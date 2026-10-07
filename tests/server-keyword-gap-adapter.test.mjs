import { test } from "node:test";
import assert from "node:assert/strict";
import { normalizeServerKeywordGap } from "../scripts/normalize-server-keyword-gap.mjs";

const valid = () => ({
  site: "example.com",
  compared: ["local-fence.com", "another-fence.com"],
  columns: [
    "c2_url", "site_url", "c1_position", "keyword", "c2_position",
    "site_position", "volume", "intent", "c1_url", "class"
  ],
  rows: [
    ["/install", null, 3, "fence installation town", 6, null, 150, "commercial", "/fences", "missing"],
    [null, "/fencing", 7, "fence company town", null, 12, 200, "commercial", "/services", "behind"],
  ],
  lists: [
    { role: "site", domain: "example.com", status: "ok", rows_read: 200, cap_hit: true },
    { role: "competitor", domain: "local-fence.com", status: "ok", rows_read: 90, cap_hit: false },
    { role: "competitor", domain: "another-fence.com", status: "ok", rows_read: 80, cap_hit: false },
  ],
  rows_left_out: 13,
  counts: { missing: 1, behind: 1, holding: 0 }
});

test("decode by column name, not fixed array position", () => {
  const a = normalizeServerKeywordGap(valid(), "https://www.example.com");
  assert.equal(a.source, "server_keyword_gap");
  assert.equal(a.candidates.length, 2);
  assert.deepEqual(a.candidates[0].competitors, [
    { domain: "local-fence.com", position: 3, url: "/fences" },
    { domain: "another-fence.com", position: 6, url: "/install" },
  ]);
  assert.equal(a.candidates[0].site_position, null);
  assert.equal(a.candidates[0].class, "missing");
  assert.equal(a.candidates[1].class, "behind");
  assert.equal(a.candidates[1].site_position, 12);
  assert.equal(a.candidates[1].competitors[1].position, null);
  assert.equal(a.lists[0].cap_hit, true);
  assert.equal(a.rows_left_out, 13);
});

test("reject cross-tenant site", () => {
  assert.throws(() => normalizeServerKeywordGap(valid(), "other.com"), /site does not match/);
});

test("reject response whose columns do not match the returned row", () => {
  const d = valid();
  d.columns.splice(1, 1);
  assert.throws(() => normalizeServerKeywordGap(d, "example.com"), /Missing column/);
});

test("reject failed site and unavailable competitor list", () => {
  const d = valid();
  d.lists[0].status = "failed";
  assert.throws(() => normalizeServerKeywordGap(d, "example.com"), /site's ranked-keyword/);
  d.lists[0].status = "ok";
  d.lists[1].status = "failed";
  assert.throws(() => normalizeServerKeywordGap(d, "example.com"), /no successful list/);
});

test("reject duplicate, missing or self-comparison domains", () => {
  const d = valid();
  d.compared[1] = d.compared[0];
  assert.throws(() => normalizeServerKeywordGap(d, "example.com"), /duplicate competitors/);
  d.compared[1] = "example.com";
  assert.throws(() => normalizeServerKeywordGap(d, "example.com"), /duplicate competitors/);
});

test("reject malformed result instead of inventing metrics", () => {
  const d = valid();
  d.rows[0][d.columns.indexOf("volume")] = "150";
  assert.throws(() => normalizeServerKeywordGap(d, "example.com"), /Invalid volume/);
  d.rows[0][d.columns.indexOf("volume")] = 150;
  d.rows[0][d.columns.indexOf("class")] = "unknown";
  assert.throws(() => normalizeServerKeywordGap(d, "example.com"), /Invalid class/);
});
