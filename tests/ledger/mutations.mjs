#!/usr/bin/env node
// Mutation check for plugins/seo-genius/scripts/ledger.mjs: each entry undoes
// one rule, runs the ledger tests, and must turn them red. The script file is
// restored after every mutation, also when a run is interrupted.
// Run: node tests/ledger/mutations.mjs
import { readFileSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { join, dirname } from "node:path";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const FILE = join(ROOT, "plugins", "seo-genius", "scripts", "ledger.mjs");
const TESTS = join(ROOT, "tests", "ledger", "ledger.test.mjs");

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
];

const original = readFileSync(FILE, "utf8");
const restore = () => writeFileSync(FILE, original);
process.on("SIGINT", () => {
  restore();
  process.exit(130);
});

const results = [];
try {
  for (const [name, from, to] of MUTATIONS) {
    const text = original.replace(/\r\n/g, "\n");
    if (!text.includes(from)) {
      results.push([name, "NOT APPLIED"]);
      continue;
    }
    writeFileSync(FILE, text.replace(from, () => to));
    const r = spawnSync(process.execPath, ["--test", TESTS], { encoding: "utf8", cwd: ROOT });
    const failed = Number((r.stdout.match(/^ℹ fail (\d+)/m) ?? [])[1] ?? 0);
    results.push([name, r.status !== 0 && failed > 0 ? `CAUGHT (${failed} failing)` : "MISSED"]);
    restore();
  }
} finally {
  restore();
}
for (const [name, verdict] of results) console.log(`${verdict.padEnd(20)} | ${name}`);
const caught = results.filter(([, v]) => v.startsWith("CAUGHT")).length;
console.log(`\n${caught}/${results.length} mutations caught`);
process.exit(caught === results.length ? 0 : 1);
