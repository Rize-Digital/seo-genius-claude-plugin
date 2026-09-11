---
name: keywords
description: Keyword and search-demand research through SEO Genius. Use when the user asks "what keywords should I target", "search volume for X", "is this keyword worth it", "keyword ideas for my service", or names terms and asks about demand. Reads the keywords SEO Genius already tracks, adds the user's terms and local variants from the stored business context, then makes one batched live volume call and returns a ranked table plus a shortlist. Requires the SEO Genius MCP server, connected and authorized.
---

# SEO Genius: keyword research

Real local demand numbers for the terms that matter, from one batched call, with the location made explicit.

## When to use

"what keywords should I target", "search volume for X", "is this keyword worth it", "keyword ideas for <service>", "what do people search for near me".

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
2. `get_business_context` for services, city, state, and metro.
3. `list_keywords` with `limit: 100`. These are free to read and already tracked.
4. Build the candidate list, 200 at most, in this order: the user's terms; tracked terms that match the user's topic; for each generic term, one local variant "<term> <city>"; for each service in the business context without a tracked term, "<service> <city>". Remove duplicates and brand terms.
5. Pick the location. If the metro's Data-for-SEO `location_code` is known from context or from the user, use it. If not, keep the default and rely on the local variants. Write down which.
6. One call: `keyword_research` with `keywords: [<candidates>]`, `location_code: <code if known>`, `language_code: "en"`. Tell the user before the call that it spends their quota.
7. Rank by search volume descending, break ties by lower competition. Mark intent when the tool returns it.
8. Shortlist five: highest volume terms with competition below the median of the set, one sentence each on where they fit (existing page, new page, or FAQ).

## Output

- One line: location used (code, or "geo-modified terms at the default") and that quota was spent.
- A table: Keyword | Monthly volume | CPC | Competition (0 to 1) | Intent.
- Shortlist: five terms, one sentence each.
- Closing line per rule 9.

Competition is a 0 to 1 score from the tool, not true keyword difficulty. Say so once under the table.

## If something is missing

- Tools not available: run `/mcp`, choose seo-genius, authorize in the browser.
- 403 with "MCP scope required" or `feature_locked`: connecting Claude needs Pro or above.
- A term returns no row: list it under "no reliable volume data" instead of guessing.
- Quota exhausted or `upstream_unavailable`: stop, show what came back, say the rest was not fetched.
- Rate limited (429): stop, say so, suggest retrying in a minute.

## Done when

- Exactly one `keyword_research` call.
- Every number in the table traces to a returned row.
- The location used and the quota spend are stated.
- Five-term shortlist with a reason each.
