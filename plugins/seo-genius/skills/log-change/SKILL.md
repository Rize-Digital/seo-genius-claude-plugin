---
name: log-change
description: Record a change the user made to their site in SEO Genius memory. Use when the user says "I updated my homepage title to X", "log this change", "I added FAQ schema to the service page", "note that I fixed the meta description", or describes an edit they shipped. Confirms the page and the exact before and after, then writes one change-log entry with the reason, and marks a matching open issue fixed only when the user confirms. Requires the SEO Genius MCP server, connected and authorized, and an account that can write.
---

# SEO Genius: log a change

Write what the user changed, where, and why into SEO Genius, so the next session and the next crawl know about it. Logging records status. It does not prove a result.

## When to use

"I updated my homepage title to X", "log this change", "I added FAQ schema to the service page", "note that I fixed the meta description", "I shipped the H1 fix".

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

1. Resolve the site (rule 1). If `can_write` is false: write the change out as a short block (page, change kind, before, after, reason) the user can paste or send to a workspace owner, say the account is read-only, and stop.
2. Find the page: `search_pages` with a descriptive phrase built from the user's words, `match_count: 5`. If the user gave a URL, match on it. More than one candidate: ask. None: page through `list_pages` (`limit: 100`, follow `next_cursor`, at most five pages) and match the URL or title; the homepage in particular often does not surface from `search_pages`. Still nothing: ask for the URL.
3. `get_page` with `page_id` to read the current stored value of the field. If the user did not state the "before", use the stored value and say so.
4. `list_crawls` with `limit: 20`; take the most recent completed crawl's id as `crawl_id`.
5. Pick the `change_kind`, then show the entry and ask for a yes: page URL, change kind, before, after, reason. Do not write until the user confirms. The kind is exactly one of `title`, `meta_description`, `h1`, `canonical`, `schema`, `internal_links`, `redirect`, `content_depth` (copy added or expanded), `readability` (copy rewritten, same scope). If the edit fits none of them (image alt text, for example), say SEO Genius has no change kind for it yet, return the entry as text, and do not write. Never force an edit into the nearest kind, and do not offer to. In that text, leave any before or after the user did not state as "not given".
6. `log_page_change` with typed fields only:
   - `page_id`: from step 2
   - `crawl_id`: from step 4
   - `change_kind`: from step 5
   - `old_value`, `new_value`: the exact before and after, character for character, 4000 characters at most each. For `content_depth` and `readability`, give a short description of the before and after (word count, the section changed) instead of the full copy.
   - `added_links`, `anchor_text`: for `internal_links`, the link URLs added and their anchor text
   - `reason`: the user's reason in one or two sentences, 1000 characters at most
   - `occurred_on`: `YYYY-MM-DD`, only when the change shipped on a day other than today
   Do not send `changes_made`. It is deprecated, and `list_page_changes` never returns it, so a later session cannot read it back.
7. If the user says the change clears a specific open issue: `list_issues` with `page_id`, `status: "open"`, `limit: 50`, show the matching issue, and on a second yes call `mark_issue_fixed` with `issue_id` and `resolution_note: "<what changed, logged via Claude Code plugin>"`.

## Output

"Logged: <change kind> on <URL>, before -> after, reason: <reason>. Origin: your Claude Code session. Impact is measured on a later crawl; nothing is proven yet." Then, if applicable: "Marked issue <short description> as fixed." Then the closing line per rule 9.

## If something is missing

- Tools not available: run `/mcp`, choose `plugin:seo-genius:seo-genius`, authorize in the browser.
- 403 with "MCP scope required" or `feature_locked`: connecting Claude needs Pro or above.
- 403 on the write itself: the account's role cannot write. Return the entry as text.
- The write returns an error: say "this did not save" and repeat the error text. Never claim success.
- No completed crawl: say a crawl is needed before a change can be logged against it.
- Rate limited (429): stop, say so, suggest retrying in a minute.

## Done when

- The user confirmed before the write.
- `log_page_change` went in with `page_id`, `crawl_id`, `change_kind`, and `reason`, plus `old_value` and `new_value` for a field edit or `added_links` for internal links. No `changes_made`.
- The reply separates logged from measured.
- No write happened on a read-only account.
