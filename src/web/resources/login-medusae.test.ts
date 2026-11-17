import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

const currentDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(currentDir, "../../..");
const fullSysauthPath = path.join(repoRoot, "package/luci-theme-fluent/ucode/template/themes/fluent/sysauth.ut");
const liteSysauthPath = path.join(repoRoot, "package/luci-theme-fluent-lite/ucode/template/themes/fluent/sysauth.ut");

function extractMedusaeScript(templateSource: string): string {
  const blockStart = templateSource.indexOf("{% } else if (backgroundType === 'MedusaeDynamic') { %}");
  assert.notEqual(blockStart, -1, "Missing MedusaeDynamic branch in sysauth.ut");
  const scriptOpen = '<script type="text/javascript">//<![CDATA[\n';
  const scriptClose = "\n  //]]></script>";
  const start = templateSource.indexOf(scriptOpen, blockStart);
  assert.notEqual(start, -1, "Missing Medusae CDATA script start");
  const contentStart = start + scriptOpen.length;
  const end = templateSource.indexOf(scriptClose, contentStart);
  assert.notEqual(end, -1, "Missing Medusae CDATA script close");
  return templateSource.slice(contentStart, end);
}

interface Snapshot {
  P: {
    breathSpeed: number;
    haloRadius: number;
    activeSize: number;
    cursorFollow: number;
    cursorStrength: number;
    density: number;
  };
  GRID_X: number;
  GRID_Y: number;
  count: number;
  mouse: { x: number; y: number; hovering: boolean };
  smoothMouse: { x: number; y: number };
  COLOR_BASE: [number, number, number];
  time: number;
  frame: number;
  failed: boolean;
}

interface HarnessOptions {
  dpr?: number;
  theme?: "light" | "dark";
  reduced?: boolean;
  respectReducedAttr?: string;
  hidden?: boolean;
  noContext?: boolean;
}

function createSeededMath(): Math {
  const math = Object.create(Math) as Math;
  let seed = 0x51ab10;
  math.random = () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  return math;
}

type Listener = (event?: Record<string, unknown>) => void;

function createEventTarget<T extends Record<string, unknown>>(initial: T) {
  const handlers = new Map<string, Listener[]>();
  return Object.assign(initial, {
    addEventListener(name: string, callback: Listener) {
      const list = handlers.get(name) ?? [];
      list.push(callback);
      handlers.set(name, list);
    },
    emit(name: string, event: Record<string, unknown> = {}) {
      for (const callback of handlers.get(name) ?? []) {
        callback(event);
      }
    },
  });
}

function createHarness(rawScript: string, options: HarnessOptions = {}) {
  const probe = `
    globalThis.__medusaeTest = {
      snapshot: () => JSON.parse(JSON.stringify({
        P, GRID_X, GRID_Y, count: particles.length,
        mouse, smoothMouse, COLOR_BASE, time, frame, failed
      }))
    };
  `;
  const instrumented = rawScript.replace(/\}\)\(\);\s*$/, `${probe}\n})();\n`);
  const pending = new Map<number, (now: number) => void>();
  const mutations: Array<{
    callback: (records: Array<{ target: unknown; attributeName: string }>) => void;
    targets: Array<{ target: unknown; attributeFilter: string[] }>;
  }> = [];
  let nextFrame = 1;
  let paints = 0;
  let throwDrawing = false;

  const box = { left: 0, top: 0, width: 1280, height: 800 };
  const context2d = new Proxy(
    {
      clearRect() {
        if (throwDrawing) {
          throw new Error("Simulated Canvas failure");
        }
        paints += 1;
      },
      createRadialGradient() {
        return { addColorStop() {} };
      },
    },
    {
      get(target, key: string) {
        if (key in target) {
          return target[key as keyof typeof target];
        }
        return () => {};
      },
      set(target, key: string, value: unknown) {
        (target as Record<string, unknown>)[key] = value;
        return true;
      },
    },
  );

  const view = createEventTarget({ hidden: Boolean(options.hidden) });
  const host = { hidden: false, getBoundingClientRect: () => ({ ...box }) };
  const canvas = {
    width: 300,
    height: 150,
    hidden: true,
    style: {},
    getContext: () => (options.noContext ? null : context2d),
  };
  const html = {
    dataset: { theme: options.theme ?? "dark" },
    getAttribute(attr: string) {
      return attr === "data-theme" ? this.dataset.theme : null;
    },
  };
  let bodyReducedAttr = options.respectReducedAttr ?? "1";
  const body = {
    getAttribute(attr: string) {
      return attr === "data-prefers-reduced-motion" ? bodyReducedAttr : null;
    },
  };
  const motion = createEventTarget({ matches: Boolean(options.reduced) });
  const mockDocument = createEventTarget({
    hidden: false,
    documentElement: html,
    body,
    getElementById(id: string) {
      const map: Record<string, unknown> = {
        "auth-view": view,
        "login-medusae": host,
        "login-medusae-canvas": canvas,
      };
      return map[id] ?? null;
    },
  });
  const mockWindow = createEventTarget({
    devicePixelRatio: options.dpr ?? 1,
    innerWidth: box.width,
    innerHeight: box.height,
    matchMedia: () => motion,
  });

  const sandbox: Record<string, unknown> = {
    window: mockWindow,
    document: mockDocument,
    Math: createSeededMath(),
    requestAnimationFrame(callback: (now: number) => void) {
      const id = nextFrame;
      nextFrame += 1;
      pending.set(id, callback);
      return id;
    },
    cancelAnimationFrame(id: number) {
      pending.delete(id);
    },
    MutationObserver: class {
      callback: (records: Array<{ target: unknown; attributeName: string }>) => void;
      targets: Array<{ target: unknown; attributeFilter: string[] }> = [];
      constructor(callback: (records: Array<{ target: unknown; attributeName: string }>) => void) {
        this.callback = callback;
        mutations.push(this);
      }
      observe(target: unknown, config: { attributeFilter?: string[] }) {
        this.targets.push({ target, attributeFilter: config.attributeFilter ?? [] });
      }
    },
    ResizeObserver: class {
      observe() {}
    },
  };

  vm.createContext(sandbox);
  vm.runInContext(instrumented, sandbox, { filename: "login-medusae.js" });

  const notifyMutation = (target: unknown, attributeName: string) => {
    for (const observer of mutations) {
      if (observer.targets.some((entry) => entry.target === target && entry.attributeFilter.includes(attributeName))) {
        observer.callback([{ target, attributeName }]);
      }
    }
  };

  return {
    canvas,
    host,
    pending,
    mockDocument,
    mockWindow,
    get paints() {
      return paints;
    },
    state(): Snapshot {
      const api = sandbox.__medusaeTest as { snapshot: () => Snapshot };
      return JSON.parse(JSON.stringify(api.snapshot())) as Snapshot;
    },
    step(now: number) {
      const first = pending.entries().next();
      assert.equal(first.done, false, "Expected a queued animation frame");
      const [id, callback] = first.value;
      pending.delete(id);
      callback(now);
    },
    setTheme(theme: "light" | "dark") {
      html.dataset.theme = theme;
      notifyMutation(html, "data-theme");
    },
    setReducedMotion(matches: boolean) {
      motion.matches = matches;
      motion.emit("change");
    },
    setBodyRespectReduced(value: string) {
      bodyReducedAttr = value;
      notifyMutation(body, "data-prefers-reduced-motion");
    },
    pointer(clientX: number, clientY: number) {
      mockDocument.emit("pointermove", { clientX, clientY });
    },
    breakDrawing() {
      throwDrawing = true;
    },
  };
}

describe("Medusae login background animation in sysauth.ut", () => {
  const fullTemplate = fs.readFileSync(fullSysauthPath, "utf8");
  const liteTemplate = fs.readFileSync(liteSysauthPath, "utf8");
  const script = extractMedusaeScript(fullTemplate);

  it("keeps full and lite sysauth.ut byte-identical and free of ucode syntax collisions", () => {
    assert.equal(fullTemplate, liteTemplate);
    for (const forbidden of ["{{", "}}", "{%", "%}", "{#", "#}"]) {
      assert.equal(script.includes(forbidden), false, `Unexpected ucode delimiter ${forbidden} inside inline script`);
    }
  });

  it("initializes the exact BreathDearMedusae 84x46 particle grid and parameters", () => {
    const h = createHarness(script, { dpr: 2, theme: "dark" });
    const s = h.state();
    assert.deepEqual(s.P, {
      breathSpeed: 1.28,
      haloRadius: 2.4,
      activeSize: 0.024,
      cursorFollow: 0.72,
      cursorStrength: 3,
      density: 1.2,
    });
    assert.equal(s.GRID_X, 84);
    assert.equal(s.GRID_Y, 46);
    assert.equal(s.count, 3864);
    assert.equal(h.canvas.width, 2560);
    assert.equal(h.canvas.height, 1600);
    assert.equal(h.canvas.hidden, false);
    assert.deepEqual(s.COLOR_BASE, [0, 0, 255]);
    assert.equal(h.paints, 1);
    assert.equal(h.pending.size, 1);
  });

  it("switches COLOR_BASE dynamically between dark and light themes and tracks pointer coordinates", () => {
    const h = createHarness(script, { theme: "light" });
    assert.deepEqual(h.state().COLOR_BASE, [200, 200, 220]);
    h.setTheme("dark");
    assert.deepEqual(h.state().COLOR_BASE, [0, 0, 255]);

    h.pointer(640, 400);
    assert.deepEqual(h.state().mouse, { x: 0, y: 0, hovering: true });
    h.mockWindow.emit("blur");
    assert.equal(h.state().mouse.hovering, false);
  });

  it("honors OS prefers-reduced-motion as well as LuCI data-prefers-reduced-motion override", () => {
    const h = createHarness(script, { reduced: true, respectReducedAttr: "1", theme: "light" });
    assert.equal(h.paints, 1);
    assert.equal(h.pending.size, 0);

    // When user sets prefers_reduced_motion = '0' in Fluent settings, animation resumes
    h.setBodyRespectReduced("0");
    assert.equal(h.pending.size, 1);

    // Restoring '1' pauses RAF and renders static frame
    h.setBodyRespectReduced("1");
    assert.equal(h.pending.size, 0);

    // Turning off OS reduced motion resumes single RAF loop
    h.setReducedMotion(false);
    assert.equal(h.pending.size, 1);
  });

  it("pauses on visibilitychange/print and falls back cleanly on canvas error", () => {
    const h = createHarness(script);
    h.step(0);
    h.step(16);
    assert.equal(h.state().time, 0.016);

    h.mockWindow.emit("beforeprint");
    assert.equal(h.pending.size, 0);
    h.mockWindow.emit("afterprint");
    assert.equal(h.pending.size, 1);

    h.breakDrawing();
    h.step(32);
    assert.equal(h.state().failed, true);
    assert.equal(h.canvas.hidden, true);
    assert.equal(h.pending.size, 0);
  });
});
