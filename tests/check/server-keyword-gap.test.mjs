// keyword-gap uses the server's keyword_gap tool when the connection offers it (the part of
// #15 still missing from main): one call joins the site's and up to three competitors'
// ranked-keyword lists on the server and answers the candidates in columns and rows, in
// place of up to four ranked_keywords calls whose whole lists the skill read and joined
// itself. The server tool is seo-genius-workflows src/app/api/mcp/v1/tools/keyword-gap.ts.
// Every test fails on main at 8903cb1 (1.6.0), whose keyword-gap never names the tool.
// Run: node --test tests/check/server-keyword-gap.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../../", import.meta.url));
const read = (p) => readFileSync(`${root}${p}`, "utf8").replace(/\r\n/g, "\n");
const md = read("plugins/seo-genius/skills/keyword-gap/SKILL.md");
const section = (name) => {
  const start = md.indexOf(`\n## ${name}\n`);
  assert.ok(start >= 0, `no section: ${name}`);
  const end = md.indexOf("\n## ", start + 1);
  return md.slice(start, end < 0 ? undefined : end);
};
const has = (text, s) => assert.ok(text.includes(s), `missing: ${s}`);

test("the procedure takes the keyword_gap path when the tool is in the tool list", () => {
  const step3 = md.split("\n").find((l) => l.startsWith("3. Check what is on file"));
  assert.ok(step3, "no step 3");
  const proc = section("Procedure");
  has(proc, "When `keyword_gap` is in the tool list, steps 3 and 4 run as Server comparison says, in place of the saved lists and `ranked_keywords`; steps 5 to 10 are the same.");
  has(section("Server comparison"), "Without `keyword_gap` in the tool list, steps 3 and 4 run as written.");
});

test("the spend is stated per list before the one call, with what the server hands back", () => {
  const s = section("Server comparison");
  has(s, "one `keyword_gap` call, which fetches up to one ranked-keyword list for this site and one for each competitor sent, four at most");
  has(s, "reserves four lists' quota before it starts and hands back the slots of competitors not sent, every list it reused, and every list the provider failed");
  has(s, "plus the possible `keyword_research` call of step 7, and wait for a yes. That yes covers both.");
});

test("the call sends the domains, country and limit, and fresh only on request", () => {
  const s = section("Server comparison");
  has(s, "`keyword_gap` with `competitors` set to the domains of step 2 (three at most), `location_name: \"<Country>\"`, `language_name: \"English\"`, `limit: 200`, and `fresh: true` only when the user asked for a fresh pull");
});

test("rows are read by column name, competitors in the order of compared", () => {
  // compared leaves out a competitor whose list failed, and the c1..c3 columns follow it,
  // so pairing the columns with the order the domains were sent shifts them onto the wrong domain.
  const s = section("Server comparison");
  has(s, "Read each row by the names in `columns`, never by a fixed position.");
  has(s, "`c1_position` and `c1_url` belong to the first domain in `compared`, `c2_` to the second, and so on.");
  has(s, "`compared` leaves out a competitor whose list failed, so never pair the columns with the order the domains were sent.");
  has(s, "A `url` is a path on that column's own domain and a full URL otherwise.");
  has(s, "A domain in `ignored` was not compared");
});

test("brand, out-of-area and unrelated keywords are still removed after the server's join", () => {
  const s = section("Server comparison");
  has(s, "The server does not remove brand, out-of-area, or unrelated keywords: step 5 still does, on these rows");
  has(s, "keep the server's `class` for each keyword left");
});

test("caps and failed lists are reported, not read as absence", () => {
  const s = section("Server comparison");
  has(s, "A competitor whose list has `status: \"failed\"` was not compared: name it.");
  has(s, "`rows_left_out` rows were cut by the server's 120-row cap, lowest search volume first: say how many.");
  has(s, "`cap_hit` on this site's own list keeps the caveat of step 6.");
});

test("list dates come from cached_at, as on the ranked_keywords path", () => {
  const s = section("Server comparison");
  has(s, "A list with `cached_at` was reused from this site's own earlier request: its `pulled_on` is the date part of `cached_at` and its `reused` is true.");
  has(s, "Without `cached_at`, `pulled_on` is today's UTC date when `fresh: true` was sent, and `null` (date unknown) otherwise.");
});

test("the files are saved through save, with no keyword-lists file and no raw answer", () => {
  const s = section("Server comparison");
  has(s, "Save `keyword-gap.md` and `keyword-gap.json` as step 10 says, through `save`, with two more keys in `keyword-gap.json`: `\"source\": \"keyword_gap\"` and `rows_left_out`.");
  has(s, "Save no `keyword-lists/` file and not the answer itself: it holds the candidates, not whole lists.");
  has(md, "- Reads `.seo-genius/keyword-lists/`, and writes it through `save`, on the `ranked_keywords` path only:");
});

test("a sent keyword_gap call never falls back to ranked_keywords", () => {
  const s = section("Server comparison");
  has(s, "Once a `keyword_gap` call was sent, make no `ranked_keywords` call in this run, whatever it answered: the same lists would be paid for twice.");
  has(s, "502 `upstream_unavailable`: the provider failed this site's list, or every competitor's, so nothing was compared. Stop as for a timeout below; the failed lists are not charged.");
});

test("an unattended run counts one live call per list the call may fetch", () => {
  const s = section("Server comparison");
  has(s, "In an unattended run the call counts toward `live_calls_per_run` as one live call per list it may fetch: one for this site and one per competitor sent.");
  has(s, "Send no more competitors than what is left of the budget minus one, and make no call when fewer than two are left.");
});

test("the description, Done when, the acceptance checklist and the README name the server path", () => {
  const desc = md.split("\n").find((l) => l.startsWith("description: "));
  assert.ok(desc.includes("one `keyword_gap` call when the server offers it"), desc);
  has(section("Done when"), "On the `keyword_gap` path, one `keyword_gap` call, no `ranked_keywords` call, and at most one `keyword_research` call.");
  has(read("tests/skills/keyword-gap.md"), "## Server comparison (keyword_gap)");
  has(read("plugins/seo-genius/README.md"), "one `keyword_gap` call when the server offers it");
});
