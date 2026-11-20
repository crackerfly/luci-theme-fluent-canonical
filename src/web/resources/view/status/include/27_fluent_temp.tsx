import { convertTemperature, formatTemperature, normalizeTempPayload, parseTempUnit, type StatusSeverity, type TempSensorReading, type TempUnit } from "../../../status/model";
import { captureSegmentedFocus, createSegmentedControl, markNoTranslate, restoreSegmentedFocus } from "../../../status/segmented";

const STORAGE_KEY = "fluent-temp-unit";
const GROUP_ID = "fluent-temp-unit";

const callGetTemp = rpc.declare<unknown>({
  object: "luci.fluent_status",
  method: "get_temp",
  expect: { "": {} },
});

let mountedRoot: HTMLElement | null = null;
let latestReadings: TempSensorReading[] = [];

function isTempWidgetEnabled(): boolean {
  const body = document.body;
  if (!body?.hasAttribute("data-fluent-dir")) return false;
  return body.getAttribute("data-temp-status") !== "0";
}

function readSavedUnit(): TempUnit {
  try {
    return parseTempUnit(localStorage.getItem(STORAGE_KEY));
  } catch {
    return "c";
  }
}

function writeSavedUnit(unit: TempUnit): void {
  try {
    localStorage.setItem(STORAGE_KEY, unit);
  } catch {}
}

function severityLabel(severity: StatusSeverity): string {
  if (severity === "critical") return _("Critical");
  if (severity === "warning") return _("High");
  return _("Normal");
}

function renderStatusChip(severity: StatusSeverity): HTMLElement {
  return (
    <span class={`fluent-status-chip fluent-status-chip--${severity}`}>
      <span class={`fluent-status-chip__icon fluent-status-chip__icon--${severity}`} aria-hidden="true"></span>
      <span>{severityLabel(severity)}</span>
    </span>
  );
}

function renderSensorCard(sensor: TempSensorReading, unit: TempUnit): HTMLElement {
  const formattedCurrent = formatTemperature(sensor.tempC, unit);
  const showDistinctSource = sensor.source && sensor.source.toLowerCase() !== sensor.label.toLowerCase() && sensor.source !== "Thermal";

  const thresholdParts: string[] = [];
  if (sensor.warnC !== null) {
    thresholdParts.push(`${_("Warn")} ${formatTemperature(sensor.warnC, unit)}`);
  }
  thresholdParts.push(`${_("Crit")} ${formatTemperature(sensor.effectiveCritC, unit)}`);

  const currentConverted = Math.round(convertTemperature(sensor.tempC, unit));
  const maxConverted = Math.max(1, Math.round(convertTemperature(sensor.effectiveCritC, unit)));

  return (
    <div class="fluent-temp-card" data-ui-boundary="tonal">
      <div class="fluent-temp-card__header">
        <div class="fluent-temp-card__identity">
          {markNoTranslate((<span class="fluent-temp-card__label">{sensor.label}</span>) as HTMLElement)}
          {showDistinctSource ? markNoTranslate((<span class="fluent-temp-card__source">{sensor.source}</span>) as HTMLElement) : ""}
        </div>
        {renderStatusChip(sensor.severity)}
      </div>
      <div class="fluent-temp-card__metrics">
        {markNoTranslate((<span class={`fluent-temp-card__value fluent-temp-card__value--${sensor.severity}`}>{formattedCurrent}</span>) as HTMLElement)}
        <span class="fluent-temp-card__limits">{thresholdParts.join(" · ")}</span>
      </div>
      <div
        class={`fluent-status-track fluent-status-track--${sensor.severity}`}
        role="progressbar"
        aria-label={`${sensor.label} ${formattedCurrent}`}
        aria-valuemin={0}
        aria-valuemax={maxConverted}
        aria-valuenow={Math.max(0, currentConverted)}
        aria-valuetext={formattedCurrent}
      >
        <span class="fluent-status-track__fill" style={`width:${sensor.barPercent.toFixed(1)}%`}></span>
      </div>
    </div>
  );
}

function renderTempContent(readings: TempSensorReading[], unit: TempUnit, onUnitChange: (next: TempUnit) => void): HTMLElement {
  const peakC = readings.reduce((max, item) => (item.tempC > max ? item.tempC : max), readings[0]?.tempC ?? 0);
  const countLabel = `${readings.length} ${readings.length === 1 ? _("Sensor") : _("Sensors")}`;
  const summaryText = `${countLabel} · ${_("Peak")} ${formatTemperature(peakC, unit)}`;

  const unitControl = createSegmentedControl<TempUnit>(
    [
      { value: "c", label: "°C", noTranslate: true },
      { value: "f", label: "°F", noTranslate: true },
    ],
    unit,
    _("Temperature unit"),
    GROUP_ID,
    onUnitChange,
  );

  return (
    <div class="fluent-temp-status">
      <div class="fluent-status-toolbar">
        <div class="fluent-status-toolbar__meta">{summaryText}</div>
        {unitControl}
      </div>
      <div class="fluent-temp-grid">{readings.map((sensor) => renderSensorCard(sensor, unit))}</div>
    </div>
  );
}

function rerenderMounted(): void {
  if (!mountedRoot?.isConnected || latestReadings.length === 0) return;
  const focusedVal = captureSegmentedFocus(GROUP_ID);
  const unit = readSavedUnit();
  const nextTree = renderTempContent(latestReadings, unit, (nextUnit) => {
    writeSavedUnit(nextUnit);
    rerenderMounted();
  });
  mountedRoot.replaceChildren(...Array.from(nextTree.childNodes));
  restoreSegmentedFocus(mountedRoot, GROUP_ID, focusedVal);
}

const module = {
  title: _("Temperature"),

  load(): Promise<unknown> {
    if (!isTempWidgetEnabled()) {
      return Promise.resolve(null);
    }
    return callGetTemp().catch(() => null);
  },

  render(data: unknown): HTMLElement | null {
    if (!isTempWidgetEnabled() || !data) {
      return null;
    }

    const readings = normalizeTempPayload(data);
    if (readings.length === 0) {
      return null;
    }

    latestReadings = readings;
    const previouslyFocused = captureSegmentedFocus(GROUP_ID);
    const unit = readSavedUnit();
    const view = renderTempContent(readings, unit, (nextUnit) => {
      writeSavedUnit(nextUnit);
      rerenderMounted();
    });

    mountedRoot = view;
    restoreSegmentedFocus(view, GROUP_ID, previouslyFocused);
    return view;
  },
};

export const main = baseclass.extend(module);
