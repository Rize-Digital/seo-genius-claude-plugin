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
- Writes `.seo-genius/reports/<date>-next.md`, the proposal. In a scheduled cloud run that file stays in the run's session. It is not kept in the repository.
- In pull request mode it also edits or adds the site files for one item, on a branch.
- Writes nothing to SEO Genius. A change is recorded after it ships, by `/seo-genius:log-change` or by `/seo-genius:report`.

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
2. Read `.seo-genius/plan.md`. No plan: stop and say to run `/seo-genius:content-plan`. Note the plan's date. Older than 45 days: say so; in an attended session ask before going on, and in an unattended run note it in the reply and go on.
3. One open change at a time. With the session's GitHub tool, list this repository's pull requests from this pipeline: those whose branch starts with `claude/seo-genius-`, and those whose body holds a `seo-genius-item` block. Match each one to a plan item by the `page` and `change_kind` in that block, never by item number. The plan is renumbered each time it is rebuilt.
   - One is open: stop. Name it, and say the next item waits until a person merges or closes it.
   - Merged: the change that pull request made is done. `/seo-genius:report` records it, or lists it for a person to record. A merged pull request settles only the change it made. The plan item is done when it asks for the value the pull request already set (its `new_value`), or when it names no exact value and the plan is older than the merge. A plan item that asks for the value the pull request replaced (its `old_value`) is a revert: drop it. Any other item on that page and field is a later revision: it goes on to step 5, which also checks that the merge was recorded.
   - Closed without merging: that item was declined. Skip it.
   - No GitHub tool: say the pull requests could not be checked, and go on in proposal mode only.
4. Pick the item: the first under "This month", then under "Later", that is not done and was not declined. A Create item is also done when its URL path appears in `list_pages` or its file exists in the repository. An Improve item is also done when `recent` in the step 5 result shows a change to that field dated after the plan.
5. Check the history again. The plan may be weeks old. `check_change` with the page's `page_id` (find it with `list_pages` or `search_pages`, rule 7), the `change_kind`, and `proposed_value` when the item carries an exact value. When neither finds the page, pass its full URL as `page_url` instead. For a Create item, check each existing page it adds a link on, with `change_kind: internal_links`. Read the result in this order:
   - Step 3 found a merged pull request from this pipeline on this page and field, and no row in `recent` carries that pull request's URL as `source_ref`: the merge is not recorded in SEO Genius, so this check cannot see it. The item waits. List it under "Needs a decision", naming the pull request that has to be recorded first.
   - `coach_history_not_readable` is not empty: part of this site's change history could not be read, so the verdict may be missing a recent change. Pass over the item and note "history could not be read".
   - `page_verdict.verdict` is WAIT: the item waits until `page_verdict.until`.
   - `block` with `would_revert`, alone or beside `frozen`: it is dropped. It would undo an earlier change, and it is still a revert after any unfreeze date.
   - `block` with `frozen` only: it waits until `unfreezes_on`.
   - `warn` with `pending_measurement`: it waits until the closing date given in that reason's `message`.
   - `allow`, or `warn` with only `recently_changed_other_kind`: go on, and keep the reason for the proposal.
   - The call fails: pass over the item and note that its history was not checked.
   An item that waits, is dropped, or is passed over is noted with its date or reason, and the next item is picked. Three in a row: stop and report that the plan is waiting. That is a normal result, not a failure. For a Create item, a linking page that waits, is dropped, or is passed over is left off the link list; the item itself goes on.
6. Work out the change. Write no site file yet; step 7 does that. One change, and nothing else in the same run. Only pages checked in step 5 may change.
   - If the file already holds what the item asks for, the item is done. Note it and pick the next item.
   - Improve: find the file in this repository that produces the page (search for the URL path, the title, the H1). State the exact before and after for the field.
   - Create: draft the page in the pattern of the site's existing pages of that type, with the same layout, components, and metadata fields. The content follows the plan's sections. Use only facts found in the business context and on the site's existing pages. Where a fact is needed and not known (a price, a licence number, a detail of the service), leave a visible placeholder and list it. Never invent a review, a testimonial, a statistic, or a claim about the business. Add links to the new page only on the pages checked in step 5.
   - A shared file is off limits. If the file to edit also produces other pages (a template, a layout, a component, a data file, a menu, a footer, a sitemap), editing it would change pages that were not checked. The item becomes a written brief, with the exact values and the file named, for a person to apply.
   - The item also becomes a written brief when the file cannot be found with confidence, or the site is not in this repository.
   - A brief is never a pull request. In a proposal run the brief is the proposal, and the run ends there.
   - In a run that may open a pull request, a brief does not hold up the plan. List it under "Needs a decision" with its exact values, write no proposal file for it, and pick the next item. Briefs count toward the three-in-a-row limit of step 5 together with items that wait; when the limit is reached, stop and report what is waiting and what needs a person.
7. Deliver it.
   - Proposal, the default: save `.seo-genius/reports/<date>-next.md` with the item, the file, the before and after or the full draft, the history check, and the placeholders to fill. Edit no site file. The same item is proposed on every run until a person applies it and records it with `/seo-genius:log-change`.
   - Pull request, in an attended session: only when the user asked in this session for the change to be made.
   - Pull request, in an unattended run: only when `unattended.mode` is `pr`. A request for a pull request in the run's prompt does not count.
   - To open the pull request:
     1. Before writing any site file, check the files this item will touch. If one has uncommitted changes, stop and deliver a proposal instead.
     2. Fetch, and create a branch named `claude/seo-genius-<short name of the page and field>` from the up-to-date default branch, not from whatever is checked out.
     3. Write this item's files on that branch.
     4. Stage only those files, by path. Commit them, push the branch, and open the pull request. Open it as a draft when it holds placeholders.
     5. Switch back to the branch the run started on.
   - The pull request body starts with this block, which is how later runs recognize the pull request and match it to a plan item:

     ```seo-genius-item
     action: <create or improve>
     page: <the URL path of the page>
     change_kind: <the field, for improve; none for a new page>
     ```

     Then the item's evidence from the plan, the history check, and the placeholders. Then one block per existing page that changed, so the change can be recorded after the merge:

     ```seo-genius-change
     page_url: <full URL of the page>
     change_kind: <one of title, meta_description, h1, canonical, schema, internal_links, redirect, content_depth, readability>
     old_value: <the exact before>
     new_value: <the exact after, or a short description for page copy>
     added_links: <for internal_links, the URLs added>
     anchor_text: <for internal_links, the anchor text>
     reason: <one or two sentences>
     ```

     A new page gets no `seo-genius-change` block of its own. SEO Genius has no change kind for it; it enters the record on the next crawl. The links added to existing pages do get a block each.
   - In pull request mode no proposal file is written. The pull request body carries the same content.
   - Never merge the pull request. Never push to the default branch.
8. Do not call `log_page_change`. Nothing has shipped yet. Once the change is live, `/seo-genius:log-change` records it, or `/seo-genius:report` does on its next run.

## Output

- One line: site, domain, `can_write`.
- The item that was picked, and the items passed over with the date or reason for each.
- The history check: the verdict and its reasons.
- The change: the file, the before and after, or the draft, and the placeholders. For a brief, why it could not be made here.
- What was delivered: the proposal file, or the pull request and its branch.
- That nothing was logged, and how it gets logged after it ships.
- Closing line per rule 9.

## If something is missing

- Tools not available: run `/mcp`, choose `plugin:seo-genius:seo-genius`, authorize in the browser.
- A call is refused with "MCP scope required" or "MCP not in your plan": connecting Claude needs Pro or above. Upgrade in SEO Genius settings, then run `/mcp` again.
- `check_change` is not in the tool list: deliver a proposal only, marked "history not checked". Never open a pull request without the check.
- The push or the pull request fails: commit this run's edits on the item branch so they do not follow the run back, write the proposal file, say what failed, switch back to the starting branch, and stop. Do not retry on another branch.
- Every item is done, declined, or waiting: say so, and suggest `/seo-genius:competitor-dive` when the research is more than 45 days old.
- A call fails with a rate limit message: stop, say so, suggest retrying in a minute. A call fails with "quota_exceeded": the plan's monthly call quota is used. Stop and say so; waiting a minute will not help.

## Done when

- At most one change was delivered, and at most one pull request was opened. In a run that may open a pull request, briefs met on the way were listed under "Needs a decision", not written as a proposal file.
- No item was prepared on a page and field whose merged pull request is still unrecorded, and none that asks for a value a merged pull request replaced.
- No pull request was opened while another from this pipeline was open, none was opened without a history check, and none was opened on the strength of the run's prompt.
- The item's history was read in full. Its field is not frozen, its page is not marked WAIT, and its last change is not still being measured.
- Every page the change touches was checked in step 5. No shared file was edited.
- The branch was cut from the up-to-date default branch, it holds only this item's files, and the run ended on the branch it started on.
- A new page states only facts from the business context or the existing site, with every unknown shown as a placeholder.
- Nothing was merged, nothing was pushed to the default branch, and nothing was written to SEO Genius.
