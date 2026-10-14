// Creates local release files only. Publishing, tags, remotes, and Git changes are separate actions.
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { copyFileSync, existsSync, mkdirSync, readFileSync, rmSync, statSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "..");
const releaseDir = join(root, "release");
const stageDir = join(releaseDir, "stage");
const moduleId = "eagle-character-edit";
const zipName = `${moduleId}-v13.zip`;
const webFields = ["url", "bugs", "manifest", "download"];
const semver = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;
const plainPath = /^[\w.-]+(\/[\w.-]+)*$/;

function fail(message) {
  throw new Error(message);
}

function readJson(path) {
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch (error) {
    fail(`cannot read ${path}: ${error instanceof Error ? error.message : String(error)}`);
  }
}

function run(command, args, options, context) {
  try {
    return execFileSync(command, args, options);
  } catch (error) {
    // In the locally sandboxed Node runtime, a completed child process can report EPERM despite status 0.
    // Its recorded status and output still prove that the command completed successfully.
    if (
      error &&
      typeof error === "object" &&
      "status" in error &&
      error.status === 0 &&
      "signal" in error &&
      error.signal === null
    ) {
      return "stdout" in error ? error.stdout : "";
    }
    const detail = error && typeof error === "object" && "stderr" in error && error.stderr ? `: ${String(error.stderr).trim()}` : "";
    fail(`${context}${detail}`);
  }
}

function archiveEntries(path) {
  return String(run("unzip", ["-Z1", path], { encoding: "utf8" }, "cannot list the archive"))
    .split("\n")
    .filter((line) => line !== "")
    .sort();
}

function describe(path) {
  const hash = createHash("sha256").update(readFileSync(path)).digest("hex");
  return `${basename(path)}  ${(statSync(path).size / 1024).toFixed(1)} kB  sha256 ${hash}`;
}

function main() {
  const manifest = readJson(join(here, "module.json"));
  const pack = readJson(join(root, "package.json"));
  if (manifest.id !== moduleId || pack.name !== moduleId) fail("module identifiers do not match eagle-character-edit");
  if (!semver.test(String(manifest.version)) || pack.version !== manifest.version) fail("package and manifest versions must match x.y.z");
  if (webFields.some((field) => manifest[field] !== undefined)) fail("a local-only manifest must not contain online release fields");

  const scripts = Array.isArray(manifest.esmodules) ? manifest.esmodules : [];
  const languages = Array.isArray(manifest.languages) ? manifest.languages.map((language) => language?.path) : [];
  const files = ["module.json", ...scripts, ...languages];
  if (scripts.length === 0 || languages.length === 0 || files.some((path) => typeof path !== "string" || !plainPath.test(path))) {
    fail("the manifest must name only plain local ES module and language paths");
  }

  run("npm", ["run", "build"], { cwd: root, stdio: "inherit" }, "the build failed");
  for (const path of files) {
    if (!existsSync(join(here, path))) fail(`the manifest names missing file ${path}`);
  }

  rmSync(releaseDir, { recursive: true, force: true });
  for (const path of files) {
    const destination = join(stageDir, path);
    mkdirSync(dirname(destination), { recursive: true });
    copyFileSync(join(here, path), destination);
  }
  const zipPath = join(releaseDir, zipName);
  const topLevel = [...new Set(files.map((path) => path.split("/")[0]))];
  run("zip", ["-q", "-r", "-D", zipPath, ...topLevel], { cwd: stageDir }, "zip failed");

  const expected = [...files].sort();
  const actual = archiveEntries(zipPath);
  if (JSON.stringify(actual) !== JSON.stringify(expected)) fail(`archive files differ: ${actual.join(", ")}`);
  copyFileSync(join(here, "module.json"), join(releaseDir, "module.json"));
  rmSync(stageDir, { recursive: true, force: true });

  console.log(`package: local release files for ${manifest.version} (nothing was published)`);
  console.log(`  ${describe(join(releaseDir, "module.json"))}`);
  console.log(`  ${describe(zipPath)}`);
  console.log(`  archive: ${actual.join(", ")}`);
}

main();
