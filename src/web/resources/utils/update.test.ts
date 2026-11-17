import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { ReleaseAsset } from "./update";

Object.assign(globalThis, {
  L: {
    rpc: {
      declare: () => () => Promise.resolve(),
    },
  },
});

const SAMPLE_ASSETS: ReleaseAsset[] = [
  {
    name: "luci-theme-fluent_1.0.10-r1_all.ipk",
    digest: `sha256:${"a".repeat(64)}`,
    browser_download_url: "https://github.com/LazuliKao/luci-theme-fluent/releases/download/v1.0.10/luci-theme-fluent_1.0.10-r1_all.ipk",
  },
  {
    name: "luci-theme-fluent-1.0.10-r1.apk",
    digest: `sha256:${"b".repeat(64)}`,
    browser_download_url: "https://github.com/LazuliKao/luci-theme-fluent/releases/download/v1.0.10/luci-theme-fluent-1.0.10-r1.apk",
  },
  {
    name: "luci-i18n-fluent-zh-cn_1.0.10-r1_all.ipk",
    digest: `sha256:${"c".repeat(64)}`,
    browser_download_url: "https://github.com/LazuliKao/luci-theme-fluent/releases/download/v1.0.10/luci-i18n-fluent-zh-cn_1.0.10-r1_all.ipk",
  },
  {
    name: "luci-i18n-fluent-zh-cn-1.0.10-r1.apk",
    digest: `sha256:${"d".repeat(64)}`,
    browser_download_url: "https://github.com/LazuliKao/luci-theme-fluent/releases/download/v1.0.10/luci-i18n-fluent-zh-cn-1.0.10-r1.apk",
  },
];

describe("update utilities", () => {
  it("disables upstream repository overwrite by default on Canonical builds", async () => {
    const { FLUENT_UPDATE_REPO, fetchLatestRelease } = await import("./update");
    assert.equal(FLUENT_UPDATE_REPO, "");
    await assert.rejects(() => fetchLatestRelease("stable", "apk", [], undefined, ""), /not configured/);
  });

  it("matches apk and ipk translation assets accurately", async () => {
    const { matchI18nAsset } = await import("./update");
    const apk = matchI18nAsset(SAMPLE_ASSETS, "zh-cn", "apk");
    assert.equal(apk?.name, "luci-i18n-fluent-zh-cn-1.0.10-r1.apk");

    const ipk = matchI18nAsset(SAMPLE_ASSETS, "zh-cn", "ipk");
    assert.equal(ipk?.name, "luci-i18n-fluent-zh-cn_1.0.10-r1_all.ipk");

    assert.equal(matchI18nAsset(SAMPLE_ASSETS, "ja", "apk"), null);
  });

  it("builds verified SHA-256 update manifests with optional mirror prefix", async () => {
    const { updateManifest } = await import("./update");
    const manifest = JSON.parse(updateManifest([SAMPLE_ASSETS[1], SAMPLE_ASSETS[3]], "https://ghfast.top/"));
    assert.equal(manifest.packages.length, 2);
    assert.equal(manifest.packages[0].sha256, "b".repeat(64));
    assert.ok(manifest.packages[0].url.startsWith("https://ghfast.top/https://github.com/"));
  });

  it("rejects assets missing sha256 digests or non-https URLs", async () => {
    const { updateManifest } = await import("./update");
    assert.throws(() =>
      updateManifest([
        {
          name: "bad.apk",
          digest: "",
          browser_download_url: "https://example.com/bad.apk",
        },
      ]),
    );
    assert.throws(() =>
      updateManifest([
        {
          name: "insecure.apk",
          digest: `sha256:${"f".repeat(64)}`,
          browser_download_url: "http://example.com/insecure.apk",
        },
      ]),
    );
  });
});
