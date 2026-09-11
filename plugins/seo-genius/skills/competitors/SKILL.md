---
name: competitors
description: Rankings and competitor check through SEO Genius. Use when the user asks "who are my competitors", "where do I rank for X", "am I ranking in <city>", "compare me to <competitor>", or wants a live position for named keywords. Pulls the site's local ranking baseline, its organic competitor domains, and a live search check for up to five named terms, each stamped with location and time. Requires the SEO Genius MCP server, connected and authorized.
---

# SEO Genius: rankings and competitors

Where the site stands locally, who it is up against, and a live check on the terms the user cares about. Every position carries the location and time it was read.

## When to use

"who are my competitors", "where do I rank for X", "am I ranking in <city>", "compare me to <competitor>", "check my position for these terms".

## Requires

The SEO Genius MCP server, connected and authorized. If `get_my_tenant` is not available, stop and tell the user: run `/mcp`, choose `plugin:seo-genius:seo-genius`, and authorize in the browser.

## Standing rules (apply to every step)

1. Resolve the business first. Call `get_my_tenant`, then `list_sites`. Match what the user typed to a site by name or domain. Echo the site and `can_write` before doing anything else. When the connection is org-scoped (`get_my_tenant` returns `org_id` and `sites[]`), pass `site` (the site id or domain) on every later call. Ambiguous or no match: ask which site.
2. Read memory before deriving. Call `get_business_context` once per session for the business name, services, locations, and competitors. Do not re-derive what is already stored.
3. Retrieval first, quota aware. Read stored SEO Genius data before any Data-for-SEO call (`keyword_research`, `ranked_keywords`, `competitor_domains`, `serp_rank_check`). Batch keywords, up to 200, into one `keyword_research` call. Say when a call spends the user's quota. Do not call `search_recommendations`; it returns an empty set today.
4. Local, not national, with the right tool. `ranked_keywords`, `keyword_research`, and `competitor_domains` run at country level only (Data-for-SEO Labs does not take a city or state, and a city returns nothing). Pass the customer's country (`location_name: "United States"` or `location_code: 2840` for a US business) and make the keywords themselves local ("tree removal boise"). For a local position use `serp_rank_check` with the metro `location_code`, or with the city in the keyword when no code is known. State which was done.
5. Never invent a number. Every figure traces to a tool result. Missing data is reported as missing.
6. Cap every list. Call `list_issues` with `limit` (50 by default, 100 at most) and read the first page only unless the user asks for more. Never quote a crawl's `issues_found` field.
7. Search with phrases. `search_pages` is a vector search; give it a descriptive phrase ("concrete driveway installation service page"), never a single word.
8. Writes need `can_write`. On a read-only account, return the change as text so it is not lost. Logging records status; it does not prove a result.
9. Say what was capped. Every reply ends with one line naming which lists were first-page only and which calls spent quota.

## Procedure

1. Resolve the site (rule 1). Echo site, domain, `can_write`.
2. `get_business_context` for city, state, metro, and any competitors the owner stored. Show stored competitors later, labeled "from your business context".
3. Tell the user that steps 4 to 6 spend their quota.
4. `ranked_keywords` with `domain: <site domain>`, `location_name: "<Country>"` (the customer's country from the business context, "United States" for a US business; never a city or state, which return nothing), `language_name: "English"`, `limit: 200`. One call only. This is the country-level baseline: count of ranking terms, how many at positions 1 to 3, 4 to 10, 11 to 20.
5. `competitor_domains` with `domain: <site domain>`, `limit: 10`, `location_code: <country code>` (`2840` for the United States; never a city code). One call only. These are the organic rivals at country level.
6. For each term the user named, five at most: `serp_rank_check` with `keyword: <term>`, `target_domain: <site domain>`, `depth: 100`, and `location_code` set to the metro code when the user or the business context provides one; otherwise use the country code and keep the city in the keyword. This is the only local call. Record the position, the URL that ranks, the top three domains on that page, the location used, and the time of the call. When the user named no terms, skip this step.

## Output

- Baseline: one line with the counts from step 4, the country `location_name` used, and a note that the baseline is country-level.
- Competitors: a table, Domain | Shared keywords (from the tool) | Note, with stored competitors added and labeled.
- Named terms: a table, Keyword | Position | Ranking URL | Top three on the page | Location | Checked at.
- Closing line per rule 9.

## If something is missing

- Tools not available: run `/mcp`, choose `plugin:seo-genius:seo-genius`, authorize in the browser.
- 403 with "MCP scope required" or `feature_locked`: connecting Claude needs Pro or above.
- `ranked_keywords` returns nothing at country scope: say the domain has no ranking terms recorded. Do not retry with a city or state; those return nothing on this tool.
- `serp_rank_check` finds no position: report "not in the top 100" with the depth used, never a guessed number.
- `upstream_unavailable` on any live call: report it, skip that term, keep the rest.
- Rate limited (429): stop, say so, suggest retrying in a minute.

## Done when

- At most five `serp_rank_check` calls.
- Every position is stamped with location and time.
- Competitors come from `competitor_domains`, with stored ones labeled.
- The quota spend is stated.
- One `ranked_keywords` call and one `competitor_domains` call, both at country scope.
