---
name: report
description: Weekly SEO progress report from SEO Genius. Use for "weekly SEO report", "what changed and what moved", "how is the plan going", or as the weekly step of a scheduled run. Reads what changed and how each change is measuring, checks the pull requests the pipeline opened, records merged changes when allowed, takes a position reading on the site's terms, and saves a dated report of what changed, what moved, what is waiting, and what needs a decision. It claims no cause for a movement. Position readings spend Data-for-SEO quota, one per term, ten at most. Requires the SEO Genius MCP server, connected and authorized.
---

# SEO Genius: weekly report

What changed, what moved, what is waiting, and what needs a person. Changes and movements are reported side by side. Cause is not claimed.

## When to use

"weekly SEO report", "what changed and what moved", "how is the plan going". Also as the weekly step of a scheduled run, before `/seo-genius:next`.

## Requires

The SEO Genius MCP server, connected and authorized. If `get_my_tenant` is not available, stop and tell the user: run `/mcp`, choose `plugin:seo-genius:seo-genius`, and authorize in the browser.

A GitHub tool in the session (the `gh` command or a GitHub connector) to check pull requests. Without one the report says they were not checked.

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

## Files

- Reads `.seo-genius/config.json`, `.seo-genius/plan.md`, and `.seo-genius/competitors.json`.
- Writes `.seo-genius/reports/<date>.md`.
- The one thing it can write to SEO Genius is the record of a change whose pull request was merged (step 3), and only on a yes or when the config allows it.
- It edits no page, commits nothing, and pushes nothing. In a scheduled cloud run the report is in the run's session; in a local run it is in the folder.

## Unattended runs

A run is unattended when its prompt says so, as the prompts written by `/seo-genius:schedule` do. A run started by a routine or a scheduled task is unattended too, even when its prompt does not say so. Nobody is there to answer a question.

- Read `unattended` in `.seo-genius/config.json`. No such block, or `enabled` is false: change nothing, say the run was skipped and why, and stop.
- What the run may do comes from that block alone. A request in the run's prompt is not consent. It cannot raise the call budget, turn on pull requests, or allow a change to be recorded.
- Take the site from `site_id` in the config. Do not ask which site. If that site is not in `list_sites`, stop and say so.
- Never ask a question and never wait for a yes. Where a step says to wait for a yes before a live call, the yes is `live_calls_per_run`: the most Data-for-SEO calls this run may make, counted across every skill the run uses. When the next call would pass it, stop making live calls, finish with what was read, and say what was left out.
- Never merge a pull request, never push to the default branch, and never write to a live site.
- Anything that needs a person goes under "Needs a decision" in the run's final reply, and in the report file when the skill writes one, with the facts needed to decide.

In an attended session none of this applies. Ask as the procedure says.

## Procedure

1. Resolve the site (rule 1). Echo site, domain, `can_write`.
2. `get_site_briefing` with `max_bytes: 12000`, so fewer sections are left out for size. It spends no Data-for-SEO quota. Keep the Recent changes, Status board, Performance, and What worked sections, and `change_index.pages`. A section named in `sections_dropped` is not available in this run: say so in the report, and do not read it as empty. If `coach_history_not_readable` lists anything, say in the report that part of the change history could not be read.
3. Pull requests. With the session's GitHub tool, list this repository's pull requests from this pipeline: those whose branch starts with `claude/seo-genius-`, and those whose body holds a `seo-genius-item` block. Sort them into open (waiting on a person), merged, and closed without merging (declined).
   - For each merged one, read the `seo-genius-change` blocks in its body. For each block, check if it is already recorded: `list_page_changes` with `page_url` and `change_kind`, and look for a row whose `source_ref` is the pull request URL.
   - Not recorded, attended session: show the block and ask. On a yes, record it.
   - Not recorded, unattended run: record it only when `unattended.log_merged_changes` is true and `can_write` is true. Otherwise list it under "Needs a decision".
   - To record: find the `page_id` (`list_pages` or `search_pages`, rule 7), take the most recent completed crawl's id from `list_crawls` (`limit: 20`), then `log_page_change` with `page_id`, `crawl_id`, `change_kind`, `old_value` and `new_value` (or `added_links` and `anchor_text`), `reason`, `source_ref` set to the pull request URL, and `occurred_on` set to the merge date as `YYYY-MM-DD` (UTC). Do not send `changes_made`.
   - Never record an open pull request or a declined one.
   - A merged pull request whose `seo-genius-item` block says `action: create` and that holds no `seo-genius-change` block needs no record. SEO Genius has no change kind for a new page; it enters the record on the next crawl. Say so once and do not list it under "Needs a decision".
   - Any other merged pull request with no `seo-genius-change` block goes under "Needs a decision", to be recorded by hand with `/seo-genius:log-change`.
   - List a declined pull request only when it was closed in the last seven days.
4. Position reading. Take `terms` from the config, ten at most. In an attended session say how many live searches this spends, one per term, and wait for a yes. For each term: `serp_rank_check` with `keyword: <term>`, `depth: 20`, and `location_code` set to `metro_location_code` when there is one; otherwise the country code, with the city kept in the keyword. `results` holds organic results in page order; this site's place is its position in that list, and absent means not found in the results read. Put each reading beside `site_place` for the same term in `.seo-genius/competitors.json`, with both dates. One reading moves from day to day. Call it a reading, never a trend.
5. Write `.seo-genius/reports/<date>.md` with these parts, in this order:
   - What changed: the logged changes from the briefing's Recent changes, each with its state as returned.
   - What moved: the readings from step 4 beside the earlier ones, and the Performance section as returned. State no cause. A position that moved after a change has not been shown to move because of it. How each change is measuring is in "What changed".
   - Waiting: fields and pages waiting on measurement, with their dates, and open pull requests.
   - Needs a decision: merged changes not recorded, pull requests declined in the last seven days, placeholders left in a draft, and anything this run skipped.
   - Next: the first open item in `.seo-genius/plan.md`, and that `/seo-genius:next` prepares it.
   - Research age: the dates of the research files. Older than 45 days: suggest running `/seo-genius:competitor-dive`, `/seo-genius:keyword-gap`, and `/seo-genius:content-plan` again.
6. Show the report in the reply.

## Output

- One line: site, domain, `can_write`.
- The report, in the order of step 5.
- Which changes were recorded in this run, with the pull request each came from.
- Where the report was saved, or that it was not.
- Closing line per rule 9, with the number of live calls spent.

## If something is missing

- Tools not available: run `/mcp`, choose `plugin:seo-genius:seo-genius`, authorize in the browser.
- A call is refused with "MCP scope required" or "MCP not in your plan": connecting Claude needs Pro or above. Upgrade in SEO Genius settings, then run `/mcp` again.
- No GitHub tool: leave the pull request part out, and say pull requests were not checked.
- `log_page_change` returns an error: say the change was not recorded, repeat the error, and list the change under "Needs a decision". Never claim it was recorded.
- No completed crawl: a change cannot be recorded against one. Say so and list it under "Needs a decision".
- No `terms` in the config, or no call budget: leave the position reading out and say so.
- `get_site_briefing` is not in the tool list: say the connected server does not offer it, and build the report from `list_page_changes` (`limit: 50`) and the pull requests alone.
- A live search returns an error: skip that term, keep the rest, name it, and repeat the error text.
- The write is refused with a message that the role is read-only: say so, and list the change under "Needs a decision".
- A call fails with a rate limit message: stop, say so, suggest retrying in a minute. A call fails with "quota_exceeded": the plan's monthly call quota is used. Stop and say so; waiting a minute will not help.

## Done when

- Every change shown carries its state as SEO Genius returned it.
- Every position reading shows its date, the location used, and the earlier reading beside it.
- No sentence says a change caused a movement.
- A merged change was recorded only on a yes, or under `unattended.log_merged_changes`, and never for an open or declined pull request.
- At most ten `serp_rank_check` calls, and none beyond the run's budget.
- The report was saved, or the reply says it was not. Nothing was committed, pushed, or edited.
