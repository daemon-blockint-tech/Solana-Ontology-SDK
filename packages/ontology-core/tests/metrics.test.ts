import { describe, it, expect } from "vitest";
import { MetricsRegistry } from "../src/metrics.js";

describe("MetricsRegistry", () => {
  it("counts exactly, per label series", () => {
    const m = new MetricsRegistry();
    m.inc("reqs", { endpoint: "a" });
    m.inc("reqs", { endpoint: "a" });
    m.inc("reqs", { endpoint: "b" }, 3);
    expect(m.getCounter("reqs", { endpoint: "a" })).toBe(2);
    expect(m.getCounter("reqs", { endpoint: "b" })).toBe(3);
    expect(m.getCounterTotal("reqs")).toBe(5);
    expect(m.getCounter("reqs", { endpoint: "missing" })).toBe(0);
  });

  it("supports fixed and live gauges (live fn wins)", () => {
    const m = new MetricsRegistry();
    m.setGauge("g", 7);
    expect(m.getGauge("g")).toBe(7);
    let n = 0;
    m.registerGauge("live", () => n);
    n = 42;
    expect(m.getGauge("live")).toBe(42);
  });

  it("records histogram count/sum/min/max", () => {
    const m = new MetricsRegistry();
    for (const v of [2, 4, 6]) m.observe("dur", v);
    const snap = m.snapshotJson();
    const h = snap.histograms["dur"]["_"];
    expect(h.count).toBe(3);
    expect(h.sum).toBe(12);
    expect(h.min).toBe(2);
    expect(h.max).toBe(6);
    expect(h.avg).toBe(4);
  });

  it("renders valid Prometheus text (TYPE lines + labels)", () => {
    const m = new MetricsRegistry();
    m.inc("http_total", { code: "200" }, 5);
    m.registerGauge("inflight", () => 2);
    m.observe("latency_ms", 3);
    const out = m.renderProm();
    expect(out).toContain("# TYPE http_total counter");
    expect(out).toContain('http_total{code="200"} 5');
    expect(out).toContain("# TYPE inflight gauge");
    expect(out).toContain("inflight 2");
    expect(out).toContain("# TYPE latency_ms histogram");
    expect(out).toContain("latency_ms_count 1");
    expect(out).toContain('latency_ms_bucket{le="+Inf"} 1');
  });
});
