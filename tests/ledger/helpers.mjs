// Shared by the ledger tests that drive the script as a real process.
import { mkdtempSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, existsSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import os, { tmpdir } from "node:os";
import { spawn, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";

export const SCRIPT = fileURLToPath(new URL("../../plugins/seo-genius/scripts/ledger.mjs", import.meta.url));
export const site = "bomannfencing.com";
export const U = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

export function scratch() {
  const dir = mkdtempSync(join(tmpdir(), "sg-ledger-"));
  return { dir, home: join(dir, "home"), siteDir: join(dir, "home", site), done: () => rmSync(dir, { recursive: true, force: true }) };
}

/** Clears the test seams and SEO_GENIUS_HOME the developer may have set. */
function cleanEnv(extra) {
  const env = { ...process.env };
  for (const k of Object.keys(env)) if (k.startsWith("SEO_GENIUS_")) delete env[k];
  return { ...env, ...extra };
}

function parse(text) {
  try {
    return JSON.parse(text);
  } catch {
    return { unparsed: text };
  }
}

/** One ledger command as a process: `ledger.mjs <cmd> --site --home --cwd [...]`. */
export function cli(s, cmd, { args = [], input, env = {}, today = "2026-10-19" } = {}) {
  const argv = [SCRIPT, cmd, "--site", site, "--home", s.home, "--cwd", s.dir, "--today", today, ...args];
  if (input !== undefined) argv.push("--input", "-");
  const r = spawnSync(process.execPath, argv, { input: input === undefined ? undefined : JSON.stringify(input), encoding: "utf8", env: cleanEnv(env) });
  return { code: r.status, out: parse(r.stdout), stderr: r.stderr };
}

/** The same, started in the background. */
export function cliAsync(s, cmd, { args = [], input, env = {}, today = "2026-10-19" } = {}) {
  return new Promise((resolve) => {
    const argv = [SCRIPT, cmd, "--site", site, "--home", s.home, "--cwd", s.dir, "--today", today, ...args];
    if (input !== undefined) argv.push("--input", "-");
    const p = spawn(process.execPath, argv, { env: cleanEnv(env) });
    let out = "";
    p.stdout.on("data", (d) => (out += d));
    p.on("close", (code) => resolve({ code, out: parse(out) }));
    if (input !== undefined) p.stdin.end(JSON.stringify(input));
    else p.stdin.end();
  });
}

const STAMP = /\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}-\d{3}Z/g;

/**
 * Every file of a site folder by path and hash, without what is never part of a
 * generation: git's own folder, transactions, drafts, lock files. Time stamps in
 * file names (hand-edit and corrupt copies) are blanked so two runs compare.
 */
export function snapshot(dir) {
  const out = {};
  const walk = (d, rel) => {
    for (const n of readdirSync(d).sort()) {
      if (rel === "" && (n === ".git" || n === ".txn" || n === ".drafts" || n.startsWith(".ledger.lock."))) continue;
      const p = join(d, n);
      const r = rel ? `${rel}/${n}` : n;
      if (statSync(p).isDirectory()) walk(p, r);
      else out[r.replace(STAMP, "<stamp>")] = createHash("sha256").update(readFileSync(p)).digest("hex").slice(0, 16);
    }
  };
  if (existsSync(dir)) walk(dir, "");
  return out;
}

export function git(dir, ...args) {
  return spawnSync("git", ["-C", dir, ...args], { encoding: "utf8" });
}

export function commits(dir) {
  const r = git(dir, "log", "--format=%s");
  return r.status === 0 ? r.stdout.trim().split("\n").filter(Boolean) : [];
}

export function lockFiles(dir) {
  return existsSync(dir) ? readdirSync(dir).filter((n) => n.startsWith(".ledger.lock.")) : [];
}

export function pendingTxns(dir) {
  return existsSync(join(dir, ".txn")) ? readdirSync(join(dir, ".txn")) : [];
}

/**
 * A process id no live process has. A pid that has just ended is not enough:
 * Windows hands it out again within moments when many processes start, and a lock
 * planted with it then belongs to a live process. 2147483647 is odd (Windows pids
 * are multiples of 4) and above the pid limit of Linux and macOS.
 */
export function deadPid() {
  return 2147483647;
}

export function writeDraft(s, rel, text) {
  const p = join(s.siteDir, ".drafts", ...rel.split("/"));
  mkdirSync(join(p, ".."), { recursive: true });
  writeFileSync(p, text);
}

export const PLAN = {
  items: [
    { action: "improve", target_page: "https://bomannfencing.com/blog/escape-proof-goat-fencing", change_kind: "content_depth", keyword: "escape proof goat fencing", what_to_do: "Expand the guide" },
    { action: "improve", target_page: "https://bomannfencing.com/blog/how-many-strands-barbed-wire-cattle/", change_kind: "title", keyword: "how many feet of barbed wire on a roll", what_to_do: "Answer the roll-length question in the title" },
    { action: "create", target_page: "/services/goat-fencing", keyword: "goat fencing", what_to_do: "Service page" },
  ],
};

/** How many ledger processes a test runs at once. */
export const POOL = Math.max(2, Math.min(8, (os.availableParallelism?.() ?? os.cpus().length) - 1));

/** Runs fn over items, at most limit at a time; rejects with the first failure. */
export async function pool(items, limit, fn) {
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const k = next++;
      await fn(items[k], k);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
}
