// The review of f39d791f: a pull that confirms a payload's run, the first use of a
// site folder by several processes at once, and no read, write or removal
// through a link; then the sweep of every file call and every sync flag.
// Run: node --test tests/ledger/round10.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync, statSync, symlinkSync, linkSync, unlinkSync, renameSync, rmdirSync } from "node:fs";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { scratch, cli, cliAsync, snapshot, commits, lockFiles, pendingTxns, writeDraft, PLAN, SCRIPT } from "./helpers.mjs";

const ledgerOf = (s) => JSON.parse(readFileSync(join(s.siteDir, "ledger.json"), "utf8"));
const ok = (r) => {
  assert.equal(r.code, 0, JSON.stringify(r.out));
  return r.out;
};
const refusedUnsafe = (r, label) => {
  assert.equal(r.code, 2, `${label}: ${JSON.stringify(r.out)}`);
  assert.equal(r.out.error, "unsafe_path", `${label}: ${JSON.stringify(r.out)}`);
};
const setStatus = (s, id, status, extra = [], today = "2026-10-19") => ok(cli(s, "set-status", { args: ["--id", id, "--status", status, ...extra], today }));
const ACK_ALL = (p) => ({ data: p.payload.items.map((i) => ({ item_key: i.item_key, result: "created" })), runs: p.payload.runs.map((r) => ({ run_id: r.run_id, result: "recorded" })) });
// Every item as the server holds it once the last payload went through.
const serverRows = (s) =>
  ledgerOf(s).items.map((it) => ({ item_key: it.id, kind: it.action, target_page: it.target_page, change_kind: it.change_kind, status: it.status, status_reason: it.status_reason, status_until: it.until, change_id: null, issue_id: null, first_seen: it.first_seen }));
const lastRun = (run_id) => ({ run_id, session_id: null, kind: "plan", ran_on: "2026-10-19", format_version: 1, file_hashes: {}, items_total: 3 });
/** A folder outside the site folder, holding one file a link must never reach. */
function outside(s, name = "outside") {
  const d = join(s.dir, name);
  mkdirSync(d, { recursive: true });
  writeFileSync(join(d, "x.md"), "outside, never to be read or removed\n");
  return d;
}
const junction = (target, at) => symlinkSync(target, at, "junction");

// 1 ---------------------------------------------------------------------------

test("runs: a pull whose last_run is a run the lost payload sent marks that payload's runs synced and clears it", () => {
  const s = scratch();
  try {
    // Two runs, one payload: save_plan_items stores both in one transaction, and last_run is the newer.
    ok(cli(s, "plan", { input: PLAN, today: "2026-10-12" }));
    ok(cli(s, "plan", { input: PLAN }));
    const sent = ok(cli(s, "push-payload"));
    assert.equal(sent.payload.runs.length, 2);
    const shownBefore = ok(cli(s, "show"));
    assert.deepEqual([shownBefore.runs_not_synced, shownBefore.awaiting_ack], [2, true]);
    // The answer was lost; the next pull reads the items as sent and the newest run.
    const pulled = ok(cli(s, "pull", { input: { complete: true, last_run: lastRun(sent.payload.run_id), items: serverRows(s) } }));
    assert.equal(pulled.cleared_pending_push, true, JSON.stringify(pulled));
    assert.deepEqual(pulled.runs_confirmed, sent.payload.runs.map((r) => r.run_id));
    const shown = ok(cli(s, "show"));
    assert.deepEqual([shown.runs_not_synced, shown.push_pending, shown.awaiting_ack], [0, false, false]);
    assert.equal(ok(cli(s, "push-payload")).nothing_to_send, true);
    assert.equal(ledgerOf(s).pending_push, undefined);
  } finally {
    s.done();
  }
  // A last_run the payload did not send (another machine's) confirms nothing here.
  const t = scratch();
  try {
    ok(cli(t, "plan", { input: PLAN }));
    ok(cli(t, "push-payload"));
    const pulled = ok(cli(t, "pull", { input: { complete: true, last_run: lastRun("11111111-2222-4333-8444-555555555555"), items: serverRows(t) } }));
    assert.equal(pulled.cleared_pending_push, undefined);
    const shown = ok(cli(t, "show"));
    assert.deepEqual([shown.runs_not_synced, shown.awaiting_ack], [1, true]);
  } finally {
    t.done();
  }
});

// 2 ---------------------------------------------------------------------------

test("first use: several processes creating a missing site folder at once; the winner's work survives, and no loser removes it", async () => {
  // Round 1 holds the site, so the others meet a live lock; rounds 2 to 6 race without a hold.
  for (let round = 1; round <= 6; round++) {
    const s = scratch();
    try {
      const env = round === 1 ? { SEO_GENIUS_LEDGER_TEST_HOLD_MS: "3000" } : {};
      const all = await Promise.all(Array.from({ length: 6 }, () => cliAsync(s, "plan", { input: PLAN, env })));
      const label = `round ${round}: ${JSON.stringify(all.map((r) => r.out.error ?? r.code))}`;
      const won = all.filter((r) => r.code === 0);
      assert.ok(won.length >= 1, label);
      assert.ok(all.every((r) => r.code === 0 || (r.code === 2 && r.out.error === "locked")), `only locked refusals, no lost folder: ${label}`);
      if (round === 1) assert.equal(won.length, 1, label);
      assert.deepEqual(ledgerOf(s).items.map((i) => i.id), ["P-001", "P-002", "P-003"], label);
      assert.ok(existsSync(join(s.siteDir, "plan.md")), label);
      assert.equal(commits(s.siteDir).filter((m) => m.startsWith("ledger: plan")).length, won.length, label);
      assert.deepEqual([lockFiles(s.siteDir), pendingTxns(s.siteDir)], [[], []], label);
    } finally {
      s.done();
    }
  }
});

// 3 ---------------------------------------------------------------------------

test("links: save reads nothing through a junction or link in the drafts, deletes nothing outside, and writes nothing through one", () => {
  const s = scratch();
  try {
    ok(cli(s, "prepare"));
    const log = commits(s.siteDir);
    // A junction inside the drafts folder pointing outside: by the site path and by the draft's own path.
    const out = outside(s);
    mkdirSync(join(s.siteDir, ".drafts"), { recursive: true });
    junction(out, join(s.siteDir, ".drafts", "reports"));
    for (const given of ["reports/x.md", join(s.siteDir, ".drafts", "reports", "x.md")]) {
      refusedUnsafe(cli(s, "save", { args: ["--file", given] }), given);
      assert.equal(readFileSync(join(out, "x.md"), "utf8"), "outside, never to be read or removed\n", `${given}: the outside file is kept`);
      assert.equal(existsSync(join(s.siteDir, "reports")), false, `${given}: nothing copied in`);
    }
    unlinkSync(join(s.siteDir, ".drafts", "reports"));
    // A hard link in the drafts to an outside file.
    linkSync(join(out, "x.md"), join(s.siteDir, ".drafts", "notes.md"));
    refusedUnsafe(cli(s, "save", { args: ["--file", "notes.md"] }), "hard link");
    assert.ok(existsSync(join(out, "x.md")));
    assert.equal(existsSync(join(s.siteDir, "notes.md")), false);
    unlinkSync(join(s.siteDir, ".drafts", "notes.md"));
    // The target folder in the site folder is a junction: the draft is real, the write would land outside.
    writeDraft(s, "reports/y.md", "# y\n");
    junction(out, join(s.siteDir, "reports"));
    refusedUnsafe(cli(s, "save", { args: ["--file", "reports/y.md"] }), "target junction");
    assert.deepEqual(readdirSync(out), ["x.md"], "nothing written outside");
    assert.ok(existsSync(join(s.siteDir, ".drafts", "reports", "y.md")), "the draft is kept");
    // The drafts folder itself is a junction.
    unlinkSync(join(s.siteDir, "reports"));
    const drafts2 = outside(s, "outside2");
    mkdirSync(join(drafts2, "reports"));
    writeFileSync(join(drafts2, "reports", "z.md"), "# z\n");
    // Swap the real drafts folder for a junction.
    renameSync(join(s.siteDir, ".drafts"), join(s.dir, "drafts-old"));
    junction(drafts2, join(s.siteDir, ".drafts"));
    refusedUnsafe(cli(s, "save", { args: ["--file", "reports/z.md"] }), "drafts junction");
    assert.ok(existsSync(join(drafts2, "reports", "z.md")), "the outside draft is kept");
    assert.deepEqual(commits(s.siteDir), log, "nothing committed");
  } finally {
    s.done();
  }
});

// Sweep -----------------------------------------------------------------------

test("links: a ledger file, the snapshots folder or the transactions folder that is a link is refused before anything is read or written", () => {
  const s = scratch();
  try {
    ok(cli(s, "plan", { input: PLAN, today: "2026-10-12" }));
    const log = commits(s.siteDir);
    const out = outside(s);
    // plan.md hard-linked to an outside file: a week would copy it in as a hand edit.
    unlinkSync(join(s.siteDir, "plan.md"));
    linkSync(join(out, "x.md"), join(s.siteDir, "plan.md"));
    refusedUnsafe(cli(s, "week", { input: {} }), "plan.md hard link");
    assert.equal(readdirSync(s.siteDir).filter((n) => n.includes("hand-edit")).length, 0, "no outside text copied in");
    unlinkSync(join(s.siteDir, "plan.md"));
    // snapshots/ a junction: a week would read and write outside.
    junction(out, join(s.siteDir, "snapshots"));
    refusedUnsafe(cli(s, "week", { input: {} }), "snapshots junction");
    assert.deepEqual(readdirSync(out), ["x.md"], "nothing written outside");
    unlinkSync(join(s.siteDir, "snapshots"));
    // .txn a junction: every command, show included, refuses before reading through it.
    rmdirSync(join(s.siteDir, ".txn"));
    junction(out, join(s.siteDir, ".txn"));
    refusedUnsafe(cli(s, "show"), ".txn junction");
    refusedUnsafe(cli(s, "week", { input: {} }), ".txn junction");
    assert.deepEqual(readdirSync(out), ["x.md"]);
    unlinkSync(join(s.siteDir, ".txn"));
    // ledger.json a hard link.
    const saved = readFileSync(join(s.siteDir, "ledger.json"));
    unlinkSync(join(s.siteDir, "ledger.json"));
    writeFileSync(join(out, "ledger.json"), saved);
    linkSync(join(out, "ledger.json"), join(s.siteDir, "ledger.json"));
    // An owner file that is a link is one that cannot be read: the folder's owner is unknown, and nothing is read through it.
    const r = cli(s, "set-status", { args: ["--id", "P-001", "--status", "dropped"] });
    assert.deepEqual([r.code, r.out.error], [2, "owner_unknown"], JSON.stringify(r.out));
    assert.deepEqual(readFileSync(join(out, "ledger.json")), saved, "the outside file is not rewritten");
    assert.deepEqual(commits(s.siteDir), log, "nothing committed");
  } finally {
    s.done();
  }
});

test("manifest: a committed transaction naming a file outside its folder is refused, and the outside file stays where it is", () => {
  const s = scratch();
  try {
    ok(cli(s, "prepare"));
    writeFileSync(join(s.dir, "outside.txt"), "keep me\n");
    const tdir = join(s.siteDir, ".txn", "0-1-abcdef12");
    mkdirSync(tdir, { recursive: true });
    // tdir/../../../../outside.txt is s.dir/outside.txt.
    writeFileSync(join(tdir, "manifest.json"), JSON.stringify({ format_version: 1, id: "0-1-abcdef12", message: "x", entries: [{ rel: "notes.md", file: "../../../../outside.txt" }] }));
    const r = cli(s, "show");
    assert.equal(r.code, 2, JSON.stringify(r.out));
    assert.equal(r.out.error, "bad_ledger");
    assert.equal(readFileSync(join(s.dir, "outside.txt"), "utf8"), "keep me\n");
    assert.equal(existsSync(join(s.siteDir, "notes.md")), false);
  } finally {
    s.done();
  }
});

test("restore: a server file list naming a path outside the folder is skipped, never read, and the pull goes on", () => {
  const s = scratch();
  try {
    ok(cli(s, "prepare"));
    writeFileSync(join(s.dir, "home", "outside.md"), "outside\n");
    const items = [{ item_key: "P-001", kind: "improve", target_page: "/a", change_kind: "title", status: "open", first_seen: "2026-10-12" }];
    const pulled = ok(cli(s, "pull", { input: { complete: true, last_run: { ...lastRun("11111111-2222-4333-8444-555555555555"), file_hashes: { "../outside.md": "0", "plan.md": "0" } }, items } }));
    assert.equal(pulled.restored_from_server, true);
    assert.equal(readdirSync(s.siteDir).filter((n) => n.includes("outside")).length, 0, "no outside text copied in");
    assert.equal(readFileSync(join(s.dir, "home", "outside.md"), "utf8"), "outside\n");
  } finally {
    s.done();
  }
});

test("no-op: a claim with nothing to take over, and a set-status that changes nothing, write and commit nothing", () => {
  const s = scratch();
  try {
    ok(cli(s, "plan", { input: PLAN }));
    setStatus(s, "P-001", "waiting", ["--reason", "client review", "--until", "2026-11-01"]);
    const before = [snapshot(s.siteDir), commits(s.siteDir), statSync(join(s.siteDir, "ledger.json")).mtimeMs, statSync(join(s.siteDir, "plan.md")).mtimeMs];
    const same = () => [snapshot(s.siteDir), commits(s.siteDir), statSync(join(s.siteDir, "ledger.json")).mtimeMs, statSync(join(s.siteDir, "plan.md")).mtimeMs];
    const c = ok(cli(s, "claim", { args: ["--confirm", "bomannfencing.com"] }));
    assert.deepEqual([c.claimed, c.commit], [false, null]);
    assert.deepEqual(same(), before, "claim");
    const st = setStatus(s, "P-001", "waiting");
    assert.equal(st.commit, null);
    assert.deepEqual(same(), before, "set-status");
    setStatus(s, "P-001", "waiting", ["--reason", "client review", "--until", "2026-11-01"]);
    assert.deepEqual(same(), before, "set-status with the same values");
  } finally {
    s.done();
  }
  // A folder holding only this site's config.json: a claim has nothing to take over and makes no ledger.
  const t = scratch();
  try {
    ok(cli(t, "prepare"));
    writeDraft(t, "config.json", JSON.stringify({ site: "bomannfencing.com" }));
    ok(cli(t, "save", { args: ["--file", "config.json"] }));
    // save made a ledger.json too; without it the folder holds only config.json.
    unlinkSync(join(t.siteDir, "ledger.json"));
    const log = commits(t.siteDir);
    const c = ok(cli(t, "claim", { args: ["--confirm", "bomannfencing.com"] }));
    assert.deepEqual([c.claimed, c.commit], [false, null]);
    assert.equal(existsSync(join(t.siteDir, "ledger.json")), false, "no ledger made");
    assert.deepEqual(commits(t.siteDir), log);
  } finally {
    t.done();
  }
});

test("sync: a pull that confirms an item clears its sync_error, and prunes a lost payload while later changes stay pending", () => {
  const s = scratch();
  try {
    ok(cli(s, "plan", { input: PLAN }));
    const p = ok(cli(s, "push-payload"));
    ok(cli(s, "push-ack", { input: { data: p.payload.items.map((i) => ({ item_key: i.item_key, result: i.item_key === "P-001" ? "rejected" : "created", reason: "try again" })), runs: [] } }));
    assert.equal(ok(cli(s, "show")).items.find((i) => i.id === "P-001").sync_error, "try again");
    // The next pull finds P-001 on the server as it is here: it went through after all.
    ok(cli(s, "pull", { input: { complete: true, last_run: lastRun(p.payload.run_id), items: serverRows(s) } }));
    const shown = ok(cli(s, "show"));
    assert.equal(shown.items.find((i) => i.id === "P-001").sync_error, undefined);
    assert.deepEqual([shown.push_pending, shown.awaiting_ack], [false, false]);
    // A payload is lost; another item changes after it; the pull confirms the payload only.
    setStatus(s, "P-001", "in_progress");
    ok(cli(s, "push-payload"));
    setStatus(s, "P-002", "dropped");
    const rows = serverRows(s).map((r) => (r.item_key === "P-002" ? { ...r, status: "open" } : r));
    const pulled = ok(cli(s, "pull", { input: { complete: true, last_run: null, items: rows } }));
    assert.equal(pulled.cleared_pending_push, true, JSON.stringify(pulled));
    const after = ok(cli(s, "show"));
    assert.deepEqual([after.push_pending, after.awaiting_ack, after.items_not_synced], [true, false, 1]);
  } finally {
    s.done();
  }
});

test("git: a site folder whose .git is a link or a pointer file is refused, and the other repository gets no commit", () => {
  for (const kind of ["junction", "gitdir file"]) {
    const s = scratch();
    try {
      ok(cli(s, "plan", { input: PLAN, today: "2026-10-12" }));
      const other = join(s.dir, "other-repo");
      renameSync(join(s.siteDir, ".git"), join(other + ".git-moved"));
      mkdirSync(other);
      renameSync(join(other + ".git-moved"), join(other, ".git"));
      if (kind === "junction") junction(join(other, ".git"), join(s.siteDir, ".git"));
      else writeFileSync(join(s.siteDir, ".git"), `gitdir: ${join(other, ".git")}\n`);
      const before = commits(other);
      refusedUnsafe(cli(s, "set-status", { args: ["--id", "P-001", "--status", "dropped"] }), kind);
      refusedUnsafe(cli(s, "show"), `${kind}: show`);
      assert.deepEqual(commits(other), before, `${kind}: nothing committed elsewhere`);
    } finally {
      s.done();
    }
  }
});

test("transactions: a transaction folder is removed file by file, never recursively; a junction inside it is removed as a link, the folder it points to is kept", () => {
  const s = scratch();
  try {
    ok(cli(s, "prepare"));
    const out = outside(s);
    const tdir = join(s.siteDir, ".txn", "0-1-deadbeef");
    mkdirSync(tdir, { recursive: true });
    writeFileSync(join(tdir, "0.data"), "never committed\n");
    junction(out, join(tdir, "1.data"));
    const r = ok(cli(s, "show"));
    assert.deepEqual(r.recovered, [{ id: "0-1-deadbeef", done: "discarded" }]);
    assert.deepEqual(readdirSync(out), ["x.md"], "the outside folder keeps its file");
    assert.equal(existsSync(tdir), false);
    // A real folder inside one is not this script's: it stops there and removes nothing in it.
    const t2 = join(s.siteDir, ".txn", "0-2-deadbeef");
    mkdirSync(join(t2, "sub"), { recursive: true });
    writeFileSync(join(t2, "sub", "keep.md"), "keep\n");
    assert.notEqual(cli(s, "show").code, 0);
    assert.ok(existsSync(join(t2, "sub", "keep.md")));
    // A stray file in .txn is no transaction: it is left, and commands go on.
    unlinkSync(join(t2, "sub", "keep.md"));
    rmdirSync(join(t2, "sub"));
    rmdirSync(t2);
    writeFileSync(join(s.siteDir, ".txn", "stray.txt"), "not a transaction\n");
    ok(cli(s, "show"));
    assert.ok(existsSync(join(s.siteDir, ".txn", "stray.txt")));
  } finally {
    s.done();
  }
});

test("save: a draft written again while save runs is kept; only one still holding what was saved is removed", async () => {
  const s = scratch();
  try {
    ok(cli(s, "prepare"));
    writeDraft(s, "notes.md", "v1\n");
    // save stops after its commit, before it removes the draft.
    const running = cliAsync(s, "save", { args: ["--file", "notes.md"], env: { SEO_GENIUS_LEDGER_TEST_PAUSE: "txn:cleaned#1=2500" } });
    const saved = join(s.siteDir, "notes.md");
    for (let i = 0; i < 100 && !existsSync(saved); i++) await new Promise((r) => setTimeout(r, 50));
    writeDraft(s, "notes.md", "v2\n");
    ok(await running);
    assert.equal(readFileSync(saved, "utf8"), "v1\n");
    assert.equal(readFileSync(join(s.siteDir, ".drafts", "notes.md"), "utf8"), "v2\n", "the newer draft is kept");
  } finally {
    s.done();
  }
});

test("links: a junction to a folder inside the site folder is refused too, and a refused write makes no git, .gitignore or drafts first", () => {
  const s = scratch();
  try {
    ok(cli(s, "prepare"));
    // A link that stays inside: still a link, still refused.
    mkdirSync(join(s.siteDir, ".drafts", "real"), { recursive: true });
    writeFileSync(join(s.siteDir, ".drafts", "real", "a.md"), "# a\n");
    junction(join(s.siteDir, ".drafts", "real"), join(s.siteDir, ".drafts", "reports"));
    refusedUnsafe(cli(s, "save", { args: ["--file", "reports/a.md"] }), "inside junction");
    assert.equal(existsSync(join(s.siteDir, "reports")), false);
  } finally {
    s.done();
  }
  const t = scratch();
  try {
    // A folder with a ledger and no git yet: a week whose weekly/ folder is a link is refused before git, .gitignore or drafts are made.
    ok(cli(t, "plan", { input: PLAN, today: "2026-10-12", env: { SEO_GENIUS_GIT: join(t.dir, "no-git-here") } }));
    assert.equal(existsSync(join(t.siteDir, ".git")), false);
    unlinkSync(join(t.siteDir, ".gitignore"));
    rmdirSync(join(t.siteDir, ".drafts"));
    junction(outside(t), join(t.siteDir, "weekly"));
    refusedUnsafe(cli(t, "week", { input: {} }), "weekly junction");
    assert.deepEqual([".git", ".gitignore", ".drafts"].filter((n) => existsSync(join(t.siteDir, n))), []);
    // .gitignore a hard link: refused before git init runs, so no .git is left behind.
    unlinkSync(join(t.siteDir, "weekly"));
    writeFileSync(join(t.dir, "outside", "gitignore"), "x\n");
    linkSync(join(t.dir, "outside", "gitignore"), join(t.siteDir, ".gitignore"));
    refusedUnsafe(cli(t, "set-status", { args: ["--id", "P-001", "--status", "dropped"] }), ".gitignore hard link");
    assert.equal(existsSync(join(t.siteDir, ".git")), false, "no git made before the refusal");
    assert.equal(readFileSync(join(t.dir, "outside", "gitignore"), "utf8"), "x\n");
  } finally {
    t.done();
  }
});

// Review of the round 10 diff ------------------------------------------------

test("review 1: a site folder that is itself a link (a home junction, or .seo-genius in a repository) is refused, and nothing is written behind it", () => {
  const s = scratch();
  try {
    const out = outside(s);
    mkdirSync(s.home, { recursive: true });
    junction(out, s.siteDir);
    refusedUnsafe(cli(s, "plan", { input: PLAN }), "home junction");
    refusedUnsafe(cli(s, "show"), "home junction: show");
    assert.deepEqual(readdirSync(out), ["x.md"]);
    // In a repository: its .seo-genius a junction.
    const repo = join(s.dir, "repo");
    mkdirSync(repo);
    spawnSync("git", ["init", "-q", repo]);
    const out2 = outside(s, "outside2");
    junction(out2, join(repo, ".seo-genius"));
    const env = { ...process.env };
    for (const k of Object.keys(env)) if (k.startsWith("SEO_GENIUS_")) delete env[k];
    const r = spawnSync(process.execPath, [SCRIPT, "plan", "--site", "bomannfencing.com", "--cwd", repo, "--input", "-", "--today", "2026-10-19"], { input: JSON.stringify(PLAN), encoding: "utf8", env });
    assert.equal(r.status, 2, r.stdout);
    assert.equal(JSON.parse(r.stdout).error, "unsafe_path");
    assert.deepEqual(readdirSync(out2), ["x.md"]);
  } finally {
    s.done();
  }
});

test("review 2: a last_run that is an earlier run of the payload confirms only itself; the payload's later runs stay pending", () => {
  const s = scratch();
  try {
    ok(cli(s, "plan", { input: { ...PLAN, run_id: "r1" }, today: "2026-10-12" }));
    ok(cli(s, "push-payload", { today: "2026-10-12" }));
    // That save went through and its answer was lost. A second run, and a payload that never arrives.
    ok(cli(s, "plan", { input: { ...PLAN, run_id: "r2" } }));
    assert.deepEqual(ok(cli(s, "push-payload")).payload.runs.map((r) => r.run_id), ["r1", "r2"]);
    const pulled = ok(cli(s, "pull", { input: { complete: true, last_run: lastRun("r1"), items: serverRows(s) } }));
    assert.deepEqual(pulled.runs_confirmed, ["r1"]);
    const shown = ok(cli(s, "show"));
    assert.deepEqual([shown.runs_not_synced, shown.push_pending], [1, true]);
    assert.deepEqual(ok(cli(s, "push-payload")).payload.runs.map((r) => r.run_id), ["r2"]);
  } finally {
    s.done();
  }
});

test("review 3: save refuses the ledger's own files and folders in any letter case, and a name that differs from one in the folder only in case", () => {
  const s = scratch();
  try {
    ok(cli(s, "plan", { input: PLAN }));
    ok(cli(s, "prepare"));
    const log = commits(s.siteDir);
    const owned = [
      ["CONFIG.json", JSON.stringify({ a: 2 })],
      ["Ledger.json", "{}"],
      ["Plan.md", "x"],
      ["Weekly/2026-10-19.md", "x"],
      ["Snapshots/2026-10-19.json", "{}"],
      ["plan.Hand-Edit-1.md", "x"],
    ];
    for (const [rel, text] of owned) {
      writeDraft(s, rel, text);
      const r = cli(s, "save", { args: ["--file", rel] });
      assert.equal(r.code, 2, `${rel}: ${JSON.stringify(r.out)}`);
    }
    writeDraft(s, "notes.md", "a\n");
    ok(cli(s, "save", { args: ["--file", "notes.md"] }));
    writeDraft(s, "Notes.md", "b\n");
    const twin = cli(s, "save", { args: ["--file", "Notes.md"] });
    assert.equal(twin.code, 2, JSON.stringify(twin.out));
    assert.match(twin.out.message, /differs only in case from notes\.md/);
    assert.equal(readFileSync(join(s.siteDir, "notes.md"), "utf8"), "a\n");
    assert.equal(commits(s.siteDir).length, log.length + 1, "only notes.md was committed");
  } finally {
    s.done();
  }
});

test("review 4: an until that is not a calendar date is refused from set-status, a plan item and a week verdict, before anything is written", () => {
  const s = scratch();
  try {
    for (const until of ["Nov 3", "2026-02-30"]) {
      const r = cli(s, "plan", { input: { items: [{ ...PLAN.items[0], status: "waiting", until }] } });
      assert.deepEqual([r.code, r.out.error], [2, "bad_input"], JSON.stringify(r.out));
      assert.equal(existsSync(s.home), false, "nothing created");
    }
    ok(cli(s, "plan", { input: PLAN }));
    const before = [snapshot(s.siteDir), commits(s.siteDir)];
    const r1 = cli(s, "set-status", { args: ["--id", "P-001", "--status", "waiting", "--until", "next week"] });
    assert.deepEqual([r1.code, r1.out.error], [2, "bad_input"], JSON.stringify(r1.out));
    const r2 = cli(s, "week", { input: { verdicts: { "P-001": { status: "waiting", reason: "WAIT", until: "2026-13-01" } } } });
    assert.deepEqual([r2.code, r2.out.error], [2, "bad_input"], JSON.stringify(r2.out));
    assert.deepEqual([snapshot(s.siteDir), commits(s.siteDir)], before);
    ok(cli(s, "set-status", { args: ["--id", "P-001", "--status", "waiting", "--until", "2026-11-02"] }));
  } finally {
    s.done();
  }
});

test("review 5: an allow on an unchecked item opens it with no reason; on an open item it changes nothing", () => {
  const s = scratch();
  try {
    ok(cli(s, "plan", { input: { items: [{ ...PLAN.items[0], status: "unchecked", reason: "history partly checked" }, PLAN.items[1]] }, today: "2026-10-12" }));
    const w = ok(cli(s, "week", { input: { verdicts: { "P-001": { status: "open" }, "P-002": { status: "open" } } } }));
    assert.deepEqual(w.status_changes, [{ id: "P-001", from: "unchecked", to: "open", reason: null }]);
    const items = ledgerOf(s).items;
    assert.deepEqual([items[0].status, items[0].status_reason, items[1].status, items[1].status_reason], ["open", null, "open", null]);
  } finally {
    s.done();
  }
});

test("review 6: a hand-edited file a command does not rewrite is left alone: no copy and no commit on every command, one copy when it is rewritten", () => {
  const s = scratch();
  try {
    ok(cli(s, "plan", { input: PLAN, today: "2026-10-12" }));
    ok(cli(s, "week", { input: {}, today: "2026-10-12" }));
    writeFileSync(join(s.siteDir, "changelog.md"), `${readFileSync(join(s.siteDir, "changelog.md"), "utf8")}\nmy own note\n`);
    const log = commits(s.siteDir);
    for (let i = 0; i < 3; i++) assert.equal(setStatus(s, "P-001", "open", [], "2026-10-12").commit, null);
    assert.deepEqual(commits(s.siteDir), log);
    assert.equal(readdirSync(s.siteDir).filter((n) => n.includes("hand-edit")).length, 0);
    const w = ok(cli(s, "week", { input: {} }));
    assert.deepEqual(w.hand_edited.map((h) => h.file), ["changelog.md"]);
    assert.equal(readdirSync(s.siteDir).filter((n) => n.includes("hand-edit")).length, 1);
  } finally {
    s.done();
  }
});

test("review 8: a run id already in the ledger is refused, so a repeated week is not recorded twice", () => {
  const s = scratch();
  try {
    ok(cli(s, "plan", { input: PLAN, today: "2026-10-12" }));
    ok(cli(s, "week", { input: { run_id: "w1" } }));
    const before = [snapshot(s.siteDir), commits(s.siteDir)];
    const r = cli(s, "week", { input: { run_id: "w1" } });
    assert.deepEqual([r.code, r.out.error], [2, "bad_input"], JSON.stringify(r.out));
    assert.deepEqual([snapshot(s.siteDir), commits(s.siteDir)], before);
    assert.equal(ledgerOf(s).runs.filter((x) => x.run_id === "w1").length, 1);
  } finally {
    s.done();
  }
});
