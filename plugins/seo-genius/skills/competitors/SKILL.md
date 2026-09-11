---
name: competitors
description: Rankings and competitor check through SEO Genius. Use when the user asks "who are my competitors", "where do I rank for X", "am I ranking in <city>", "compare me to <competitor>", or wants a live position for named keywords. Pulls the site's local ranking baseline, its organic competitor domains, and a live search check for up to five named terms, each stamped with location and time. Requires the SEO Genius MCP server, connected and authorized.
---

# SEO Genius: rankings and competitors

Where the site stands locally, who it is up against, and a live check on the terms the user cares about. Every position carries the location and time it was read.

## When to use

"who are my competitors", "where do I rank for X", "am I ranking in <city>", "compare me to <competitor>", "check my position for these terms".

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
2. `get_business_context` for city, state, metro, and any competitors the owner stored. Show stored competitors later, labeled "from your business context".
3. Tell the user that steps 4 to 6 spend their quota.
4. `ranked_keywords` with `domain: <site domain>`, `location_name: "<City>,<Region>,<Country>"` built from the business context (for a US business this reads like "Boise,Idaho,United States"), `language_name: "English"`, `limit: 200`. This is the baseline: count of ranking terms, how many at positions 1 to 3, 4 to 10, 11 to 20.
5. `competitor_domains` with `domain: <site domain>`, `limit: 10`, plus `location_code` when the metro code is known. These are the organic rivals.
6. For each term the user named, five at most: `serp_rank_check` with `keyword: <term>`, `target_domain: <site domain>`, `depth: 100`, plus `location_code` when known. Record the position, the URL that ranks, the top three domains on that page, the location used, and the time of the call. When the user named no terms, skip this step.

## Output

- Baseline: one line with the counts from step 4 and the `location_name` used.
- Competitors: a table, Domain | Shared keywords (from the tool) | Note, with stored competitors added and labeled.
- Named terms: a table, Keyword | Position | Ranking URL | Top three on the page | Location | Checked at.
- Closing line per rule 9.

## If something is missing

- Tools not available: run `/mcp`, choose seo-genius, authorize in the browser.
- 403 with "MCP scope required" or `feature_locked`: connecting Claude needs Pro or above.
- `ranked_keywords` returns nothing: first check that the location string resolved (city, region, and country spelled as the business context stores them). If it resolved, say the site has no ranking terms recorded for that location. If it did not, say the location could not be resolved, ask the user for their city and country, and do not present the empty result as a ranking fact.
- `serp_rank_check` finds no position: report "not in the top 100" with the depth used, never a guessed number.
- `upstream_unavailable` on any live call: report it, skip that term, keep the rest.
- Rate limited (429): stop, say so, suggest retrying in a minute.

## Done when

- At most five `serp_rank_check` calls.
- Every position is stamped with location and time.
- Competitors come from `competitor_domains`, with stored ones labeled.
- The quota spend is stated.
