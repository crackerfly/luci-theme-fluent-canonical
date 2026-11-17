import { resolve } from "node:path";
import { devRemote, loadDevRemoteConfig } from "@lazulikao/luci-types/dev";

const config = loadDevRemoteConfig();
config.buildCommand = "pnpm run watch:dashboard";
const pkg = "package/luci-mod-fluentdashboard";

config.localDistPaths = [
  resolve(pkg, "htdocs/luci-static/resources/view/fluentdashboard"),
  resolve(pkg, "root/usr/share/luci/menu.d"),
  resolve(pkg, "root/usr/share/rpcd/acl.d"),
];
config.remotePaths = [
  "/www/luci-static/resources/view/fluentdashboard",
  "/usr/share/luci/menu.d",
  "/usr/share/rpcd/acl.d",
];

await devRemote(config);
