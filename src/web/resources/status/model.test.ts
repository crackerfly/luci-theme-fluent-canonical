import assert from "node:assert/strict";
import test from "node:test";
import { computeCpuUsage, convertTemperature, formatCpuFrequency, formatPercent, formatTemperature, normalizeCpuPayload, normalizeTempPayload, parseCpuViewMode, parseTempUnit } from "./model";

test("normalizes CPU samples in natural core order and filters invalid rows", () => {
  const samples = normalizeCpuPayload({
    cpus: [
      { id: "cpu2", total: 1200, idle: 900, freq_khz: 1800000 },
      { id: "cpu0", total: 1000, idle: 800, freq_khz: 800000 },
      { id: "cpu", total: 3200, idle: 2500 },
      { id: "cpu10", total: 1000, idle: 800 },
      { id: "invalid", total: 100, idle: 50 },
      { id: "cpu1", total: -5, idle: 0 },
    ],
  });

  assert.deepEqual(
    samples.map((s) => s.id),
    ["cpu", "cpu0", "cpu2", "cpu10"],
  );
  assert.equal(samples[1]?.freqKhz, 800000);
  assert.equal(samples[3]?.freqKhz, null);
});

test("computes cold-start and delta CPU percentages without inventing zero on first sample", () => {
  const prev = normalizeCpuPayload({
    cpus: [
      { id: "cpu", total: 1000, idle: 800 },
      { id: "cpu0", total: 500, idle: 450, freq_khz: 1200000 },
      { id: "cpu1", total: 500, idle: 350, freq_khz: 1500000 },
    ],
  });

  const cold = computeCpuUsage(null, prev);
  assert.equal(cold.ready, false);
  assert.equal(cold.overall?.percent, null);
  assert.equal(formatPercent(cold.overall?.percent), "—");
  assert.equal(cold.overall?.freqKhz, 1500000);

  const next = normalizeCpuPayload({
    cpus: [
      { id: "cpu", total: 1200, idle: 850 },
      { id: "cpu0", total: 600, idle: 470, freq_khz: 1200000 },
      { id: "cpu1", total: 600, idle: 355, freq_khz: 2000000 },
    ],
  });

  const warm = computeCpuUsage(prev, next);
  assert.equal(warm.ready, true);
  assert.equal(warm.overall?.percent, 75);
  assert.equal(warm.overall?.severity, "warning");
  assert.equal(warm.overall?.freqKhz, 2000000);
  assert.equal(warm.cores[0]?.percent, 80);
  assert.equal(warm.cores[0]?.severity, "warning");
  assert.equal(warm.cores[1]?.percent, 95);
  assert.equal(warm.cores[1]?.severity, "critical");
});

test("handles counter wraparound safely", () => {
  const prev = [{ id: "cpu0", total: 1000, idle: 800, freqKhz: null }];
  const reset = [{ id: "cpu0", total: 400, idle: 300, freqKhz: null }];
  const snapshot = computeCpuUsage(prev, reset);
  assert.equal(snapshot.ready, false);
  assert.equal(snapshot.cores[0]?.percent, null);
});

test("formats CPU frequencies and preferences", () => {
  assert.equal(formatCpuFrequency(null), "");
  assert.equal(formatCpuFrequency(0), "");
  assert.equal(formatCpuFrequency(850000), "850 MHz");
  assert.equal(formatCpuFrequency(1200000), "1.20 GHz");
  assert.equal(parseCpuViewMode("compact"), "compact");
  assert.equal(parseCpuViewMode("unknown"), "all");
  assert.equal(parseTempUnit("f"), "f");
  assert.equal(parseTempUnit("C"), "c");
});

test("normalizes temperature readings, thresholds, and Celsius/Fahrenheit formatting", () => {
  const readings = normalizeTempPayload({
    sensors: [
      { id: "tz0", source: "Thermal", label: "cpu-thermal", temp_c: 52.4 },
      { id: "hw0_temp1", source: "nvme (nvme0)", label: "Composite", temp_c: 61.0, warn_c: 60, crit_c: 70 },
      { id: "hw1_temp1", source: "mt7915_phy0", label: "WiFi", temp_c: 96.5, crit_c: 95 },
      { id: "broken", source: "Thermal", label: "bad", temp_c: -273.15 },
    ],
  });

  assert.equal(readings.length, 3);
  assert.equal(readings[0]?.severity, "normal");
  assert.equal(readings[0]?.effectiveWarnC, 75);
  assert.equal(readings[0]?.effectiveCritC, 90);

  assert.equal(readings[1]?.severity, "warning");
  assert.equal(readings[1]?.effectiveWarnC, 60);
  assert.equal(readings[1]?.effectiveCritC, 70);

  assert.equal(readings[2]?.severity, "critical");
  assert.equal(readings[2]?.barPercent, 100);

  assert.equal(convertTemperature(0, "f"), 32);
  assert.equal(formatTemperature(50, "c"), "50.0 °C");
  assert.equal(formatTemperature(50, "f"), "122.0 °F");
  assert.equal(formatTemperature(null, "c"), "—");
});
