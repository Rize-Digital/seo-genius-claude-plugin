// serp_rank_check answers `results`, the organic results only, in page order, but each
// result's `rank` and the answer's `target_rank` are the place on the whole results page:
// they count every block above it, the map pack included. The tool's own description calls
// target_rank the "best organic position". `competitor-dive` and `report` already take the
// organic place from the order of `results` (#28 and earlier); `competitors` said only
// "Record the position", and its table headed that number "Position", so a run reported
// the place on the page as the organic rank.
// Run: node --test tests/check/competitors-organic-rank.test.mjs
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
const step = (md, n) => {
  const m = section(md, "Procedure").match(new RegExp(`\\n${n}\\. ([^\\n]*)`));
  assert.ok(m, `no step ${n}`);
  return m[1];
};

test("competitors: the live position is the place among the organic results, read from the order of `results`", () => {
  const s6 = step(skill("competitors"), 6);
  assert.match(s6, /`results` holds the organic results only, in page order/);
  assert.match(s6, /`target_rank` and each result's `rank` count every block on the page \(the map pack, ads, answer boxes\)/);
  assert.match(s6, /organic position is the place of this site's first result in `results`, counting from 1/);
  assert.match(s6, /Never report `target_rank` as the organic position/);
  assert.doesNotMatch(s6, /Record the position,/);
});

test("competitors: the table heads the column Organic position, and a site not in `results` is not found", () => {
  const md = skill("competitors");
  assert.match(section(md, "Output"), /Keyword \| Organic position \| Ranking URL \| Top three on the page \| Location \| Checked at/);
  assert.match(section(md, "If something is missing"), /The site's domain is not in `results`: report "not in the organic results read" with the depth used, never a guessed number\./);
});

test("every skill that names `target_rank` says it counts every block and is not the organic position", () => {
  const bad = [];
  for (const n of skillNames) {
    const md = skill(n);
    if (!md.includes("`target_rank`")) continue;
    if (!/`target_rank`[^.\n]*count every block on the page/.test(md) || !/Never report `target_rank` as the organic position/.test(md)) bad.push(n);
  }
  assert.deepEqual(bad, []);
});

test("competitors acceptance file fails a place on the page given as the organic position", () => {
  const acc = read("tests/skills/competitors.md");
  assert.match(section(acc, "Pass conditions"), /Each named term's position is its place among the organic results in `results`, not `target_rank`\./);
  assert.match(section(acc, "Fail conditions"), /`target_rank` \(or a result's `rank`\) reported as the organic position\./);
});

test("CHANGELOG notes the competitors fix under Unreleased", () => {
  const unreleased = read("CHANGELOG.md").split("\n## ")[1];
  assert.match(unreleased, /`competitors` reports the organic position from the order of `results`/);
});
