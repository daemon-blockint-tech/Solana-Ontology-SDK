# Framework Evaluasi Performa Kode — OMS REST Service

## 1. Ringkasan Evaluasi

- **Nama komponen:** `@solana-ontology/oms` — Ontology Metadata Service (REST API)
- **Owner:** daemon-blockint-tech
- **Tanggal evaluasi:** 2026-07-25
- **Versi/commit:** branch `chore/post-release-improvements` @ `b8ccb62`
- **Environment:** local (single host, Linux, Node v22.22.2)
- **Evaluator:** performance evaluation pass (static + live benchmark)
- **Status:** **Yellow**

**Tujuan komponen:** Menyajikan ontology Solana (Object/Link/Action types) sebagai REST API read-mostly, di-bootstrap dari 78 concept YAML saat startup, dengan storage `memory` atau `sqlite` (`node:sqlite`).

**Unit kerja utama:** satu HTTP request `GET /api/v1/*`. Unit sekunder: startup `registerConcepts` (78 concepts).

**Target performa / SLO (asumsi, tidak ada SLO resmi di repo):** p95 < 200 ms, error rate < 0.5%, throughput read > 500 req/s untuk single-list.

**Kesimpulan singkat:** Pada beban nyata (78 concepts) single-list GET sehat — p95 27 ms (memory) / 50 ms (sqlite) pada c50, error rate 0%. Bottleneck dominan adalah **serialisasi ulang tanpa cache** (24.5% CPU untuk `JSON.stringify` respons) plus **double encode/decode di sqlite** (~49% CPU untuk `prepare` + `JSON.parse` per-row) — biaya identik yang diulang tiap request meski data statis. Endpoint dump `GET /api/v1/ontology` di sqlite sudah menembus 200 ms p95 pada c100 (281 ms). Throughput **flat terhadap concurrency** (single-core CPU-bound). Cost per request **naik linear terhadap ukuran ontology**; pada 16× ontology, `/ontology` sqlite jatuh ke 19 req/s / p95 2665 ms. Prioritas: response cache + prepared-statement reuse + transaksi pada bulk register.

---

## 2. Konteks Beban Kerja

**Profil workload:**

- Jenis beban: **CPU-bound** (serialisasi/parse), sebagian I/O pada sqlite. Bukan network-bound antar service.
- Pola traffic: read-mostly, steady; write hanya saat bootstrap (`registerConcepts`).
- Ukuran input tipikal: 78 concepts → payload `object-types` **78 KB**, `ontology` (dump) **257 KB**.
- Ukuran input terburuk (uji skala): 312 (4×) dan 1248 (16×) concepts.
- Concurrency normal: 1–10. Puncak diuji: 100.

**Dependency utama:**

- Database: `node:sqlite` (in-process, file) atau in-memory Map. Tidak ada DB eksternal.
- Cache: **tidak ada.**
- Queue/broker: tidak ada.
- External API: tidak ada di hot path.
- Filesystem: baca `ontology/concepts/**` sekali saat startup (sync).
- Service lain: tidak ada (Node `http` built-in, tanpa framework).

**Asumsi penting:** Server single-process, single-core event loop (tidak ada cluster/worker_threads). `ab` sebagai client di host yang sama → ada kontensi client↔server; angka throughput absolut konservatif tapi perbandingan (memory vs sqlite, skala) valid. Cold start mencakup `node` startup + import + `loadConcepts` + `registerConcepts`.

---

## 3. Baseline Metrik

Representatif: `GET /api/v1/object-types` (single list, unit kerja utama), c50, 78 concepts. Sumber: `ab -n 5000 -c 50`, 3× (varian ±2.5%).

| Metrik                |      memory |                                             sqlite | Target | Status | Catatan                           |
| --------------------- | ----------: | -------------------------------------------------: | -----: | ------ | --------------------------------- |
| Latency p50           |       26 ms |                                              45 ms |   <200 | ✅     |                                   |
| Latency p95           |    27–30 ms |                                              50 ms |   <200 | ✅     |                                   |
| Latency p99           |       28 ms |                                              53 ms |   <200 | ✅     | tail rapat (tanpa GC spike)       |
| Throughput            | ~1875 req/s |                                        ~1105 req/s |   >500 | ✅     | sqlite −41%                       |
| Error rate            |          0% |                                                 0% |  <0.5% | ✅     |                                   |
| Timeout rate          |          0% |                                                 0% |      — | ✅     |                                   |
| Query count / unit    |     0 (Map) |                                **1** (SELECT SCAN) |      — | ⚠️     | `prepare` dibuat ulang tiap call  |
| JSON.parse / unit     |           0 |                                   **78** (per-row) |      — | ⚠️     | decode dari TEXT sqlite           |
| JSON.stringify / unit |   1 (78 KB) |                                          1 (78 KB) |      — | ⚠️     | re-serialize identik, tanpa cache |
| Network calls / unit  |           0 |                                                  0 |      — | ✅     | in-process                        |
| CPU (hot frame)       |           — | **24.5% stringify, ~49% sqlite, 16% socket write** |      — | ⚠️     | lihat §4                          |
| GC / pause            |      ringan |                                           3.2% CPU |      — | ✅     | churn dari parse→object→stringify |

**Endpoint dump `GET /api/v1/ontology`** (3 list + payload 257 KB), c50:

| Metrik     |     memory |                   sqlite |
| ---------- | ---------: | -----------------------: |
| Throughput | ~834 req/s |               ~374 req/s |
| p95        |      62 ms |                   139 ms |
| p95 @ c100 |     125 ms | **281 ms** ⚠️ (>200 SLO) |

**Startup (`perf_hooks`, 78 concepts, ms/op):**

| Langkah                    |  memory |   sqlite | Catatan                              |
| -------------------------- | ------: | -------: | ------------------------------------ |
| `loadConcepts` (read+YAML) |    58.1 |     58.1 | **biaya cold-start terbesar** (sync) |
| `validateAll`              |    1.08 |     1.08 | ajv + semantic passes                |
| `buildGraph`               |    0.19 |     0.19 | O(V+E)                               |
| `registerConcepts`         |    1.09 | **19.6** | sqlite 18× (INSERT tanpa transaksi)  |
| boot→ready (wall, via CLI) | ~0.43 s |  ~0.43 s | termasuk node startup + import       |

**Sumber data baseline:** `ab` 2.3, `perf_hooks` microbench, `node --cpu-prof`, `EXPLAIN QUERY PLAN` (`node:sqlite`). Harness di scratchpad `bench/` (throwaway).

---

## 4. Peta Hot Path

**Hot path request** (`packages/ontology-oms/src/oms-server.ts` → `handleRequest`):

1. Request diterima (Node `http`, `createServer`).
2. Set CORS headers; cek `OPTIONS`; cek auth (string compare bila `authToken`).
3. Route by `url`/`method` (rantai `if`).
4. `storage.listX()` — **sqlite:** `db.prepare("SELECT data …")` (dibuat ulang) → `SCAN` → `rows.map(JSON.parse)`. **memory:** `Array.from(map.values())`.
5. Untuk `/ontology`: `dump()` = 3× `listX()` paralel.
6. `this.json(res, 200, {success,data})` → `JSON.stringify(body)` → `res.end`.

**Langkah paling mahal (dari cpu-prof, sqlite `/ontology` di bawah beban):**

| Frame                                   |                    Self CPU | Arti                                         |
| --------------------------------------- | --------------------------: | -------------------------------------------- |
| `json` (oms-server)                     |                   **24.5%** | `JSON.stringify` respons                     |
| sqlite (anonymous ×3)                   | **18.7 + 10.3 + 7.1 = 36%** | `prepare` + `all()` + row `JSON.parse`       |
| `writevGeneric`                         |                       16.1% | tulis payload ke socket (payload-size bound) |
| `listActionTypes/LinkTypes/ObjectTypes` |         5.6+4.3+3.5 = 13.4% | wrapper list (map JSON.parse)                |
| GC                                      |                        3.2% | churn alokasi parse→object→stringify         |

Bottleneck ada di:

- [x] Compute (serialisasi/parse)
- [x] Serialization / deserialization (double encode/decode di sqlite)
- [x] Cache miss (tidak ada cache → kerja identik diulang)
- [x] Database / query (sqlite `SCAN` + `prepare` per call, hanya di path sqlite)
- [x] Network I/O (socket write payload besar)
- [ ] Lock / contention — tidak ada (single-thread, no locks)
- [ ] Retry / duplicate work

---

## 5. Hidden Cost Audit

### 5.1 Alokasi dan Memori

- `listObjectTypes` sqlite mengalokasikan array + N objek hasil `JSON.parse` **tiap request**, lalu `JSON.stringify` seluruh payload → object churn tinggi, terlihat 3.2% GC.
- memory backend murah: `Array.from(map.values())` (referensi), 0.002 ms/op.
- **Temuan:** tiap read men-decode ulang seluruh dataset walau tak berubah; payload dibangun penuh tiap request meski identik antar request.

### 5.2 Data Access

- N+1? Tidak. Tapi **`db.prepare()` dipanggil ulang setiap method** (tidak ada reuse prepared statement) — kompilasi SQL berulang.
- `EXPLAIN`: `SELECT data FROM object_types` → `SCAN object_types` (full scan; wajar untuk list-all). `WHERE name=?` → `SEARCH USING INDEX sqlite_autoindex` (PK terindeks — point lookup sehat).
- Kolom: hanya `data` diambil — tidak over-fetch.
- Transaksi: **bulk register tidak dibungkus transaksi** → tiap INSERT = implicit txn + fsync.
- **Temuan:** prepared statement tidak di-cache; bulk write tidak transaksional.

### 5.3 I/O dan Network

- Tidak ada API/DB/file call di dalam loop request. `loadConcepts` (I/O file) hanya saat startup, sync.
- Payload besar (`/ontology` 257 KB @1×) dikirim penuh tiap request → 16% CPU di `writevGeneric`.
- Tidak ada retry/reconnect.
- **Temuan:** payload response tidak dikompresi/di-ETag; klien tak bisa `304`.

### 5.4 Concurrency dan State

- Lock scope: tidak ada lock (single-thread). Shared state = Map/db, read-only di hot path.
- **Throughput flat 1→100 concurrency** (memory ~1900, sqlite ~1100 req/s) → single-core saturate; menambah concurrency hanya menaikkan latency linear (queueing), bukan throughput.
- Tail tidak memburuk drastis (p99≈p50×1.05) — sehat.
- **Temuan:** tidak ada paralelisme CPU (no cluster/worker_threads) → 1 core = plafon throughput.

### 5.5 Serialization, Parsing, dan Transform

- **Double transform di sqlite:** `JSON.parse` (baca kolom TEXT) → objek → `JSON.stringify` (respons). Data di-encode saat insert, di-decode tiap read, di-encode lagi tiap respons.
- **Temuan:** ini biaya tersembunyi terbesar bersama cache-miss.

### 5.6 Observability Overhead

- Hot path bersih: tidak ada logging per-request (hanya `console.error` saat error). Tidak ada tracing/metric high-cardinality.
- **Temuan:** observability overhead ~0 — bagus.

---

## 6. Klasifikasi Bottleneck Dominan

| Kategori               | Ya/Tidak                  | Bukti                                | Dampak                             |
| ---------------------- | ------------------------- | ------------------------------------ | ---------------------------------- |
| Compute-bound          | **Ya**                    | 24.5% stringify + parse frames       | plafon throughput single-core      |
| Memory-bound           | Sebagian                  | 3.2% GC, churn parse/stringify       | tekanan alokasi saat payload besar |
| I/O-bound              | Sebagian (sqlite/startup) | registerConcepts 18× lebih lambat    | startup lambat di sqlite           |
| DB-bound               | **Ya (sqlite)**           | prepare per-call + SCAN, 36% CPU     | request −41%, startup fsync        |
| Network-bound          | Sebagian                  | 16% writevGeneric                    | payload besar mahal dikirim        |
| Contention-bound       | Tidak                     | no locks, tail rapat                 | —                                  |
| Cache-efficiency       | **Ya**                    | tak ada cache; kerja identik diulang | biaya per-request sia-sia          |
| Framework overhead     | Tidak                     | Node http murni                      | —                                  |
| Observability overhead | Tidak                     | tak ada log/trace hot path           | —                                  |

**Kesimpulan bottleneck dominan:** **Request path = serialization + cache-efficiency bound** (re-serialize data statis tiap request), diperberat **DB-bound double encode/decode** pada sqlite. **Startup = DB-bound** (INSERT tanpa transaksi) plus `loadConcepts` (sync YAML). Semuanya di atas plafon **single-core CPU**.

---

## 7. Scaling Behavior

**Saat input membesar (1× → 4× → 16× concepts):** **linear** untuk request path (biaya ∝ ukuran payload, karena serialisasi ulang penuh).

| Metrik (c50)                      | 1× (78) | 4× (312) |   16× (1248) |
| --------------------------------- | ------: | -------: | -----------: |
| object-types req/s (memory)       |    1930 |        — |          129 |
| object-types req/s (sqlite)       |    1105 |        — |           84 |
| object-types p95 memory           |   27 ms |        — |       408 ms |
| ontology p95 memory               |   62 ms |        — |      1210 ms |
| ontology p95 sqlite               |  139 ms |        — |  **2665 ms** |
| `listObjectTypes` sqlite (µbench) | 0.33 ms |  1.34 ms |      5.56 ms |
| `loadConcepts` (startup)          |   58 ms |   221 ms |       857 ms |
| `registerConcepts` memory         | 1.09 ms |  8.06 ms | **113.7 ms** |
| `registerConcepts` sqlite         | 19.6 ms |    82 ms |       442 ms |

- `listObjectTypes` sqlite & `loadConcepts`: **linear**.
- **`registerConcepts` [memory]: superlinear ~O(n^1.7)** (1.09→113.7 untuk 16× input = 104×) — indikasi kerja O(n²) di registry (kemungkinan deteksi link/action lintas-concept). **Scaling risk.**

**Saat concurrency naik:** throughput flat, p50/p95/p99 naik **linear** (queueing single-core); error rate tetap 0; tail rapat.

**Saat dependency melambat:** hanya sqlite disk yang relevan; startup memburuk (fsync per INSERT). Request path sqlite tetap in-process.

**Failure amplification:** tidak ada retry/fan-out → tidak ada amplifikasi. Risiko nyata: tanpa cache, lonjakan concurrency pada `/ontology` (payload besar) langsung menaikkan CPU & latency linear sampai menembus SLO.

---

## 8. Metode Evaluasi yang Dipakai

- [x] Static code review
- [x] Microbenchmark (`perf_hooks`)
- [x] End-to-end benchmark (`ab`)
- [x] CPU profiling (`node --cpu-prof`)
- [ ] Memory/heap profiling (tidak dijalankan; churn diinfer dari GC% + µbench)
- [x] Query analysis / EXPLAIN (`EXPLAIN QUERY PLAN`)
- [ ] Distributed tracing (N/A — single process)
- [ ] Load test tool khusus (k6/autocannon tak tersedia → `ab`)
- [ ] Soak/chaos test

**Tool:** ApacheBench 2.3, Node `perf_hooks`, `node --cpu-prof` (+ analisis self-time custom), `node:sqlite` `EXPLAIN QUERY PLAN`.

**Catatan validitas:** `ab` client sehost dengan server → kontensi CPU client↔server menekan angka **throughput absolut**; gunakan untuk **perbandingan** (memory vs sqlite, skala), bukan angka mutlak produksi. Warm-state (server sudah ready sebelum ukur). Varian 3× ±2.5% (stabil). Single host, single core — tidak merepresentasikan multi-pod di k8s.

---

## 9. Temuan Utama

| No  | Temuan                                                                 | Bukti                                              | Dampak                                                   | Prioritas                |
| --- | ---------------------------------------------------------------------- | -------------------------------------------------- | -------------------------------------------------------- | ------------------------ |
| 1   | Tidak ada response cache — data statis di-serialize ulang tiap request | 24.5% CPU `JSON.stringify`; payload identik        | Throughput terbatas; SLO `/ontology` breach @c100 sqlite | **High**                 |
| 2   | sqlite double encode/decode + `prepare` per-call                       | 36% CPU sqlite frames; sqlite −41% throughput      | Request 1.5–2× lebih lambat dari memory                  | **High**                 |
| 3   | `registerConcepts` sqlite tanpa transaksi                              | 19.6 ms vs 1.09 ms memory (18×); ~234 INSERT fsync | Startup lambat, memburuk saat ontology tumbuh            | **Medium**               |
| 4   | `registerConcepts` [memory] superlinear O(n^1.7)                       | 1.09→113.7 ms untuk 16×                            | Startup/registrasi tak skala                             | **Medium**               |
| 5   | Single-core (no cluster/worker)                                        | throughput flat 1→100                              | Plafon ~1900 req/s single-list                           | **Low** (butuh redesign) |
| 6   | Payload tak terkompresi/ETag                                           | 16% CPU socket write; 257 KB `/ontology`           | Bandwidth & CPU kirim                                    | **Low**                  |

---

## 10. Rekomendasi Perbaikan

| Symptom                                | Likely Cause                          | Proposed Fix                                                                       | Expected Gain                                                               | Risk                                                                |
| -------------------------------------- | ------------------------------------- | ---------------------------------------------------------------------------------- | --------------------------------------------------------------------------- | ------------------------------------------------------------------- |
| Throughput rendah, 24.5% CPU stringify | Re-serialize data statis tiap request | Cache string JSON per-endpoint + ETag; invalidasi saat write                       | Hilangkan ~24.5% stringify + ~49% sqlite pada read hit → multi-× throughput | Rendah (data read-mostly; perlu invalidasi di insert/update/delete) |
| sqlite −41% throughput                 | `prepare()` dibuat ulang tiap call    | Cache prepared statements di constructor `SqliteStorage`                           | Kurangi porsi 36% sqlite; kurangi CPU/req                                   | Rendah                                                              |
| Startup sqlite 18× lebih lambat        | INSERT tanpa transaksi (fsync/row)    | Bungkus `registerConcepts` dalam 1 transaksi / tambah `bulkInsert` ke `OmsStorage` | ~10–18× lebih cepat startup sqlite                                          | Rendah                                                              |
| registerConcepts memory O(n^1.7)       | Kerja O(n²) di link/action registry   | Audit `registerMany`/autodetect; pakai index/Map, buat linear                      | Startup linear di ukuran besar                                              | Sedang (butuh baca registry)                                        |
| p95 naik linear vs concurrency         | Single-core event loop                | worker_threads/cluster ATAU multi-pod (butuh shared backend dulu)                  | Skala horizontal CPU                                                        | Tinggi (redesign; OMS kini single-replica)                          |

**Quick wins:** (1) response cache + ETag, (2) cached prepared statements, (3) transaksi pada bulk register. Ketiganya lokal, ROI tinggi.

**Structural fixes:** registry O(n²) → linear; paralelisme CPU (cluster/worker) + shared storage backend untuk multi-replica.

**Yang tidak perlu dioptimalkan dulu:** `buildGraph` (0.19 ms), `validateAll` (1 ms), auth string-compare, routing `if`-chain — tak material pada 78 concepts.

---

## 11. Rubrik Keputusan

- **Green:** tidak — ada hidden cost material (no-cache re-serialize) & satu endpoint breach SLO @c100 sqlite.
- **Yellow:** **ya** — beban nyata (78 concepts) single-list GET lolos target (p95 < 100 ms bahkan @c100), error 0%; tetapi `/ontology` sqlite @c100 = 281 ms (>200), cache-miss membuang ~24.5% CPU, dan skala memburuk linear (16× → detik).
- **Red:** hanya pada skala ekstrem (16×) / `/ontology` sqlite di bawah beban tinggi.

**Status akhir evaluasi: Yellow.**
**Alasan:** Lolos untuk workload read single-list saat ini, tapi hidden cost serialisasi tanpa cache + double encode/decode sqlite + startup tak-transaksional adalah hotspot yang menggigit saat concurrency naik atau ontology tumbuh. Ketiga quick win menghilangkan mayoritas biaya.

---

## 12. Action Plan

| Aksi                                              | Owner | Prioritas | Estimasi usaha | Deadline | Status      |
| ------------------------------------------------- | ----- | --------- | -------------- | -------- | ----------- |
| Response cache + ETag (invalidate on write)       | TBD   | High      | S (½–1 hari)   | TBD      | Not started |
| Cache prepared statements di `SqliteStorage`      | TBD   | High      | S (jam)        | TBD      | Not started |
| Transaksi / `bulkInsert` untuk `registerConcepts` | TBD   | Medium    | S–M            | TBD      | Not started |
| Audit & linearize registry O(n^1.7)               | TBD   | Medium    | M              | TBD      | Not started |
| Paralelisme CPU (cluster/worker) — evaluasi       | TBD   | Low       | L (redesign)   | TBD      | Not started |

---

## 13. Re-evaluation

_(Diisi setelah fix diterapkan — belum dijalankan; evaluasi ini read-only.)_ Metode: ulang skenario `ab` identik (memory & sqlite, c1/10/50/100, object-types & ontology; 1× & 16×) di scratchpad clone, gate di belakang test suite tetap hijau.

| Metrik                                |    Sebelum | Sesudah | Delta | Catatan                       |
| ------------------------------------- | ---------: | ------: | ----: | ----------------------------- |
| Latency p95 (sqlite object-types c50) |      50 ms |         |       | target: turun besar via cache |
| Latency p99 (sqlite ontology c100)    |    ~300 ms |         |       | keluar dari breach SLO        |
| Throughput (sqlite object-types)      | 1105 req/s |         |       | target: mendekati/≥ memory    |
| CPU (stringify hot frame)             |      24.5% |         |       | target: hilang pada cache hit |
| Startup registerConcepts (sqlite)     |    19.6 ms |         |       | target: ~1–2 ms via transaksi |
| Error rate                            |         0% |         |       | jaga 0%                       |

**Apakah bottleneck berpindah?** Prediksi: setelah cache + prepared-statement, bottleneck read bergeser dari serialisasi/DB ke **socket write / bandwidth** (16% writevGeneric) dan **single-core**; startup bergeser dari INSERT ke `loadConcepts` (sync YAML).

---

## 14. Checklist Review Cepat

- [x] Target performa jelas (asumsi SLO didefinisikan)
- [x] Baseline ada dan repeatable (varian ±2.5%, harness tersimpan)
- [x] Hot path sudah dipetakan (kode + cpu-prof)
- [x] Hidden cost di luar logic utama diaudit (cache-miss, double encode/decode, prepare/call, txn)
- [x] Latency p95/p99 diukur, bukan cuma rata-rata
- [x] Cost per unit kerja dihitung (query/parse/stringify per request)
- [x] Query/network/I/O amplification dicek (EXPLAIN, payload size)
- [x] Concurrency dan contention dicek (sweep c1–100)
- [x] Observability overhead dicek (~0)
- [x] Ada prioritas tindakan yang jelas (3 quick win)
- [x] Ada rencana ukur ulang setelah fix (§13)

---

### Lampiran — cara reproduksi

Harness throwaway ada di scratchpad `bench/`: `synth.mjs` (ontology 4×/16×), `microbench.mjs` (`perf_hooks`), `run-ab.sh` (boot OMS env-driven + `ab` sweep), `explain.mjs` (`EXPLAIN QUERY PLAN`), `prof-top.mjs` (analisis `.cpuprofile`). Server dinyalakan lewat CLI: `ONTOLOGY_PATH=… OMS_STORAGE=sqlite OMS_DB_PATH=… OMS_PORT=… node packages/cli/dist/index.js oms`.
