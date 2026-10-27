#!/usr/bin/env node
// Mutation check for the plugin's scripts (ledger.mjs, node-check.cjs) and the
// repository checker (scripts/check.mjs): each entry undoes one rule, runs the
// test files that cover it, and must turn them red.
//
// It never writes into this checkout. The repository is copied once into a
// temporary folder; each mutant is written into that copy, its tests run there,
// and the copy's file is put back before the next one. The copy is removed at
// the end, also after Ctrl-C. Each mutant has a time limit (MUTATION_TIMEOUT_MS,
// default 15 minutes); a run past it is killed with its whole process tree and
// reported TIMED OUT, which counts as not caught. A line is printed when each
// mutant starts and when it ends, with its time.
//
// Run: node tests/ledger/mutations.mjs [name filter]
//      node tests/ledger/mutations.mjs --list    every mutant applies? (no tests run)
//      MUTATION_SHARD=2/4 node tests/ledger/mutations.mjs   the second of four shards
// (Set SEO_GENIUS_TEST_OLD_NODES as tests/ledger/node.test.mjs describes to run
// the real-old-Node test too.)
import { readFileSync, writeFileSync, readdirSync, mkdtempSync, cpSync, rmSync } from "node:fs";
import { spawn, spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { join, dirname, relative, basename } from "node:path";
import { tmpdir } from "node:os";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const LEDGER = "plugins/seo-genius/scripts/ledger.mjs";
const NODE_CHECK = "plugins/seo-genius/scripts/node-check.cjs";
const CHECK = "scripts/check.mjs";
const ALL_LEDGER = readdirSync(join(ROOT, "tests", "ledger"))
  .filter((n) => n.endsWith(".test.mjs"))
  .map((n) => `tests/ledger/${n}`);
// The crash and lock files take most of the time, so they run only for the rules they cover.
const LIGHT = ALL_LEDGER.filter((p) => !/\/(crash|lock)\.test\.mjs$/.test(p));
const CRASH = ["tests/ledger/crash.test.mjs"];
const LOCK = ["tests/ledger/lock.test.mjs"];
const CHECKS = ["tests/check/check.test.mjs"];
const TIMEOUT_MS = Number(process.env.MUTATION_TIMEOUT_MS) || 15 * 60 * 1000;

// [name, from, to, { file = LEDGER, tests = LIGHT }]
const MUTATIONS = [
  ["item key follows list order", "    const key = itemKey(c);\n    if (seen.has(key)) return;", "    const key = itemKey(c) + i;\n    if (seen.has(key)) return;"],
  ["item key without page normalization", "  return [norm(c.action), pageKey(c.target_page), norm(c.change_kind), norm(c.keyword)].join(\"|\");", "  return [norm(c.action), c.target_page, norm(c.change_kind), norm(c.keyword)].join(\"|\");"],
  ["a done item is reopened by a later plan", "    if (TERMINAL.has(item.status)) {\n      out.kept_terminal.push(item.id);", "    if (false) {\n      out.kept_terminal.push(item.id);"],
  ["a folder of another site is not refused", "  if (other) {", "  if (false) {"],
  ["sc-domain: is not stripped", "  s = s.replace(/^sc-domain:/, \"\");", ""],
  ["a capped issue list closes items", "  const issuesRead = Array.isArray(input.issues) && input.issues_complete !== false;", "  const issuesRead = Array.isArray(input.issues);"],
  ["a failed linked-issue read closes its item", "Object.hasOwn(states, id) && states[id] !== \"open\"", "states[id] !== \"open\""],
  ["an open linked issue closes its item", "Object.hasOwn(states, id) && states[id] !== \"open\"", "Object.hasOwn(states, id)"],
  ["issue_states are ignored", "(states !== undefined ? Object.hasOwn", "(false ? Object.hasOwn"],
  ["issue_states and issues together are accepted", "  if (states !== undefined && input.issues !== undefined) throw", "  if (false) throw"],
  ["issue_states of the wrong shape are accepted", "Array.isArray(states) || Object.values(states).some((v) => typeof v !== \"string\")", "false"],
  ["issue_totals of the wrong shape are accepted", "Array.isArray(totals) || Object.values(totals).some((n) => !Number.isInteger(n) || n < 0)", "false"],
  ["issue_totals are not the counts", "  if (now.issue_totals !== undefined) return {", "  if (false) return {"],
  ["the snapshot drops issue_totals", "...(input.issue_totals !== undefined && { issue_totals: input.issue_totals })", "...{}"],
  ["show leaves out the issue id", "        issue_id: it.links?.issue_id ?? null,\n", ""],
  ["an opened line without an issue list", "  if (c.previous_as_of && c.issues_opened) lines.push", "  if (c.previous_as_of) lines.push"],
  ["a rolled-back fix closes an item", "            !NOT_LIVE.has(c.state) &&", "            true &&"],
  ["history row on every save", "  if (item.status !== status) {\n    item.history.push", "  if (true) {\n    item.history.push"],
  ["the site repository is committed", "    gitReady = mode === \"workspace\" ? ensureWorkspaceGit(dir, env) : false;", "    gitReady = ensureWorkspaceGit(dir, env);"],
  ["a newer format is read anyway", "  if (Number.isInteger(data?.format_version) && data.format_version > FORMAT_VERSION) {", "  if (false) {"],
  ["a partial ledger is trusted", "  if (problems.length > 0) {", "  if (false) {"],
  ["a corrupt ledger is overwritten instead of moved aside", "      writes.push(...q.writes);", "      writes.push(q.writes[1]);"],
  ["the lock file is committed", "const GITIGNORE_LINES = [`${LOCK_PREFIX}*`, ", "const GITIGNORE_LINES = ["],
  ["a hand edit is overwritten without a copy", "  writes.push(...guarded.writes);", ""],
  ["pull keeps a colliding id on the local item", "      if (!local.synced) {\n        // Two machines", "      if (false) {\n        // Two machines"],
  ["ids restart below the server's", "  ledger.next_ids.P = Math.max(ledger.next_ids.P ?? 1, maxServer + 1, ...ledger.items.map((it) => idNumber(it.id) + 1));", ""],
  ["a refused item is marked synced", "    if ([\"created\", \"updated\", \"unchanged\"].includes(row.result)) {", "    if (true) {"],
  ["a run is resent forever", "      run.synced = true;", "      run.synced = false;"],
  ["a synced item is sent again", "  const items = ledger.items.filter((it) => !sameState(it.synced, statusState(it)));", "  const items = ledger.items;"],
  ["an in-progress item is not closed by its own verified change", "      if (own?.state === \"verified\") {", "      if (false) {"],
  ["an own change closes an in-progress item before it is verified", "      if (own?.state === \"verified\") {", "      if (own && !NOT_LIVE.has(own.state)) {"],
  ["any verified change on the page closes an in-progress item", "      const own = ledger.changes.find((c) => c.key === it.links.change);", "      const own = ledger.changes.find((c) => c.page === pageKey(it.target_page) && c.state === \"verified\") ?? ledger.changes.find((c) => c.key === it.links.change);"],
  ["the own-change rule closes items of any status", "    if (it.status === \"in_progress\" && it.links.change) {", "    if (it.links.change) {"],
  ["set-status --change links nothing", "      it.links.change = key;\n", ""],
  ["set-status --change takes any value", "    if (opts[k] !== undefined && !UUID_RE.test(String(opts[k]))) throw", "    if (false) throw"],
  ["an own change not verified yet is not reported in held", "        out.held.push({ id: it.id, status: it.status, until: null, would_be: \"done\", reason: why });", ""],
  ["awaiting_ack reads the stored payload record", "  return { items, runs, pending, awaiting_ack: pending && !!ledger.pending_push };", "  return { items, runs, pending, awaiting_ack: !!ledger.pending_push };"],
  ["a pull that confirms the state keeps a stale payload record", "    if (Object.keys(pp.items).length === 0 && pp.runs.length === 0) {", "    if (false) {"],
  ["a command that writes nothing creates a missing folder", "    if (!CREATES.has(cmd)) {\n      // resolve and show leave", "    if (false) {\n      // resolve and show leave"],
  ["nothing to send still sets up git, .gitignore and drafts", "    if (result.nothing_to_send) return { ...base, files: {}, commit: null, ...result };", "    if (result.nothing_to_send) { setUp(); return { ...base, files: {}, commit: null, ...result }; }"],
  ["set-status --change replaces a different link", "      if (opts.replaceChange === undefined && it.links.change && it.links.change !== key) {", "      if (false) {"],
  ["--change and --replace-change together are accepted", "  if (opts.change !== undefined && opts.replaceChange !== undefined) throw", "  if (false) throw"],
  ["the changelog leaves out a source with no rows", "    countLine(ledger.changes.filter((c) => c.source === \"coach_applied_fix\").length, \"dashboard fix\", \"dashboard fixes\"),\n", ""],
  ["save refuses the draft's own path", "  const pathLike = nodePath.isAbsolute(given) || /^\\.{1,2}[\\\\/]/.test(given) || /(^|[\\\\/])\\.drafts[\\\\/]/.test(given);", "  const pathLike = false;"],
  ["an allow verdict sets a reason", "input.verdicts[it.id].status !== \"open\") next", "true) next"],
  ["a run-out wait waits for a verdict", "    else if (it.status === \"waiting\" && weekMayChange(it, today)) next = { status: \"open\", reason: null, until: null };\n", ""],
  ["a week changes a manual status", "    if (!weekMayChange(it, today)) {", "    if (false) {"],
  ["a wait before its date may change", "  return it.status === \"waiting\" && it.until != null && it.until <= today;", "  return it.status === \"waiting\";"],
  ["an item in progress may change", "  if (it.status === \"open\" || it.status === \"unchecked\") return true;", "  if (it.status !== \"waiting\") return true;"],
  ["a run-out wait is kept", "  return it.status === \"waiting\" && it.until != null && it.until <= today;", "  return false;"],
  ["a site folder is taken for a site repository", "      return isLedgerWorkspace(dir, io, homeHint) ? ", "      return false ? "],
  ["a site folder is known only under the configured home", "  return !!io.isWorkspace?.(dir);", "  return false;"],
  ["inside a site folder the default home is used", "  if (!base && found.workspace) base = p.dirname(found.workspace);", ""],
  ["the folder holding a site folder is not its home", "    if (io.exists(p.join(here, \".git\")) && isLedgerWorkspace(here, io)) base = p.resolve(cwd);", ""],
  ["nothing to send still records a payload and commits", "  if (!pending.pending) return { nothing_to_send: true, payload: { items: [], runs: [] } };", ""],
  ["show reads the stored payload for push_pending", "      push_pending: pending.pending,", "      push_pending: !!ledger.pending_push,"],
  ["a week dated other than the run is accepted", "  if (input?.as_of != null && input.as_of !== today) {", "  if (false) {"],
  ["--today is not checked", "  if (!DATE_RE.test(today)) throw", "  if (false) throw"],
  ["the run is dated in local time", "  return now.toISOString().slice(0, 10);", "  return now.toLocaleDateString(\"en-CA\");"],
  ["set-status drops a reason it was not given", "    const given = (v, have) => (v === undefined ? (same ? have ?? null : null) : v || null);", "    const given = (v, have) => (v === undefined ? null : v || null);"],
  ["set-status keeps a reason across a status change", "    const given = (v, have) => (v === undefined ? (same ? have ?? null : null) : v || null);", "    const given = (v, have) => (v === undefined ? have ?? null : v || null);"],
  ["an empty --reason is stored, not cleared", "    const given = (v, have) => (v === undefined ? (same ? have ?? null : null) : v || null);", "    const given = (v, have) => (v === undefined ? (same ? have ?? null : null) : v);"],
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
  ["the owner is read before a pending transaction is finished", "  const recovered = recoverTransactions(dir, { gitReady: recoverGit, env, lock });\n  step(\"owner:check\");\n  const where = ownerAnswer(cmd, located);", "  const where = ownerAnswer(cmd, located);\n  const recovered = recoverTransactions(dir, { gitReady: recoverGit, env, lock });\n  step(\"owner:check\");", { tests: CRASH }],
  ["resolve and show read without the lock or recovery", "  if (!existsSync(dir)) {\n    if (!CREATES.has(cmd)) {", "  if (!existsSync(dir) || cmd === \"resolve\" || cmd === \"show\") {\n    if (!CREATES.has(cmd)) {", { tests: CRASH }],
  ["resolve does not finish a pending transaction", "  const recovered = recoverTransactions(dir, { gitReady: recoverGit, env, lock });", "  const recovered = cmd === \"resolve\" ? [] : recoverTransactions(dir, { gitReady: recoverGit, env, lock });", { tests: CRASH }],
  // 2. The lock.
  ["the lock appears before its owner is written in it", "  writeDurable(tmp, JSON.stringify(owner));\n  step(\"lock:written\");\n  renameSync(tmp, path);", "  writeDurable(path, \"\");\n  step(\"lock:written\");\n  writeDurable(path, JSON.stringify(owner));", { tests: LOCK }],
  ["a crashed run's lock on this machine is judged by age alone", "  if (l.owner.host === thisHost() && !processAlive(l.owner.pid)) return true;\n", "", { tests: LOCK }],
  ["a long run does not refresh its lock", "      lock.touch();\n      sleep(100);", "      sleep(100);", { tests: LOCK }],
  ["two runs that see each other both go on", "    if (live.length === 0) {\n      step(\"lock:held\");", "    if (true) {\n      step(\"lock:held\");", { tests: LOCK }],
  ["taking over a stale lock removes the other runs' locks too", "        if (removeStaleLock(dir, l) === \"contended\") live.push({ ...l, owner: null, heartbeat: Date.now() });", "        for (const o of otherLocks(dir, lock.name)) unlinkSync(o.path);", { tests: LOCK }],
  ["a stale takeover stops looking for live owners", "        if (removeStaleLock(dir, l) === \"contended\") live.push({ ...l, owner: null, heartbeat: Date.now() });", "        if (removeStaleLock(dir, l) === \"contended\") live.push({ ...l, owner: null, heartbeat: Date.now() });\n        break;", { tests: LOCK }],
  ["a run commits after losing its lock", "  lock.assertHeld();\n", "", { tests: LOCK }],
  ["a sharing error on the stale lock's delete crashes the run", "    if (SHARING_ERRORS.has(e.code)) return \"contended\";\n    throw e;", "    throw e;", { tests: LOCK }],
  ["a contended takeover is not counted as a live owner", "        if (removeStaleLock(dir, l) === \"contended\") live.push({ ...l, owner: null, heartbeat: Date.now() });", "        removeStaleLock(dir, l);", { tests: LOCK }],
  ["a sharing error reading another run's lock crashes the run", "    if (SHARING_ERRORS.has(e.code)) return { name, path, owner: null, heartbeat: Date.now(), busy: true };\n", "", { tests: LOCK }],
  // 3. History for any new ledger.
  ["a ledger rebuilt with no plan items does not ask for its history", "    ledger.history_complete = false;\n  }\n  if (input?.site_id", "    if (restored) ledger.history_complete = false;\n  }\n  if (input?.site_id"],
  ["a restored ledger does not ask for its history", "    ledger.history_complete = false;\n  }\n  if (input?.site_id", "  }\n  if (input?.site_id"],
  // 4. Three-way merge.
  ["a server-side clear is not adopted", "    merged[f] = side[f] === \"server\" ? r : l;", "    merged[f] = side[f] === \"server\" && r !== null ? r : l;"],
  ["pull lets the server win over a local change", "    else if (base && r === b) side[f] = \"local\";", "    else if (base && r === b) side[f] = \"server\";"],
  ["the reason and the date follow the side whose status won", "  const normalized = normalizeState(merged)", "  if (side.status !== \"same\") {\n    const from = side.status === \"server\" ? theirs : mine;\n    for (const f of [\"status_reason\", \"until\"]) {\n      merged[f] = from[f] ?? null;\n      if (side.status === \"server\") side[f] = \"server\";\n    }\n  }\n  const normalized = normalizeState(merged)"],
  ["an until date on a status other than waiting is kept (the rule itself)", "  if ((x.until ?? null) !== null && x.status !== \"waiting\") {", "  if (false) {", { tests: ["tests/ledger/normalize.test.mjs", "tests/ledger/merge.test.mjs"] }],
  ["a waiting item with no date is given one", "  if ((x.until ?? null) !== null && x.status !== \"waiting\") {", "  if (x.status === \"waiting\" && (x.until ?? null) === null) {\n    x.until = \"9999-12-31\";\n    return [{ field: \"until\", rule: \"invented\" }];\n  }\n  if ((x.until ?? null) !== null && x.status !== \"waiting\") {", { tests: ["tests/ledger/normalize.test.mjs", "tests/ledger/merge.test.mjs"] }],
  ["path: the merge skips the rule", "  const normalized = normalizeState(merged).map(({ field, rule }) => ({ field, rule }));", "  const normalized = [];", { tests: ["tests/ledger/normalize.test.mjs", "tests/ledger/merge.test.mjs"] }],
  ["path: an item imported from the server skips the rule", "  normalizeItem(it, today);\n  ledger.items.push(it);", "  ledger.items.push(it);", { tests: ["tests/ledger/normalize.test.mjs", "tests/ledger/merge.test.mjs"] }],
  ["path: a ledger read from disk skips the rule", "  for (const it of ledger.items) normalizeItem(it, today);\n", "", { tests: ["tests/ledger/normalize.test.mjs", "tests/ledger/merge.test.mjs"] }],
  ["path: setStatus skips the rule", "  normalizeItem(item, on);\n  if (changed) item.updated_on = on;", "  if (changed) item.updated_on = on;", { tests: ["tests/ledger/normalize.test.mjs", "tests/ledger/merge.test.mjs"] }],
  ["path: show displays a date the next write will clear", "    for (const it of ledger.items) normalizeItem(it);\n", "", { tests: ["tests/ledger/normalize.test.mjs", "tests/ledger/merge.test.mjs"] }],
  ["what the rule changed is not reported", "  for (const c of changes) normalizedLog.push({ id: it.id, ...c });", "", { tests: ["tests/ledger/normalize.test.mjs", "tests/ledger/merge.test.mjs"] }],
  ["a cleared date is marked synced, so it is never pushed", "  normalizeItem(it, today);\n  ledger.items.push(it);", "  normalizeItem(it, today);\n  it.synced = statusState(it);\n  ledger.items.push(it);", { tests: ["tests/ledger/normalize.test.mjs", "tests/ledger/merge.test.mjs"] }],
  ["a both-sides change is not reported as a conflict", "    else side[f] = \"conflict\";", "    else side[f] = \"local\";"],
  ["a server date the rule cleared is reported as adopted", "side[f] === \"server\" && merged[f] === (theirs[f] ?? null)", "side[f] === \"server\""],
  ["the issue link is not a synced field", "export const SYNC_FIELDS = [\"status\", \"status_reason\", \"until\", \"change_id\", \"issue_id\"];", "export const SYNC_FIELDS = [\"status\", \"status_reason\", \"until\", \"change_id\"];"],
  ["a change link the server cleared is linked again by a later week", "            !(it.cleared_changes ?? []).includes(c.key),", "            true,"],
  // 5. Unknown ownership fails closed.
  ["a folder whose owner cannot be read is used anyway", "  if (!found.site && found.unreadable.length > 0 && !claim) {", "  if (false) {"],
  ["one valid owner file outweighs an unreadable one", "distinct.length === 1 && unreadable.length === 0 ? distinct[0] : null", "distinct.length === 1 ? distinct[0] : null"],
  ["claim takes a half-readable folder as already claimed", "    if (found.site === site) {\n      claimed = [];", "    if (found.sites.includes(site)) {\n      claimed = [];"],
  ["a claim that moved the ledger aside writes an empty one", "  if (!movedLedger) writes.push(", "  writes.push("],
  ["a claim that moved only config.json drops the ledger", "  if (!movedLedger) {\n    try {", "  if (cmd !== \"claim\") {\n    try {"],
  ["claim takes a folder without the domain named twice", "    if (named !== normalizeDomain(opts.site)) {", "    if (false) {"],
  // 7. The folder exists, with git, before any write; every file goes through save.
  ["prepare writes the folder without its git", "    gitReady = mode === \"workspace\" ? ensureWorkspaceGit(dir, env) : false;", "    gitReady = mode === \"workspace\" && cmd !== \"prepare\" ? ensureWorkspaceGit(dir, env) : false;"],
  ["the drafts are committed", "`${TXN_DIR}/`, `${DRAFTS_DIR}/`, ", "`${TXN_DIR}/`, "],
  ["save takes a file the ledger owns", "    if (LEDGER_OWNED.has(low) ||", "    if (false && LEDGER_OWNED.has(low) ||"],
  ["save keeps another site's file", "        if (other !== site) throw", "        if (false) throw"],
  ["a saved draft is left behind", "      if (readFileSync(p).equals(d.data)) unlinkSync(p);", "      readFileSync(p);"],
  // 8. The checker compares with the canonical text.
  ["a pull ignores last_run", "  const lastId = input.last_run?.run_id ? String(input.last_run.run_id) : null;", "  const lastId = null;"],
  ["last_run confirms only itself, not the payload's other runs", "    const recorded = new Set(sent.length > 0 && sent[sent.length - 1] === lastId ? sent : [lastId]);", "    const recorded = new Set([lastId]);"],
  ["last_run confirms every unsynced run", "    const recorded = new Set(sent.length > 0 && sent[sent.length - 1] === lastId ? sent : [lastId]);", "    const recorded = new Set(ledger.runs.map((r) => r.run_id));"],
  ["a confirming pull keeps the item's sync_error", "      delete local.sync_error;\n      out.in_sync += 1;", "      out.in_sync += 1;"],
  ["a pull prunes nothing of a lost payload", "        return it && !sameState(it.synced, sent) && !sameState(it.synced, statusState(it));", "        return true;"],
  ["a refused run removes the folder it made", "    preflight(cmd, input, located.site, today);\n    mkdirSync(dir, { recursive: true });\n  }\n  // Every command, in this order: the lock, then a pending transaction finished or\n  // thrown away, then whose folder it is. Owner files half moved in are never read.\n  const lock = acquireLock(dir);\n  try {\n    return runLocked(cmd, { ...opts, input }, { located, lock, today, env, drafts_dir });\n  } finally {\n    lock.release();\n  }", "    preflight(cmd, input, located.site, today);\n  }\n  const created = existsSync(dir) ? undefined : mkdirSync(dir, { recursive: true });\n  let ok = false;\n  try {\n    const lock = acquireLock(dir);\n    try {\n      const out = runLocked(cmd, { ...opts, input }, { located, lock, today, env, drafts_dir });\n      ok = true;\n      return out;\n    } finally {\n      lock.release();\n    }\n  } finally {\n    if (created && !ok) rmSync(created, { recursive: true, force: true });\n  }", { tests: ["tests/ledger/round10.test.mjs"] }],
  ["a missing folder is made before its input is checked", "    preflight(cmd, input, located.site, today);\n", ""],
  ["save reads the draft through a link", "    const draft = insidePath(dir, `${DRAFTS_DIR}/${rel}`);", "    const draft = join(dir, DRAFTS_DIR, ...rel.split(\"/\"));"],
  ["a symbolic link or junction is not a link", "    if (isLink(st)) {\n      throw new LedgerError(\"unsafe_path\"", "    if (st.isFile() && st.nlink > 1) {\n      throw new LedgerError(\"unsafe_path\""],
  ["a hard link is not a link", "  return st.isSymbolicLink() || (st.isFile() && st.nlink > 1);", "  return st.isSymbolicLink();"],
  ["a manifest may name a staged file outside its folder", "    if (!e.remove && !/^[0-9]+\\.data$/.test(String(e.file))) {", "    if (false) {"],
  ["a write that changes nothing is still committed", "  const changing = writes.filter((w) => !unchangedOnDisk(dir, w));", "  const changing = writes;"],
  ["a claim with nothing to take over writes the ledger", "    if (claimed.length === 0) return { ...base, files: {}, commit: null, claimed: false, moved_aside: [] };\n", ""],
  ["a site folder's .git may point elsewhere", "  if (mode === \"workspace\") gitDirIsOwn(dir);\n", ""],
  ["a transaction folder is removed recursively", "  for (const n of readdirSync(tdir)) unlinkSync(join(tdir, n));\n  rmdirSync(tdir);", "  rmSync(tdir, { recursive: true, force: true });"],
  ["a draft is removed whatever it holds now", "      if (readFileSync(p).equals(d.data)) unlinkSync(p);", "      unlinkSync(p);"],
  ["an owner file that is a link is read", "      if (isLink(st)) throw new Error(\"a link\");\n", ""],
  ["setup's own paths are not checked before setup","  for (const rel of [\".gitignore\", DRAFTS_DIR, TXN_DIR]) insidePath(dir, rel);\n",""],
  ["a site folder that is a link is followed", "  if (own && isLink(own)) {", "  if (false) {"],
  ["any run of a payload confirms the whole payload", "    const recorded = new Set(sent.length > 0 && sent[sent.length - 1] === lastId ? sent : [lastId]);", "    const recorded = new Set(sent.includes(lastId) ? sent : [lastId]);"],
  ["save compares the ledger's own names with case", "    const low = rel.toLowerCase();", "    const low = rel;"],
  ["save takes a name that differs only in case", "    if (sameName) throw", "    if (false) throw"],
  ["set-status takes any until", "  if (opts.until !== undefined && opts.until !== \"\" && !isCalendarDate(opts.until)) throw", "  if (false) throw"],
  ["a plan item takes any until", "    if (c.until != null && !isCalendarDate(c.until)) throw", "    if (false) throw"],
  ["a week verdict takes any until", "    if (v?.until != null && !isCalendarDate(v.until)) throw", "    if (false) throw"],
  ["a date that does not exist is a date", "  return t.getUTCFullYear() === y && t.getUTCMonth() === m - 1 && t.getUTCDate() === d;", "  return true;"],
  ["an allow leaves an unchecked item unchecked", "    else if (input.verdicts?.[it.id]?.status === \"open\" && it.status === \"unchecked\") next = { status: \"open\", reason: null, until: null };\n", ""],
  ["every recorded file is guarded, rewritten or not", "    if (!rewriting.has(rel)) continue;\n", ""],
  ["the guard reads the hashes this command just recorded", "  let recorded = { ...ledger.files };", "  let recorded = ledger.files;"],
  ["a run id already in the ledger is recorded again", "  if (runEntry && input?.run_id && ledger.runs.some(", "  if (false && ledger.runs.some("],
  ["a stray file in .txn stops every command", "    if (!lstatSync(tdir).isDirectory()) continue;\n", ""],
  ["git stages and commits everything in the folder", "    const added = git(\"add\", \"--\", ...present.map(lit));\n    if (added.error || added.status !== 0) return null;\n  }\n  const r = git(\"commit\", \"-q\", \"-m\", message, \"--\", ...paths.map(lit));", "    const added = git(\"add\", \"-A\");\n    if (added.error || added.status !== 0) return null;\n  }\n  const r = git(\"commit\", \"-q\", \"-m\", message);", { tests: ["tests/ledger/round11.test.mjs"] }],
  ["a commit takes the whole index", "  const r = git(\"commit\", \"-q\", \"-m\", message, \"--\", ...paths.map(lit));", "  const r = git(\"commit\", \"-q\", \"-m\", message);", { tests: ["tests/ledger/round11.test.mjs"] }],
  ["only the .git entry itself is checked", "  walk(root);\n", "", { tests: ["tests/ledger/round11.test.mjs"] }],
  ["a hard link inside .git is allowed", "      if (isLink(e)) {\n        throw new LedgerError(\"unsafe_path\", `${p} is a link (a symbolic link, a junction or a hard link) inside", "      if (e.isSymbolicLink()) {\n        throw new LedgerError(\"unsafe_path\", `${p} is a link (a symbolic link, a junction or a hard link) inside", { tests: ["tests/ledger/round11.test.mjs"] }],
  ["a commit leaves out the .gitignore the command wrote", "  const rels = [\".gitignore\", ...(m.entries ?? []).map((e) => e.rel)];", "  const rels = (m.entries ?? []).map((e) => e.rel);", { tests: ["tests/ledger/round11.test.mjs"] }],
  ["a removed file stays in the history", "  const paths = [...present, ...wanted.filter((r) => !present.includes(r) && tracked.has(r))];", "  const paths = present;", { tests: ["tests/ledger/round11.test.mjs"] }],
  ["check compares the Server sync copies only with each other", "for (const [name, b] of syncBlocks) check(b === SYNC,", "for (const [name, b] of syncBlocks) check(b === syncBlocks[0][1],", { file: CHECK, tests: CHECKS }],
  ["check compares the Standing rules copies only with each other", "for (const [name, b] of rulesBlocks) check(b === RULES,", "for (const [name, b] of rulesBlocks) check(b === rulesBlocks[0][1],", { file: CHECK, tests: CHECKS }],
  ["check compares the Unattended runs copies only with each other", "for (const [name, b] of unattendedBlocks) check(b === UNATTENDED,", "for (const [name, b] of unattendedBlocks) check(b === unattendedBlocks[0][1],", { file: CHECK, tests: CHECKS }],
  ["check compares the folder bullets only with each other", "  check(!!bullet && bullet[1] === FOLDER,", "  check(!!bullet && bullet[1] === resolverBullets[0],", { file: CHECK, tests: CHECKS }],
  ["check accepts any save bullet", "  check(!!save && save[1] === SAVE,", "  check(!!save,", { file: CHECK, tests: CHECKS }],
  ["check lets a skill write into .seo-genius/ directly", "  check(direct.length === 0,", "  check(true,", { file: CHECK, tests: CHECKS }],
];

const args = process.argv.slice(2);
const listOnly = args.includes("--list");
const only = args.find((a) => !a.startsWith("--")) ?? "";
// MUTATION_SHARD=k/n runs every n-th mutant from the k-th, so n shells can split one run.
const [shardK, shardN] = (process.env.MUTATION_SHARD || "1/1").split("/").map(Number);
const chosen = MUTATIONS.filter(([name]) => !only || name.includes(only)).filter((m, i) => i % shardN === shardK - 1);

const originals = new Map([LEDGER, NODE_CHECK, CHECK].map((f) => [f, readFileSync(join(ROOT, f), "utf8").replace(/\r\n/g, "\n")]));
const missing = chosen.filter(([, from, , { file = LEDGER } = {}]) => !originals.get(file).includes(from));
if (listOnly) {
  for (const [name, from, , { file = LEDGER } = {}] of chosen) console.log(`${originals.get(file).includes(from) ? "applies    " : "NOT APPLIED"} | ${name}`);
  console.log(`\n${chosen.length - missing.length}/${chosen.length} mutants apply`);
  process.exit(missing.length ? 1 : 0);
}

// The copy everything runs in. Only what the tests read is copied: no .git, no node_modules.
const work = mkdtempSync(join(tmpdir(), "sg-mutants-"));
cpSync(ROOT, work, { recursive: true, filter: (src) => !["node_modules", ".git"].includes(basename(src)) });
const cleanup = () => rmSync(work, { recursive: true, force: true });
let child = null;
const killTree = (p) => {
  if (!p || p.exitCode !== null) return;
  if (process.platform === "win32") spawnSync("taskkill", ["/pid", String(p.pid), "/T", "/F"], { stdio: "ignore" });
  else {
    try {
      process.kill(-p.pid, "SIGKILL");
    } catch {
      // Already gone.
    }
  }
};
for (const sig of ["SIGINT", "SIGTERM"]) {
  process.on(sig, () => {
    killTree(child);
    cleanup();
    process.exit(130);
  });
}

function runTests(tests) {
  return new Promise((resolve) => {
    let out = "";
    child = spawn(process.execPath, ["--test", ...tests], { cwd: work, detached: process.platform !== "win32" });
    child.stdout.on("data", (d) => (out += d));
    child.stderr.on("data", (d) => (out += d));
    const timer = setTimeout(() => {
      killTree(child);
      resolve({ timedOut: true, out });
    }, TIMEOUT_MS);
    child.on("close", (code) => {
      clearTimeout(timer);
      resolve({ timedOut: false, code, out });
    });
  });
}

const results = [];
const started = Date.now();
const secs = (t) => `${Math.round((Date.now() - t) / 1000)}s`;
try {
  console.log(`running ${chosen.length} mutants in ${work} (limit ${Math.round(TIMEOUT_MS / 1000)}s each)`);
  for (const [k, [name, from, to, { file = LEDGER, tests = LIGHT } = {}]] of chosen.entries()) {
    const tag = `[${k + 1}/${chosen.length}]`;
    const text = originals.get(file);
    if (!text.includes(from)) {
      results.push([name, "NOT APPLIED"]);
      console.log(`${tag} NOT APPLIED        | ${name}`);
      continue;
    }
    process.stdout.write(`${tag} running (${tests.map((t) => relative("tests", t)).join(", ")}) | ${name}\n`);
    const t0 = Date.now();
    writeFileSync(join(work, file), text.replace(from, () => to));
    const r = await runTests(tests);
    writeFileSync(join(work, file), text);
    const failed = Number((r.out.match(/^ℹ fail (\d+)/m) ?? [])[1] ?? 0);
    const verdict = r.timedOut ? "TIMED OUT" : r.code !== 0 && failed > 0 ? `CAUGHT (${failed} failing)` : "MISSED";
    results.push([name, verdict]);
    console.log(`${tag} ${verdict.padEnd(18)} | ${name} (${secs(t0)})`);
  }
} finally {
  cleanup();
}
console.log("");
for (const [name, verdict] of results) console.log(`${verdict.padEnd(20)} | ${name}`);
const caught = results.filter(([, v]) => v.startsWith("CAUGHT")).length;
console.log(`\n${caught}/${results.length} mutations caught in ${secs(started)}`);
process.exit(caught === results.length ? 0 : 1);
