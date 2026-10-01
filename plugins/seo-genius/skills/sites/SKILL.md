---
name: sites
description: Portfolio view of every site in the SEO Genius workspace. Use for "which of my sites needs attention", "show all my sites", "status of my client sites", "overview of my sites". One call returns each site with its open issues by severity and its latest crawl, and the reply orders the sites by what needs attention first. It only reads. Requires the SEO Genius MCP server, connected and authorized.
---

# SEO Genius: all sites

Every site this connection can see, in one table, ordered by what needs attention first.

## When to use

"which of my sites needs attention", "show all my sites", "status of my client sites", "overview of my sites".

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

1. `get_my_tenant`. This skill covers every site, so do not ask which site, and pass no `site`.
2. `list_sites_summary` with no arguments. Each row has `id`, `name`, `domain`, `status`, `open_issues` (`critical`, `high`, `medium`, `low`, `total`), and `latest_crawl` (`id`, `status`, `started_at`, `completed_at`). An archived site has `status` "archived" and no counts. A site with no crawl has `latest_crawl` null.
3. Order the active sites: first those with no crawl, then by `critical`, then by `high`, most first. Put archived sites last.
4. Add one note per site where it applies: no crawl yet; last crawl more than 14 days old; last crawl not completed.
5. Do not show `issues_found` from the crawl (rule 6). The counts to show are the ones in `open_issues`.
6. Close by naming the first site in the order and the next step for it: `/seo-genius:brief` or `/seo-genius:audit` with that site.

## Output

- A table: Site | Domain | Critical | High | Medium | Low | Open in total | Last crawl | Note.
- One line naming the site that needs attention first, and why.
- Closing line per rule 9.

## If something is missing

- Tools not available: run `/mcp`, choose `plugin:seo-genius:seo-genius`, authorize in the browser.
- A call is refused with "MCP scope required" or "MCP not in your plan": connecting Claude needs Pro or above. Upgrade in SEO Genius settings, then run `/mcp` again.
- `list_sites_summary` is not in the tool list: use `list_sites` for the names and domains, and say the issue counts need one `/seo-genius:audit` per site.
- One site only: show its row and suggest `/seo-genius:brief`.
- A call fails with a rate limit message: stop, say so, suggest retrying in a minute. A call fails with "quota_exceeded": the plan's monthly call quota is used. Stop and say so; waiting a minute will not help.

## Done when

- Every site the tool returned is in the table, archived ones marked.
- Every count comes from `open_issues`. No crawl issue count is shown.
- The order follows step 3, and the first site is named with its reason.
- Nothing was written.
