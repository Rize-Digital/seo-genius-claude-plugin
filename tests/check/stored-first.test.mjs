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
const canonical = (name) =>
  readFileSync(fileURLToPath(new URL(`../../scripts/canonical/${name}`, import.meta.url)), "utf8").replace(/\r\n/g, "\n");
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
  assert.match(report, /the config's `metro_location_code`, or, when it is null and `locations` holds exactly one tracked location, that location's `location_code`/);
  assert.match(report, /A tracker reading counts when its `location` is the label of the tracked location with that code, a snapshot entry when its `location_code` is that code./);
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
  // It is cursor-paginated at 100 a call, so each severity is read to its last page.
  assert.match(s, /`list_issues` with `status: "open"`, `limit: 100`, and `severity: "critical"`, then the same with `severity: "high"`, each following `next_cursor` until it is null, so every open critical and high issue is read/);
  assert.doesNotMatch(s, /first page only/);
  assert.doesNotMatch(s, /first page held/);
});

test("report: the server is asked only about the terms this run's files did not answer", () => {
  // After weekly's snapshot answered a term, sending it to list_tracked_keywords again is a
  // wasted read and can put a second, different reading beside the first.
  const s = step(skill("report"), 4);
  assert.match(s, /only for the terms still without a reading that counts \(below\) after this run's files; never send it a term those files already answered\. `list_tracked_keywords` with `keywords` set to those terms/);
  assert.doesNotMatch(s, /`list_tracked_keywords` with `keywords` set to the terms[ ,(]/);
  assert.match(s, /When this run's files answered every term, make neither call for a reading; call `list_tracked_keywords` once with `limit: 1` and no `keywords`, for its `locations` alone/);
});

// A sentence that must appear word for word.
const has = (s, text, msg) => assert.ok(s.includes(text), msg ?? `missing: ${text}`);

test("stamps: only a section that shows numbers carries a source stamp", () => {
  // Live smoke 2026-10-27: rule 10 stamped "where its numbers came from" while report step 5
  // stamped "each part", and Needs a decision, Next and Research age came out unstamped.
  const rule = canonical("standing-rules.md");
  has(rule, "10. Stamp every section that shows numbers. Each section of a reply or saved file that shows numbers opens with where they came from");
  has(rule, "A section with no numbers carries no stamp.");
  has(rule, "The files the ledger script writes as its own record (`weekly/`, `snapshots/`) are not sections.");
  const s = step(skill("report"), 5);
  has(s, "Each part that shows numbers (What changed, What moved, Waiting, and Research age) opens with its source stamp");
  has(s, "Needs a decision and Next hold words, not numbers, and open without a stamp.");
  has(s, "Research age: the dates of the research files, each research file stamped \"Stored, as of <date>\" with the date it carries");
  assert.ok(!s.includes("Each part opens with its source stamp"));
  has(skill("brief"), "\"Next moves\": three at most, each with the page, the field, and the briefing line it came from, under the briefing's \"Stored, as of <date>\" stamp when a move shows a number.");
});

test("metro: a null metro code does not throw away the tracker's readings", () => {
  // Live smoke 2026-10-27: start saved metro_location_code null (no code in the business
  // profile), so report counted only national readings and every Bonifay reading was dropped.
  // list_tracked_keywords returns locations with label, location_code and is_primary.
  const start = step(skill("start"), 5);
  has(start, "when its `locations` holds exactly one tracked location, or one with `is_primary` true, offer that location (its `label` and `location_code`) as the metro location and record its code on a yes");
  has(start, "An unattended run records `null` and says so; it never picks a code.");
  const report = step(skill("report"), 4);
  has(report, "when it is null and `locations` holds exactly one tracked location, that location's `location_code`");
  has(report, "With no metro code and not exactly one tracked location, only a national reading (no location) counts: name the terms whose readings were left out for that reason");
  assert.ok(!report.includes("only when the config has a `metro_location_code`, call `list_tracked_keywords`"));
});

test("weekly: only the issues the plan is linked to are read; a failed read closes nothing", () => {
  // Bomann smoke 2026-10-27: the per-severity reads answered 63,149 and 102,306 characters
  // (medium, low) only to learn whether each item's own issue was still open.
  const s = step(skill("weekly"), 3);
  has(s, "For each item `show` lists with an `issue_id` and a status other than `done` or `dropped`, `get_issue` with that id, and put the `status` it answers into `issue_states` under that id.");
  has(s, "an item closes only when its own issue was read and is not open, never on a failed read. Never read every open issue to find these.");
  has(s, "`list_issues` with `status: open` and `limit: 1`, once per severity (`critical`, `high`, `medium`, `low`), and put each answer's `total` into `issue_totals`");
  assert.ok(!/`list_issues` with `status: open` and `limit: 100`/.test(s));
  const w = step(skill("weekly"), 5);
  has(w, "\"issue_states\": {");
  assert.ok(!w.includes("\"issues_complete\""));
});

test("next: the history check runs on the exact text it proposes", () => {
  // Bomann smoke 2026-10-27: check_change ran on the issue's 48-character title while the
  // proposal recommended a 56-character one.
  const s = step(skill("next"), 6);
  has(s, "run `check_change` again for the same page and `change_kind` with `proposed_value` set to the exact proposed text, character for character, and read the result as step 5 does. The proposal reports that check, on that text.");
  has(step(skill("next"), 7), "the history check on the exact text proposed");
});
