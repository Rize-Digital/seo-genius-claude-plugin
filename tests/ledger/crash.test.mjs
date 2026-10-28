// Crash injection: every step of a command that writes, stopped as a crash would
// stop it. Whatever the step, the next command must find the old generation whole
// (crash before the commit point) or the new one whole (at or after it), with git
// recording only whole generations, and must then run cleanly.
// Run: node --test tests/ledger/crash.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { cpSync, writeFileSync, readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { scratch, cli, cliAsync, pool, POOL, snapshot, git, commits, lockFiles, pendingTxns, writeDraft, PLAN, U, deadPid } from "./helpers.mjs";

const COMMIT_POINT = "txn:committed#1";

/** The steps a command passes, in order, from a run on a copy of the folder. */
function steps(s, cmd, opts) {
  const trace = join(s.dir, `trace-${Math.random().toString(36).slice(2)}.txt`);
  const r = cli(s, cmd, { ...opts, env: { ...(opts.env ?? {}), SEO_GENIUS_LEDGER_TEST_TRACE: trace } });
  assert.equal(r.code, 0, JSON.stringify(r.out));
  return readFileSync(trace, "utf8").trim().split("\n");
}

/**
 * Crashes `cmd` at each of its steps on a fresh copy of the old folder, recovers
 * with `show`, and compares with the generation a clean run produces.
 */
async function crashAtEveryStep(name, prepare, cmd, opts, { oldRefusal = null } = {}) {
  const s = scratch();
  try {
    prepare(s);
    const oldDir = join(s.dir, "old");
    cpSync(s.siteDir, oldDir, { recursive: true });
    const OLD = snapshot(oldDir);
    const oldCommits = commits(oldDir);
    const oldStatus = git(oldDir, "status", "--porcelain").stdout;

    const fresh = (tag) => {
      const t = { ...s, home: join(s.dir, tag) };
      t.siteDir = join(t.home, "bomannfencing.com");
      cpSync(oldDir, t.siteDir, { recursive: true });
      return t;
    };
    const ref = fresh("ref");
    const trace = steps(ref, cmd, opts);
    const NEW = snapshot(ref.siteDir);
    assert.notDeepEqual(NEW, OLD, `${name}: the command changes something`);
    const commitAt = trace.indexOf(COMMIT_POINT);
    assert.ok(commitAt > 0, `${name}: the command passes its commit point (${trace.join(", ")})`);

    // The steps are independent (each on its own copy), so they run a few at a time.
    await pool(trace.map((point, i) => [point, i]), POOL, async ([point, i]) => {
      const t = fresh(`crash-${i}`);
      const crashed = await cliAsync(t, cmd, { ...opts, env: { ...(opts.env ?? {}), SEO_GENIUS_LEDGER_TEST_CRASH_AT: point } });
      assert.equal(crashed.code, 86, `${name} at ${point}: the process stopped there`);
      const expectNew = i >= commitAt;
      const shown = await cliAsync(t, "show");
      // The old generation of a rebuild or a claim is a folder show refuses, as before.
      const showRefuses = !!oldRefusal && !expectNew;
      assert.equal(shown.code, showRefuses ? 2 : 0, `${name} at ${point}: show after the crash (${JSON.stringify(shown.out)})`);
      if (showRefuses) assert.equal(shown.out.error, oldRefusal);
      assert.deepEqual(snapshot(t.siteDir), expectNew ? NEW : OLD, `${name} at ${point}: the ${expectNew ? "new" : "old"} generation, whole`);
      if (existsSync(join(t.siteDir, ".git"))) {
        assert.equal(git(t.siteDir, "status", "--porcelain").stdout, expectNew ? "" : oldStatus, `${name} at ${point}: git holds exactly this generation`);
        assert.equal(commits(t.siteDir).length, oldCommits.length + (expectNew ? 1 : 0), `${name} at ${point}: one commit per whole generation`);
      }
      // The next run is clean: a crash before the commit point is simply run again.
      if (!expectNew) {
        const again = await cliAsync(t, cmd, opts);
        assert.equal(again.code, 0, `${name} at ${point}: the command runs again (${JSON.stringify(again.out)})`);
        assert.deepEqual(snapshot(t.siteDir), NEW, `${name} at ${point}: the rerun brings the new generation`);
      }
      const after = await cliAsync(t, "push-payload");
      assert.equal(after.code, 0, `${name} at ${point}: a later command is not blocked (${JSON.stringify(after.out)})`);
      assert.deepEqual(lockFiles(t.siteDir), [], `${name} at ${point}: no lock left behind`);
      assert.deepEqual(pendingTxns(t.siteDir), [], `${name} at ${point}: no transaction left behind`);
    });
    return trace;
  } finally {
    s.done();
  }
}

const weekInput = {
  as_of: "2026-10-26",
  run_id: "run-week-2",
  rankings: [{ keyword: "goat fencing", location: "Bonifay, FL", position: 9 }],
  issues: [{ id: U(12), severity: "low" }],
  changes: [{ source: "reported", id: U(1), page_url: "https://bomannfencing.com/blog/how-many-strands-barbed-wire-cattle", change_kind: "title", on: "2026-10-20", verification: "verified" }],
};

test("crash: a week stopped at any step leaves the old generation or the new one whole, and the next run is clean", async () => {
  const trace = await crashAtEveryStep(
    "week",
    (s) => {
      assert.equal(cli(s, "plan", { input: { ...PLAN, run_id: "run-plan-1" }, today: "2026-10-12" }).code, 0);
      assert.equal(cli(s, "week", { input: { as_of: "2026-10-19", run_id: "run-week-1", rankings: [{ keyword: "goat fencing", location: "Bonifay, FL", position: 14 }], issues: [{ id: U(11), severity: "high" }] } }).code, 0);
      // A hand edit, so the run also writes the copy that keeps it.
      writeFileSync(join(s.siteDir, "plan.md"), `${readFileSync(join(s.siteDir, "plan.md"), "utf8")}\nmy note\n`);
    },
    "week",
    { input: weekInput, today: "2026-10-26" },
  );
  // snapshot, weekly page, changelog, plan, hand-edit copy, ledger.json: one staged and one applied step each.
  assert.equal(trace.filter((p) => p.startsWith("txn:staged#")).length, 6);
  assert.equal(trace.filter((p) => p.startsWith("txn:applied#")).length, 6);
});

test("crash: a save of two research files stopped at any step saves both or neither", async () => {
  await crashAtEveryStep(
    "save",
    (s) => {
      assert.equal(cli(s, "prepare").code, 0);
      writeDraft(s, "competitors.md", "# Competitors\n\nold\n");
      writeDraft(s, "competitors.json", JSON.stringify({ site: "bomannfencing.com", generated: "2026-10-12", competitors: [] }));
      assert.equal(cli(s, "save", { args: ["--file", "competitors.md,competitors.json"] }).code, 0);
      writeDraft(s, "competitors.md", "# Competitors\n\nnew\n");
      writeDraft(s, "competitors.json", JSON.stringify({ site: "bomannfencing.com", generated: "2026-10-19", competitors: [{ domain: "a.com" }] }));
    },
    "save",
    { args: ["--file", "competitors.md,competitors.json"] },
  );
});

test("crash: a push acknowledgement stopped at any step is recorded whole or not at all", async () => {
  await crashAtEveryStep(
    "push-ack",
    (s) => {
      assert.equal(cli(s, "plan", { input: { ...PLAN, run_id: "run-plan-1" }, today: "2026-10-12" }).code, 0);
      assert.equal(cli(s, "push-payload").code, 0);
    },
    "push-ack",
    { input: { data: [{ item_key: "P-001", result: "created" }, { item_key: "P-002", result: "created" }, { item_key: "P-003", result: "rejected", reason: "test" }], runs: [{ run_id: "run-plan-1", result: "recorded" }] } },
  );
});

const PULL_ONE = { complete: true, last_run: null, items: [{ item_key: "P-001", kind: "improve", target_page: "/a", change_kind: "title", status: "open", first_seen: "2026-10-12" }] };

// A ledger that parses and names this site but is incomplete: whose folder it is
// stays known, so pull may move it aside and rebuild it.
function incompleteLedger(s) {
  assert.equal(cli(s, "plan", { input: PLAN, today: "2026-10-12" }).code, 0);
  writeDraft(s, "config.json", JSON.stringify({ site: "bomannfencing.com" }));
  assert.equal(cli(s, "save", { args: ["--file", "config.json"] }).code, 0);
  writeFileSync(join(s.siteDir, "ledger.json"), JSON.stringify({ format_version: 1, site: "bomannfencing.com", items: "lost" }));
}

// A folder whose owner files do not parse: only claim takes it over.
function unreadableOwner(s) {
  assert.equal(cli(s, "plan", { input: PLAN, today: "2026-10-12" }).code, 0);
  writeFileSync(join(s.siteDir, "ledger.json"), "{ not json");
  writeFileSync(join(s.siteDir, "config.json"), "{ not json either");
}

test("crash: rebuilding an incomplete ledger stopped at any step keeps it or moves it aside with the rebuilt ledger", async () => {
  await crashAtEveryStep("pull rebuild", incompleteLedger, "pull", { input: PULL_ONE }, { oldRefusal: "bad_ledger" });
});

test("crash: a claim stopped at any step is finished by the next show, never read as owner_unknown once committed", async () => {
  const trace = await crashAtEveryStep("claim", unreadableOwner, "claim", { args: ["--confirm", "bomannfencing.com"] }, { oldRefusal: "owner_unknown" });
  // Two copies and two removals: the reported case is a crash at txn:applied#2.
  assert.ok(trace.includes("txn:applied#2"), trace.join(", "));
});

// Every command, after a crash at every step, answers as it does on the whole
// generation the crash leaves (old before the commit point, new at or after it),
// and leaves no transaction behind: each one recovers before it reads whose folder it is.
const EVERY_COMMAND = [
  ["resolve", {}],
  ["show", {}],
  ["prepare", {}],
  ["claim", { args: ["--confirm", "bomannfencing.com"] }],
  ["pull", { input: PULL_ONE }],
  ["plan", { input: PLAN }],
  ["week", { input: { as_of: "2026-10-26" }, today: "2026-10-26" }],
  ["history", { input: { complete: true, changes: [] } }],
  ["set-status", { args: ["--id", "P-001", "--status", "dropped"] }],
  ["save", { args: ["--file", "notes.md"] }],
  ["push-payload", {}],
  ["push-ack", { input: { data: [], runs: [] } }],
];

async function everyCommandAfterEveryCrash(name, prepare, cmd, opts, { distinct = false } = {}) {
  const s = scratch();
  try {
    prepare(s);
    const oldDir = join(s.dir, "old");
    cpSync(s.siteDir, oldDir, { recursive: true });
    let n = 0;
    const fresh = (from) => {
      const t = { ...s, home: join(s.dir, `c${n++}`) };
      t.siteDir = join(t.home, "bomannfencing.com");
      cpSync(from, t.siteDir, { recursive: true });
      writeDraft(t, "notes.md", "# notes\n");
      return t;
    };
    const ref = fresh(oldDir);
    const trace = steps(ref, cmd, opts);
    const newDir = join(s.dir, "new");
    cpSync(ref.siteDir, newDir, { recursive: true });
    const commitAt = trace.indexOf(COMMIT_POINT);
    const outcome = (r) => (r.code === 0 ? "ok" : `${r.code} ${r.out.error}`);
    const expected = { old: {}, new: {} };
    for (const [gen, dir] of [["old", oldDir], ["new", newDir]]) {
      const got = await Promise.all(EVERY_COMMAND.map(([c, o]) => cliAsync(fresh(dir), c, o)));
      EVERY_COMMAND.forEach(([c], k) => (expected[gen][c] = outcome(got[k])));
    }
    if (distinct) assert.notDeepEqual(expected.old, expected.new, `${name}: the generations answer differently, so the check can tell them apart`);
    await pool([...trace.entries()], Math.max(1, Math.floor(POOL / 4)), async ([i, point]) => {
      const gen = i >= commitAt ? "new" : "old";
      // One crash at this step, then a copy of the crashed folder for each command.
      const crashed = fresh(oldDir);
      assert.equal((await cliAsync(crashed, cmd, { ...opts, env: { SEO_GENIUS_LEDGER_TEST_CRASH_AT: point } })).code, 86, `${name} at ${point}`);
      // The crashed run's lock stays, naming a pid no live process can have: Windows hands a pid
      // that just ended to a new process within moments, and the lock would then look live.
      for (const n of lockFiles(crashed.siteDir)) {
        const p = join(crashed.siteDir, n);
        writeFileSync(p, JSON.stringify({ ...JSON.parse(readFileSync(p, "utf8")), pid: deadPid() }));
      }
      const runs = EVERY_COMMAND.map(([c, o]) => {
        const t = fresh(crashed.siteDir);
        return cliAsync(t, c, o).then((r) => ({ c, t, r }));
      });
      for (const { c, t, r } of await Promise.all(runs)) {
        assert.equal(outcome(r), expected[gen][c], `${name} crashed at ${point}, then ${c}: answers as on the ${gen} generation (${JSON.stringify(r.out)})`);
        assert.deepEqual(pendingTxns(t.siteDir), [], `${name} crashed at ${point}, then ${c}: the transaction was finished or thrown away first`);
        assert.deepEqual(lockFiles(t.siteDir), [], `${name} crashed at ${point}, then ${c}: no lock left behind`);
      }
    });
  } finally {
    s.done();
  }
}

test("crash: after a claim stopped at any step, every command recovers first and answers as on the whole generation", async () => {
  await everyCommandAfterEveryCrash("claim", unreadableOwner, "claim", { args: ["--confirm", "bomannfencing.com"] }, { distinct: true });
});

test("crash: after a week stopped at any step, every command recovers first and answers as on the whole generation", async () => {
  await everyCommandAfterEveryCrash(
    "week",
    (s) => {
      assert.equal(cli(s, "plan", { input: { ...PLAN, run_id: "run-plan-1" }, today: "2026-10-12" }).code, 0);
      assert.equal(cli(s, "push-payload").code, 0);
    },
    "week",
    { input: weekInput, today: "2026-10-26" },
  );
});

test("crash: a recovery stopped at any step is finished by the next command", () => {
  const s = scratch();
  try {
    assert.equal(cli(s, "plan", { input: PLAN, today: "2026-10-12" }).code, 0);
    const base = join(s.dir, "base");
    cpSync(s.siteDir, base, { recursive: true });
    const fresh = (tag) => {
      const t = { ...s, home: join(s.dir, tag) };
      t.siteDir = join(t.home, "bomannfencing.com");
      cpSync(base, t.siteDir, { recursive: true });
      return t;
    };
    const ref = fresh("ref");
    assert.equal(cli(ref, "week", { input: weekInput, today: "2026-10-26" }).code, 0);
    const NEW = snapshot(ref.siteDir);
    // Crash just after the commit point, then crash the recovery at each of its own steps.
    const probe = fresh("probe");
    assert.equal(cli(probe, "week", { input: weekInput, today: "2026-10-26", env: { SEO_GENIUS_LEDGER_TEST_CRASH_AT: COMMIT_POINT } }).code, 86);
    const traceFile = join(s.dir, "recovery-trace.txt");
    assert.equal(cli(probe, "show", { env: { SEO_GENIUS_LEDGER_TEST_TRACE: traceFile } }).code, 0);
    const recovery = readFileSync(traceFile, "utf8").trim().split("\n");
    assert.ok(recovery.includes("txn:recovered#1"), recovery.join(", "));
    recovery.forEach((point, i) => {
      const t = fresh(`r-${i}`);
      assert.equal(cli(t, "week", { input: weekInput, today: "2026-10-26", env: { SEO_GENIUS_LEDGER_TEST_CRASH_AT: COMMIT_POINT } }).code, 86);
      assert.equal(cli(t, "show", { env: { SEO_GENIUS_LEDGER_TEST_CRASH_AT: point } }).code, 86, point);
      assert.equal(cli(t, "show").code, 0, point);
      assert.deepEqual(snapshot(t.siteDir), NEW, `recovery stopped at ${point}`);
      assert.equal(git(t.siteDir, "status", "--porcelain").stdout, "", point);
      assert.deepEqual(pendingTxns(t.siteDir), [], point);
    });
  } finally {
    s.done();
  }
});
