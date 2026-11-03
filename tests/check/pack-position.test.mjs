// pack_position (list_tracked_keywords) and site_pack_position (get_serp_snapshots) are the
// rank_absolute of this site's map pack entry: where that entry sits on the whole results
// page, counting every block above it, as position and p do (seo-genius-workflows
// src/services/dataforseo.ts checkDomainRank, local_pack branch; src/steps/check-tracked-
// keywords.ts stores it as the local_pack row's position). The server stores no place inside
// the map pack. weekly (#26) said "show `pack_position` as the map pack place", report and
// competitor-dive said the same of site_pack_position, and the 1.6.1 release smoke on
// 2026-11-03 (Bomann, attended weekly) answered that a term "holds map pack place 15".
// Also pinned here: the README's keyword-gap row on both paths, the holding count on the
// keyword_gap path, and the CHANGELOG line on the ranked_keywords path's new `status` key.
// Every test fails on main at 9ebdc30.
// Run: node --test tests/check/pack-position.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../../", import.meta.url));
const read = (p) => readFileSync(`${root}${p}`, "utf8").replace(/\r\n/g, "\n");
const skillNames = readdirSync(`${root}plugins/seo-genius/skills`);
const skill = (n) => read(`plugins/seo-genius/skills/${n}/SKILL.md`);
const section = (md, heading) => {
  const m = md.match(new RegExp(`\\n## ${heading}\\n([\\s\\S]*?)(?=\\n## |$)`));
  assert.ok(m, `no section ${heading}`);
  return m[1];
};
const PACK_FIELD = /`(site_)?pack_position`/;
const ON_PAGE = /where this site's map pack entry sits on the whole results page, counting every block above it/;
const NOT_INSIDE = /(not|Neither is) a place inside the map pack, which the server does not store, so never state or imply one/;

test("no skill or README calls the pack reading a map pack place", () => {
  const files = [
    ...skillNames.map((n) => `plugins/seo-genius/skills/${n}/SKILL.md`),
    "plugins/seo-genius/README.md",
    "README.md",
  ];
  const bad = [];
  for (const f of files) {
    read(f).split("\n").forEach((line, i) => {
      if (/map pack place/i.test(line)) bad.push(`${f}:${i + 1}: ${line.slice(0, 120)}`);
    });
  }
  assert.deepEqual(bad, []);
});

test("every skill that reads a pack position describes it as the entry's place on the whole page", () => {
  const readers = skillNames.filter((n) => PACK_FIELD.test(skill(n)));
  assert.deepEqual(readers.sort(), ["competitor-dive", "report", "weekly"]);
  for (const n of readers) {
    const md = skill(n);
    assert.match(md, ON_PAGE, `${n} does not say where the map pack entry sits`);
    assert.match(md, NOT_INSIDE, `${n} does not rule out a place inside the map pack`);
    assert.match(md, /the map pack entry's place on the page/, `${n} has no name for it`);
  }
});

test("weekly step 7 and Output name pack_position as the map pack entry's place on the page", () => {
  const md = skill("weekly");
  const step7 = md.split("\n").find((l) => l.startsWith("7. Show the result:"));
  assert.ok(step7, "no step 7");
  assert.ok(step7.includes("A `pack_position` is where this site's map pack entry sits on the whole results page, counting every block above it, as `position` does: call it the map pack entry's place on the page. It is not a place inside the map pack, which the server does not store, so never state or imply one."), step7);
  const out = md.split("\n").find((l) => l.startsWith("- What moved, the open issues by severity"));
  assert.ok(out.includes("a `pack_position` is the map pack entry's place on the page, never a place inside the map pack."), out);
});

test("report gives both pack fields the same meaning as position and p", () => {
  const md = skill("report");
  assert.ok(md.includes("`site_pack_position` and `pack_position` are where this site's map pack entry sits on the whole results page, counting every block above it, as `p` and `position` do: call each the map pack entry's place on the page. Neither is a place inside the map pack, which the server does not store, so never state or imply one."));
  assert.ok(md.includes("The map pack entry's place on the page is shown only where a stored reading carried one; a live search does not return it."));
});

test("competitor-dive never counts the local_pack entries into a place inside the pack", () => {
  const md = skill("competitor-dive");
  assert.ok(md.includes("never count the `local_pack` entries to make one."));
  assert.ok(md.includes("`site_pack_place` is the stored `site_pack_position`: where this site's map pack entry sits on the whole results page, counting every block above it, not a place inside the map pack."));
  assert.ok(md.includes("Terms table: Term | This site's place | Map pack entry, place on the page |"));
});

test("the acceptance files fail a reply that calls it a map pack place", () => {
  const weekly = read("tests/skills/weekly.md");
  const wFail = section(weekly, "Fail conditions");
  assert.match(wFail, /a `pack_position` called a map pack place or given as a place inside the map pack \(for example "map pack place 15"/);
  assert.match(section(weekly, "Pass conditions"), /each `pack_position` is called the map pack entry's place on the page/);
  assert.match(section(read("tests/skills/report.md"), "Fail conditions"), /`pack_position` or `site_pack_position` called a map pack place or given as a place inside the map pack/);
  assert.match(section(read("tests/skills/competitor-dive.md"), "Fail conditions"), /`site_pack_position` called a map pack place or given as a place inside the map pack, including one counted from the order of the `local_pack` entries/);
  for (const f of ["tests/skills/report.md", "tests/skills/competitor-dive.md", "tests/skills/weekly.md"]) {
    const md = read(f);
    const pass = md.slice(0, md.indexOf("\n## Fail conditions"));
    const positive = pass.split("\n").filter((l) => /map pack place/i.test(l) && !/never (called )?a map pack place/i.test(l));
    assert.deepEqual(positive, [], `${f} still accepts a map pack place`);
  }
});

test("the README keyword-gap row describes both paths", () => {
  const row = read("plugins/seo-genius/README.md").split("\n").find((l) => l.startsWith("| 3 | `/seo-genius:keyword-gap`"));
  assert.ok(row, "no keyword-gap row");
  assert.ok(!row.includes("and keeps each list it pulls in `keyword-lists/`."), "the row still keeps lists unconditionally");
  assert.ok(row.includes("When the server offers `keyword_gap`, the lists are compared on the server and none is kept locally; without it, it also keeps each list it pulls in `keyword-lists/`."));
  assert.ok(row.includes("Without `keyword_gap`, a run reuses only a list saved in `keyword-lists/` in the last seven days that has a date"));
});

test("keyword-gap says its holding count covers the returned rows only", () => {
  const classes = section(skill("keyword-gap"), "Server comparison").split("\n").find((l) => l.startsWith("- Classes."));
  assert.ok(classes, "no Classes bullet");
  assert.ok(classes.includes("That count is of the returned rows only: holding rows share the server's 120-row cap, so when `rows_left_out` is above 0, say the holding count covers the returned rows and that some holding keywords may be among the rows cut."), classes);
});

test("the CHANGELOG says the ranked_keywords path gained the status key", () => {
  const log = read("CHANGELOG.md");
  assert.ok(!log.includes("Without the tool, the `ranked_keywords` path is unchanged. Tests:"));
  assert.ok(log.includes("Without the tool, the `ranked_keywords` path is unchanged, except that each entry in `keyword-gap.json` `lists` now carries `\"status\": \"ok\"`."));
});
