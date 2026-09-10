---
name: audit
description: Run a first SEO audit of a site connected to SEO Genius. Use when the user says "audit my site", "what's my SEO like", "where do I stand", "set up SEO Genius", "check my website", or asks for the biggest SEO problems on a site. Reads the latest crawl, the open issues by severity, and the stored business context, then returns the top five problems with current and recommended values plus one first action. Requires the SEO Genius MCP server, connected and authorized.
---

# SEO Genius: first audit

Read what SEO Genius already knows about the site and turn it into a short brief: what is wrong, in what order, and the one thing to do first. Nothing here comes from anywhere except tool results.

## When to use

"audit my site", "what's my SEO like", "where do I stand", "biggest problems on my site", "set up SEO Genius for my site", "check my website".

## Requires

The SEO Genius MCP server, connected and authorized. If `get_my_tenant` is not available, stop and tell the user: run `/mcp`, choose seo-genius, and authorize in the browser.

## Standing rules (apply to every step)

1. Resolve the business first. Call `get_my_tenant`, then `list_sites`. Match what the user typed to a site by name or domain. Echo the site and `can_write` before doing anything else. When the connection is org-scoped (`get_my_tenant` returns `org_id` and `sites[]`), pass `site` (the site id or domain) on every later call. Ambiguous or no match: ask which site.
2. Read memory before deriving. Call `get_business_context` once per session for the business name, services, locations, and competitors. Do not re-derive what is already stored.
3. Retrieval first, quota aware. Read stored SEO Genius data before any Data-for-SEO call (`keyword_research`, `ranked_keywords`, `competitor_domains`, `serp_rank_check`). Batch keywords, up to 200, into one `keyword_research` call. Say when a call spends the user's quota.
4. Local, not national. Data-for-SEO tools default to the whole United States. Pass the customer's metro as `location_name` on `ranked_keywords` (a string such as "Boise,Idaho,United States") or as `location_code` on the other three (an integer), or make the keywords themselves local ("tree removal boise"). State which was done.
5. Never invent a number. Every figure traces to a tool result. Missing data is reported as missing.
6. Cap every list. Call `list_issues` with `limit` (50 by default, 100 at most) and read the first page only unless the user asks for more. Never quote a crawl's `issues_found` field.
7. Search with phrases. `search_pages` is a vector search; give it a descriptive phrase ("concrete driveway installation service page"), never a single word.
8. Writes need `can_write`. On a read-only account, return the change as text so it is not lost. Logging records status; it does not prove a result.
9. Say what was capped. Every reply ends with one line naming which lists were first-page only and which calls spent quota.

## Procedure

1. Resolve the site (rule 1). Echo: site name, domain, `can_write`, tier.
2. `get_business_context`. Keep the business name, services, and locations for the brief.
3. `list_crawls` with `limit: 10`. Pick the most recent crawl whose status is completed. `get_crawl` on it for the date and page count. Do not read or repeat its issue count.
   - No completed crawl and `can_write` is true: offer `trigger_crawl`, say it takes a few minutes, stop.
   - No completed crawl and `can_write` is false: say a crawl is needed and that a workspace owner or editor can start one, stop.
   - Latest crawl older than 7 days: say so. Do not trigger another unless the user asks.
4. `list_issues` with `status: "open"`, `severity: "critical"`, `limit: 50`. Then the same with `severity: "high"`. First page each. If both are empty, `severity: "medium"` once.
5. Pick five. Order: severity, then issues on the homepage or a service page before blog posts, then most recent. Call `get_issue` only for a row that lacks a current or recommended value.
6. Choose one first action: the highest-severity single-field fix (title, meta description, H1, schema, alt text) that names a specific page and carries a recommended value.

## Output

- One line: site, domain, `can_write`.
- One line: crawl date and page count.
- A table: Page | Issue | Current | Recommended | Severity (five rows at most).
- First action: page, field, paste-ready value, one sentence on why it is first.
- Closing line per rule 9.

## If something is missing

- Tools not available: run `/mcp`, choose seo-genius, authorize in the browser.
- 403 with "MCP scope required" or `feature_locked`: the SEO Genius plan does not include LLM connections. Connecting Claude needs Pro or above. Upgrade in SEO Genius settings, then run `/mcp` again.
- `list_sites` is empty: no sites in this workspace yet. Add one in the SEO Genius dashboard and run a crawl.
- No open issues at any severity: say the last crawl looks clean and offer a fresh crawl if `can_write` is true.
- Rate limited (429): stop, say so, suggest retrying in a minute.

## Done when

- Five issues at most, each with a current and a recommended value.
- One first action naming a page.
- The crawl's issue count is never shown. No raw page list.
- The closing line names what was capped.
