/**
 * Fail loud unless cwd is the Expo app root (product/).
 * Windows: C:\Users\alank\Desktop\Infiniti-adventure\product
 */
const fs = require("fs");
const path = require("path");
const cwd = process.cwd();
const pkgPath = path.join(cwd, "package.json");
const appJsonPath = path.join(cwd, "app.json");
if (!fs.existsSync(pkgPath) || !fs.existsSync(appJsonPath)) {
  console.error("ERROR: Expo scripts must run from product/");
  console.error("Windows: cd C:\\Users\\alank\\Desktop\\Infiniti-adventure\\product");
  console.error("Current:", cwd);
  process.exitCode = 1;
  throw new Error("wrong cwd");
}
let pkg;
try { pkg = JSON.parse(fs.readFileSync(pkgPath, "utf8")); } catch (e) {
  console.error("ERROR: Could not read package.json in product/");
  process.exitCode = 1; throw e;
}
if (pkg.name !== "infinite-adventure") {
  console.error("ERROR: Expo scripts must run from product/ (bad package name:", pkg.name + ")");
  console.error("Windows: cd C:\\Users\\alank\\Desktop\\Infiniti-adventure\\product");
  console.error("Current:", cwd);
  process.exitCode = 1; throw new Error("wrong cwd");
}
let appJson;
try { appJson = JSON.parse(fs.readFileSync(appJsonPath, "utf8")); } catch (e) {
  console.error("ERROR: Could not read app.json in product/");
  process.exitCode = 1; throw e;
}
const slug = appJson && appJson.expo && appJson.expo.slug;
if (slug !== "infinite-adventure") {
  console.error("ERROR: Expo scripts must run from product/ (bad expo.slug:", String(slug) + ")");
  console.error("Windows: cd C:\\Users\\alank\\Desktop\\Infiniti-adventure\\product");
  console.error("Current:", cwd);
  process.exitCode = 1; throw new Error("wrong cwd");
}
const major = Number(process.versions.node.split(".")[0]);
if (major >= 24) {
  console.warn("WARNING: Node " + process.versions.node + " detected. Prefer Node 22 LTS for Expo SDK 57 / Metro on Windows.");
}
