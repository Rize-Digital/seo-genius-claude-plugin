// Dates in the files a skill names or writes are UTC dates, the date the ledger script
// uses (ledger.mjs utcDate). A local date runs a day ahead or behind for part of every day
// (seen 2026-10-28: citations-2026-10-29 files for a run whose checked_at was 2026-10-28,
// from a session at UTC+5:30), so a file misses the day its own record says, and a report
// looks for weekly/<date>.md under a day the script never wrote. Each test fails on main
// at 7746b3e, except the first, which pins the rule they follow.
// Run: node --test tests/check/utc-dates.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../../", import.meta.url));
const skill = (name) => readFileSync(`${root}plugins/seo-genius/skills/${name}/SKILL.md`, "utf8").replace(/\r\n/g, "\n");
const lineWith = (md, start) => {
  const line = md.split("\n").find((l) => l.startsWith(start));
  assert.ok(line, `no line starting: ${start}`);
  return line;
};

test("the ledger script dates its own files by the UTC date", () => {
  // The rule the skills follow; if the script changed, these tests would need to too.
  const src = readFileSync(`${root}plugins/seo-genius/scripts/ledger.mjs`, "utf8").replace(/\r\n/g, "\n");
  assert.match(src, /export function utcDate\(now = new Date\(\)\) \{\n\s+return now\.toISOString\(\)\.slice\(0, 10\);/);
});

test("citations names its report files by the UTC date of checked_at", () => {
  const md = skill("citations");
  const files = lineWith(md, "- Saves `.seo-genius/research/citations-<date>.md`");
  assert.ok(files.includes("`<date>` is the UTC date of the report's `checked_at`"), files);
  const save = md.split("\n").find((l) => l.startsWith("8. Save the report through the ledger"));
  assert.ok(save && save.includes("the UTC date of `checked_at`"), "step 8 does not say which date");
  const server = md.split("\n").find((l) => l.startsWith("9. When `can_write` is true"));
  assert.ok(server && server.includes("`generated_on` the UTC date of `checked_at`"), "generated_on is not the UTC date");
  const reuse = md.split("\n").find((l) => l.startsWith("4. Before spending anything"));
  assert.ok(reuse && reuse.includes("from the last 30 days (UTC dates)"), "the 30-day window is not in UTC dates");
});

test("report names its file by the UTC date and reads weekly's files under it", () => {
  const md = skill("report");
  assert.ok(lineWith(md, "- Writes `.seo-genius/reports/<date>.md`").includes("`<date>` being today's UTC date"));
  assert.ok(lineWith(md, "- Reads `.seo-genius/config.json`").includes("the files `weekly` wrote today (the UTC date)"));
});

test("report's occurred_on fallback is today's UTC date", () => {
  // A change first seen live in this run is recorded as seen today; the server compares
  // that date with UTC crawl and deployment dates.
  const md = skill("report");
  assert.ok(md.includes("lists it as seen live, or else today's UTC date."), "occurred_on falls back to an unqualified today");
  assert.ok(!md.includes("lists it as seen live, or else today. "), "the unqualified fallback is still there");
});

test("next names its proposal by the UTC date", () => {
  const md = skill("next");
  assert.ok(lineWith(md, "- Writes `.seo-genius/reports/<date>-next.md`").includes("`<date>` being today's UTC date"));
});

test("keyword-gap records a fresh pull under the UTC date, like cached_at", () => {
  // cached_at is a UTC timestamp; a pulled_on from the local date compares a different day
  // against the seven-day reuse window.
  const md = skill("keyword-gap");
  assert.ok(md.includes("the server pulled the list now: save today's UTC date"), "fresh pull saved under a local date");
  assert.ok(md.includes("is today (the UTC date) or one of the seven days before it"), "reuse window not in UTC dates");
  assert.ok(!/the server pulled the list now: save today[^']/.test(md), "an unqualified 'save today' is left");
  assert.ok(md.includes("save the date part of `cached_at` as `pulled_on`, not today's UTC date"), "the cached_at rule contrasts with a bare today");
});

test("keyword-gap reuses and dates local-terms.json by the UTC date, like a domain list", () => {
  // Step 7's local-terms branch had its own reuse window and fresh pulled_on, both a bare
  // "today", while step 3's domain-list path said the UTC date.
  const md = skill("keyword-gap");
  const step = md.split("\n").find((l) => l.startsWith("7. Local terms"));
  assert.ok(step, "no step 7");
  assert.ok(step.includes("is today (the UTC date) or one of the seven days before it"), "local-terms reuse window is not in UTC dates");
  assert.ok(step.includes("today (the UTC date) when `fresh: true` was sent"), "local-terms fresh pulled_on is not the UTC date");
  assert.ok(!/is today or one of the seven days before it/.test(step), "a bare today is left in the reuse window");
  assert.ok(!/without it, today when `fresh: true` was sent/.test(step), "a bare today is left in the fresh pull");
});

test("log-change sends occurred_on only for a UTC day other than today's", () => {
  // The server dates a change it is not given a date for by its own UTC day.
  const md = skill("log-change");
  assert.ok(md.includes("only when the change shipped on a day other than today (the UTC date)"), "occurred_on compared with a bare today");
});
