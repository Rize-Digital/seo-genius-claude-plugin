// The review of fbcd6341 and the live smoke test on two sites: an own change not
// verified yet is reported, one answer for awaiting_ack, nothing written by a
// refusal or a no-op, a linked change past the first page, a link never
// replaced, zero counts in the changelog, save taking the draft's own path, an
// allow that changes nothing, and two weeks on two dates.
// Run: node --test tests/ledger/round9.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { scratch, cli, snapshot, commits, writeDraft, U, PLAN } from "./helpers.mjs";

const ledgerOf = (s) => JSON.parse(readFileSync(join(s.siteDir, "ledger.json"), "utf8"));
const item = (s, id) => ledgerOf(s).items.find((i) => i.id === id);
const ok = (r) => {
  assert.equal(r.code, 0, JSON.stringify(r.out));
  return r.out;
};
const setStatus = (s, id, status, extra = [], today = "2026-10-12") => ok(cli(s, "set-status", { args: ["--id", id, "--status", status, ...extra], today }));
const skill = (name) => readFileSync(fileURLToPath(new URL(`../../plugins/seo-genius/skills/${name}/SKILL.md`, import.meta.url)), "utf8");
const BARBED = "https://bomannfencing.com/blog/how-many-strands-barbed-wire-cattle/";
const titleChange = (n, verification, on = "2026-10-18", page_url = BARBED) => ({ source: "reported", id: U(n), page_url, change_kind: "title", on, verification });
const ACK_ALL = (p) => ({ data: p.payload.items.map((i) => ({ item_key: i.item_key, result: "created" })), runs: p.payload.runs.map((r) => ({ run_id: r.run_id, result: "recorded" })) });

// 1 ---------------------------------------------------------------------------

test("held: an in-progress item whose own change is not observed, claimed, or not read yet is reported with that reason", () => {
  for (const [state, why] of [
    ["not_observed", /its own change 2026-10-18 is not_observed, not verified live yet/],
    ["claimed", /its own change 2026-10-18 is claimed, not verified live yet/],
    [null, new RegExp(`its own change reported:${U(20)} is not in the changelog yet`)],
  ]) {
    const s = scratch();
    try {
      ok(cli(s, "plan", { input: PLAN, today: "2026-10-12" }));
      setStatus(s, "P-002", "in_progress", ["--reason", "pull request 12", "--change", U(20)]);
      const w = ok(cli(s, "week", { input: { changes: state ? [titleChange(20, state)] : [] }, today: "2026-10-19" }));
      const h = w.held.find((x) => x.id === "P-002");
      assert.ok(h, `${state}: held lists P-002: ${JSON.stringify(w.held)}`);
      assert.deepEqual([h.status, h.would_be], ["in_progress", "done"], String(state));
      assert.match(h.reason, why);
      assert.equal(item(s, "P-002").status, "in_progress");
      assert.match(readFileSync(join(s.siteDir, "weekly", "2026-10-19.md"), "utf8"), /- P-002: in_progress; this week would make it done/);
    } finally {
      s.done();
    }
  }
});

// 2 ---------------------------------------------------------------------------

test("awaiting_ack: a payload whose answer was lost is not awaited once a pull confirms the state; show and push-payload agree", () => {
  const s = scratch();
  try {
    ok(cli(s, "plan", { input: PLAN }));
    ok(cli(s, "push-ack", { input: ACK_ALL(ok(cli(s, "push-payload"))) }));
    setStatus(s, "P-001", "in_progress", [], "2026-10-19");
    // The payload is made and sent; its answer never comes back.
    const sent = ok(cli(s, "push-payload"));
    assert.equal(sent.payload.items.length, 1);
    assert.equal(ok(cli(s, "show")).awaiting_ack, true);
    // The next run's pull reads every item as the server now holds it: the save went through.
    const rows = ledgerOf(s).items.map((it) => ({ item_key: it.id, kind: it.action, target_page: it.target_page, change_kind: it.change_kind, status: it.status, status_reason: it.status_reason, status_until: it.until, change_id: null, issue_id: null, first_seen: it.first_seen }));
    const pulled = ok(cli(s, "pull", { input: { complete: true, last_run: null, items: rows } }));
    assert.equal(pulled.cleared_pending_push, true);
    assert.equal(ledgerOf(s).pending_push, undefined, "the stale payload record is gone");
    const shown = ok(cli(s, "show"));
    const p = ok(cli(s, "push-payload"));
    assert.deepEqual([shown.push_pending, shown.awaiting_ack, p.nothing_to_send], [false, false, true]);
    // No pull at all: a payload is made, then the item is set back to what the server holds.
    // The record of that payload is still in ledger.json, but nothing is pending, so nothing is awaited.
    setStatus(s, "P-002", "dropped", [], "2026-10-26");
    assert.equal(ok(cli(s, "push-payload", { today: "2026-10-26" })).payload.items.length, 1);
    setStatus(s, "P-002", "open", [], "2026-10-26");
    assert.ok(ledgerOf(s).pending_push, "the record of the payload is still there");
    const again = ok(cli(s, "show"));
    assert.deepEqual([again.push_pending, again.awaiting_ack], [false, false]);
  } finally {
    s.done();
  }
});

// 3 ---------------------------------------------------------------------------

test("no writes: a no-op or refused command creates no folder, git, .gitignore or drafts, on a missing, empty or prepared folder", () => {
  const s = scratch();
  try {
    const none = (label) => assert.equal(existsSync(s.home), false, `${label}: nothing created`);
    const p = ok(cli(s, "push-payload"));
    assert.equal(p.nothing_to_send, true);
    none("push-payload on a missing folder");
    for (const [cmd, opts] of [
      ["set-status", { args: ["--id", "P-001", "--status", "done"] }],
      ["set-status", { args: ["--id", "P-001", "--status", "finished"] }],
      ["push-ack", { input: { data: [], runs: [] } }],
      ["save", { args: ["--file", "notes.md"] }],
      ["claim", { args: ["--confirm", "bomannfencing.com"] }],
      ["week", { input: { as_of: "2026-10-24" }, today: "2026-10-23" }],
      ["plan", { input: { items: [{ action: "improve" }] } }],
      ["pull", { input: { complete: true } }],
    ]) {
      const r = cli(s, cmd, opts);
      assert.equal(r.code, 2, `${cmd}: ${JSON.stringify(r.out)}`);
      none(`${cmd} ${JSON.stringify(opts)}`);
    }
    // An empty folder stays empty.
    mkdirSync(s.siteDir, { recursive: true });
    assert.equal(ok(cli(s, "push-payload")).nothing_to_send, true);
    assert.deepEqual(readdirSync(s.siteDir), []);
    assert.equal(cli(s, "week", { input: { as_of: "2026-10-24" }, today: "2026-10-23" }).code, 2);
    assert.deepEqual(readdirSync(s.siteDir), []);
    // A prepared folder: a refused week leaves files and history as they were.
    ok(cli(s, "prepare"));
    const files = readdirSync(s.siteDir).sort();
    const log = commits(s.siteDir);
    assert.equal(cli(s, "week", { input: { as_of: "2026-10-24" }, today: "2026-10-23" }).code, 2);
    assert.deepEqual([readdirSync(s.siteDir).sort(), commits(s.siteDir)], [files, log]);
  } finally {
    s.done();
  }
});

// 4 ---------------------------------------------------------------------------

test("linked change past the first page: the weekly re-read follows next_cursor, and a linked change at row 150 of 250 closes its item", () => {
  const bullet = skill("weekly").split("\n").find((l) => l.includes("with a linked change (`show` lists its `change`)")) ?? "";
  assert.match(bullet, /following `next_cursor` until it is null, and add every row of every page/);
  const s = scratch();
  try {
    ok(cli(s, "plan", { input: PLAN, today: "2026-10-12" }));
    setStatus(s, "P-002", "in_progress", ["--change", U(1150)]);
    const rows = Array.from({ length: 250 }, (_, i) => titleChange(1000 + i, "verified", "2026-10-18", `https://bomannfencing.com/other-${i}`));
    rows[150] = titleChange(1150, "verified");
    ok(cli(s, "week", { input: { changes: rows }, today: "2026-10-19" }));
    assert.equal(item(s, "P-002").status, "done");
  } finally {
    s.done();
  }
});

// 5 ---------------------------------------------------------------------------

test("links: set-status --change never replaces a different link; only --replace-change does, and no skill uses it; report links only an unlinked item", () => {
  const s = scratch();
  try {
    ok(cli(s, "plan", { input: PLAN }));
    setStatus(s, "P-002", "in_progress", ["--change", U(20)]);
    const before = snapshot(s.siteDir);
    const r = cli(s, "set-status", { args: ["--id", "P-002", "--status", "in_progress", "--change", U(21)] });
    assert.equal(r.code, 2);
    assert.match(r.out.message, /already linked to reported:00000000-0000-4000-8000-000000000020; nothing was changed/);
    assert.deepEqual(snapshot(s.siteDir), before);
    // The same link again is fine.
    assert.equal(setStatus(s, "P-002", "in_progress", ["--change", U(20)]).change, `reported:${U(20)}`);
    assert.equal(setStatus(s, "P-002", "in_progress", ["--replace-change", U(21)]).change, `reported:${U(21)}`);
    assert.equal(cli(s, "set-status", { args: ["--id", "P-002", "--status", "in_progress", "--change", U(22), "--replace-change", U(23)] }).code, 2);
  } finally {
    s.done();
  }
  const report = skill("report");
  assert.match(report, /`in_progress` with the same page and `change_kind` as the change just recorded and no linked change yet \(its `change` is null\)/);
  assert.match(report, /Never replace a link/);
  for (const name of ["report", "weekly", "next", "log-change", "content-plan"]) assert.doesNotMatch(skill(name), /--replace-change/, name);
});

// 6 ---------------------------------------------------------------------------

test("changelog: a source with no rows says 0 recorded, for dashboard fixes and MCP changes alike", () => {
  const s = scratch();
  try {
    ok(cli(s, "week", { input: { changes: [] } }));
    let text = readFileSync(join(s.siteDir, "changelog.md"), "utf8");
    assert.match(text, /^0 MCP changes recorded\.$/m);
    assert.match(text, /^0 dashboard fixes recorded\.$/m);
    ok(cli(s, "week", { input: { changes: [titleChange(1, "verified")] }, today: "2026-10-26" }));
    text = readFileSync(join(s.siteDir, "changelog.md"), "utf8");
    assert.match(text, /^1 MCP change recorded\.$/m);
    assert.match(text, /^0 dashboard fixes recorded\.$/m);
  } finally {
    s.done();
  }
});

// 7 ---------------------------------------------------------------------------

test("save: takes the path inside the site folder or the draft's own path; refuses one outside the drafts folder", () => {
  const s = scratch();
  try {
    ok(cli(s, "prepare"));
    writeDraft(s, "reports/2026-10-19-next.md", "# proposal\n");
    const draft = join(s.siteDir, ".drafts", "reports", "2026-10-19-next.md");
    const r = ok(cli(s, "save", { args: ["--file", draft] }));
    assert.deepEqual(r.saved, ["reports/2026-10-19-next.md"]);
    assert.equal(readFileSync(join(s.siteDir, "reports", "2026-10-19-next.md"), "utf8"), "# proposal\n");
    assert.equal(existsSync(draft), false, "the draft is removed once saved");
    writeDraft(s, "reports/2026-10-26-next.md", "# second\n");
    assert.deepEqual(ok(cli(s, "save", { args: ["--file", "reports/2026-10-26-next.md"] })).saved, ["reports/2026-10-26-next.md"]);
    // Outside the drafts folder: the site folder itself, another folder, or a .seo-genius/ path.
    writeFileSync(join(s.dir, "elsewhere.md"), "x");
    for (const bad of [join(s.siteDir, "reports", "2026-10-26-next.md"), join(s.dir, "elsewhere.md"), join(s.siteDir, ".drafts", "..", "plan.md"), ".seo-genius/reports/2026-10-26-next.md"]) {
      const b = cli(s, "save", { args: ["--file", bad] });
      assert.equal(b.code, 2, bad);
      assert.equal(b.out.error, "bad_input", bad);
    }
  } finally {
    s.done();
  }
});

// 8 ---------------------------------------------------------------------------

test("allow: an allow verdict sets no reason and changes no item; the weekly skill says to send none", () => {
  assert.match(skill("weekly"), /`allow` changes nothing, so send no verdict for it \(no status, no reason\)/);
  const s = scratch();
  try {
    ok(cli(s, "plan", { input: PLAN, today: "2026-10-12" }));
    ok(cli(s, "push-ack", { input: ACK_ALL(ok(cli(s, "push-payload", { today: "2026-10-12" }))), today: "2026-10-12" }));
    const before = ledgerOf(s).items;
    const allow = Object.fromEntries(before.map((it) => [it.id, { status: "open", reason: "check_change: allow" }]));
    const w = ok(cli(s, "week", { input: { run_id: "w1", verdicts: allow }, today: "2026-10-19" }));
    assert.deepEqual(w.status_changes, []);
    assert.deepEqual(w.held, []);
    assert.deepEqual(ledgerOf(s).items, before, "no item changed, not even a reason or a date");
    const p = ok(cli(s, "push-payload", { today: "2026-10-19" }));
    assert.deepEqual([p.payload.items, p.payload.runs.map((r) => r.run_id)], [[], ["w1"]]);
  } finally {
    s.done();
  }
});

// 9 ---------------------------------------------------------------------------

test("week over week on two dates: the second compares with the first one's snapshot, rankings and issues both", () => {
  const s = scratch();
  try {
    const first = ok(cli(s, "week", { input: { rankings: [{ keyword: "goat fencing", location: "Bonifay, FL", position: 14 }, { keyword: "barbed wire roll", location: "Bonifay, FL", position: 9 }, { keyword: "farm fence", location: "Bonifay, FL", position: 18 }], issues: [{ id: U(1), severity: "high" }, { id: U(2), severity: "low" }] }, today: "2026-10-19" }));
    assert.equal(first.compare.previous_as_of, null);
    const second = ok(cli(s, "week", { input: { rankings: [{ keyword: "Goat Fencing", location: "Bonifay, FL", position: 10 }, { keyword: "barbed wire roll", location: "Bonifay, FL", position: 12 }, { keyword: "farm fence", location: "Bonifay, FL", position: null }], issues: [{ id: U(2), severity: "low" }, { id: U(3), severity: "critical" }] }, today: "2026-10-26" }));
    const c = second.compare;
    assert.equal(c.previous_as_of, "2026-10-19");
    assert.deepEqual(c.ranking_moves.map((m) => [m.keyword, m.from, m.to, m.kind, m.basis]), [
      ["Goat Fencing", 14, 10, "up", "snapshot 2026-10-19"],
      ["barbed wire roll", 9, 12, "down", "snapshot 2026-10-19"],
      ["farm fence", 18, null, "dropped_out", "snapshot 2026-10-19"],
    ]);
    assert.deepEqual([c.issues_opened, c.issues_closed], [[U(3)], [U(1)]]);
    assert.deepEqual(c.open_by_severity, { low: 1, critical: 1 });
    const page = readFileSync(join(s.siteDir, "weekly", "2026-10-26.md"), "utf8");
    assert.match(page, /Compared with the snapshot of 2026-10-19\./);
    assert.match(page, /Opened since 2026-10-19: 1\. No longer open: 1\./);
    assert.deepEqual(ledgerOf(s).runs.map((r) => r.ran_on), ["2026-10-19", "2026-10-26"]);
  } finally {
    s.done();
  }
});
