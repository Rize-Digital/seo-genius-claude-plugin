---
name: content-plan
description: Turn competitor and keyword research into an ordered content plan, using SEO Genius. Use for "plan my content", "what pages should I build", "build a topical map", "what should I write next", or as the monthly step after keyword-gap. Maps each keyword topic to an existing page to improve or a new page to create, lays out the pages a site needs to cover each service in its area, and checks every existing page against its change history, so a page whose last change is still being measured waits its turn. Saves an ordered backlog to .seo-genius/plan.md. Spends no Data-for-SEO quota. It proposes; it does not edit pages. Requires the SEO Genius MCP server, connected and authorized.
---

# SEO Genius: content plan

From research to an ordered backlog: which pages to create, which to improve, in what order, and which to leave alone for now.

## When to use

"plan my content", "what pages should I build", "build a topical map", "what should I write next". Also as the monthly step after `/seo-genius:keyword-gap`.

## Requires

The SEO Genius MCP server, connected and authorized. If `get_my_tenant` is not available, stop and tell the user: run `/mcp`, choose `plugin:seo-genius:seo-genius`, and authorize in the browser.

## Standing rules (apply to every step)

1. Resolve the business first. Call `get_my_tenant`, then `list_sites`. Match what the user typed to a site by name or domain. Echo the site and `can_write` before doing anything else. When the connection is org-scoped (`get_my_tenant` returns `org_id` and `sites[]`), pass `site` (the site id or domain) on every later call. Ambiguous or no match: ask which site.
2. Read memory before deriving. Call `get_business_context` once per session for the business name, services, locations, and competitors. Do not re-derive what is already stored.
3. Retrieval first, quota aware. Read stored SEO Genius data before any Data-for-SEO call (`keyword_research`, `ranked_keywords`, `competitor_domains`, `serp_rank_check`). Batch keywords, up to 200, into one `keyword_research` call. Say when a call spends the user's quota. Do not call `search_recommendations`; it returns an empty set today.
4. Local, not national, with the right tool. `ranked_keywords`, `keyword_research`, and `competitor_domains` run at country level only (Data-for-SEO Labs does not take a city or state, and a city returns nothing). Pass the customer's country (`location_name: "United States"` or `location_code: 2840` for a US business) and make the keywords themselves local ("tree removal boise"). For a local position use `serp_rank_check` with the metro `location_code`, or with the city in the keyword when no code is known. State which was done.
5. Never invent a number. Every figure traces to a tool result. Missing data is reported as missing.
6. Cap every list. Call `list_issues` with `limit` (50 by default, 100 at most) and read the first page only unless the user asks for more. Never quote a crawl's `issues_found` field.
7. Search to fit the mode. `search_pages` is a vector search on some accounts and a text search on others; the response's `mode` says which ran, so remember it. In `vector` mode, or before the mode is known, send a descriptive phrase ("concrete driveway installation service page"), never a single word. In `text` mode every word has to match the page's title, meta description, H1 or URL, so send two or three words the title or H1 would carry ("driveway installation"); after a long phrase missed, search once more that way, once only. Still no match: page through `list_pages` without `q`; `q` there is the same text search.
8. Writes need `can_write`. On a read-only account, return the change as text so it is not lost. Logging records status; it does not prove a result.
9. Say what was capped. Every reply ends with one line naming which lists were first-page only and which calls spent quota.

## Files

- Reads `.seo-genius/config.json`, `.seo-genius/competitors.json`, and `.seo-genius/keyword-gap.json`.
- Writes `.seo-genius/plan.md`, replacing the previous plan. The folder sits at the repository root, or in the current folder when there is no repository.
- The file is meant to be kept with the site. Never write a token, key, or password into it.
- If the session cannot write files, show the plan in the reply and say it was not saved.
- This skill writes nothing to SEO Genius and edits no page.

## Procedure

1. Resolve the site (rule 1). Echo site, domain, `can_write`.
2. Read `.seo-genius/keyword-gap.json` and `.seo-genius/competitors.json`. Neither exists: stop and say to run `/seo-genius:competitor-dive`, then `/seo-genius:keyword-gap`. One exists: continue with it and say what the plan lacks without the other. Read `services`, `city`, and `other_cities` from the config.
3. `get_site_briefing` with `max_bytes: 12000`, so fewer sections are left out for size. It spends no Data-for-SEO quota. A section named in `sections_dropped` is not available in this run: say so, and do not read it as empty. Keep three things from it:
   - `change_index.pages`: each page's verdict and `until` date.
   - The Opportunities section (`sections.opportunities`): keywords this site already ranks for between positions 4 and 20, each with its `page_url`, `position`, and `search_volume`.
   - The What worked section.
4. Page inventory: `list_pages` (`limit: 25`, follow `next_cursor`, twenty pages at most). Sort each URL into service page, location page (a service in a city), guide, or other, by its URL and title. Smaller responses avoid client size failures. Say when the twenty-page cap cut the list short; do not treat unobserved pages as absent.
5. Topical map. For each service in the config, lay out the slots:
   - The main service page.
   - A page for a city only where there is evidence for it: a gap keyword that names the city, a `local_terms` entry for it, or at least two competitors with location pages. Never one page per city by default; thin city pages help nobody.
   - The guides the keyword topics call for (cost, FAQ, how to choose, comparisons).
   Mark each slot covered (a page exists and its topic is not in the gap file; name the URL), thin (a page exists and its topic is missing or behind in the gap file), or empty (no page). Where `competitors.json` has `page_counts`, show observed page counts as approximate. A `null` competitor count means unknown, not zero; never turn an unknown count or an unread FAQ/page into evidence that a competitor lacks a page or a section. When the site inventory is capped or unavailable, label unverified slots unknown rather than empty.
6. Build the backlog: one item for each thin or empty slot, one for each `local_terms` entry no slot covers, and one for each entry in `moves` from `competitors.json` that no slot covers.
   - Create: the page type, a working title, the main keyword and four supporting ones at most (from the gap file, with their volume), a URL path in the site's existing pattern, the sections to include (what the competitors' ranking pages share, from the fields the research read: FAQ, proof, and schema only where it was seen), and the existing pages that should link to it.
   - Improve: the existing URL, what to add, and the field it changes (`content_depth`, `title`, `h1`, `meta_description`, `schema`, or `internal_links`).
7. Check history before giving any item a status. Call `check_change` with the page's `page_id` (from `list_pages`) and the `change_kind`, once for every Improve item, and once with `change_kind: internal_links` for every existing page a Create item would add a link on. When `list_pages` did not return the page, pass its full URL as `page_url` instead. Add `proposed_value` only when the item carries an exact new value. Read the result in this order:
   - `coach_history_not_readable` is not empty: part of this site's change history could not be read, so the verdict may be missing a recent change. The item is unchecked, marked "history partly checked".
   - `page_verdict.verdict` is WAIT: waiting until `page_verdict.until`, whatever the field and whatever the `verdict`. The same holds for a page whose `change_index.pages` row says WAIT.
   - `block` with `would_revert`, alone or beside `frozen`: dropped, with that reason. It would undo an earlier change, and it is still a revert after any unfreeze date.
   - `block` with `frozen` only: waiting until `unfreezes_on`.
   - `warn` with `pending_measurement`: waiting until the closing date given in that reason's `message`. Editing now would throw the measurement away.
   - `warn` with only `recently_changed_other_kind`: open, with the reason shown.
   - `allow`: open.
   - A linking page that is waiting, dropped, or unchecked is left off the Create item's link list, with a note. The Create item itself stays open.
8. Order the open items. First: Improve items on pages that already rank between 4 and 20 for a keyword in their topic, by `site_position` in the gap file or `position` in the briefing's Opportunities. Second: Create items for page types at least two competitors have. Third: guides. Inside each group, higher total search volume first. Where What worked shows a kind of change working on this site, prefer that kind and say that is the reason. Twenty items at most; the first five are "this month". An unchecked item is not an open item. It goes in neither "this month" nor "later".
9. Save `.seo-genius/plan.md` (see Files) with these parts, in this order:
   - A header: the date, the site, which research files the plan was built from, with their dates, and one line saying so when any item is unchecked.
   - This month: a table, # | Action | Page | Topic | Keywords | What to do | Evidence | Status.
   - Later: the same table for the remaining open items.
   - Waiting: each waiting item with the date it opens.
   - Dropped: each dropped item with its reason.
   - Unchecked: each item whose history was not checked, or only partly checked, saying which. These wait for a run that can read the history.
   - Topical map: Service | Slot | Covered, thin, or empty | URL | Competitors with this page.
10. Close with how to act on an item: make the edit, check it with `/seo-genius:brief` first, and record it with `/seo-genius:log-change` after it ships. The plan orders the work. It does not promise a ranking.

## Output

- One line: site, domain, `can_write`.
- The topical map.
- This month, Later, Waiting, Dropped, and Unchecked, as saved.
- What the plan could not use (a missing research file, a capped page list, an unchecked history).
- Where the plan was saved, or that it was not.
- Closing line per rule 9.

## If something is missing

- Tools not available: run `/mcp`, choose `plugin:seo-genius:seo-genius`, authorize in the browser.
- 403 with "MCP scope required" or `feature_locked`: connecting Claude needs Pro or above. Upgrade in SEO Genius settings, then run `/mcp` again.
- No config: read the services and cities from `get_business_context`, and suggest `/seo-genius:start`.
- `get_site_briefing` or `check_change` is not in the tool list: build the plan without the history check, mark every item on an existing page "history not checked", put all of those under Unchecked, and say so at the top of the plan.
- `change_index.truncated` is true: say the index is incomplete. The `check_change` call in step 7 still returns `page_verdict` for each page, so the check holds.
- The research files are more than 45 days old: say how old, and suggest running the research again before acting on the plan.
- Rate limited (429): stop, say so, suggest retrying in a minute.

## Done when

- Every item names the research row it came from.
- Every Improve item, and every page a Create item links from, was checked with `check_change`. An item whose history was not checked, or only partly checked, sits under Unchecked and in no open list.
- No open item touches a frozen field, a page marked WAIT, or a field whose last change is still being measured.
- Every keyword volume comes from the gap file or the briefing. No score, percentage, or forecast was invented.
- `.seo-genius/plan.md` was saved, or the reply says it was not.
- Nothing was written to SEO Genius and no page was edited.
