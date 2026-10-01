---
name: issues
description: Record, correct, or dismiss an SEO issue in SEO Genius. Use for "add this as an issue", "record this finding", "this issue is a false positive", "dismiss this issue", "change the recommendation on this issue", "raise the severity of this issue". Files a new issue with its evidence and recommendation, corrects an existing one, or rejects one with a reason, each only after the user confirms. To mark an issue fixed after a change shipped, use log-change instead. Requires the SEO Genius MCP server, connected and authorized, and an account that can write.
---

# SEO Genius: record, correct, or dismiss an issue

Keep the issue list true. A finding worth acting on goes in, a wrong recommendation is corrected, and a false positive is dismissed with the reason.

## When to use

"add this as an issue", "record this finding", "this issue is a false positive", "dismiss this issue", "change the recommendation on this issue", "raise the severity of this issue".

## Requires

The SEO Genius MCP server, connected and authorized, on an account where `get_my_tenant` returns `can_write: true`. If `get_my_tenant` is not available, stop and tell the user: run `/mcp`, choose `plugin:seo-genius:seo-genius`, and authorize in the browser.

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

1. Resolve the site (rule 1). If `can_write` is false: write the entry out as a short block the user can send to a workspace owner, say the account is read-only, and stop.
2. Work out which of the three the user wants: record a finding, correct an issue, or dismiss one. If the user wants an issue marked fixed, that is `/seo-genius:log-change`; say so and stop.
3. Record a finding.
   - Look for it first: `list_issues` with `q` set to a few words that describe it, `status: "open"`, and `limit: 50`. Add `page_id` when the page is known. If it is already there, show that issue and offer to correct it instead.
   - Find the page when the finding is about one: `search_pages` with a descriptive phrase (rule 7), `match_count: 5`, or `list_pages`. A finding about the whole site needs no page.
   - `list_crawls` with `limit: 20`; take the most recent completed crawl's id as `crawl_id`.
   - Show the entry and ask for a yes: issue type (a short label in snake case, such as `missing_faq_section`), severity (`critical`, `high`, `medium`, or `low`), description, current value, recommended value, recommendation, and the reason. The reason names the evidence and where it came from: a page that was read, a tool result, a research file. Never invent it.
   - `create_issue` with `crawl_id`, `issue_type`, `severity`, `description`, and whichever of `recommendation`, `reason`, `page_id`, `url`, `current_value`, `recommended_value` apply. SEO Genius reuses an issue type already in use when the name is the same, ignoring case and spacing; it does not match by meaning. Show the row it returns.
4. Correct an issue.
   - Find it: `list_issues` with `q` or `page_id`, `limit: 50`. More than one candidate: ask which.
   - Show what it says now and what would change, and ask for a yes.
   - `update_issue` with `issue_id` and at least one of `recommendation`, `reason`, `severity`, `recommended_value`. It changes those four fields only.
5. Dismiss an issue.
   - Find it as in step 4. It has to be open.
   - Ask for the reason it is wrong, in the user's words, and for a yes.
   - `reject_issue` with `issue_id` and `reason`. The reason is required.

## Output

- One line: site, domain, `can_write`.
- What was done: "Recorded", "Corrected", or "Dismissed", with the issue's type, page, and severity.
- For a correction, the before and after of each field that changed.
- Closing line per rule 9.

## If something is missing

- Tools not available: run `/mcp`, choose `plugin:seo-genius:seo-genius`, authorize in the browser.
- A call is refused with "MCP scope required" or "MCP not in your plan": connecting Claude needs Pro or above.
- The write is refused with a message that the role is read-only: the account cannot write. Return the entry as text.
- No completed crawl: say a crawl is needed before a finding can be recorded against one.
- "Issue not found or not open" on a dismissal: the issue was already resolved or rejected. Say so.
- The write returns an error: say "this did not save" and repeat the error text. Never claim success.
- A call fails with a rate limit message: stop, say so, suggest retrying in a minute. A call fails with "quota_exceeded": the plan's monthly call quota is used. Stop and say so; waiting a minute will not help.

## Done when

- The user confirmed before every write.
- A new finding was checked against the open issues first, and its reason names real evidence.
- A dismissal carries the user's reason.
- No write happened on a read-only account.
