// Pull is a field-level three-way merge against the state both sides held at the
// last sync. Run: node --test tests/ledger/merge.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { mkdtempSync, rmSync } from "node:fs";
import { run, mergeItemState, SYNC_FIELDS } from "../../plugins/seo-genius/scripts/ledger.mjs";

const U = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const site = "bomannfencing.com";
const env = {};

// The synced base: an item the server holds with every field set.
const BASE_ROW = { item_key: "P-001", kind: "improve", target_page: "/fence", change_kind: "title", status: "waiting", status_reason: "frozen", status_until: "2026-11-02", change_id: U(5), issue_id: U(9), first_seen: "2026-10-01" };

function synced() {
  const dir = mkdtempSync(join(tmpdir(), "sg-merge-"));
  const o = { site, cwd: dir, home: join(dir, "home"), env };
  run("pull", { ...o, today: "2026-10-10", input: { complete: true, last_run: null, items: [BASE_ROW] } });
  return {
    o,
    item: () => JSON.parse(readFileSync(join(dir, "home", site, "ledger.json"), "utf8")).items.find((i) => i.id === "P-001"),
    pull: (over, today = "2026-10-12") => run("pull", { ...o, today, input: { complete: true, last_run: null, items: [{ ...BASE_ROW, ...over }] } }),
    push: () => run("push-payload", { ...o, today: "2026-10-12" }),
    done: () => rmSync(dir, { recursive: true, force: true }),
  };
}

// What the server changes for each field, a clear included wherever the field can be null.
const SERVER_CHANGES = {
  status: { status: "open", status_reason: null, status_until: null },
  status_reason: { status_reason: null },
  until: { status_until: null },
  change_id: { change_id: null },
  issue_id: { issue_id: null },
};

test("merge: covers every synced field", () => {
  assert.deepEqual(Object.keys(SERVER_CHANGES).sort(), [...SYNC_FIELDS].sort());
});

for (const [field, over] of Object.entries(SERVER_CHANGES)) {
  test(`merge: a server-side change of ${field} is adopted and never sent back by a later push`, () => {
    const t = synced();
    try {
      const r = t.pull(over);
      assert.ok(r.adopted[0].fields.includes(field), JSON.stringify(r.adopted));
      const it = t.item();
      if (field === "change_id") assert.equal(it.links.change, undefined);
      if (field === "issue_id") assert.equal(it.links.issue_id, undefined);
      if (field === "status_reason") assert.equal(it.status_reason, null);
      if (field === "until") assert.equal(it.until, null);
      if (field === "status") assert.equal(it.status, "open");
      const p = t.push();
      assert.equal(p.nothing_to_send, true, JSON.stringify(p.payload.items));
      // A week that still holds the change the server unlinked does not link it again.
      run("week", { ...t.o, today: "2026-10-19", input: { as_of: "2026-10-19", changes: [{ source: "reported", id: U(5), page_url: "/fence", change_kind: "title", on: "2026-10-05", verification: "verified" }] } });
      const after = t.push();
      if (field === "change_id") {
        assert.equal(t.item().links.change, undefined);
        assert.equal(t.item().status, "waiting", "the unlinked change does not close the item again");
        assert.deepEqual(after.payload.items, [], "nothing to send back");
      }
      if (field === "issue_id") assert.ok(after.payload.items.every((i) => i.issue_id === undefined), JSON.stringify(after.payload.items));
    } finally {
      t.done();
    }
  });
}

test("merge: a local change with the server unchanged is kept and sent", () => {
  const t = synced();
  try {
    run("set-status", { ...t.o, today: "2026-10-11", id: "P-001", status: "in_progress", reason: "pull request opened" });
    const r = t.pull({});
    assert.deepEqual(r.adopted, []);
    assert.deepEqual(r.kept_local[0].fields, ["status", "status_reason", "until"]);
    const sent = t.push().payload.items[0];
    assert.deepEqual([sent.status, sent.status_reason, sent.status_until, sent.change_id, sent.issue_id], ["in_progress", "pull request opened", null, U(5), U(9)]);
  } finally {
    t.done();
  }
});

test("merge: each side changed a different field: both changes are kept", () => {
  const t = synced();
  try {
    run("set-status", { ...t.o, today: "2026-10-11", id: "P-001", status: "in_progress", reason: "pull request opened" });
    const r = t.pull({ change_id: null, issue_id: null });
    assert.deepEqual(r.adopted[0].fields, ["change_id", "issue_id"]);
    const it = t.item();
    assert.equal(it.status, "in_progress");
    assert.equal(it.links.change, undefined);
    assert.equal(it.links.issue_id, undefined);
    const sent = t.push().payload.items[0];
    assert.deepEqual([sent.status, sent.change_id, sent.issue_id], ["in_progress", null, undefined]);
  } finally {
    t.done();
  }
});

test("merge: both sides changed the same field differently: the local value stands, is reported, and is sent", () => {
  const t = synced();
  try {
    run("set-status", { ...t.o, today: "2026-10-11", id: "P-001", status: "dropped", reason: "decided here" });
    const r = t.pull({ status: "done", status_reason: "closed elsewhere", status_until: null });
    assert.deepEqual(r.kept_local[0].conflicts, ["status", "status_reason"]);
    assert.equal(t.item().status, "dropped");
    assert.equal(t.push().payload.items[0].status, "dropped");
  } finally {
    t.done();
  }
});

test("merge: the rule itself, field by field", () => {
  const base = { status: "open", status_reason: null, until: null, change_id: U(1), issue_id: U(2) };
  // Server cleared change_id, local changed nothing.
  assert.deepEqual(mergeItemState(base, { ...base }, { ...base, change_id: null }).merged, { ...base, change_id: null });
  // Local set a reason, the server set an issue clear: both.
  assert.deepEqual(mergeItemState(base, { ...base, status_reason: "note" }, { ...base, issue_id: null }).merged, { ...base, status_reason: "note", issue_id: null });
  // The server moved the status to waiting with its date; the date comes with it.
  const m = mergeItemState(base, { ...base, status_reason: "local note" }, { ...base, status: "waiting", until: "2026-11-01", status_reason: "frozen" });
  assert.deepEqual([m.merged.status, m.merged.until, m.merged.status_reason], ["waiting", "2026-11-01", "frozen"]);
  // No base: the local item stands.
  assert.deepEqual(mergeItemState(null, { ...base, status: "done" }, { ...base }).merged.status, "done");
});
