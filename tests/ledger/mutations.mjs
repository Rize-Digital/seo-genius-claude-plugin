#!/usr/bin/env node
// Mutation check for the plugin's scripts (ledger.mjs, node-check.cjs) and the
// repository checker (scripts/check.mjs): each entry undoes one rule, runs the
// test files that cover it, and must turn them red. The mutated file is restored
// after every mutation, also when a run is interrupted.
// Run: node tests/ledger/mutations.mjs [name filter]
// (Set SEO_GENIUS_TEST_OLD_NODES as tests/ledger/node.test.mjs describes to run
// the real-old-Node test too.)
import { readFileSync, writeFileSync, readdirSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { join, dirname } from "node:path";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const SCRIPTS = join(ROOT, "plugins", "seo-genius", "scripts");
const LEDGER = join(SCRIPTS, "ledger.mjs");
const NODE_CHECK = join(SCRIPTS, "node-check.cjs");
const CHECK = join(ROOT, "scripts", "check.mjs");
const testFile = (rel) => join(ROOT, "tests", rel);
const ALL_LEDGER = readdirSync(join(ROOT, "tests", "ledger")).filter((n) => n.endsWith(".test.mjs")).map((n) => testFile(`ledger/${n}`));
// The crash and lock files take most of the time, so they run only for the rules they cover.
const LIGHT = ALL_LEDGER.filter((p) => !/[\\/](crash|lock)\.test\.mjs$/.test(p));
const CRASH = [testFile("ledger/crash.test.mjs")];
const LOCK = [testFile("ledger/lock.test.mjs")];
const CHECKS = [testFile("check/check.test.mjs")];

// [name, from, to, { file = LEDGER, tests = LIGHT }]
const MUTATIONS = [
  ["item key follows list order", "    const key = itemKey(c);\n    if (seen.has(key)) return;", "    const key = itemKey(c) + i;\n    if (seen.has(key)) return;"],
  ["item key without page normalization", "  return [norm(c.action), pageKey(c.target_page), norm(c.change_kind), norm(c.keyword)].join(\"|\");", "  return [norm(c.action), c.target_page, norm(c.change_kind), norm(c.keyword)].join(\"|\");"],
  ["a done item is reopened by a later plan", "    if (TERMINAL.has(item.status)) {\n      out.kept_terminal.push(item.id);", "    if (false) {\n      out.kept_terminal.push(item.id);"],
  ["a folder of another site is not refused", "  if (other) {", "  if (false) {"],
  ["sc-domain: is not stripped", "  s = s.replace(/^sc-domain:/, \"\");", ""],
  ["a capped issue list closes items", "  const issuesRead = Array.isArray(input.issues) && input.issues_complete !== false;", "  const issuesRead = Array.isArray(input.issues);"],
  ["a rolled-back fix closes an item", "            !NOT_LIVE.has(c.state) &&", "            true &&"],
  ["history row on every save", "  if (item.status !== status) {\n    item.history.push", "  if (true) {\n    item.history.push"],
  ["the site repository is committed", "    const gitReady = mode === \"workspace\" ? ensureWorkspaceGit(dir, env) : false;", "    const gitReady = ensureWorkspaceGit(dir, env);"],
  ["a newer format is read anyway", "  if (Number.isInteger(data?.format_version) && data.format_version > FORMAT_VERSION) {", "  if (false) {"],
  ["a partial ledger is trusted", "  if (problems.length > 0) {", "  if (false) {"],
  ["a corrupt ledger is overwritten instead of moved aside", "        writes.push(...q.writes);", "        writes.push(q.writes[1]);"],
  ["the lock file is committed", "const GITIGNORE_LINES = [`${LOCK_PREFIX}*`, ", "const GITIGNORE_LINES = ["],
  ["a hand edit is overwritten without a copy", "    writes.push(...guarded.writes);", ""],
  ["pull keeps a colliding id on the local item", "      if (!local.synced) {\n        // Two machines", "      if (false) {\n        // Two machines"],
  ["ids restart below the server's", "  ledger.next_ids.P = Math.max(ledger.next_ids.P ?? 1, maxServer + 1, ...ledger.items.map((it) => idNumber(it.id) + 1));", ""],
  ["a refused item is marked synced", "    if ([\"created\", \"updated\", \"unchanged\"].includes(row.result)) {", "    if (true) {"],
  ["a run is resent forever", "      run.synced = true;", "      run.synced = false;"],
  ["a synced item is sent again", "  const dirty = ledger.items.filter((it) => !sameState(it.synced, statusState(it))).slice(0, PUSH_MAX_ITEMS);", "  const dirty = ledger.items.slice(0, PUSH_MAX_ITEMS);"],
  ["no git on the machine fails the run", "  return !r.error && r.status === 0;", "  if (r.error) throw r.error;\n  return r.status === 0;"],
  ["the history read accepts a partial read", "  if (input.complete !== true) {\n    throw new LedgerError(\"bad_input\", \"history needs every page", "  if (false) {\n    throw new LedgerError(\"bad_input\", \"history needs every page"],
  ["a changelog row repeated across pages is added twice", "    const have = known.get(key);\n    if (have) {", "    const have = null;\n    if (have) {"],
  ["a monitor-detected change is labelled as an MCP log entry", "  return c.source === \"reported\" && c.origin === \"crawl\" ? \"Detected on the live page\" : CHANGE_SOURCES[c.source];", "  return CHANGE_SOURCES[c.source];"],
  ["the ledger script runs on Node older than 18", "  return !(major >= NODE_MIN_MAJOR);", "  return false;"],
  ["the Node check passes an old Node", "var ok = major >= MIN_MAJOR;", "var ok = true;", { file: NODE_CHECK }],
  ["the Node check gives no install instructions", "    \". Nothing was read or written. Install the current LTS from https://nodejs.org \" +", "    \". \" +", { file: NODE_CHECK }],

  // 1. One generation at a time.
  ["files are written in place before the commit point", "    writeDurable(join(tdir, file), w.data);", "    writeDurable(target(dir, w.rel), w.data);", { tests: CRASH }],
  ["a committed transaction is thrown away on recovery", "    if (existsSync(join(tdir, \"manifest.json\"))) {", "    if (false) {", { tests: CRASH }],
  ["a replayed removal undoes a later write of the same file", "writes.filter((w, i) => last.get(w.rel) === i)", "writes.filter(() => true)", { tests: CRASH }],
  ["show reads without finishing an interrupted command", "    const recovered = existsSync(dir) && pendingTransactions(dir) ? finishInterrupted(dir, mode, env) : [];", "    const recovered = [];", { tests: CRASH }],
  // 2. The lock.
  ["the lock appears before its owner is written in it", "  writeDurable(tmp, JSON.stringify(owner));\n  step(\"lock:written\");\n  renameSync(tmp, path);", "  writeDurable(path, \"\");\n  step(\"lock:written\");\n  writeDurable(path, JSON.stringify(owner));", { tests: LOCK }],
  ["a crashed run's lock on this machine is judged by age alone", "  if (l.owner.host === thisHost() && !processAlive(l.owner.pid)) return true;\n", "", { tests: LOCK }],
  ["a long run does not refresh its lock", "        lock.touch();\n        sleep(100);", "        sleep(100);", { tests: LOCK }],
  ["two runs that see each other both go on", "    if (live.length === 0) {\n      step(\"lock:held\");", "    if (true) {\n      step(\"lock:held\");", { tests: LOCK }],
  ["taking over a stale lock removes the other runs' locks too", "        removeStaleLock(dir, l);", "        for (const o of otherLocks(dir, lock.name)) unlinkSync(o.path);", { tests: LOCK }],
  ["a stale takeover stops looking for live owners", "        removeStaleLock(dir, l);", "        removeStaleLock(dir, l);\n        break;", { tests: LOCK }],
  ["a run commits after losing its lock", "  lock.assertHeld();\n", "", { tests: LOCK }],
  // 3. History for any new ledger.
  ["a ledger rebuilt with no plan items does not ask for its history", "      ledger.history_complete = false;\n    }\n    if (input?.site_id", "      if (restored) ledger.history_complete = false;\n    }\n    if (input?.site_id"],
  ["a restored ledger does not ask for its history", "      ledger.history_complete = false;\n    }\n    if (input?.site_id", "    }\n    if (input?.site_id"],
  // 4. Three-way merge.
  ["a server-side clear is not adopted", "    merged[f] = side[f] === \"server\" ? r : l;", "    merged[f] = side[f] === \"server\" && r !== null ? r : l;"],
  ["pull lets the server win over a local change", "    else if (base && r === b) side[f] = \"local\";", "    else if (base && r === b) side[f] = \"server\";"],
  ["a status's reason and date are merged apart from it", "  if (side.status === \"server\" || side.status === \"local\" || side.status === \"conflict\") {", "  if (false) {"],
  ["the issue link is not a synced field", "export const SYNC_FIELDS = [\"status\", \"status_reason\", \"until\", \"change_id\", \"issue_id\"];", "export const SYNC_FIELDS = [\"status\", \"status_reason\", \"until\", \"change_id\"];"],
  ["a change link the server cleared is linked again by a later week", "            !(it.cleared_changes ?? []).includes(c.key),", "            true,"],
  // 5. Unknown ownership fails closed.
  ["a folder whose owner cannot be read is used anyway", "  if (!found.site && found.unreadable.length > 0 && !claim) {", "  if (false) {"],
  ["claim takes a folder without the domain named twice", "    if (named !== normalizeDomain(opts.site)) {", "    if (false) {"],
  // 7. The folder exists, with git, before any write; every file goes through save.
  ["prepare writes the folder without its git", "    const gitReady = mode === \"workspace\" ? ensureWorkspaceGit(dir, env) : false;", "    const gitReady = mode === \"workspace\" && cmd !== \"prepare\" ? ensureWorkspaceGit(dir, env) : false;"],
  ["the drafts are committed", "`${TXN_DIR}/`, `${DRAFTS_DIR}/`, ", "`${TXN_DIR}/`, "],
  ["save takes a file the ledger owns", "    if (LEDGER_OWNED.has(rel) ||", "    if (false && LEDGER_OWNED.has(rel) ||"],
  ["save keeps another site's file", "        if (other !== site) throw", "        if (false) throw"],
  ["a saved draft is left behind", "    for (const d of drafts) rmSync(d.draft, { force: true });", ""],
  // 8. The checker compares with the canonical text.
  ["check compares the Server sync copies only with each other", "for (const [name, b] of syncBlocks) check(b === SYNC,", "for (const [name, b] of syncBlocks) check(b === syncBlocks[0][1],", { file: CHECK, tests: CHECKS }],
  ["check compares the Standing rules copies only with each other", "for (const [name, b] of rulesBlocks) check(b === RULES,", "for (const [name, b] of rulesBlocks) check(b === rulesBlocks[0][1],", { file: CHECK, tests: CHECKS }],
  ["check compares the Unattended runs copies only with each other", "for (const [name, b] of unattendedBlocks) check(b === UNATTENDED,", "for (const [name, b] of unattendedBlocks) check(b === unattendedBlocks[0][1],", { file: CHECK, tests: CHECKS }],
  ["check compares the folder bullets only with each other", "  check(!!bullet && bullet[1] === FOLDER,", "  check(!!bullet && bullet[1] === resolverBullets[0],", { file: CHECK, tests: CHECKS }],
  ["check accepts any save bullet", "  check(!!save && save[1] === SAVE,", "  check(!!save,", { file: CHECK, tests: CHECKS }],
  ["check lets a skill write into .seo-genius/ directly", "  check(direct.length === 0,", "  check(true,", { file: CHECK, tests: CHECKS }],
];

const files = [LEDGER, NODE_CHECK, CHECK];
const originals = new Map(files.map((f) => [f, readFileSync(f, "utf8")]));
const restoreAll = () => {
  for (const [f, text] of originals) writeFileSync(f, text);
};
process.on("SIGINT", () => {
  restoreAll();
  process.exit(130);
});

const only = process.argv[2] ?? "";
const results = [];
try {
  for (const [name, from, to, { file = LEDGER, tests = LIGHT } = {}] of MUTATIONS) {
    if (only && !name.includes(only)) continue;
    const text = originals.get(file).replace(/\r\n/g, "\n");
    if (!text.includes(from)) {
      results.push([name, "NOT APPLIED"]);
      continue;
    }
    writeFileSync(file, text.replace(from, () => to));
    const r = spawnSync(process.execPath, ["--test", ...tests], { encoding: "utf8", cwd: ROOT });
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
