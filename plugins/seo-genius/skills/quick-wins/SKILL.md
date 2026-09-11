---
name: quick-wins
description: The fastest SEO fixes and the closest keyword wins for a site in SEO Genius. Use when the user asks "quick wins", "easiest fixes", "low-hanging fruit", "what should I fix first", "striking distance keywords", or wants a short do-this-first list. Returns three single-field fixes with paste-ready values from the open issues, plus up to five keywords already ranking on page one or two with the one move that lifts each. Requires the SEO Genius MCP server, connected and authorized.
---

# SEO Genius: quick wins

Three fixes that take minutes, then the keywords closest to moving. Everything comes from the stored issues and one local rankings call.

## When to use

"quick wins", "easiest fixes", "low-hanging fruit", "what should I fix first", "striking distance", "what can I do this week".

## Requires

The SEO Genius MCP server, connected and authorized. If `get_my_tenant` is not available, stop and tell the user: run `/mcp`, choose seo-genius, and authorize in the browser.

## Standing rules (apply to every step)

1. Resolve the business first. Call `get_my_tenant`, then `list_sites`. Match what the user typed to a site by name or domain. Echo the site and `can_write` before doing anything else. When the connection is org-scoped (`get_my_tenant` returns `org_id` and `sites[]`), pass `site` (the site id or domain) on every later call. Ambiguous or no match: ask which site.
2. Read memory before deriving. Call `get_business_context` once per session for the business name, services, locations, and competitors. Do not re-derive what is already stored.
3. Retrieval first, quota aware. Read stored SEO Genius data before any Data-for-SEO call (`keyword_research`, `ranked_keywords`, `competitor_domains`, `serp_rank_check`). Batch keywords, up to 200, into one `keyword_research` call. Say when a call spends the user's quota. Do not call `search_recommendations`; it returns an empty set today.
4. Local, not national. Data-for-SEO tools default to the whole United States. Pass the customer's metro as `location_name` on `ranked_keywords` (a string such as "Boise,Idaho,United States") or as `location_code` on the other three (an integer), or make the keywords themselves local ("tree removal boise"). State which was done.
5. Never invent a number. Every figure traces to a tool result. Missing data is reported as missing.
6. Cap every list. Call `list_issues` with `limit` (50 by default, 100 at most) and read the first page only unless the user asks for more. Never quote a crawl's `issues_found` field.
7. Search with phrases. `search_pages` is a vector search; give it a descriptive phrase ("concrete driveway installation service page"), never a single word.
8. Writes need `can_write`. On a read-only account, return the change as text so it is not lost. Logging records status; it does not prove a result.
9. Say what was capped. Every reply ends with one line naming which lists were first-page only and which calls spent quota.

## Procedure

1. Resolve the site (rule 1). Echo site, domain, `can_write`.
2. `get_business_context` for city, state, and metro.
3. `list_issues` with `status: "open"`, `severity: "critical"`, `limit: 100`, then the same with `severity: "high"`. First page each.
4. Keep only single-field issues that carry a recommended value: title, meta description, H1, schema, image alt text. Drop anything that needs new copy, a new page, a redirect, or a code change.
5. Rank the keepers: severity, then homepage and service pages before blog posts, then shortest edit. Take three. Call `get_page` only when the issue row does not name the page URL.
6. `ranked_keywords` with `domain: <site domain>`, `location_name: "<City>,<Region>,<Country>"`, `language_name: "English"`, `limit: 200`. Build the location from the business context (for a US business it reads like "Boise,Idaho,United States"). Say that this call spends quota. Keep rows with position 4 to 20. Drop brand terms. Sort by search volume descending. Take five.
7. For each keyword, name the ranking page from the row and one move: put the term and the city in the title, add an H2 that answers the query, add an FAQ, or add an internal link with the local anchor. One move per keyword.

## Output

- "Do these first": three rows, Page | Field | Current | Paste-ready value | Why.
- "Closest keyword wins": five rows at most, Keyword | Position | Volume | Ranking page | The one move.
- One line: the `location_name` used.
- Closing line per rule 9.

## If something is missing

- Tools not available: run `/mcp`, choose seo-genius, authorize in the browser.
- 403 with "MCP scope required" or `feature_locked`: connecting Claude needs Pro or above.
- No single-field issues with a recommended value: say so and point to `/seo-genius:audit` for the full picture.
- `ranked_keywords` returns nothing: ship the fixes alone. Then check that the location string resolved (city, region, and country as the business context stores them). If it resolved, say the ranking data was empty for that location. If it did not, say the location could not be resolved and ask the user for their city and country; do not present the empty result as a ranking fact.
- Rate limited (429) or `upstream_unavailable`: stop, show what came back, say what was not fetched.

## Done when

- Three single-field fixes with paste-ready values, none on an issue without a recommended value.
- Five keywords at most, all at position 4 to 20, each with a ranking page and one move.
- The `location_name` and the quota spend are stated.
