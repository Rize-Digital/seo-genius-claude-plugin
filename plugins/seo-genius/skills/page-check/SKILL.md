---
name: page-check
description: Check one page's SEO issues using SEO Genius. Use when the user names a page or a page type and asks what is wrong with it, for example "check my homepage SEO", "what's wrong with my pricing page", "any issues on the driveway page", "review this URL". Finds the page in the crawled site data, lists only that page's open issues with current and recommended values, and reads the page's current title, meta, headings, and schema. Requires the SEO Genius MCP server, connected and authorized.
---

# SEO Genius: page check

Answer "what is wrong with this one page" from the stored crawl, with current and recommended values side by side.

## When to use

"check my homepage SEO", "what's wrong with my pricing page", "any issues on the driveway page", "review this URL", "is my service page okay".

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
2. `get_business_context` for the services and locations. Use them to turn the user's words into a search phrase that says what the page is about: "the driveway page" becomes "concrete driveway installation service page". The homepage is the exception. It does not call itself a home page, so it has its own lookup in step 3.
3. Find the page. If the user gave a URL, match it against the returned URLs first.
   - The homepage: never search for it by role ("home page", "landing page"); about, policy and blog index pages outrank it for those words. `search_pages` with `q: <the site's name from list_sites>`, `match_count: 50`, and take the row whose URL is the site root (the domain with only `/` after it). No such row: search once more with `q: <the business's tagline from get_business_context>`, `match_count: 50`, and take the site-root row. Still none, or no tagline: go to the `list_pages` branch below. This is the one lookup that does not use rule 7's descriptive phrase.
   - Any other page: `search_pages` with `q: <phrase>`, `match_count: 5`. If an earlier search in this session already showed `mode: text`, send the two or three words from rule 7 in place of the phrase.
   - One clear match (for the homepage, the site-root row): confirm the URL in the reply and continue.
   - More than one plausible match: list the candidate URLs and ask which one. Stop until answered.
   - No match, the response's `mode` is `text`, and the query was the long phrase: search one more time, once only, with two or three words the page's title or H1 would carry (rule 7), so "the driveway page" becomes "driveway installation". Handle a match or several candidates as in the two branches above.
   - Still no match, in either mode: page through `list_pages` without `q` (`limit: 100`, follow `next_cursor`, at most five pages) and match the URL or title. Still nothing: ask for the page URL. Stop.
4. `list_issues` with `page_id: <matched page id>`, `status: "open"`, `limit: 50`.
5. `get_page` once with `page_id` for the current title, meta description, H1, headings, and schema types.

## Output

- One line: the page URL that was matched.
- A table: Issue | Current | Recommended | Severity.
- Below it, the page's current title, meta description, H1, and schema types as read from `get_page`.
- Closing line per rule 9.

## If something is missing

- Tools not available: run `/mcp`, choose `plugin:seo-genius:seo-genius`, authorize in the browser.
- 403 with "MCP scope required" or `feature_locked`: connecting Claude needs Pro or above. Upgrade in SEO Genius settings, then run `/mcp` again.
- No issues on the matched page: say it looks clean on the last crawl and show the `get_page` values anyway.
- Rate limited (429): stop, say so, suggest retrying in a minute.

## Done when

- Only the matched page's issues are shown, each with current and recommended values.
- `get_page` was called once at most.
- The reply names the matched URL and what was capped.
