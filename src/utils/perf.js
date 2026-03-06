const SAMPLE_LIMIT = 320;
const CHANNELS = ["commit", "render", "chart", "persist"];

function nowMs() {
  if (typeof performance !== "undefined" && typeof performance.now === "function") {
    return performance.now();
  }
  return Date.now();
}

function round(value, places = 3) {
  const factor = 10 ** places;
  return Math.round(Number(value || 0) * factor) / factor;
}

function percentile(sortedValues, percentileValue) {
  if (!sortedValues.length) return 0;
  const rank = Math.ceil((percentileValue / 100) * sortedValues.length) - 1;
  const index = Math.min(sortedValues.length - 1, Math.max(0, rank));
  return sortedValues[index];
}

function durationSummary(items) {
  const durations = items
    .map((item) => Number(item.durationMs))
    .filter((value) => Number.isFinite(value))
    .sort((a, b) => a - b);

  if (!durations.length) {
    return { count: 0, avg: 0, min: 0, p50: 0, p95: 0, max: 0, last: 0 };
  }

  const total = durations.reduce((acc, value) => acc + value, 0);
  const last = Number(items[items.length - 1]?.durationMs || 0);
  return {
    count: durations.length,
    avg: round(total / durations.length),
    min: round(durations[0]),
    p50: round(percentile(durations, 50)),
    p95: round(percentile(durations, 95)),
    max: round(durations[durations.length - 1]),
    last: round(last),
  };
}

function cloneData(value) {
  if (typeof structuredClone === "function") {
    return structuredClone(value);
  }
  return JSON.parse(JSON.stringify(value));
}

function createRuntime() {
  const samples = {
    commit: [],
    render: [],
    chart: [],
    persist: [],
  };

  const runtime = {
    version: "step1",
    channels: [...CHANNELS],
    sampleLimit: SAMPLE_LIMIT,
    enabled: true,
    metadata: {},
    samples,

    setEnabled(nextEnabled = true) {
      runtime.enabled = Boolean(nextEnabled);
      return runtime.enabled;
    },

    clear() {
      for (const channel of CHANNELS) {
        runtime.samples[channel] = [];
      }
    },

    record(channel, payload = {}) {
      if (!runtime.enabled) return null;
      if (!CHANNELS.includes(channel)) return null;

      const sample = {
        ts: new Date().toISOString(),
        ...payload,
      };
      if (Number.isFinite(Number(sample.durationMs))) {
        sample.durationMs = round(sample.durationMs);
      }

      const bucket = runtime.samples[channel];
      bucket.push(sample);
      if (bucket.length > runtime.sampleLimit) {
        bucket.splice(0, bucket.length - runtime.sampleLimit);
      }
      return sample;
    },

    getSamples(channel) {
      if (!channel) return cloneData(runtime.samples);
      if (!CHANNELS.includes(channel)) return [];
      return cloneData(runtime.samples[channel]);
    },

    summary() {
      const out = {};
      for (const channel of CHANNELS) {
        out[channel] = durationSummary(runtime.samples[channel]);
      }
      return out;
    },

    summaryBy(channel = "render", key = "action") {
      if (!CHANNELS.includes(channel)) return [];
      const groups = new Map();

      for (const sample of runtime.samples[channel]) {
        const bucketKey = String(sample?.[key] ?? "unknown");
        if (!groups.has(bucketKey)) {
          groups.set(bucketKey, []);
        }
        groups.get(bucketKey).push(sample);
      }

      return [...groups.entries()]
        .map(([bucketKey, entries]) => ({
          [key]: bucketKey,
          ...durationSummary(entries),
        }))
        .sort((a, b) => b.count - a.count);
    },
  };

  return runtime;
}

function getRuntime() {
  if (typeof window === "undefined") return null;
  const existing = window.__docBuilderPerf;
  if (existing && existing.version === "step1") {
    return existing;
  }
  const runtime = createRuntime();
  window.__docBuilderPerf = runtime;
  return runtime;
}

export function initPerf(metadata = {}) {
  const runtime = getRuntime();
  if (!runtime) return null;
  runtime.metadata = {
    ...(runtime.metadata || {}),
    ...metadata,
    initializedAt: runtime.metadata?.initializedAt || new Date().toISOString(),
  };
  return runtime;
}

export function recordPerf(channel, payload = {}) {
  const runtime = getRuntime();
  if (!runtime) return null;
  return runtime.record(channel, payload);
}

export function startPerfTimer(channel, context = {}) {
  const startedAt = nowMs();
  return (payload = {}) =>
    recordPerf(channel, {
      ...context,
      ...payload,
      durationMs: nowMs() - startedAt,
    });
}
