// The rules the 2026-10-23 live smoke test found unwritten: what a week may
// change, where the files go from any working folder, a push with nothing to
// send, one answer for "is a push pending", one date basis, and the reason a
// set-status keeps. Run: node --test tests/ledger/rules.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, mkdirSync, existsSync, rmSync } from "node:fs";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { scratch, cli, snapshot, commits, git, site, U, SCRIPT, PLAN } from "./helpers.mjs";
import { weekMayChange } from "../../plugins/seo-genius/scripts/ledger.mjs";

const ledgerOf = (s) => JSON.parse(readFileSync(join(s.siteDir, "ledger.json"), "utf8"));
const item = (s, id) => ledgerOf(s).items.find((i) => i.id === id);
const ok = (r) => {
  assert.equal(r.code, 0, JSON.stringify(r.out));
  return r.out;
};
const setStatus = (s, id, status, extra = [], today = "2026-10-12") => ok(cli(s, "set-status", { args: ["--id", id, "--status", status, ...extra], today }));

const SIX = {
  items: [
    ...PLAN.items,
    { action: "improve", target_page: "https://bomannfencing.com/services/farm-fencing", change_kind: "meta_description", keyword: "farm fencing", what_to_do: "Rewrite the description" },
    { action: "improve", target_page: "https://bomannfencing.com/services/vinyl-fencing", change_kind: "h1", keyword: "vinyl fencing", what_to_do: "Name the service in the H1" },
    { action: "improve", target_page: "https://bomannfencing.com/services/chain-link", change_kind: "title", keyword: "chain link fence", what_to_do: "Local title" },
  ],
};
// Every verdict says allow (open), and P-001's change went live: what a week would do to all of them.
const ALLOW_ALL = Object.fromEntries(["P-001", "P-002", "P-003", "P-004", "P-005", "P-006"].map((id) => [id, { status: "open", reason: "check_change: allow" }]));
const P1_LIVE = { source: "reported", id: U(1), page_url: "https://bomannfencing.com/blog/escape-proof-goat-fencing", change_kind: "content_depth", on: "2026-10-15", verification: "verified" };

test("week: rule table: only open, unchecked, or waiting whose until has come may change", () => {
  const today = "2026-10-19";
  const cases = [
    [{ status: "open" }, true],
    [{ status: "unchecked" }, true],
    [{ status: "waiting", until: "2026-10-18" }, true],
    [{ status: "waiting", until: "2026-10-19" }, true],
    [{ status: "waiting", until: "2026-10-20" }, false],
    [{ status: "waiting", until: null }, false],
    [{ status: "in_progress" }, false],
    [{ status: "done" }, false],
    [{ status: "dropped" }, false],
  ];
  for (const [it, want] of cases) assert.equal(weekMayChange(it, today), want, JSON.stringify(it));
});

test("week: a manual status survives two weeks of allow verdicts and a live change; open and a run-out wait move; held says why", () => {
  const s = scratch();
  try {
    ok(cli(s, "plan", { input: SIX, today: "2026-10-12" }));
    setStatus(s, "P-001", "in_progress", ["--reason", "pull request 12"]);
    setStatus(s, "P-002", "waiting", ["--until", "2026-11-30", "--reason", "client review"]);
    setStatus(s, "P-003", "waiting", ["--until", "2026-10-19", "--reason", "measurement window"]);
    setStatus(s, "P-004", "done", ["--reason", "shipped by hand"]);
    setStatus(s, "P-005", "dropped", ["--reason", "client said no"]);
    for (const [week, today] of [[1, "2026-10-19"], [2, "2026-10-26"]]) {
      const w = ok(cli(s, "week", { input: { run_id: `week-${week}`, changes: [P1_LIVE], verdicts: ALLOW_ALL }, today }));
      const st = (id) => [item(s, id).status, item(s, id).until ?? null, item(s, id).status_reason];
      assert.deepEqual(st("P-001"), ["in_progress", null, "pull request 12"], `week ${week}`);
      assert.deepEqual(st("P-002"), ["waiting", "2026-11-30", "client review"], `week ${week}`);
      assert.deepEqual(st("P-003")[0], "open", `week ${week}: the wait ran out on 2026-10-19`);
      assert.deepEqual(st("P-004"), ["done", null, "shipped by hand"], `week ${week}`);
      assert.deepEqual(st("P-005"), ["dropped", null, "client said no"], `week ${week}`);
      assert.equal(st("P-006")[0], "open");
      const held = Object.fromEntries(w.held.map((h) => [h.id, h.would_be]));
      assert.deepEqual(held, { "P-001": "done", "P-002": "open" }, `week ${week}: ${JSON.stringify(w.held)}`);
      assert.deepEqual(w.status_changes.map((c) => c.id), week === 1 ? ["P-003"] : [], `week ${week}`);
      const page = readFileSync(join(s.siteDir, "weekly", `${today}.md`), "utf8");
      assert.match(page, /## Kept as set/);
      assert.match(page, /- P-001: in_progress; this week would make it done/);
    }
    // An open item still takes a verdict, a wait with its date included.
    const w3 = ok(cli(s, "week", { input: { verdicts: { "P-006": { status: "waiting", until: "2026-11-09", reason: "WAIT" } } }, today: "2026-11-02" }));
    assert.deepEqual(w3.status_changes, [{ id: "P-006", from: "open", to: "waiting", reason: "WAIT" }]);
    assert.equal(item(s, "P-006").until, "2026-11-09");
  } finally {
    s.done();
  }
});

test("week: the skill asks check_change only for items a week may change, and maps allow to open only for them", () => {
  const skill = readFileSync(fileURLToPath(new URL("../../plugins/seo-genius/skills/weekly/SKILL.md", import.meta.url)), "utf8");
  const step4 = skill.match(/^4\. Verdicts[^\n]*$/m)?.[0] ?? "";
  assert.ok(step4, "step 4 is there");
  assert.doesNotMatch(step4, /`in_progress`, call `check_change`|`waiting`, or `in_progress`/, "in-progress items are not checked");
  assert.match(step4, /`open` or `unchecked`, or `waiting` with an `until` on or before today/);
  assert.match(step4, /never changes an item that is `in_progress`, `waiting` before its date, `done`, or `dropped`/);
  assert.match(skill, /`held`/, "the skill says what held means");
});

// --- where the files go, from every working folder ---------------------------

/** resolve as a real process started in `cwd`, with no --cwd. */
function resolveFrom(cwd, env, cmd = "resolve", input) {
  const argv = [SCRIPT, cmd, "--site", site];
  if (input !== undefined) argv.push("--input", "-");
  const clean = Object.fromEntries(Object.entries(process.env).filter(([k]) => !k.startsWith("SEO_GENIUS_")));
  const r = spawnSync(process.execPath, argv, { cwd, env: { ...clean, ...env }, encoding: "utf8", input: input === undefined ? undefined : JSON.stringify(input) });
  return { code: r.status, out: JSON.parse(r.stdout) };
}

test("resolver: from the site repo, a subfolder, the site folder itself, a folder under it, its parent, and an unrelated folder", () => {
  const s = scratch();
  try {
    const home = join(s.dir, "ledgers");
    const user = join(s.dir, "user");
    const ws = join(home, site);
    const repo = join(s.dir, "sites", "bomann");
    const sub = join(repo, "wp-content", "themes");
    const elsewhere = join(s.dir, "elsewhere");
    for (const d of [user, sub, elsewhere]) mkdirSync(d, { recursive: true });
    assert.equal(git(repo, "init", "-q").status, 0);
    ok(resolveFrom(elsewhere, { SEO_GENIUS_HOME: home }, "prepare"));
    assert.ok(existsSync(join(ws, ".git")), "the site folder has its own git");
    mkdirSync(join(ws, "weekly"), { recursive: true });
    // No home configured: the default is <user>/seo-genius.
    const noHome = { USERPROFILE: user, HOME: user };
    for (const [label, env] of [["SEO_GENIUS_HOME set", { SEO_GENIUS_HOME: home }], ["no home configured", noHome]]) {
      const expect = {
        "site repo root": [repo, "repo", join(repo, ".seo-genius")],
        "site repo subfolder": [sub, "repo", join(repo, ".seo-genius")],
        "the site folder itself": [ws, "workspace", ws],
        "a folder under the site folder": [join(ws, "weekly"), "workspace", ws],
        "its parent": [home, "workspace", ws],
        "an unrelated folder": [elsewhere, "workspace", env.SEO_GENIUS_HOME ? ws : join(user, "seo-genius", site)],
      };
      for (const [where, [cwd, mode, dir]] of Object.entries(expect)) {
        const r = ok(resolveFrom(cwd, env));
        assert.deepEqual([r.mode, r.dir], [mode, dir], `${label}, from ${where}`);
      }
    }
    // A write from inside the site folder lands in it, never in a .seo-genius/ under it.
    const before = commits(ws).length;
    ok(resolveFrom(ws, noHome, "pull", { complete: true, last_run: null, items: [] }));
    assert.ok(existsSync(join(ws, "ledger.json")));
    assert.equal(existsSync(join(ws, ".seo-genius")), false, "no .seo-genius inside the site folder");
    assert.equal(commits(ws).length, before + 1);
    assert.match(commits(ws)[0], /^ledger: pull /);
    // Recognised by its own files too: without the .gitignore, ledger.json says it.
    rmSync(join(ws, ".gitignore"));
    assert.deepEqual([ok(resolveFrom(ws, noHome)).mode, ok(resolveFrom(ws, noHome)).dir], ["workspace", ws]);
    // The site repository was never written to.
    assert.equal(existsSync(join(repo, ".seo-genius")), false);
  } finally {
    s.done();
  }
});

// --- push-payload and show ---------------------------------------------------

const ACK_ALL = (p) => ({ data: p.payload.items.map((i) => ({ item_key: i.item_key, result: "created" })), runs: p.payload.runs.map((r) => ({ run_id: r.run_id, result: "recorded" })) });

test("push-payload: with nothing to send it writes nothing and commits nothing", () => {
  const s = scratch();
  try {
    ok(cli(s, "plan", { input: PLAN }));
    const p = ok(cli(s, "push-payload"));
    ok(cli(s, "push-ack", { input: ACK_ALL(p) }));
    const files = snapshot(s.siteDir);
    const log = commits(s.siteDir);
    for (let i = 0; i < 2; i++) {
      const again = ok(cli(s, "push-payload"));
      assert.equal(again.nothing_to_send, true);
      assert.equal(again.commit, null);
      assert.deepEqual(again.files, {});
    }
    assert.deepEqual(snapshot(s.siteDir), files, "no file changed");
    assert.deepEqual(commits(s.siteDir), log, "no commit");
  } finally {
    s.done();
  }
});

test("show and push-payload agree on whether a push is pending, in every state", () => {
  const s = scratch();
  try {
    const agree = (label) => {
      const shown = ok(cli(s, "show"));
      const p = ok(cli(s, "push-payload"));
      assert.equal(shown.push_pending, !p.nothing_to_send, `${label}: show says ${shown.push_pending}, push-payload sends ${p.payload.items.length} items and ${p.payload.runs.length} runs`);
      // The counts, too, once the answer itself agrees.
      assert.equal(shown.items_not_synced, p.payload.items.length, label);
      assert.equal(shown.runs_not_synced, p.payload.runs.length, label);
      return p;
    };
    agree("empty folder");
    ok(cli(s, "plan", { input: PLAN }));
    agree("planned, never pushed");
    const p = agree("payload made, not acknowledged");
    ok(cli(s, "push-ack", { input: ACK_ALL(p) }));
    agree("acknowledged");
    setStatus(s, "P-001", "in_progress");
    const p2 = agree("a status changed after the ack");
    ok(cli(s, "push-ack", { input: ACK_ALL(p2) }));
    agree("acknowledged again");
    ok(cli(s, "week", { input: {} }));
    agree("a week run");
  } finally {
    s.done();
  }
});

// --- dates -------------------------------------------------------------------

test("dates: one UTC date for item dates, file names, the run's ran_on and the commit; a different as_of is refused", () => {
  const s = scratch();
  try {
    ok(cli(s, "plan", { input: PLAN, today: "2026-10-23" }));
    const files = snapshot(s.siteDir);
    // A local date ahead of UTC (IST after 18:30 UTC, say) is refused, and nothing is written.
    const r = cli(s, "week", { input: { as_of: "2026-10-24", issues: [] }, today: "2026-10-23" });
    assert.equal(r.code, 2);
    assert.equal(r.out.error, "bad_input");
    assert.match(r.out.message, /not the run's date 2026-10-23 \(the UTC date\)/);
    assert.deepEqual(snapshot(s.siteDir), files);
    // Without as_of, everything carries the run's date.
    const w = ok(cli(s, "week", { input: { run_id: "w1", issues: [], verdicts: { "P-001": { status: "dropped", reason: "would_revert" } } }, today: "2026-10-23" }));
    const l = ledgerOf(s);
    const run = l.runs.find((x) => x.run_id === "w1");
    assert.deepEqual([run.on, run.ran_on], ["2026-10-23", "2026-10-23"]);
    assert.ok(existsSync(join(s.siteDir, "weekly", "2026-10-23.md")));
    assert.ok(existsSync(join(s.siteDir, "snapshots", "2026-10-23.json")));
    assert.equal(l.items[0].history.at(-1).on, "2026-10-23");
    assert.equal(l.items[0].updated_on, "2026-10-23");
    assert.equal(commits(s.siteDir)[0], "ledger: week 2026-10-23 run w1");
    assert.equal(w.run_id, "w1");
    const p = ok(cli(s, "push-payload", { today: "2026-10-23" }));
    assert.deepEqual(p.payload.runs.map((x) => x.ran_on), ["2026-10-23", "2026-10-23"]);
    // The same date as an as_of is fine.
    ok(cli(s, "week", { input: { as_of: "2026-10-30" }, today: "2026-10-30" }));
    // --today is a date or nothing.
    assert.equal(cli(s, "show", { today: "23/10/2026" }).out.error, "bad_input");
  } finally {
    s.done();
  }
});

test("dates: with no --today the run is dated by UTC, whatever the machine's time zone", () => {
  const s = scratch();
  try {
    const argv = [SCRIPT, "plan", "--site", site, "--home", s.home, "--cwd", s.dir, "--input", "-"];
    for (const TZ of ["Pacific/Kiritimati", "Pacific/Pago_Pago"]) {
      const before = new Date().toISOString().slice(0, 10);
      const r = spawnSync(process.execPath, argv, { input: JSON.stringify(PLAN), encoding: "utf8", env: { ...process.env, TZ, SEO_GENIUS_HOME: "" } });
      const after = new Date().toISOString().slice(0, 10);
      assert.equal(r.status, 0, r.stdout);
      const on = ledgerOf(s).runs.at(-1).on;
      assert.ok(on === before || on === after, `${TZ}: ${on}, UTC ${before}`);
    }
  } finally {
    s.done();
  }
});

// --- set-status --------------------------------------------------------------

test("set-status: a left-out reason is kept while the status stays, cleared when the status changes; an empty one clears", () => {
  const s = scratch();
  try {
    ok(cli(s, "plan", { input: PLAN }));
    const st = () => [item(s, "P-001").status, item(s, "P-001").status_reason, item(s, "P-001").until ?? null];
    setStatus(s, "P-001", "waiting", ["--until", "2026-11-30", "--reason", "client is away"]);
    // Only the date moves: the reason stays.
    let r = setStatus(s, "P-001", "waiting", ["--until", "2026-12-07"]);
    assert.deepEqual(st(), ["waiting", "client is away", "2026-12-07"]);
    assert.deepEqual([r.status_reason, r.until], ["client is away", "2026-12-07"]);
    // Only the reason moves: the date stays.
    setStatus(s, "P-001", "waiting", ["--reason", "client is away until December"]);
    assert.deepEqual(st(), ["waiting", "client is away until December", "2026-12-07"]);
    // The status changes: the old reason explained the old status, so it goes, and so does the until.
    r = setStatus(s, "P-001", "in_progress");
    assert.deepEqual(st(), ["in_progress", null, null]);
    assert.equal(item(s, "P-001").history.at(-1).reason, null);
    setStatus(s, "P-001", "in_progress", ["--reason", "pull request 12"]);
    setStatus(s, "P-001", "in_progress");
    assert.deepEqual(st(), ["in_progress", "pull request 12", null]);
    // An explicit empty reason clears it.
    setStatus(s, "P-001", "in_progress", ["--reason", ""]);
    assert.deepEqual(st(), ["in_progress", null, null]);
  } finally {
    s.done();
  }
});

// --- an item in progress and its own change ----------------------------------

const BARBED = "https://bomannfencing.com/blog/how-many-strands-barbed-wire-cattle/";
const titleChange = (n, verification, on = "2026-10-18") => ({ source: "reported", id: U(n), page_url: BARBED, change_kind: "title", on, verification });

test("week: in_progress -> done on its own verified change, not before it is verified, and never back to open", () => {
  const s = scratch();
  try {
    ok(cli(s, "plan", { input: PLAN, today: "2026-10-12" }));
    setStatus(s, "P-002", "in_progress", ["--reason", "pull request 12"]);
    // report links the change it recorded for the merged pull request; the reason stays.
    const linked = setStatus(s, "P-002", "in_progress", ["--change", U(20).toUpperCase()]);
    assert.deepEqual([linked.change, linked.status_reason], [`reported:${U(20)}`, "pull request 12"]);
    assert.equal(ok(cli(s, "show")).items.find((i) => i.id === "P-002").change, `reported:${U(20)}`);
    assert.equal(ok(cli(s, "push-payload")).payload.items.find((i) => i.item_key === "P-002").change_id, U(20));
    // Claimed, not verified yet: still in progress, whatever the verdict says.
    const w1 = ok(cli(s, "week", { input: { changes: [titleChange(20, "claimed")], verdicts: { "P-002": { status: "open", reason: "allow" } } }, today: "2026-10-19" }));
    assert.equal(item(s, "P-002").status, "in_progress");
    assert.deepEqual(w1.status_changes, []);
    // Verified live: done, with its own change as the reason.
    const w2 = ok(cli(s, "week", { input: { changes: [titleChange(20, "verified")] }, today: "2026-10-26" }));
    assert.deepEqual(w2.status_changes, [{ id: "P-002", from: "in_progress", to: "done", reason: "its own change verified live 2026-10-18 (MCP log)" }]);
    // Done stays done: an allow never reopens it.
    ok(cli(s, "week", { input: { verdicts: { "P-002": { status: "open", reason: "allow" } } }, today: "2026-11-02" }));
    assert.equal(item(s, "P-002").status, "done");
    assert.ok(item(s, "P-002").history.every((h) => h.status !== "open" || h.on === "2026-10-12"), "never back to open");
  } finally {
    s.done();
  }
});

test("week: in_progress is not changed by an unrelated live change, a closed issue, an unobserved own change, or a verdict", () => {
  const s = scratch();
  try {
    const plan = { items: PLAN.items.map((c, i) => (i === 1 ? { ...c, issue_id: U(40) } : c)) };
    ok(cli(s, "plan", { input: plan, today: "2026-10-12" }));
    setStatus(s, "P-002", "in_progress", ["--reason", "pull request 12", "--change", U(30)]);
    const w = ok(
      cli(s, "week", {
        input: {
          // Another verified change to the same page and field, its own change not observed, and its issue no longer open.
          changes: [titleChange(31, "verified"), titleChange(30, "not_observed")],
          issues: [{ id: U(41), severity: "low" }],
          verdicts: { "P-002": { status: "open", reason: "allow" } },
        },
        today: "2026-10-19",
      }),
    );
    assert.deepEqual([item(s, "P-002").status, item(s, "P-002").status_reason], ["in_progress", "pull request 12"]);
    assert.deepEqual(w.status_changes.filter((c) => c.id === "P-002"), []);
    assert.deepEqual(w.held.find((h) => h.id === "P-002")?.would_be, "done");
  } finally {
    s.done();
  }
  // The closed issue alone, with no change recorded at all: still kept.
  const t = scratch();
  try {
    ok(cli(t, "plan", { input: { items: PLAN.items.map((c, i) => (i === 1 ? { ...c, issue_id: U(40) } : c)) }, today: "2026-10-12" }));
    setStatus(t, "P-002", "in_progress", ["--reason", "pull request 12"]);
    const w2 = ok(cli(t, "week", { input: { issues: [] }, today: "2026-10-19" }));
    assert.equal(JSON.parse(readFileSync(join(t.siteDir, "ledger.json"), "utf8")).items[1].status, "in_progress");
    assert.equal(w2.held.find((h) => h.id === "P-002")?.reason, "the issue it was planned for is no longer open");
  } finally {
    t.done();
  }
});

test("week: only an item in progress closes on its own change; waiting before its date stays waiting; --change takes a change id only", () => {
  const s = scratch();
  try {
    ok(cli(s, "plan", { input: PLAN, today: "2026-10-12" }));
    setStatus(s, "P-002", "waiting", ["--until", "2026-12-01", "--reason", "client review", "--change", U(20)]);
    ok(cli(s, "week", { input: { changes: [titleChange(20, "verified")] }, today: "2026-10-19" }));
    assert.deepEqual([item(s, "P-002").status, item(s, "P-002").until], ["waiting", "2026-12-01"]);
    const bad = cli(s, "set-status", { args: ["--id", "P-001", "--status", "in_progress", "--change", "pr-12"] });
    assert.equal(bad.code, 2);
    assert.equal(bad.out.error, "bad_input");
    assert.equal(item(s, "P-001").status, "open", "nothing written");
  } finally {
    s.done();
  }
});
