// The weekly check of the rank tracker against Search Console (`week` with search_console).
// The tracker is one search from one place on one day; Search Console is what real searchers
// saw. The script compares them, so a model never decides whether the two agree.
// Run: node --test tests/ledger/page-flags.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { scratch, cli } from "./helpers.mjs";

const ok = (r) => {
  assert.equal(r.code, 0, JSON.stringify(r.out));
  return r.out;
};
const row = (query, page, impressions, position) => ({ query, page, clicks: 0, impressions, ctr: 0, position });
const sc = (rows) => ({ start_date: "2026-09-21", end_date: "2026-10-16", rows });
const ranking = (keyword, position, url, location = "Boise, Idaho") => ({ keyword, location, position, pack_position: null, change: null, url, checked_on: "2026-10-18" });
const HOME = "https://example.com/";
const WWW_HOME = "https://www.example.com/";
const CITY = "https://www.example.com/fence-company-city-a";

function week(input, check) {
  const s = scratch();
  try {
    const out = ok(cli(s, "week", { input }));
    check(out, {
      file: readFileSync(join(s.siteDir, "weekly", "2026-10-19.md"), "utf8"),
      snapshot: JSON.parse(readFileSync(join(s.siteDir, "snapshots", "2026-10-19.json"), "utf8")),
    });
  } finally {
    s.done();
  }
}

test("different page: the tracker's page is not the one searchers saw most, across www and non-www", () => {
  week(
    {
      rankings: [ranking("fence company city", 10, CITY)],
      search_console: sc([row("fence company city", HOME, 38, 1.1), row("fence company city", WWW_HOME, 24, 2.5), row("fence company city", CITY, 3, 5.7)]),
    },
    (out, { file, snapshot }) => {
      assert.deepEqual(out.page_flags, [
        {
          keyword: "fence company city",
          location: "Boise, Idaho",
          kind: "different_page",
          tracker_page: "/fence-company-city-a",
          tracker_position: 10,
          search_console_page: "/",
          search_console_position: 1.6,
          search_console_impressions: 62,
        },
      ]);
      assert.deepEqual(snapshot.page_flags, out.page_flags);
      assert.match(file, /## Tracker and Search Console/);
      assert.match(file, /Search Console, 2026-09-21 to 2026-10-16\./);
      assert.match(file, /A row here is a question to check, not proof that the wrong page ranks\./);
      assert.match(file, /\| fence company city \| Boise, Idaho \| \/fence-company-city-a at 10 \| \/ at 1\.6, 62 impressions \| different page \|/);
    },
  );
});

test("same page: host, scheme, case, query string and a trailing slash do not make two pages", () => {
  week(
    {
      rankings: [ranking("fence company city", 2, "https://www.example.com/Services/?utm_source=x")],
      search_console: sc([row("fence company city", "http://example.com/services", 30, 2)]),
    },
    (out, { file }) => {
      assert.deepEqual(out.page_flags, []);
      assert.match(file, /no tracked term shows a different page/);
    },
  );
});

test("thin terms: a total under ten impressions flags nothing, and ten does", () => {
  const rankings = [ranking("thin term", 4, CITY)];
  week({ rankings, search_console: sc([row("thin term", HOME, 6, 2), row("thin term", CITY, 3, 4)]) }, (out) => assert.deepEqual(out.page_flags, []));
  week({ rankings, search_console: sc([row("thin term", HOME, 7, 2), row("thin term", CITY, 3, 4)]) }, (out) => {
    assert.equal(out.page_flags.length, 1);
    assert.equal(out.page_flags[0].search_console_impressions, 7);
  });
});

test("tracker missed: no position while searchers see the top page inside the top 20", () => {
  week({ rankings: [ranking("fence company city", null, "")], search_console: sc([row("fence company city", HOME, 40, 6)]) }, (out, { file }) => {
    assert.equal(out.page_flags.length, 1);
    assert.equal(out.page_flags[0].kind, "tracker_missed");
    assert.equal(out.page_flags[0].tracker_page, null);
    assert.equal(out.page_flags[0].tracker_position, null);
    assert.match(file, /\| fence company city \| Boise, Idaho \| not in top 20 \| \/ at 6, 40 impressions \| tracker missed it \|/);
  });
  week({ rankings: [ranking("deep term", null, "")], search_console: sc([row("deep term", HOME, 40, 20)]) }, (out) => assert.equal(out.page_flags.length, 1));
  week({ rankings: [ranking("deep term", null, "")], search_console: sc([row("deep term", HOME, 40, 20.1)]) }, (out) => assert.deepEqual(out.page_flags, []));
});

test("a ranking with a position and no page has nothing to compare", () => {
  week({ rankings: [ranking("fence company city", 3, "")], search_console: sc([row("fence company city", HOME, 40, 3)]) }, (out) => assert.deepEqual(out.page_flags, []));
});

test("terms match on their words, each location gets its own row, and other queries do not count", () => {
  week(
    {
      rankings: [ranking("Fence  Company City", 5, CITY, "Boise, Idaho"), ranking("fence company city", 7, CITY, "Nampa, Idaho")],
      search_console: sc([row("fence company city", HOME, 20, 2), row("fence company city near me", CITY, 500, 1)]),
    },
    (out) => {
      assert.deepEqual(out.page_flags.map((f) => [f.keyword, f.location, f.search_console_page, f.search_console_impressions]), [
        ["Fence  Company City", "Boise, Idaho", "/", 20],
        ["fence company city", "Nampa, Idaho", "/", 20],
      ]);
    },
  );
});

test("a tie goes to the better position, then to the page path, whatever order the rows came in", () => {
  const rankings = [ranking("tied term", 9, "https://example.com/other")];
  const rows = [row("tied term", "https://example.com/b", 20, 8), row("tied term", "https://example.com/a", 20, 3), row("tied term", "https://example.com/c", 20, 3)];
  for (const order of [rows, [...rows].reverse()]) {
    week({ rankings, search_console: sc(order) }, (out) => assert.equal(out.page_flags[0].search_console_page, "/a"));
  }
});

test("not read: no search_console says so, and no flag or empty list stands in for a check", () => {
  week({ rankings: [ranking("fence company city", 10, CITY)] }, (out, { file, snapshot }) => {
    assert.equal(out.search_console, null);
    assert.deepEqual(out.page_flags, []);
    assert.match(file, /Search Console was not read this run, so the tracker was not checked against it\./);
    assert.equal("page_flags" in snapshot, false);
    assert.equal("search_console" in snapshot, false);
  });
});

test("read with no rows: the window is named and nothing is flagged", () => {
  week({ rankings: [ranking("fence company city", 10, CITY)], search_console: sc([]) }, (out, { file, snapshot }) => {
    assert.deepEqual(out.search_console, { start_date: "2026-09-21", end_date: "2026-10-16" });
    assert.deepEqual(out.page_flags, []);
    assert.match(file, /Search Console, 2026-09-21 to 2026-10-16: no tracked term shows a different page, on terms with at least 10 impressions\./);
    assert.deepEqual(snapshot.search_console, out.search_console);
    assert.deepEqual(snapshot.page_flags, []);
  });
});

test("rows that cannot be counted are left out, and a search_console with no rows list is refused", () => {
  week(
    {
      rankings: [ranking("fence company city", 10, CITY)],
      search_console: sc([row("fence company city", "", 500, 1), row("", HOME, 500, 1), row("fence company city", HOME, "500", 1), row("fence company city", HOME, 500, null), null]),
    },
    (out) => assert.deepEqual(out.page_flags, []),
  );
  const s = scratch();
  try {
    const r = cli(s, "week", { input: { rankings: [], search_console: [row("x", HOME, 1, 1)] } });
    assert.equal(r.code, 2);
    assert.equal(r.out.error, "bad_input");
    assert.match(r.out.message, /search_console must hold a rows list/);
  } finally {
    s.done();
  }
});
