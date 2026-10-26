// Skill-text tests for the stored-first position readings (competitor-dive, report) and
// the open-issue join (content-plan). Each pins a rule the server's real answers need:
// get_serp_snapshots and list_tracked_keywords in seo-genius-workflows src/app/api/mcp/v1/tools/,
// list_issues in the same folder. Run: node --test tests/check/stored-first.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const skill = (name) =>
  readFileSync(fileURLToPath(new URL(`../../plugins/seo-genius/skills/${name}/SKILL.md`, import.meta.url)), "utf8").replace(/\r\n/g, "\n");
// One numbered step of the Procedure section (not of the Standing rules), with its
// sub-bullets, up to the next numbered step.
const step = (md, n) => {
  const proc = md.slice(md.indexOf("\n## Procedure\n"));
  const m = proc.match(new RegExp(`\\n${n}\\. [\\s\\S]*?(?=\\n\\d+\\. |\\n## )`));
  assert.ok(m, `step ${n} not found`);
  return m[0];
};
const missing = (md) => md.match(/\n## If something is missing\n([\s\S]*?)(?=\n## )/)[1];

test("place: a stored place is counted among the organic entries, never taken from site_position or a tracker position", () => {
  // get_serp_snapshots: site_position and p count every block on the page (map pack, answer
  // boxes); list_tracked_keywords: "Positions count every element on the results page".
  // A live search's place, and site_place in competitors.json, count organic results only.
  const dive = step(skill("competitor-dive"), 3);
  assert.match(dive, /this site's place is its place among those organic entries/);
  assert.match(dive, /never `site_position`/);
  assert.doesNotMatch(dive, /take this site's place from the snapshot's `site_position`/);
  assert.doesNotMatch(dive, /list_tracked_keywords/, "a tracker reading has no page to place the businesses on");
  const report = step(skill("report"), 4);
  assert.match(report, /counts every block on the page/);
  assert.match(report, /its place among the entry's organic results in `p` order/);
  assert.match(report, /Never set a place on the page beside an organic place\./);
});

test("window and paging: get_serp_snapshots is asked for the last seven days, 25 a page, to the last page", () => {
  // Server defaults: since = 30 days back, limit 10 (max 25), one entry per term and location.
  // Ten terms at two locations do not fit one default page; a term left on page two was
  // searched live and paid for.
  for (const [name, n] of [["competitor-dive", 3], ["report", 4]]) {
    const s = step(skill(name), n);
    assert.match(s, /`get_serp_snapshots` with `keywords` set to [^,]+, `since` set to the date seven days before today \(the UTC date\), and `limit: 25`, following `next_cursor` until it is null/, name);
    assert.match(s, /checked on or after (that|the) date/, name);
  }
});

test("location: a reading counts only at the location the config searches", () => {
  // Both tools answer one entry per term and location, so a term tracked nationally, or in
  // another city, came back as a fresh reading for the metro search.
  const dive = step(skill("competitor-dive"), 3);
  assert.match(dive, /An entry counts for a term only at the location this research searches: its `location_code` is the config's `metro_location_code`, or, with no metro code, it has no location \(a national search\)\./);
  const report = step(skill("report"), 4);
  assert.match(report, /A reading counts for a term only at the location the config searches:/);
  assert.match(report, /the label of the tracked location whose `location_code` is the config's `metro_location_code`/);
  assert.match(report, /`locations`/);
});

test("fallback: with no stored readings, report searches live only in an attended session", () => {
  // The not-set-up fallback said to read every term live, which an unattended weekly run
  // would have paid for.
  const m = missing(skill("report"));
  assert.doesNotMatch(m, /read every term live as before/);
  assert.match(m, /`get_serp_snapshots` is not in the tool list, or it says stored search pages are not set up: say which, and go on with the other stored readings; only an attended session searches live, on a yes, for the terms left without one\./);
});

test("issues: content-plan reads the open critical and high issues by severity, not the newest hundred", () => {
  // list_issues orders by detected_at, newest first; a site with more than 100 open issues
  // kept its older critical ones off the first page, and off the plan.
  const s = step(skill("content-plan"), 5);
  assert.match(s, /`list_issues` twice, with `status: "open"`, `limit: 100`, and `severity: "critical"`, then `severity: "high"`, first page only \(rule 6\)/);
  assert.doesNotMatch(s, /`list_issues` with `status: "open"` and `limit: 100`, first page only/);
  assert.match(s, /Each answer's `total` says whether its first page held every open issue of that severity/);
});
