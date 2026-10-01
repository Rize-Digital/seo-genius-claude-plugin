---
name: brief
description: Brief Claude on a site before any SEO work, using SEO Genius. Use at the start of a session, before a batch of edits, or before one edit, for example "brief me on my site", "what changed recently", "what is frozen", "what should I work on next", "is it safe to change the title on my pricing page", "can I edit this H1 yet". Returns the site briefing (crawl status, open-issue health, recent changes and their measurement status, fields frozen against a re-edit, pages that need attention, search performance, keyword opportunities, what worked before), and for a named page and field a verdict of allow, warn, or block with the reasons and dates. It only reads and checks; it never edits a page and never writes to SEO Genius. Requires the SEO Genius MCP server, connected and authorized.
---

# SEO Genius: site briefing

Start from what SEO Genius already knows about the site: what changed, what is still being measured, what must not be touched yet, and what to do next. Then check any single edit before it is made.

## When to use

"brief me on my site", "what changed recently", "what is frozen", "what should I work on next", "is it safe to change the title on my pricing page", "can I edit this H1 yet". Also at the start of a session where SEO edits are planned, and before each edit to a title, meta description, H1, canonical, schema, internal links, redirect, or page copy.

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

For "is it safe to change X on page Y" with no request for the full briefing, do step 1, then go to step 5.

1. Resolve the site (rule 1). Echo site, domain, `can_write`.
2. `get_site_briefing`. It reads stored data only and spends no crawl and no Data-for-SEO quota, so the briefing already holds the business context and `get_business_context` is not needed here. Leave `max_bytes` at its default. Raise it (12000 at most) only when the user asks for the full briefing and `sections_dropped` is not empty.
3. Show the returned `markdown` as it is. Do not reword its numbers, dates, or page verdicts. Then add, in plain words:
   - each section named in `sections_dropped`, as left out to fit the size limit;
   - each section whose `empty_reason` is set. Report the reason; never present a section that could not be read as a clean result. `no_scored_changes_yet` means no past change has finished measurement, so nothing is proven yet. `performance_not_available` means search performance data is not connected or not synced. `no_recent_changes` means nothing was logged in the window the section names; an edit nobody logged does not appear. `no_crawl_yet` means the site has not been crawled. `no_business_context` means no business profile is stored. `coach_history_not_readable` means part of the change history could not be read. `nothing_frozen`, `no_pages_need_attention`, `no_opportunities_found`, and `no_history` mean what they say;
   - if `coach_history_not_readable` lists anything, say that Recent changes, Frozen, and the Status board may be incomplete. Missing is not the same as empty.
4. Next moves, three at most. Take each from a line of the briefing and name that line. Order: Status board rows marked REVISE, CREATE, or ESCALATE, then Opportunities, then Health.
   - Check every candidate against `change_index` from the same response as well as the markdown. The Frozen section shows a capped number of lines and can be left out for size; `change_index` holds every one. Its `page_url` may be a full URL or a path, while the markdown shows paths, so match on the path.
   - Never propose a field whose `change_index.entries` row (same `page_url` and `change_kind`) has `frozen_until` in the future.
   - Never propose a revision on a page whose `change_index.pages` row has verdict WAIT. Say when the wait ends (`until`).
   - `change_index.truncated` is true: say the index is incomplete, and run `check_change` (step 5) on each move before proposing it.
   - ESCALATE means revising has not worked. Say it needs a person's decision, not another edit.
   - CREATE means the page has been revised enough. Propose new content, not another revision.
   - KEEP means the last change worked. Leave it.
5. Check one edit, when the user asks if it is safe, or before an edit the user asked you to make: `check_change` with
   - exactly one of `page_id` (find the page with `search_pages`, rule 7, or `list_pages`) or `page_url` (the full URL; a bare path is refused when the site's history holds it on more than one host)
   - `change_kind`: one of `title`, `meta_description`, `h1`, `canonical`, `schema`, `internal_links`, `redirect`, `content_depth`, `readability`
   - `proposed_value`: the exact new value, character for character, when it is known. Without it, any change to a frozen field counts as a block, and a revert cannot be detected.
6. Report the verdict. This skill only checks. It does not edit a page. When the user asked if an edit is safe, the answer is the whole job. When the check ran ahead of an edit the user asked for, the verdict decides what happens to that edit:
   - `allow`: say it is clear. A requested edit can go on.
   - `warn`: repeat each reason's `message`. `pending_measurement` means an earlier change to this field is still being measured, and editing now throws that measurement away. `recently_changed_other_kind` means another field on the page changed recently, so neither change can be measured cleanly. A requested edit goes on only if the user accepts that.
   - `block`: say the edit should not be made now. Repeat each reason's `message`, give `unfreezes_on` when it is set (a `would_revert` block has no date, and when both reasons are present the edit is still a revert after the unfreeze date), and say what `page_verdict` recommends for the page instead. A requested edit stops here. It goes on only if the user, after hearing the reasons, gives an explicit yes.
7. Checking records nothing. After an edit ships, log it with `/seo-genius:log-change` so the next briefing knows about it.

## Output

- One line: site, domain, `can_write`.
- The briefing markdown as returned, then the notes on dropped and empty sections.
- "Next moves": three at most, each with the page, the field, and the briefing line it came from.
- For a single-edit check: the verdict first (allow, warn, or block), then the reasons, the date it changes, and the page verdict.
- Closing line per rule 9.

## If something is missing

- Tools not available: run `/mcp`, choose `plugin:seo-genius:seo-genius`, authorize in the browser.
- 403 with "MCP scope required" or `feature_locked`: connecting Claude needs Pro or above. Upgrade in SEO Genius settings, then run `/mcp` again.
- `get_site_briefing` or `check_change` is not in the tool list: say the connected server does not offer it, and run `/seo-genius:audit` for the site instead. Never fill in a briefing from guesses.
- `check_change` says the path exists on more than one host: pass the full URL.
- `check_change` returns "Page not found": the `page_id` is wrong. Find the page again.
- Rate limited (429): stop, say so, suggest retrying in a minute.

## Done when

- The briefing was shown as returned, with dropped and empty sections named.
- No next move touches a field that `change_index` shows as frozen, or revises a page marked WAIT.
- Every single-edit check states the verdict, the reasons, and the date when there is one.
- Nothing was written to SEO Genius, and this skill edited no page. A question about safety got an answer, not an edit.
