import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

function walk(directory, predicate) {
  const files = [];
  for (const name of readdirSync(directory)) {
    const path = join(directory, name);
    if (statSync(path).isDirectory()) files.push(...walk(path, predicate));
    else if (predicate(path)) files.push(path);
  }
  return files;
}

const manifest = JSON.parse(readFileSync(join(root, "manifest.json"), "utf8"));
const packageMetadata = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
assert.equal(manifest.manifest_version, 3);
assert.deepEqual([...manifest.permissions].sort(), ["storage", "tabs"]);
assert.equal(manifest.incognito, "not_allowed");
assert.equal(manifest.host_permissions, undefined);
assert.equal(manifest.optional_host_permissions, undefined);
assert.equal(manifest.content_scripts, undefined);
assert.match(manifest.content_security_policy.extension_pages, /script-src 'self'/);
assert.doesNotMatch(manifest.content_security_policy.extension_pages, /unsafe-|https?:/);
assert.equal(packageMetadata.license, "MIT");
assert.equal(packageMetadata.repository.url, "https://github.com/sihrc/singleton-tabs.git");

const referencedFiles = [
  manifest.background.service_worker,
  manifest.action.default_popup,
  manifest.options_ui.page,
  ...Object.values(manifest.action.default_icon || {}),
  ...Object.values(manifest.icons || {}),
];
for (const file of referencedFiles) {
  assert.ok(existsSync(join(root, file)), `Manifest reference does not exist: ${file}`);
}

const javascriptFiles = [
  ...walk(join(root, "src"), (path) => path.endsWith(".js")),
  ...walk(join(root, "tests"), (path) => path.endsWith(".js")),
  ...walk(join(root, "scripts"), (path) => path.endsWith(".mjs")),
];
for (const file of javascriptFiles) {
  const result = spawnSync(process.execPath, ["--check", file], { encoding: "utf8" });
  assert.equal(result.status, 0, `${relative(root, file)} failed syntax check:\n${result.stderr}`);
}

const extensionSources = walk(join(root, "src"), () => true);
const combinedSource = extensionSources.map((path) => readFileSync(path, "utf8")).join("\n");
for (const forbidden of [
  /\bfetch\s*\(/,
  /\bXMLHttpRequest\b/,
  /\bWebSocket\b/,
  /\beval\s*\(/,
  /\bnew\s+Function\b/,
]) {
  assert.doesNotMatch(combinedSource, forbidden, `Forbidden extension surface: ${forbidden}`);
}

for (const htmlFile of walk(join(root, "src"), (path) => path.endsWith(".html"))) {
  const html = readFileSync(htmlFile, "utf8");
  assert.doesNotMatch(
    html,
    /<script\b(?![^>]*\bsrc\s*=)[^>]*>/i,
    `${relative(root, htmlFile)} contains an inline script`,
  );
}

console.log(`check passed: ${javascriptFiles.length} scripts, ${referencedFiles.length} manifest references`);
