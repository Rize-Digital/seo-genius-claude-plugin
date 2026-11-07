// A file the folder already held before the ledger first wrote it: a plan from a version with
// no ledger, or one made by hand. The hand-edit guard compared recorded hashes only, so a file
// with no hash was overwritten with no copy: a site's first `pull` emptied its plan.
// Run: node --test tests/ledger/first-write.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, readFileSync, writeFileSync, existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { scratch, cli } from "./helpers.mjs";

const ok = (r) => {
  assert.equal(r.code, 0, JSON.stringify(r.out));
  return r.out;
};
const EMPTY_PULL = { items: [], last_run: null, complete: true };
const OLD_PLAN = "# Content plan\n\n| 1 | Improve | / | My real plan, written before the ledger |\n";

function withOldPlan(check) {
  const s = scratch();
  try {
    ok(cli(s, "prepare"));
    mkdirSync(s.siteDir, { recursive: true });
    writeFileSync(join(s.siteDir, "plan.md"), OLD_PLAN);
    check(s);
  } finally {
    s.done();
  }
}

test("a plan.md the ledger never wrote is copied aside before the first pull replaces it", () => {
  withOldPlan((s) => {
    const r = ok(cli(s, "pull", { input: EMPTY_PULL }));
    assert.equal(r.hand_edited.length, 1);
    assert.equal(r.hand_edited[0].file, "plan.md");
    assert.equal(readFileSync(join(s.siteDir, r.hand_edited[0].saved_as), "utf8"), OLD_PLAN);
    assert.doesNotMatch(readFileSync(join(s.siteDir, "plan.md"), "utf8"), /My real plan/);
  });
});

test("the copy is made once: the next pull has the file on record and adds no second copy", () => {
  withOldPlan((s) => {
    ok(cli(s, "pull", { input: EMPTY_PULL }));
    const again = ok(cli(s, "pull", { input: EMPTY_PULL, today: "2026-10-20" }));
    assert.equal(again.hand_edited, undefined);
    assert.equal(readdirSync(s.siteDir).filter((n) => n.includes(".hand-edit-")).length, 1);
  });
});

test("a file with the same bytes as the write is no hand edit", () => {
  const s = scratch();
  try {
    ok(cli(s, "pull", { input: EMPTY_PULL }));
    const plan = join(s.siteDir, "plan.md");
    const same = readFileSync(plan);
    // The ledger forgets the file, as a rebuilt ledger would, and the same bytes come back.
    const ledgerPath = join(s.siteDir, "ledger.json");
    const ledger = JSON.parse(readFileSync(ledgerPath, "utf8"));
    delete ledger.files["plan.md"];
    writeFileSync(ledgerPath, JSON.stringify(ledger));
    const r = ok(cli(s, "pull", { input: EMPTY_PULL }));
    assert.equal(r.hand_edited, undefined);
    assert.ok(readFileSync(plan).equals(same));
  } finally {
    s.done();
  }
});

test("a file with no copy to make: a new site writes its plan and reports nothing", () => {
  const s = scratch();
  try {
    const r = ok(cli(s, "pull", { input: EMPTY_PULL }));
    assert.equal(r.hand_edited, undefined);
    assert.ok(existsSync(join(s.siteDir, "plan.md")));
  } finally {
    s.done();
  }
});
