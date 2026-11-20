import {
  type CpuCoreUsage,
  type CpuUsageSnapshot,
  type CpuViewMode,
  computeCpuUsage,
  formatCpuFrequency,
  formatPercent,
  normalizeCpuPayload,
  parseCpuViewMode,
  type RawCpuSample,
  type StatusSeverity,
} from "../../../status/model";
import { captureSegmentedFocus, createSegmentedControl, markNoTranslate, restoreSegmentedFocus } from "../../../status/segmented";

const STORAGE_KEY = "fluent-cpu-view-mode";
const GROUP_ID = "fluent-cpu-mode";
const WARMUP_DELAY_MS = 350;
const STALE_SAMPLE_MS = 30_000;

const callGetCpu = rpc.declare<unknown>({
  object: "luci.fluent_status",
  method: "get_cpu",
  expect: { "": {} },
});

let previousSamples: RawCpuSample[] | null = null;
let previousSampleAt = 0;
let warmupTimer: ReturnType<typeof setTimeout> | null = null;
let mountedRoot: HTMLElement | null = null;
let latestSnapshot: CpuUsageSnapshot | null = null;

function isCpuWidgetEnabled(): boolean {
  const body = document.body;
  if (!body?.hasAttribute("data-fluent-dir")) return false;
  return body.getAttribute("data-cpu-status") !== "0";
}

function readSavedMode(): CpuViewMode {
  try {
    return parseCpuViewMode(localStorage.getItem(STORAGE_KEY));
  } catch {
    return "all";
  }
}

function writeSavedMode(mode: CpuViewMode): void {
  try {
    localStorage.setItem(STORAGE_KEY, mode);
  } catch {}
}

function severityProgressClass(severity: StatusSeverity): string {
  if (severity === "critical") return " cbi-progressbar-error";
  if (severity === "warning") return " cbi-progressbar-warning";
  return "";
}

function renderProgressBar(label: string, usage: CpuCoreUsage): HTMLElement {
  const ready = usage.percent !== null && Number.isFinite(usage.percent);
  const titleText = ready ? formatPercent(usage.percent) : `${_("Sampling…")} (—)`;
  const widthPct = ready && usage.percent !== null ? usage.percent.toFixed(1) : "0";

  const bar = (
    <div class={`cbi-progressbar${severityProgressClass(usage.severity)}`} title={titleText} role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={100}>
      <div style={`width:${widthPct}%`}></div>
    </div>
  ) as HTMLElement;

  if (ready && usage.percent !== null) {
    bar.setAttribute("aria-valuenow", String(Math.round(usage.percent)));
  }

  return bar;
}

function renderLabelWithFreq(title: string, freqKhz: number | null, codeTranslateNo = false): HTMLElement {
  const freqText = formatCpuFrequency(freqKhz);
  const nameEl = (<span class="fluent-cpu-status__name">{title}</span>) as HTMLElement;
  if (codeTranslateNo) {
    markNoTranslate(nameEl);
  }
  return (
    <span class="fluent-cpu-status__label-group">
      {nameEl}
      {freqText ? markNoTranslate((<span class="fluent-cpu-status__freq">{freqText}</span>) as HTMLElement) : ""}
    </span>
  );
}

function renderCompactTile(core: CpuCoreUsage): HTMLElement {
  const coreTitle = core.index !== null ? `CPU ${core.index}` : core.id.toUpperCase();
  const freqText = formatCpuFrequency(core.freqKhz);
  const ready = core.percent !== null && Number.isFinite(core.percent);
  const widthPct = ready && core.percent !== null ? core.percent.toFixed(1) : "0";

  const track = (
    <div class={`fluent-status-track fluent-status-track--${core.severity}`} role="progressbar" aria-label={coreTitle} aria-valuemin={0} aria-valuemax={100}>
      <span class="fluent-status-track__fill" style={`width:${widthPct}%`}></span>
    </div>
  ) as HTMLElement;

  if (ready && core.percent !== null) {
    track.setAttribute("aria-valuenow", String(Math.round(core.percent)));
  } else {
    track.setAttribute("aria-valuetext", _("Sampling…"));
  }

  return (
    <div class="fluent-cpu-tile" data-ui-boundary="tonal">
      <div class="fluent-cpu-tile__header">
        <div class="fluent-cpu-tile__meta">
          {markNoTranslate((<span class="fluent-cpu-tile__title">{coreTitle}</span>) as HTMLElement)}
          {freqText ? markNoTranslate((<span class="fluent-cpu-tile__freq">{freqText}</span>) as HTMLElement) : ""}
        </div>
        <span class={`fluent-cpu-tile__value fluent-cpu-tile__value--${core.severity}`}>{formatPercent(core.percent)}</span>
      </div>
      {track}
    </div>
  );
}

function renderCpuContent(snapshot: CpuUsageSnapshot, mode: CpuViewMode, onModeChange: (next: CpuViewMode) => void): HTMLElement {
  const coreCount = snapshot.cores.length;
  const peakFreq = formatCpuFrequency(snapshot.overall?.freqKhz ?? null);
  const summaryParts: string[] = [];
  if (coreCount > 0) {
    summaryParts.push(`${coreCount} ${coreCount === 1 ? _("Core") : _("Cores")}`);
  }
  if (peakFreq) {
    summaryParts.push(`${_("Peak")} ${peakFreq}`);
  }

  const modeControl =
    coreCount > 1
      ? createSegmentedControl<CpuViewMode>(
          [
            { value: "all", label: _("All CPUs") },
            { value: "compact", label: _("Compact") },
            { value: "total", label: _("Total only") },
          ],
          mode,
          _("CPU display mode"),
          GROUP_ID,
          onModeChange,
        )
      : null;

  const effectiveMode: CpuViewMode = coreCount <= 1 ? "total" : mode;
  const overallRow = snapshot.overall ? (
    <tr class="tr">
      <td class="td left" width="33%">
        {renderLabelWithFreq(_("Total load"), effectiveMode === "total" ? snapshot.overall.freqKhz : null)}
      </td>
      <td class="td left">{renderProgressBar(_("Total load"), snapshot.overall)}</td>
    </tr>
  ) : null;

  const coreRows =
    effectiveMode === "all"
      ? snapshot.cores.map((core) => {
          const coreName = core.index !== null ? `CPU ${core.index}` : core.id.toUpperCase();
          return (
            <tr class="tr">
              <td class="td left" width="33%">
                {renderLabelWithFreq(coreName, core.freqKhz, true)}
              </td>
              <td class="td left">{renderProgressBar(coreName, core)}</td>
            </tr>
          );
        })
      : [];

  return (
    <div class="fluent-cpu-status">
      {summaryParts.length > 0 || modeControl ? (
        <div class="fluent-status-toolbar">
          <div class="fluent-status-toolbar__meta">{summaryParts.join(" · ")}</div>
          {modeControl || ""}
        </div>
      ) : (
        ""
      )}
      <table class="table fluent-cpu-status__table">
        <tbody>
          {overallRow || ""}
          {coreRows}
        </tbody>
      </table>
      {effectiveMode === "compact" && snapshot.cores.length > 0 ? <div class="fluent-cpu-grid">{snapshot.cores.map((core) => renderCompactTile(core))}</div> : ""}
    </div>
  );
}

function rerenderMounted(): void {
  if (!mountedRoot?.isConnected || !latestSnapshot) return;
  const focusedVal = captureSegmentedFocus(GROUP_ID);
  const mode = readSavedMode();
  const nextTree = renderCpuContent(latestSnapshot, mode, (nextMode) => {
    writeSavedMode(nextMode);
    rerenderMounted();
  });
  mountedRoot.replaceChildren(...Array.from(nextTree.childNodes));
  restoreSegmentedFocus(mountedRoot, GROUP_ID, focusedVal);
}

function scheduleColdStartWarmup(): void {
  if (warmupTimer !== null) return;
  warmupTimer = setTimeout(async () => {
    warmupTimer = null;
    if (!mountedRoot?.isConnected || !isCpuWidgetEnabled()) return;
    try {
      const payload = await callGetCpu();
      const samples = normalizeCpuPayload(payload);
      if (samples.length === 0) return;
      const snapshot = computeCpuUsage(previousSamples, samples);
      previousSamples = samples;
      previousSampleAt = Date.now();
      latestSnapshot = snapshot;
      rerenderMounted();
    } catch {}
  }, WARMUP_DELAY_MS);
}

const module = {
  title: _("CPU Load"),

  load(): Promise<unknown> {
    if (!isCpuWidgetEnabled()) {
      return Promise.resolve(null);
    }
    return callGetCpu().catch(() => null);
  },

  render(data: unknown): HTMLElement | null {
    if (!isCpuWidgetEnabled() || !data) {
      return null;
    }

    const samples = normalizeCpuPayload(data);
    if (samples.length === 0) {
      return null;
    }

    const now = Date.now();
    const validPrev = previousSamples && now - previousSampleAt < STALE_SAMPLE_MS ? previousSamples : null;
    const snapshot = computeCpuUsage(validPrev, samples);
    previousSamples = samples;
    previousSampleAt = now;
    latestSnapshot = snapshot;

    const previouslyFocused = captureSegmentedFocus(GROUP_ID);
    const mode = readSavedMode();
    const view = renderCpuContent(snapshot, mode, (nextMode) => {
      writeSavedMode(nextMode);
      rerenderMounted();
    });

    mountedRoot = view;
    restoreSegmentedFocus(view, GROUP_ID, previouslyFocused);

    if (!snapshot.ready) {
      scheduleColdStartWarmup();
    }

    return view;
  },
};

export const main = baseclass.extend(module);
