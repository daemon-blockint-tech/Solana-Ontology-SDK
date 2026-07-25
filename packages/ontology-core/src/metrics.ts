/**
 * Zero-dependency, instance-owned metrics registry.
 *
 * Design goals (treat metrics as a memory map, not decoration):
 * - Every counter/gauge/histogram is owned by the instance that constructs the
 *   registry — no module-global mutable state, so ownership is unambiguous.
 * - Counters are exact integers; histograms record real measured values. Nothing
 *   is estimated. A metric only moves when a real call site moves it.
 * - Renders to structured JSON (for humans) and Prometheus text (for scrapers)
 *   without any external dependency.
 */

export type Labels = Record<string, string>;

interface HistogramState {
  count: number;
  sum: number;
  min: number;
  max: number;
  /** Cumulative bucket counts, aligned with `buckets` upper bounds (+Inf implicit = count). */
  bucketCounts: number[];
}

/** Default latency-oriented buckets in milliseconds. */
const DEFAULT_BUCKETS = [1, 2, 5, 10, 25, 50, 100, 250, 500, 1000, 2500];

function labelKey(labels?: Labels): string {
  if (!labels) return "";
  // Deterministic ordering so the same label set maps to one series.
  return Object.keys(labels)
    .sort()
    .map((k) => `${k}=${labels[k]}`)
    .join(",");
}

function renderLabels(labels: string): string {
  if (!labels) return "";
  const parts = labels.split(",").map((p) => {
    const i = p.indexOf("=");
    const k = p.slice(0, i);
    const v = p
      .slice(i + 1)
      .replace(/\\/g, "\\\\")
      .replace(/"/g, '\\"');
    return `${k}="${v}"`;
  });
  return `{${parts.join(",")}}`;
}

export interface MetricsSnapshot {
  counters: Record<string, Record<string, number>>;
  gauges: Record<string, number>;
  histograms: Record<
    string,
    Record<string, { count: number; sum: number; min: number; max: number; avg: number }>
  >;
}

export class MetricsRegistry {
  private counters = new Map<string, Map<string, number>>();
  private gauges = new Map<string, number>();
  private gaugeFns = new Map<string, () => number>();
  private histograms = new Map<string, Map<string, HistogramState>>();
  private readonly buckets: number[];

  constructor(buckets: number[] = DEFAULT_BUCKETS) {
    this.buckets = buckets;
  }

  /** Increment a counter series by `by` (default 1). Exact integer accounting. */
  inc(name: string, labels?: Labels, by = 1): void {
    let series = this.counters.get(name);
    if (!series) {
      series = new Map();
      this.counters.set(name, series);
    }
    const key = labelKey(labels);
    series.set(key, (series.get(key) ?? 0) + by);
  }

  /** Set a fixed gauge value. */
  setGauge(name: string, value: number): void {
    this.gauges.set(name, value);
  }

  /** Register a live gauge computed at snapshot time (e.g. current queue depth). */
  registerGauge(name: string, fn: () => number): void {
    this.gaugeFns.set(name, fn);
  }

  /** Record a histogram observation (e.g. request duration in ms). */
  observe(name: string, value: number, labels?: Labels): void {
    let series = this.histograms.get(name);
    if (!series) {
      series = new Map();
      this.histograms.set(name, series);
    }
    const key = labelKey(labels);
    let h = series.get(key);
    if (!h) {
      h = {
        count: 0,
        sum: 0,
        min: Number.POSITIVE_INFINITY,
        max: Number.NEGATIVE_INFINITY,
        bucketCounts: new Array(this.buckets.length).fill(0),
      };
      series.set(key, h);
    }
    h.count++;
    h.sum += value;
    if (value < h.min) h.min = value;
    if (value > h.max) h.max = value;
    for (let i = 0; i < this.buckets.length; i++) {
      if (value <= this.buckets[i]) h.bucketCounts[i]++;
    }
  }

  /** Read a single counter series (for tests / stats endpoints). */
  getCounter(name: string, labels?: Labels): number {
    return this.counters.get(name)?.get(labelKey(labels)) ?? 0;
  }

  /** Sum a counter across all its label series. */
  getCounterTotal(name: string): number {
    const series = this.counters.get(name);
    if (!series) return 0;
    let total = 0;
    for (const v of series.values()) total += v;
    return total;
  }

  /** Current value of a gauge (live fn wins over a set value). */
  getGauge(name: string): number {
    const fn = this.gaugeFns.get(name);
    return fn ? fn() : (this.gauges.get(name) ?? 0);
  }

  snapshotJson(): MetricsSnapshot {
    const counters: Record<string, Record<string, number>> = {};
    for (const [name, series] of this.counters) {
      counters[name] = {};
      for (const [k, v] of series) counters[name][k || "_"] = v;
    }
    const gauges: Record<string, number> = {};
    for (const [name, v] of this.gauges) gauges[name] = v;
    for (const [name, fn] of this.gaugeFns) gauges[name] = fn();
    const histograms: MetricsSnapshot["histograms"] = {};
    for (const [name, series] of this.histograms) {
      histograms[name] = {};
      for (const [k, h] of series) {
        histograms[name][k || "_"] = {
          count: h.count,
          sum: h.sum,
          min: h.count ? h.min : 0,
          max: h.count ? h.max : 0,
          avg: h.count ? h.sum / h.count : 0,
        };
      }
    }
    return { counters, gauges, histograms };
  }

  /** Prometheus text exposition format. */
  renderProm(): string {
    const lines: string[] = [];
    for (const [name, series] of this.counters) {
      lines.push(`# TYPE ${name} counter`);
      for (const [k, v] of series) lines.push(`${name}${renderLabels(k)} ${v}`);
    }
    const gaugeNames = new Set<string>([...this.gauges.keys(), ...this.gaugeFns.keys()]);
    for (const name of gaugeNames) {
      lines.push(`# TYPE ${name} gauge`);
      lines.push(`${name} ${this.getGauge(name)}`);
    }
    for (const [name, series] of this.histograms) {
      lines.push(`# TYPE ${name} histogram`);
      for (const [k, h] of series) {
        const base = renderLabels(k);
        const inner = k ? k + "," : "";
        // bucketCounts are already cumulative (observe increments every bucket
        // whose upper bound the value satisfies), so emit them directly.
        for (let i = 0; i < this.buckets.length; i++) {
          lines.push(
            `${name}_bucket${renderLabels(`${inner}le=${this.buckets[i]}`)} ${h.bucketCounts[i]}`,
          );
        }
        lines.push(`${name}_bucket${renderLabels(`${inner}le=+Inf`)} ${h.count}`);
        lines.push(`${name}_sum${base} ${h.sum}`);
        lines.push(`${name}_count${base} ${h.count}`);
      }
    }
    return lines.join("\n") + "\n";
  }
}
