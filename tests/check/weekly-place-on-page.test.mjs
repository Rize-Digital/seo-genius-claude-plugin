// weekly shows the rank tracker's readings, and a tracker `position` counts every block on
// the results page (the map pack, answer boxes), so it is the place on the page, not the
// organic place. report already says so (stored-first, 1.5.0); weekly did not, and the
// 1.6.0 smoke on 2026-10-29 (Bomann, attended weekly) headed its rankings table "Organic".
// Each test fails on main at 8903cb1 (1.6.0).
// Run: node --test tests/check/weekly-place-on-page.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../../", import.meta.url));
const md = readFileSync(`${root}plugins/seo-genius/skills/weekly/SKILL.md`, "utf8").replace(/\r\n/g, "\n");
const lineWith = (start) => {
  const line = md.split("\n").find((l) => l.startsWith(start));
  assert.ok(line, `no line starting: ${start}`);
  return line;
};

test("step 7 calls a tracker position the place on the page, never the organic place", () => {
  const step7 = lineWith("7. Show the result:");
  assert.ok(
    step7.includes("A tracker `position` counts every block on the page (the map pack, answer boxes): call it the place on the page, never the organic place, and show `pack_position` as the map pack place."),
    step7,
  );
});

test("the Output bullet for what moved carries the same rule", () => {
  const out = lineWith("- What moved, the open issues by severity");
  assert.ok(out.includes("Each ranking is a place on the page, never an organic place."), out);
});
