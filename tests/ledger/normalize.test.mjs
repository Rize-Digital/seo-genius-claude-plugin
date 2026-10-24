// One rule for every item, on every path into the ledger: an until date only on a
// waiting item (until_needs_waiting). Run: node --test tests/ledger/normalize.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, writeFileSync, rmSync, existsSync } from "node:fs";
import { join } from "node:path";
import { scratch, cli, PLAN } from "./helpers.mjs";

const RULE = (id, was) => ({ id, field: "until", rule: "until_needs_waiting", was });
const row = (over = {}) => ({ item_key: "P-001", kind: "improve", target_page: "/fence", change_kind: "title", status: "open", status_until: "2026-11-02", first_seen: "2026-10-01", ...over });
const pull = (s, items, today = "2026-10-12") => cli(s, "pull", { input: { complete: true, last_run: null, items }, today });
const ledgerOf = (s) => JSON.parse(readFileSync(join(s.siteDir, "ledger.json"), "utf8"));
const item = (s, id = "P-001") => ledgerOf(s).items.find((i) => i.id === id);

/** What the push sends for P-001, or null when nothing is sent. */
function sent(s) {
  const p = cli(s, "push-payload");
  assert.equal(p.code, 0, JSON.stringify(p.out));
  return p.out.payload.items.find((i) => i.item_key === "P-001") ?? null;
}

test("normalize: a new server row, open with an until date, is imported without it, reported, and the clear is pushed", () => {
  const s = scratch();
  try {
    assert.equal(cli(s, "prepare").code, 0);
    // Seed an existing ledger, so this is the import path of an ordinary pull.
    assert.equal(pull(s, []).code, 0);
    const r = pull(s, [row()]);
    assert.equal(r.code, 0, JSON.stringify(r.out));
    assert.deepEqual(r.out.imported, ["P-001"]);
    assert.deepEqual(r.out.normalized, [RULE("P-001", "2026-11-02")]);
    assert.equal(item(s).until, null);
    assert.doesNotMatch(readFileSync(join(s.siteDir, "plan.md"), "utf8"), /until 2026-11-02/);
    const p = sent(s);
    assert.ok(p, "push-payload has the item to send, not nothing_to_send");
    assert.deepEqual([p.status, p.status_until], ["open", null]);
  } finally {
    s.done();
  }
});

test("normalize: an item stored invalid and equal to an equally invalid server row is cleared, reported, and pushed", () => {
  const s = scratch();
  try {
    assert.equal(pull(s, [row({ status: "waiting" })]).code, 0);
    // Stored before this rule: open with a date on both sides, the synced base too.
    const l = ledgerOf(s);
    Object.assign(l.items[0], { status: "open" });
    l.items[0].synced = { ...l.items[0].synced, status: "open" };
    writeFileSync(join(s.siteDir, "ledger.json"), JSON.stringify(l));
    const r = pull(s, [row()]);
    assert.equal(r.code, 0, JSON.stringify(r.out));
    assert.deepEqual(r.out.normalized, [RULE("P-001", "2026-11-02")]);
    assert.equal(r.out.in_sync, 0, "not counted as in sync while the server still holds the date");
    assert.equal(item(s).until, null);
    assert.deepEqual([sent(s).status, sent(s).status_until], ["open", null]);
  } finally {
    s.done();
  }
});

test("normalize: a ledger rebuilt from the server clears an invalid row's date, reports it, and pushes the clear", () => {
  const s = scratch();
  try {
    assert.equal(pull(s, [row({ status: "waiting" })]).code, 0);
    rmSync(join(s.siteDir, "ledger.json"));
    const r = pull(s, [row({ status: "in_progress" }), row({ item_key: "P-002", target_page: "/gate", status: "waiting", status_until: "2026-11-09" })]);
    assert.equal(r.code, 0, JSON.stringify(r.out));
    assert.equal(r.out.restored_from_server, true);
    assert.deepEqual(r.out.normalized, [RULE("P-001", "2026-11-02")]);
    assert.equal(item(s).until, null);
    assert.equal(item(s, "P-002").until, "2026-11-09", "a waiting item keeps its date");
    assert.deepEqual([sent(s).status, sent(s).status_until], ["in_progress", null]);
  } finally {
    s.done();
  }
});

test("normalize: a hand edit that adds until to an open item is cleared by the next command and never sent", () => {
  const s = scratch();
  try {
    assert.equal(cli(s, "plan", { input: PLAN, today: "2026-10-12" }).code, 0);
    const l = ledgerOf(s);
    l.items[0].until = "2026-12-01";
    writeFileSync(join(s.siteDir, "ledger.json"), JSON.stringify(l));
    // show reports it as the next write will store it.
    const shown = cli(s, "show");
    assert.equal(shown.out.items[0].until, null);
    assert.deepEqual(shown.out.normalized, [RULE("P-001", "2026-12-01")]);
    const p = cli(s, "push-payload");
    assert.deepEqual(p.out.normalized, [RULE("P-001", "2026-12-01")]);
    assert.equal(p.out.payload.items.find((i) => i.item_key === "P-001").status_until, null);
    assert.equal(item(s).until, null, "stored cleared");
  } finally {
    s.done();
  }
});

test("normalize: set-status with an until date on a status other than waiting stores no date and reports it", () => {
  const s = scratch();
  try {
    assert.equal(cli(s, "plan", { input: PLAN, today: "2026-10-12" }).code, 0);
    const r = cli(s, "set-status", { args: ["--id", "P-002", "--status", "in_progress", "--until", "2026-11-30"] });
    assert.equal(r.code, 0, JSON.stringify(r.out));
    assert.deepEqual(r.out.normalized, [RULE("P-002", "2026-11-30")]);
    assert.equal(item(s, "P-002").until, null);
    const w = cli(s, "set-status", { args: ["--id", "P-002", "--status", "waiting", "--until", "2026-11-30"] });
    assert.equal(w.out.normalized, undefined);
    assert.equal(item(s, "P-002").until, "2026-11-30");
  } finally {
    s.done();
  }
});

test("normalize: a week verdict that gives a date to a status other than waiting stores no date and reports it", () => {
  const s = scratch();
  try {
    assert.equal(cli(s, "plan", { input: PLAN, today: "2026-10-12" }).code, 0);
    const r = cli(s, "week", { input: { as_of: "2026-10-19", verdicts: { "P-003": { status: "dropped", reason: "would_revert", until: "2026-11-01" } } } });
    assert.equal(r.code, 0, JSON.stringify(r.out));
    assert.deepEqual(r.out.normalized, [RULE("P-003", "2026-11-01")]);
    assert.equal(item(s, "P-003").until, null);
    assert.ok(existsSync(join(s.siteDir, "weekly", "2026-10-19.md")));
  } finally {
    s.done();
  }
});
