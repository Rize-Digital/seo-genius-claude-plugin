---
name: history
description: Show the recorded change history of a page or a site, using SEO Genius. Use for "what have we changed on this page", "history of the title on my homepage", "what did we change last month", "who changed this and why", "how many times has this H1 been edited". Lists each logged change with its date, before and after, the reason given, who made it, and where its verification stands. It only reads. Requires the SEO Genius MCP server, connected and authorized.
---

# SEO Genius: change history

What was changed, when, by whom, and why, as recorded in SEO Genius. Read the reason before redoing someone's work.

## When to use

"what have we changed on this page", "history of the title on my homepage", "what did we change last month", "who changed this and why", "how many times has this H1 been edited".

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

## Procedure

1. Resolve the site (rule 1). Echo site, domain, `can_write`.
2. Work out the scope from the request: one page, one field on one page, a date window, or the whole site.
   - A page given as a URL or path: pass it as `page_url`. The scheme, a leading www, a trailing slash, the query, and the fragment are ignored when matching.
   - A page given in words: `search_pages` with a descriptive phrase (rule 7), `match_count: 5`. One clear match: use its `page_id`. More than one: ask which. None: page through `list_pages` (`limit: 100`, follow `next_cursor`, at most five pages) and match the URL or title; the homepage in particular often does not surface from `search_pages`.
3. `list_page_changes` with whichever of these apply: `page_id` or `page_url`, `change_kind` (one of `title`, `meta_description`, `h1`, `canonical`, `schema`, `internal_links`, `redirect`, `content_depth`, `readability`), `since` and `until` (`YYYY-MM-DD`, both inclusive), and `limit: 50`. Read the first page only unless the user asks for more; `next_cursor` continues it.
4. One field on one page ("how many times has this title changed"): add `chain: true`. It needs exactly one of `page_id` or `page_url`, plus `change_kind`, and it takes no `cursor`. It returns the revisions of that field, newest first, up to `limit` rows and with no way to page further. When the number of rows equals the limit, say the chain may be longer than what was read.
5. Show the rows newest first. For each: `occurred_on`, `change_kind`, `old_value` to `new_value` (or `added_links` and `anchor_text` for internal links), `change_reason`, `actor_kind`, `verification`, `source_ref`, and `live_at`. Shorten a long value to its first 120 characters and say it was shortened. In the ordinary list, rows from the same day are not in the order they happened; say so when two share a date. A `chain` result is in revision order.
6. Read the rows for the user in two or three sentences: what was changed most, what reasons were given, and which changes carry no reason. Do not judge from this list if a change worked; it holds no results. `/seo-genius:brief` shows measured outcomes, and checks if a field is safe to edit now.
7. Say what this record is: changes logged through SEO Genius. An edit nobody logged is not here. `verification` reads `claimed` until SEO Genius has compared the entry with the live page; repeat any other value as returned.

## Output

- One line: site, domain, `can_write`.
- The scope that was read (page, field, dates).
- A table: Date | Field | Before | After | Reason | By | Verification | Reference.
- The short reading from step 6.
- The note from step 7.
- Closing line per rule 9.

## If something is missing

- Tools not available: run `/mcp`, choose `plugin:seo-genius:seo-genius`, authorize in the browser.
- 403 with "MCP scope required" or `feature_locked`: connecting Claude needs Pro or above. Upgrade in SEO Genius settings, then run `/mcp` again.
- No rows: say nothing is recorded for that scope, and that an edit nobody logged would not appear.
- `chain` is refused: it was sent without `change_kind`, with both `page_id` and `page_url`, or with a `cursor`. Fix the call and say what was wrong.
- `since` is later than `until`: swap them and say so.
- Rate limited (429): stop, say so, suggest retrying in a minute.

## Done when

- The reply names the scope that was read and says the list was first-page only when it was.
- Every row shows its reason, or shows that none was recorded.
- No claim about results was made from this list.
- Nothing was written.
