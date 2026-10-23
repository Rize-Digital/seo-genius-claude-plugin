// The site lock, tested with real competing processes.
// Run: node --test tests/ledger/lock.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { writeFileSync, readFileSync, mkdirSync, unlinkSync, readdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import { hostname } from "node:os";
import { scratch, cli, cliAsync, snapshot, lockFiles, pendingTxns, deadPid, PLAN } from "./helpers.mjs";

const delay = (ms) => new Promise((r) => setTimeout(r, ms));
const ids = (s) => JSON.parse(readFileSync(join(s.siteDir, "ledger.json"), "utf8")).items.map((i) => i.id);

function plantLock(s, owner, token = "00000000-0000-4000-8000-0000000000ee") {
  mkdirSync(s.siteDir, { recursive: true });
  const name = `.ledger.lock.${token}`;
  writeFileSync(join(s.siteDir, name), JSON.stringify({ token, started: new Date().toISOString(), ...owner }));
  return name;
}

test("lock: four processes started at once, exactly one runs, the others are refused, and the ledger is whole", async () => {
  const s = scratch();
  try {
    // The holder keeps the site longer than any of the others waits for it.
    const all = await Promise.all([0, 1, 2, 3].map(() => cliAsync(s, "plan", { input: PLAN, env: { SEO_GENIUS_LEDGER_TEST_HOLD_MS: "4000" } })));
    assert.deepEqual(all.map((r) => r.code).sort(), [0, 2, 2, 2], JSON.stringify(all.map((r) => r.out)));
    assert.deepEqual(all.find((r) => r.code === 0).out.created, ["P-001", "P-002", "P-003"]);
    assert.ok(all.filter((r) => r.code === 2).every((r) => r.out.error === "locked"));
    assert.deepEqual(ids(s), ["P-001", "P-002", "P-003"]);
    assert.deepEqual(lockFiles(s.siteDir), []);
  } finally {
    s.done();
  }
});

test("lock: two runs that both judge a crashed run's lock stale: one takes the site over, the other is refused", async () => {
  const s = scratch();
  try {
    const stale = plantLock(s, { pid: deadPid(), host: hostname() });
    // Both publish their own lock before either looks, so each sees the stale lock and the other's.
    const env = { SEO_GENIUS_LEDGER_TEST_HOLD_MS: "1500", SEO_GENIUS_LEDGER_TEST_PAUSE: "lock:published#1=500" };
    const [a, b] = await Promise.all([cliAsync(s, "plan", { input: PLAN, env }), cliAsync(s, "plan", { input: PLAN, env })]);
    assert.deepEqual([a.code, b.code].sort(), [0, 2], JSON.stringify([a.out, b.out]));
    assert.equal((a.code === 2 ? a : b).out.error, "locked");
    assert.ok(!readdirSync(s.siteDir).includes(stale), "the stale lock is gone");
    assert.deepEqual(ids(s), ["P-001", "P-002", "P-003"]);
    assert.deepEqual(lockFiles(s.siteDir), []);
  } finally {
    s.done();
  }
});

test("lock: taking over a stale lock does not stop the look for a live owner listed after it", () => {
  const s = scratch();
  try {
    // Sorted before the live one, so a run that stopped looking after the takeover would miss the owner.
    const stale = plantLock(s, { pid: deadPid(), host: hostname() });
    const live = plantLock(s, { pid: process.pid, host: hostname() }, "ffffffff-0000-4000-8000-0000000000ff");
    const r = cli(s, "plan", { input: PLAN });
    assert.equal(r.code, 2, JSON.stringify(r.out));
    assert.equal(r.out.error, "locked");
    assert.ok(!readdirSync(s.siteDir).includes(stale), "the stale lock was removed");
    assert.ok(readdirSync(s.siteDir).includes(live), "the live owner's lock stays");
    assert.equal(existsSync(join(s.siteDir, "ledger.json")), false, "nothing was written");
  } finally {
    s.done();
  }
});

test("lock: a Windows sharing error while taking over a stale lock is contention: the run answers locked and commits nothing", () => {
  for (const op of ["unlink", "stat"]) {
    for (const code of ["EPERM", "EBUSY", "EACCES"]) {
      const s = scratch();
      try {
        const stale = plantLock(s, { pid: deadPid(), host: hostname() });
        const r = cli(s, "plan", { input: PLAN, env: { SEO_GENIUS_LEDGER_TEST_LOCK_FS_ERROR: `${op}:${code}` } });
        assert.equal(r.code, 2, `${op}:${code} ${JSON.stringify(r.out)}`);
        assert.equal(r.out.error, "locked", `${op}:${code}: the standard answer, not a raw ${code}`);
        assert.equal(existsSync(join(s.siteDir, "ledger.json")), false, `${op}:${code}: nothing written`);
        assert.deepEqual(pendingTxns(s.siteDir), [], `${op}:${code}: nothing staged`);
        assert.deepEqual(lockFiles(s.siteDir), [stale], `${op}:${code}: only the stale lock is left; its own is released`);
        // Once the other run is done with it, the next run takes the stale lock over.
        assert.equal(cli(s, "plan", { input: PLAN }).code, 0);
        assert.deepEqual(lockFiles(s.siteDir), []);
      } finally {
        s.done();
      }
    }
  }
});

test("lock: a run that crashed on this machine is taken over at once, however recently it refreshed its lock", () => {
  const s = scratch();
  try {
    assert.equal(cli(s, "plan", { input: PLAN, env: { SEO_GENIUS_LEDGER_TEST_CRASH_AT: "lock:held#1" } }).code, 86);
    assert.equal(lockFiles(s.siteDir).length, 1, "the crashed run left its lock");
    const t0 = Date.now();
    const r = cli(s, "plan", { input: PLAN });
    assert.equal(r.code, 0, JSON.stringify(r.out));
    assert.ok(Date.now() - t0 < 5000);
    assert.deepEqual(lockFiles(s.siteDir), []);
  } finally {
    s.done();
  }
});

test("lock: a run that crashed while publishing its lock leaves nothing that blocks the next run", () => {
  const s = scratch();
  try {
    assert.equal(cli(s, "plan", { input: PLAN, env: { SEO_GENIUS_LEDGER_TEST_CRASH_AT: "lock:written#1" } }).code, 86);
    const r = cli(s, "plan", { input: PLAN });
    assert.equal(r.code, 0, JSON.stringify(r.out));
    assert.deepEqual(readdirSync(s.siteDir).filter((n) => n.startsWith(".ledger.lock")), []);
  } finally {
    s.done();
  }
});

test("lock: a live owner on this machine is never taken over by age; one on another machine is, once it stops refreshing", () => {
  const s = scratch();
  try {
    // This test process is alive: its lock, even an old one, holds.
    const mine = plantLock(s, { pid: process.pid, host: hostname(), started: "2026-10-01T00:00:00Z" }, "00000000-0000-4000-8000-0000000000e1");
    assert.equal(cli(s, "plan", { input: PLAN, env: { SEO_GENIUS_LEDGER_TEST_STALE_MS: "600000" } }).out.error, "locked");
    unlinkSync(join(s.siteDir, mine));
    // Another machine's lock, refreshed just now: held. Not refreshed for longer than the stale window: taken over.
    plantLock(s, { pid: 1, host: "another-machine", started: "2026-10-01T00:00:00Z" }, "00000000-0000-4000-8000-0000000000e2");
    assert.equal(cli(s, "plan", { input: PLAN, env: { SEO_GENIUS_LEDGER_TEST_STALE_MS: "60000" } }).out.error, "locked");
    const r = cli(s, "plan", { input: PLAN, env: { SEO_GENIUS_LEDGER_TEST_STALE_MS: "1" } });
    assert.equal(r.code, 0, JSON.stringify(r.out));
    assert.deepEqual(lockFiles(s.siteDir), []);
  } finally {
    s.done();
  }
});

test("lock: a long run keeps its lock fresh, so another run never takes it over while it works", async () => {
  const s = scratch();
  try {
    const env = { SEO_GENIUS_LEDGER_TEST_STALE_MS: "700", SEO_GENIUS_LEDGER_TEST_HOLD_MS: "2500" };
    const first = cliAsync(s, "plan", { input: PLAN, env });
    await delay(1400);
    const second = await cliAsync(s, "plan", { input: PLAN, env: { SEO_GENIUS_LEDGER_TEST_STALE_MS: "700" } });
    const one = await first;
    assert.equal(one.code, 0, JSON.stringify(one.out));
    assert.equal(second.code, 2, JSON.stringify(second.out));
    assert.equal(second.out.error, "locked");
  } finally {
    s.done();
  }
});

test("lock: a run whose lock was taken away commits nothing, and the next run discards what it staged", async () => {
  const s = scratch();
  try {
    assert.equal(cli(s, "plan", { input: PLAN, today: "2026-10-12" }).code, 0);
    const before = snapshot(s.siteDir);
    const running = cliAsync(s, "set-status", { args: ["--id", "P-001", "--status", "in_progress"], env: { SEO_GENIUS_LEDGER_TEST_PAUSE: "txn:manifest-written#1=1200" } });
    await delay(600);
    for (const n of lockFiles(s.siteDir)) unlinkSync(join(s.siteDir, n));
    const r = await running;
    assert.equal(r.code, 2, JSON.stringify(r.out));
    assert.equal(r.out.error, "lock_lost");
    assert.deepEqual(snapshot(s.siteDir), before);
    assert.equal(cli(s, "show").code, 0);
    assert.equal(cli(s, "push-payload").code, 0);
    assert.deepEqual(pendingTxns(s.siteDir), []);
    assert.equal(JSON.parse(readFileSync(join(s.siteDir, "ledger.json"), "utf8")).items[0].status, "open");
  } finally {
    s.done();
  }
});
