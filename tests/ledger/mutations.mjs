#!/usr/bin/env node
// Mutation check for the plugin's scripts (ledger.mjs, node-check.cjs): each
// entry undoes one rule, runs every test file in tests/ledger, and must turn
// them red. The mutated file is restored after every mutation, also when a run
// is interrupted.
// Run: node tests/ledger/mutations.mjs
// (Set SEO_GENIUS_TEST_OLD_NODES as tests/ledger/node.test.mjs describes to run
// the real-old-Node test too.)
import { readFileSync, writeFileSync, readdirSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { join, dirname } from "node:path";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const SCRIPTS = join(ROOT, "plugins", "seo-genius", "scripts");
const LEDGER = join(SCRIPTS, "ledger.mjs");
const CHECK = join(SCRIPTS, "node-check.cjs");
const TEST_DIR = join(ROOT, "tests", "ledger");
const TESTS = readdirSync(TEST_DIR).filter((n) => n.endsWith(".test.mjs")).map((n) => join(TEST_DIR, n));

// [name, from, to] edits ledger.mjs; [name, from, to, file] edits another script.
const MUTATIONS = [
  ["item key follows list order", "    const key = itemKey(c);\n    if (seen.has(key)) return;", "    const key = itemKey(c) + i;\n    if (seen.has(key)) return;"],
  ["item key without page normalization", "  return [norm(c.action), pageKey(c.target_page), norm(c.change_kind), norm(c.keyword)].join(\"|\");", "  return [norm(c.action), c.target_page, norm(c.change_kind), norm(c.keyword)].join(\"|\");"],
  ["a done item is reopened by a later plan", "    if (TERMINAL.has(item.status)) {\n      out.kept_terminal.push(item.id);", "    if (false) {\n      out.kept_terminal.push(item.id);"],
  ["a folder of another site is not refused", "  if (owner && owner !== domain) {", "  if (false) {"],
  ["sc-domain: is not stripped", "  s = s.replace(/^sc-domain:/, \"\");", ""],
  ["a capped issue list closes items", "  const issuesRead = Array.isArray(input.issues) && input.issues_complete !== false;", "  const issuesRead = Array.isArray(input.issues);"],
  ["a rolled-back fix closes an item", "&& !NOT_LIVE.has(c.state),", ","],
  ["history row on every save", "  if (item.status !== status) {\n    item.history.push", "  if (true) {\n    item.history.push"],
  ["the site repository is committed", "    const gitReady = mode === \"workspace\" ? ensureWorkspaceGit(dir, env) : false;", "    const gitReady = ensureWorkspaceGit(dir, env);"],
  ["a newer format is read anyway", "  if (Number.isInteger(data?.format_version) && data.format_version > FORMAT_VERSION) {", "  if (false) {"],
  ["a partial ledger is trusted", "  if (problems.length > 0) {", "  if (false) {"],
  ["a corrupt ledger is overwritten instead of moved aside", "      quarantined = quarantine(dir);", "      quarantined = null;"],
  ["a live lock is taken over", "      if (!stale) {\n        throw new LedgerError(", "      if (false) {\n        throw new LedgerError("],
  ["the lock file is committed", "    if (!existsSync(join(dir, \".gitignore\"))) writeFileSync(join(dir, \".gitignore\"), `${LOCK_FILE}\\n*.tmp\\n`);", ""],
  ["a hand edit is overwritten without a copy", "    const guarded = guardFiles(dir, recorded);", "    const guarded = { hand_edited: [], missing: [] };"],
  ["pull lets the server win over a local change", "    if (!localChanged) {\n      setStatus(local", "    if (true) {\n      setStatus(local"],
  ["pull keeps a colliding id on the local item", "      if (!local.synced) {\n        // Two machines", "      if (false) {\n        // Two machines"],
  ["ids restart below the server's", "  ledger.next_ids.P = Math.max(ledger.next_ids.P ?? 1, maxServer + 1, ...ledger.items.map((it) => idNumber(it.id) + 1));", ""],
  ["a refused item is marked synced", "    if ([\"created\", \"updated\", \"unchanged\"].includes(row.result)) {", "    if (true) {"],
  ["a run is resent forever", "      run.synced = true;", "      run.synced = false;"],
  ["a synced item is sent again", "  const dirty = ledger.items.filter((it) => !sameState(it.synced, statusState(it))).slice(0, PUSH_MAX_ITEMS);", "  const dirty = ledger.items.slice(0, PUSH_MAX_ITEMS);"],
  ["no git on the machine fails the run", "  return !r.error && r.status === 0;", "  if (r.error) throw r.error;\n  return r.status === 0;"],
  ["the history read accepts a partial read", "  if (input.complete !== true) {\n    throw new LedgerError(\"bad_input\", \"history needs every page", "  if (false) {\n    throw new LedgerError(\"bad_input\", \"history needs every page"],
  ["a restored ledger does not ask for its history", "      if (restored) ledger.history_complete = false;", ""],
  ["a changelog row repeated across pages is added twice", "    const have = known.get(key);\n    if (have) {", "    const have = null;\n    if (have) {"],
  ["a monitor-detected change is labelled as an MCP log entry", "  return c.source === \"reported\" && c.origin === \"crawl\" ? \"Detected on the live page\" : CHANGE_SOURCES[c.source];", "  return CHANGE_SOURCES[c.source];"],
  ["the ledger script runs on Node older than 18", "  return !(major >= NODE_MIN_MAJOR);", "  return false;"],
  ["the Node check passes an old Node", "var ok = major >= MIN_MAJOR;", "var ok = true;", CHECK],
  ["the Node check gives no install instructions", "    \". Nothing was read or written. Install the current LTS from https://nodejs.org \" +", "    \". \" +", CHECK],
];

const originals = new Map([LEDGER, CHECK].map((f) => [f, readFileSync(f, "utf8")]));
const restoreAll = () => {
  for (const [f, text] of originals) writeFileSync(f, text);
};
process.on("SIGINT", () => {
  restoreAll();
  process.exit(130);
});

const results = [];
try {
  for (const [name, from, to, file = LEDGER] of MUTATIONS) {
    const text = originals.get(file).replace(/\r\n/g, "\n");
    if (!text.includes(from)) {
      results.push([name, "NOT APPLIED"]);
      continue;
    }
    writeFileSync(file, text.replace(from, () => to));
    const r = spawnSync(process.execPath, ["--test", ...TESTS], { encoding: "utf8", cwd: ROOT });
    const failed = Number((r.stdout.match(/^ℹ fail (\d+)/m) ?? [])[1] ?? 0);
    results.push([name, r.status !== 0 && failed > 0 ? `CAUGHT (${failed} failing)` : "MISSED"]);
    restoreAll();
  }
} finally {
  restoreAll();
}
for (const [name, verdict] of results) console.log(`${verdict.padEnd(20)} | ${name}`);
const caught = results.filter(([, v]) => v.startsWith("CAUGHT")).length;
console.log(`\n${caught}/${results.length} mutations caught`);
process.exit(caught === results.length ? 0 : 1);
