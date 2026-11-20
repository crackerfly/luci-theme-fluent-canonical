export interface SegmentedOption<T extends string> {
  value: T;
  label: string;
  noTranslate?: boolean;
}

export function markNoTranslate<T extends HTMLElement>(element: T): T {
  element.setAttribute("translate", "no");
  return element;
}

export function captureSegmentedFocus(groupId: string): string | null {
  const active = document.activeElement;
  if (!(active instanceof HTMLInputElement)) return null;
  const group = active.closest(`[data-segmented-id="${groupId}"]`);
  if (!group) return null;
  return active.value || null;
}

export function restoreSegmentedFocus(root: ParentNode, groupId: string, focusedValue: string | null): void {
  if (!focusedValue) return;
  queueMicrotask(() => {
    const target = root.querySelector<HTMLInputElement>(`[data-segmented-id="${groupId}"] input[type="radio"][value="${focusedValue}"]`);
    if (target?.isConnected) {
      target.focus({ preventScroll: true });
    }
  });
}

export function createSegmentedControl<T extends string>(options: ReadonlyArray<SegmentedOption<T>>, activeValue: T, legendText: string, groupId: string, onSelect: (next: T) => void): HTMLElement {
  const children: HTMLElement[] = [];

  for (const opt of options) {
    const isChecked = opt.value === activeValue;
    const inputId = `${groupId}-${opt.value}`;

    const input = (<input type="radio" id={inputId} name={groupId} value={opt.value} checked={isChecked} class="fluent-status-segmented__input" />) as HTMLInputElement;

    input.checked = isChecked;
    input.addEventListener("change", () => {
      if (input.checked && opt.value !== activeValue) {
        onSelect(opt.value);
      }
    });

    const label = (
      <label htmlFor={inputId} class="fluent-status-segmented__item">
        {opt.label}
      </label>
    ) as HTMLLabelElement;
    label.htmlFor = inputId;

    if (opt.noTranslate) {
      markNoTranslate(label);
    }

    children.push(input, label);
  }

  const fieldset = document.createElement("fieldset");
  fieldset.className = "fluent-status-segmented";
  fieldset.setAttribute("data-segmented-id", groupId);

  const legend = document.createElement("legend");
  legend.className = "fluent-status-segmented__legend";
  legend.textContent = legendText;

  fieldset.append(legend, ...children);
  return fieldset;
}
