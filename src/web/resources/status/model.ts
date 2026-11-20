export type CpuViewMode = "all" | "compact" | "total";
export type TempUnit = "c" | "f";
export type StatusSeverity = "normal" | "warning" | "critical";

export interface RawCpuSample {
  id: string;
  total: number;
  idle: number;
  freqKhz: number | null;
}

export interface CpuCoreUsage {
  id: string;
  index: number | null;
  percent: number | null;
  severity: StatusSeverity;
  freqKhz: number | null;
}

export interface CpuUsageSnapshot {
  overall: CpuCoreUsage | null;
  cores: CpuCoreUsage[];
  ready: boolean;
}

export interface TempSensorReading {
  id: string;
  source: string;
  label: string;
  tempC: number;
  warnC: number | null;
  critC: number | null;
  effectiveWarnC: number;
  effectiveCritC: number;
  barPercent: number;
  severity: StatusSeverity;
}

export const DEFAULT_TEMP_CRIT_C = 90;
export const CPU_WARNING_PERCENT = 75;
export const CPU_CRITICAL_PERCENT = 90;

type UnknownRecord = Record<string, unknown>;

function asRecord(value: unknown): UnknownRecord {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? (value as UnknownRecord) : {};
}

function asFiniteNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function clampPercent(value: number): number {
  return Math.min(100, Math.max(0, value));
}

export function parseCpuViewMode(value: string | null | undefined): CpuViewMode {
  if (value === "compact" || value === "total" || value === "all") {
    return value;
  }
  return "all";
}

export function parseTempUnit(value: string | null | undefined): TempUnit {
  return value === "f" ? "f" : "c";
}

export function classifyCpuSeverity(percent: number | null): StatusSeverity {
  if (percent === null || !Number.isFinite(percent)) return "normal";
  if (percent >= CPU_CRITICAL_PERCENT) return "critical";
  if (percent >= CPU_WARNING_PERCENT) return "warning";
  return "normal";
}

export function normalizeCpuPayload(payload: unknown): RawCpuSample[] {
  const record = asRecord(payload);
  if (!Array.isArray(record.cpus)) return [];

  const samples: RawCpuSample[] = [];
  for (const entry of record.cpus) {
    const item = asRecord(entry);
    const id = typeof item.id === "string" ? item.id.trim() : "";
    if (id !== "cpu" && !/^cpu\d+$/.test(id)) continue;

    const total = asFiniteNumber(item.total);
    const idle = asFiniteNumber(item.idle);
    if (total === null || idle === null || total < 0 || idle < 0) continue;

    const rawFreq = asFiniteNumber(item.freq_khz);
    const freqKhz = rawFreq !== null && rawFreq > 0 ? rawFreq : null;
    samples.push({ id, total, idle, freqKhz });
  }

  samples.sort((a, b) => {
    if (a.id === "cpu") return -1;
    if (b.id === "cpu") return 1;
    return Number.parseInt(a.id.slice(3), 10) - Number.parseInt(b.id.slice(3), 10);
  });

  return samples;
}

export function computeCpuUsage(previous: RawCpuSample[] | null, current: RawCpuSample[]): CpuUsageSnapshot {
  const prevById = new Map<string, RawCpuSample>();
  if (previous) {
    for (const sample of previous) {
      prevById.set(sample.id, sample);
    }
  }

  let overall: CpuCoreUsage | null = null;
  const cores: CpuCoreUsage[] = [];

  for (const sample of current) {
    const prev = prevById.get(sample.id);
    let percent: number | null = null;

    if (prev && sample.total > prev.total && sample.idle >= prev.idle) {
      const deltaTotal = sample.total - prev.total;
      const deltaIdle = sample.idle - prev.idle;
      percent = clampPercent(((deltaTotal - deltaIdle) / deltaTotal) * 100);
    }

    const index = sample.id === "cpu" ? null : Number.parseInt(sample.id.slice(3), 10);
    const usage: CpuCoreUsage = {
      id: sample.id,
      index,
      percent,
      severity: classifyCpuSeverity(percent),
      freqKhz: sample.freqKhz,
    };

    if (sample.id === "cpu") {
      overall = usage;
    } else {
      cores.push(usage);
    }
  }

  const maxCoreFreq = cores.reduce<number | null>((acc, core) => {
    if (core.freqKhz === null) return acc;
    return acc === null || core.freqKhz > acc ? core.freqKhz : acc;
  }, null);

  if (overall && overall.freqKhz === null && maxCoreFreq !== null) {
    overall = { ...overall, freqKhz: maxCoreFreq };
  } else if (!overall && cores.length > 0) {
    const readyCores = cores.filter((core): core is CpuCoreUsage & { percent: number } => core.percent !== null);
    const avgPercent = readyCores.length > 0 ? readyCores.reduce((sum, core) => sum + core.percent, 0) / readyCores.length : null;
    overall = {
      id: "cpu",
      index: null,
      percent: avgPercent,
      severity: classifyCpuSeverity(avgPercent),
      freqKhz: maxCoreFreq,
    };
  }

  const ready = (overall?.percent !== null && overall?.percent !== undefined) || cores.some((core) => core.percent !== null);
  return { overall, cores, ready };
}

export function formatPercent(percent: number | null | undefined): string {
  if (percent === null || percent === undefined || !Number.isFinite(percent)) {
    return "—";
  }
  return `${clampPercent(percent).toFixed(1)}%`;
}

export function formatCpuFrequency(freqKhz: number | null | undefined): string {
  if (freqKhz === null || freqKhz === undefined || !Number.isFinite(freqKhz) || freqKhz <= 0) {
    return "";
  }
  if (freqKhz >= 1_000_000) {
    return `${(freqKhz / 1_000_000).toFixed(2)} GHz`;
  }
  return `${Math.round(freqKhz / 1000)} MHz`;
}

export function normalizeTempPayload(payload: unknown): TempSensorReading[] {
  const record = asRecord(payload);
  if (!Array.isArray(record.sensors)) return [];

  const readings: TempSensorReading[] = [];
  for (const entry of record.sensors) {
    const item = asRecord(entry);
    const id = typeof item.id === "string" ? item.id.trim() : "";
    const tempC = asFiniteNumber(item.temp_c);
    if (!id || tempC === null || tempC <= -100 || tempC >= 250) continue;

    const source = typeof item.source === "string" && item.source.trim() ? item.source.trim() : "Thermal";
    const label = typeof item.label === "string" && item.label.trim() ? item.label.trim() : id;

    const rawCrit = asFiniteNumber(item.crit_c);
    const critC = rawCrit !== null && rawCrit > 0 && rawCrit <= 200 ? rawCrit : null;
    const effectiveCritC = critC ?? DEFAULT_TEMP_CRIT_C;

    const rawWarn = asFiniteNumber(item.warn_c);
    const warnC = rawWarn !== null && rawWarn > 0 && rawWarn < effectiveCritC ? rawWarn : null;
    const effectiveWarnC = warnC ?? Math.max(45, effectiveCritC - 15);

    const severity: StatusSeverity = tempC >= effectiveCritC ? "critical" : tempC >= effectiveWarnC ? "warning" : "normal";
    const barPercent = clampPercent((Math.max(0, tempC) / effectiveCritC) * 100);

    readings.push({
      id,
      source,
      label,
      tempC,
      warnC,
      critC,
      effectiveWarnC,
      effectiveCritC,
      barPercent,
      severity,
    });
  }

  return readings;
}

export function convertTemperature(tempC: number, unit: TempUnit): number {
  return unit === "f" ? tempC * 1.8 + 32 : tempC;
}

export function formatTemperature(tempC: number | null | undefined, unit: TempUnit): string {
  if (tempC === null || tempC === undefined || !Number.isFinite(tempC)) {
    return "—";
  }
  const value = convertTemperature(tempC, unit);
  return `${value.toFixed(1)} ${unit === "f" ? "°F" : "°C"}`;
}
