// keyword-gap uses the server's keyword_gap tool when the connection offers it (the part of
// #15 still missing from main): one call joins the site's and up to three competitors'
// ranked-keyword lists on the server and answers the candidates in columns and rows, in
// place of up to four ranked_keywords calls whose whole lists the skill read and joined
// itself. The server tool is seo-genius-workflows src/app/api/mcp/v1/tools/keyword-gap.ts.
// Every test fails on main at 8903cb1 (1.6.0), whose keyword-gap never names the tool. The
// last four (absence from the rows, failed lists) also fail at ec4035e, this branch before
// review: step 7 read a term missing from the capped candidate rows as one nobody ranks for and
// paid for keyword_research on that alone, and a failed list kept no status and could be
// dated or counted as zero rows.
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
  has(proc, "When `keyword_gap` is in the tool list, steps 3 and 4 run as Server comparison says, in place of the saved lists and `ranked_keywords`; steps 5, 6, and 8 to 10 are the same, and step 7 says what differs on that path.");
  has(section("Server comparison"), "Without `keyword_gap` in the tool list, steps 3 and 4 run as written.");
});

test("the spend is stated per list before the one call, with what the server hands back", () => {
  const s = section("Server comparison");
  has(s, "one `keyword_gap` call, which fetches up to one ranked-keyword list for this site and one for each competitor sent, four at most");
  has(s, "reserves four lists' quota before it starts and hands back the slots of competitors not sent, every list it reused, and every list the provider failed");
  has(s, "Say this and wait for a yes. That yes covers the `keyword_gap` call only: step 7 asks for its own `keyword_research` call, after the answer, only when that call is needed.");
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
  has(s, "A competitor whose list has `status: \"failed\"` is still in `lists` but was not compared");
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

const step7 = () => {
  const lines = md.split("\n");
  const i = lines.findIndex((l) => l.startsWith("7. Local terms"));
  assert.ok(i >= 0, "no step 7");
  const j = lines.findIndex((l, k) => k > i && l.startsWith("8. "));
  return lines.slice(i, j).join("\n");
};

test("step 7 never reports a term's absence as a ranking claim", () => {
  // The server answers only capped candidates (a competitor at max_position or better, at most
  // max_rows rows), not whole lists, so a term missing from them is not one nobody ranks for.
  const s = step7();
  assert.ok(!s.includes("nobody ranks for."), "the step 7 heading still claims nobody ranks");
  assert.ok(!s.includes("no competitor ranks for it in the lists that were read"), "absence still read as no competitor ranking");
  has(s, "Absence is never a ranking claim");
  has(s, "On the `keyword_gap` path, a term in no row is not among the returned candidates, and that is all it means.");
  has(s, "The rows hold only keywords a competitor in `compared` ranks for at position 20 or better, from each list's 200 highest-volume keywords, and only the 120 with the most volume (`rows_left_out` were cut).");
  has(s, "Say \"not among the returned candidates\", never that nobody, no competitor, or this site ranks or does not rank for it.");
  has(section("Output"), "(on the `keyword_gap` path, not among the returned candidates)");
  assert.ok(!read("plugins/seo-genius/README.md").includes("local terms nobody ranks for"), "README still says nobody ranks");
});

test("on the keyword_gap path absence alone never pays for keyword_research", () => {
  const s = step7();
  has(s, "Its absence does not by itself call for a `keyword_research` call, and the `keyword_gap` yes does not cover one.");
  has(s, "The call is needed only for its search volume, and only for a term with no volume in a reusable `local-terms.json`.");
  has(s, "make it only on a yes to that call. No yes: no call, and say which terms had no volume looked up.");
  has(s, "In an unattended run make no `keyword_research` call on this path: list those terms under \"Needs a decision\".");
  has(section("Server comparison"), "Make no `keyword_research` call on this path in an unattended run (step 7).");
  has(section("Done when"), "The `keyword_research` call was made only on its own yes, after the answer, and never in an unattended run.");
  const plan = read("tests/skills/keyword-gap.md");
  has(plan, "[name the local terms not among the returned candidates; keyword_research once, only for those with no volume on file, and only after a yes to that call]");
  assert.ok(!plan.includes("only for local terms that appear in no row"), "the acceptance sequence still pays on absence alone");
});

test("each list keeps its status, and a failed list is never dated or marked reused", () => {
  const s = section("Server comparison");
  has(s, "Keep each list's `status` as the server gave it.");
  has(s, "A failed list was not pulled: its `pulled_on` is `null` and its `reused` is false, even when `fresh: true` was sent or it carries `cached_at`.");
  has(s, "Each entry in the file's `lists` carries the list's `status`.");
  has(md, '"lists": [{ "domain": "example.com", "pulled_on": "YYYY-MM-DD", "reused": false, "status": "ok" }],');
  has(md, "`status` is `ok`, or `failed` for a list the `keyword_gap` answer marked failed, which has `pulled_on` null, `reused` false, `rows_read` null, and no place in `cap_hit`");
});

test("a failed competitor is reported as failed, never as zero rows", () => {
  const s = section("Server comparison");
  has(s, "Name it as failed, never as a list with zero rows or no keywords; its `rows_read` of 0 is not a count.");
  has(s, "A failed list's `rows_read` is `null`, never 0, and it is never in `cap_hit`.");
  has(section("Output"), "rows read per domain (a failed list named as failed, not as a count)");
  has(read("tests/skills/keyword-gap.md"), "- A failed list given a date, marked reused, or reported as zero rows.");
});
