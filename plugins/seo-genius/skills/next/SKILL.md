---
name: next
description: Take the next item from the SEO Genius content plan and prepare it. Use for "do the next SEO item", "work on the plan", "what is next on my plan", or as the weekly step of a scheduled run. Picks the first open item in .seo-genius/plan.md, checks the page's change history again, and writes the exact change as a proposal. When the user asks for the change to be made, or a scheduled run is set to allow it, it makes that one change on a branch and opens a pull request. One item per run. It never merges and never touches a live site. Requires the SEO Genius MCP server, connected and authorized.
---

# SEO Genius: next plan item

One item from the plan, checked against the page's history, turned into an exact change. A proposal by default. A pull request when asked.

## When to use

"do the next SEO item", "work on the plan", "what is next on my plan". Also as the weekly step of a scheduled run, after `/seo-genius:report`.

## Requires

The SEO Genius MCP server, connected and authorized. If `get_my_tenant` is not available, stop and tell the user: run `/mcp`, choose `plugin:seo-genius:seo-genius`, and authorize in the browser.

For a pull request: the site's source in this repository, and a GitHub tool in the session (the `gh` command or a GitHub connector).

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

- Reads `.seo-genius/config.json` and `.seo-genius/plan.md`.
- Writes `.seo-genius/reports/<date>-next.md`, the proposal.
- In pull request mode it also edits or adds the site files for one item, on a branch.
- Writes nothing to SEO Genius. A change is recorded after it ships, by `/seo-genius:log-change` or by `/seo-genius:report`.

## Unattended runs

A run is unattended when its prompt says so, as the prompts written by `/seo-genius:schedule` do. Nobody is there to answer a question.

- Read `unattended` in `.seo-genius/config.json`. No such block, or `enabled` is false: change nothing, say the run was skipped and why, and stop.
- Take the site from `site_id` in the config. Do not ask which site. If that site is not in `list_sites`, stop and say so.
- Never ask a question and never wait for a yes. Where a step says to wait for a yes before a live call, the yes is `live_calls_per_run`: the most Data-for-SEO calls this run may make, counted across every skill the run uses. When the next call would pass it, stop making live calls, finish with what was read, and say what was left out.
- Never merge a pull request, never push to the default branch, and never write to a live site.
- Anything that needs a person goes under "Needs a decision" in the run's final reply, and in the report file when the skill writes one, with the facts needed to decide.

In an attended session none of this applies. Ask as the procedure says.

## Procedure

1. Resolve the site (rule 1). Echo site, domain, `can_write`.
2. Read `.seo-genius/plan.md`. No plan: stop and say to run `/seo-genius:content-plan`. Note the plan's date. Older than 45 days: say so; in an attended session ask before going on, and in an unattended run note it in the report and go on.
3. One open change at a time. With the session's GitHub tool, list this repository's pull requests whose branch starts with `claude/seo-genius-`.
   - One is open: stop. Name it, and say the next item waits until a person merges or closes it.
   - Closed without merging: that item was declined. Skip it.
   - No GitHub tool: say the pull requests could not be checked, and go on in proposal mode only.
4. Pick the item: the first under "This month", then under "Later", that was not declined and is not already done. A Create item is done when its URL path appears in `list_pages` or its file exists in the repository. An Improve item is done when `recent` in the step 5 result shows a change to that field dated after the plan.
5. Check the history again. The plan may be weeks old. `check_change` with the page's `page_id` (find it with `list_pages` or `search_pages`, rule 7), the `change_kind`, and `proposed_value` when the item carries an exact value. When neither finds the page, pass its full URL as `page_url` instead. For a Create item, check each existing page it adds a link on, with `change_kind: internal_links`. Read the result in this order:
   - `coach_history_not_readable` is not empty: part of this site's change history could not be read, so the verdict may be missing a recent change. Pass over the item and note "history could not be read".
   - `page_verdict.verdict` is WAIT: the item waits until `page_verdict.until`.
   - `block` with `would_revert`, alone or beside `frozen`: it is dropped. It would undo an earlier change, and it is still a revert after any unfreeze date.
   - `block` with `frozen` only: it waits until `unfreezes_on`.
   - `warn` with `pending_measurement`: it waits until the closing date given in that reason's `message`.
   - `allow`, or `warn` with only `recently_changed_other_kind`: go on, and keep the reason for the proposal.
   - The call fails: pass over the item and note that its history was not checked.
   An item that waits, is dropped, or is passed over is noted with its date or reason, and the next item is picked. Three in a row: stop and report that the plan is waiting. That is a normal result, not a failure.
6. Write the change. One item, and nothing else in the same run.
   - Improve: find the file in this repository that produces the page (search for the URL path, the title, the H1). State the exact before and after for the field. If the file cannot be found with confidence, or the site is not in this repository, the item becomes a written brief with the exact values, to be applied by hand.
   - Create: draft the page in the pattern of the site's existing pages of that type, with the same layout, components, and metadata fields. The content follows the plan's sections. Use only facts found in the business context and on the site's existing pages. Where a fact is needed and not known (a price, a licence number, a detail of the service), leave a visible placeholder and list it. Never invent a review, a testimonial, a statistic, or a claim about the business.
7. Deliver it.
   - Proposal, the default: save `.seo-genius/reports/<date>-next.md` with the item, the file, the before and after or the full draft, the history check, and the placeholders to fill. Edit no site file.
   - Pull request: only when the user asked in this session for the change to be made, or the run is unattended and `unattended.mode` is `pr`. Create a branch named `claude/seo-genius-<item number>-<short name>`, commit the files for this one item, push the branch, and open a pull request. Open it as a draft when it holds placeholders. The body states the item, its evidence from the plan, the history check, the placeholders, and one block per existing page that changed, so the change can be recorded after the merge:

     ```seo-genius-change
     page_url: <full URL of the page>
     change_kind: <one of title, meta_description, h1, canonical, schema, internal_links, redirect, content_depth, readability>
     old_value: <the exact before>
     new_value: <the exact after, or a short description for page copy>
     added_links: <for internal_links, the URLs added>
     anchor_text: <for internal_links, the anchor text>
     reason: <one or two sentences>
     ```

     A new page gets no block of its own. SEO Genius has no change kind for it; it enters the record on the next crawl. The links added to existing pages do get a block each.
   - In pull request mode no proposal file is written. The pull request body carries the same content.
   - Never merge the pull request. Never push to the default branch.
8. Do not call `log_page_change`. Nothing has shipped yet. Once the change is live, `/seo-genius:log-change` records it, or `/seo-genius:report` does on its next run.

## Output

- One line: site, domain, `can_write`.
- The item that was picked, and the items passed over with the date or reason for each.
- The history check: the verdict and its reasons.
- The change: the file, the before and after, or the draft, and the placeholders.
- What was delivered: the proposal file, or the pull request and its branch.
- That nothing was logged, and how it gets logged after it ships.
- Closing line per rule 9.

## If something is missing

- Tools not available: run `/mcp`, choose `plugin:seo-genius:seo-genius`, authorize in the browser.
- 403 with "MCP scope required" or `feature_locked`: connecting Claude needs Pro or above. Upgrade in SEO Genius settings, then run `/mcp` again.
- `check_change` is not in the tool list: deliver a proposal only, marked "history not checked". Never open a pull request without the check.
- The push or the pull request fails: keep the proposal file, say what failed, and stop. Do not retry on another branch.
- Every item is done, declined, or waiting: say so, and suggest `/seo-genius:competitor-dive` when the research is more than 45 days old.
- Rate limited (429): stop, say so, suggest retrying in a minute.

## Done when

- At most one item was prepared, and at most one pull request was opened.
- No pull request was opened while another from this pipeline was open, and none was opened without a history check.
- The item's history was read in full. Its field is not frozen, its page is not marked WAIT, and its last change is not still being measured.
- A new page states only facts from the business context or the existing site, with every unknown shown as a placeholder.
- Nothing was merged, nothing was pushed to the default branch, and nothing was written to SEO Genius.
