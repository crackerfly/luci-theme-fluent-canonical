const form = L.form;

// LuCI 24.10/25.12 writes non-empty defaults when the UCI option is absent.
// Remove them explicitly so defaults remain runtime fallbacks instead of stored values.
export const omitDefaultValue = (option: LuCI.form.AbstractValue): void => {
  const parse = option.parse.bind(option);
  option.parse = (sectionId: string): Promise<void> => {
    if (option.isActive(sectionId) && option.formvalue(sectionId) === option.default) {
      if (!option.isValid(sectionId)) return parse(sectionId);
      option.remove(sectionId);
      return Promise.resolve();
    }

    return parse(sectionId);
  };
};

export const transparencySteps: number[] = [0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1];
const PREVIEW_STYLE_ID = "fluent-live-preview";
const HEX_RE = /(^#[0-9A-F]{6}$)|(^#[0-9A-F]{3}$)/i;

// Must mirror the inline custom properties header.ut injects, or the live
// preview shown while editing will not match the rendered page.
const COLOR_UCI_TO_CSS_VAR: Record<string, { cssVars: string[]; isDark: boolean }> = {
  primary: { cssVars: ["--fluent-primary"], isDark: false },
  dark_primary: { cssVars: ["--fluent-primary"], isDark: true },
  page_bg: { cssVars: ["--fluent-bg-page"], isDark: false },
  dark_page_bg: { cssVars: ["--fluent-bg-page"], isDark: true },
  card_bg: { cssVars: ["--fluent-bg", "--fluent-bg-card"], isDark: false },
  dark_card_bg: { cssVars: ["--fluent-bg", "--fluent-bg-card"], isDark: true },
  sidebar_bg: { cssVars: ["--fluent-sidebar-bg"], isDark: false },
  dark_sidebar_bg: { cssVars: ["--fluent-sidebar-bg"], isDark: true },
  progressbar_font: { cssVars: ["--fluent-progressbar-font-color"], isDark: false },
  dark_progressbar_font: { cssVars: ["--fluent-progressbar-font-color"], isDark: true },
};

const previewRules = new globalThis.Map<string, { selector: string; cssVar: string; value: string }>();

const getPreviewStyle = (): HTMLStyleElement => {
  let el = document.getElementById(PREVIEW_STYLE_ID) as HTMLStyleElement | null;
  if (!el) {
    el = document.createElement("style");
    el.id = PREVIEW_STYLE_ID;
    document.head.appendChild(el);
  }

  return el;
};

const writePreviewStyle = (): void => {
  const el = getPreviewStyle();
  const bySelector = new globalThis.Map<string, string[]>();

  for (const rule of previewRules.values()) {
    const declarations = bySelector.get(rule.selector) ?? [];
    declarations.push(`${rule.cssVar}: ${rule.value};`);
    bySelector.set(rule.selector, declarations);
  }

  let css = "";
  for (const [selector, declarations] of bySelector) {
    css += `${selector} { ${declarations.join(" ")} }\n`;
  }

  el.textContent = css;
};

const createColorPicker = (textInput: HTMLInputElement, onLiveChange: (value: string) => void): void => {
  if (textInput.dataset.fluentColorPicker === "true") {
    return;
  }

  const parent = textInput.parentElement;
  if (!parent) {
    return;
  }

  textInput.dataset.fluentColorPicker = "true";
  textInput.classList.add("fluent-color-field__text");

  const field = document.createElement("div");
  field.className = "fluent-color-field";

  const swatch = document.createElement("label");
  swatch.className = "fluent-color-swatch";
  swatch.title = _("Choose color");

  const colorPicker = document.createElement("input");
  colorPicker.type = "color";
  colorPicker.className = "fluent-color-swatch__input";
  colorPicker.setAttribute("aria-label", _("Choose color"));

  const preview = document.createElement("span");
  preview.className = "fluent-color-swatch__preview";

  const syncColor = (value: string) => {
    if (!HEX_RE.test(value)) {
      return;
    }

    colorPicker.value = value;
    preview.style.backgroundColor = value;
  };

  syncColor(textInput.value);
  colorPicker.addEventListener("input", () => {
    textInput.value = colorPicker.value;
    preview.style.backgroundColor = colorPicker.value;
    if (HEX_RE.test(colorPicker.value)) {
      onLiveChange(colorPicker.value);
    }
  });
  textInput.addEventListener("input", () => {
    syncColor(textInput.value);
    if (HEX_RE.test(textInput.value)) {
      onLiveChange(textInput.value);
    }
  });

  swatch.appendChild(colorPicker);
  swatch.appendChild(preview);

  parent.insertBefore(field, textInput);
  field.appendChild(textInput);
  field.appendChild(swatch);
};
const publishPreview = (uciKey: string, value: string): void => {
  const mapping = COLOR_UCI_TO_CSS_VAR[uciKey];
  if (!mapping) {
    return;
  }

  const selector = mapping.isDark ? ':root[data-theme="dark"]' : ":root";
  for (const cssVar of mapping.cssVars) {
    previewRules.set(`${mapping.isDark ? "dark" : "light"}|${cssVar}`, { selector, cssVar, value });
  }
  writePreviewStyle();
};

export const configureHexColorValue = (option: LuCI.form.Value, selectorSuffix: string, useAnimationFrame = false): void => {
  option.validate = (sectionId: string, value: unknown) => {
    if (sectionId) {
      return HEX_RE.test(String(value)) || _("Expecting: %s").format(_("valid HEX color value"));
    }
    return true;
  };

  option.render = (optionIndex: number, sectionId: string, inTable: boolean) => {
    const el = form.Value.prototype.render.call(option, optionIndex, sectionId, inTable);

    const bindPicker = () => {
      const textInput = document.querySelector<HTMLInputElement>(`[id^="widget.cbid.fluent."][id$=".${selectorSuffix}"]`);
      if (textInput) {
        createColorPicker(textInput, (value) => publishPreview(selectorSuffix, value));
      }
    };

    if (useAnimationFrame) {
      requestAnimationFrame(bindPicker);
    } else {
      setTimeout(bindPicker, 0);
    }

    return el;
  };
};

export const createModeSubtabs = (section: LuCI.form.TypedSection, parentTab: string, optionName: string): LuCI.form.TypedSection => {
  const container = section.taboption(parentTab, form.SectionValue, optionName, form.TypedSection, "global");

  const modeSection = container.subsection as LuCI.form.TypedSection;
  modeSection.anonymous = true;
  modeSection.addremove = false;
  modeSection.tab("light", _("Light mode"));
  modeSection.tab("dark", _("Dark mode"));

  return modeSection;
};
