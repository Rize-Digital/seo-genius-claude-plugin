# Changelog

## 1.3.0 (2026-10-01)

The pipeline on a schedule, and the last tools without a skill.

- New skill `next`: takes the next open item from the content plan, checks the page's history again, and writes the exact change as a proposal. On request, or when a scheduled run is set to allow it, it makes that one change on a branch and opens a pull request. One item per run, one open pull request at a time, and only pages it has checked: an item whose file is shared with other pages is written up for a person to apply. It never merges.
- New skill `report`: the weekly report of what changed, what moved, what is waiting, and what needs a decision. It records a change in SEO Genius once its pull request is merged, on a yes or when the schedule allows it. It claims no cause for a movement.
- New skill `schedule`: records what an unattended run may do in `.seo-genius/config.json`, copies the pipeline skills into the repository for cloud runs, and hands over the prompts to paste into a routine. It creates no routine itself. A cloud run keeps nothing it does not push, so its research files are merged by a person after each monthly run.
- New skill `sites`: every site in the workspace in one table, ordered by what needs attention first.
- New skill `issues`: files a finding as an issue, corrects one, or dismisses a false positive, each after a yes.
- `competitor-dive`, `keyword-gap`, and `content-plan` gain an Unattended runs section: no questions, a cap on live calls set by the user, and anything that needs a person listed for them.
- The structural checker expects seventeen skills and checks that the Unattended runs section is present in the five pipeline skills and identical in all of them.

## 1.2.0 (2026-10-01)

The research pipeline: four skills that run in order and hand their results to each other through files in a `.seo-genius/` folder.

- New skill `start`: one setup per site. Confirms the site, services, city, and up to ten search terms to compete on, and saves them to `.seo-genius/config.json`.
- New skill `competitor-dive`: finds the three businesses that hold the top organic results for those terms, reads the pages that rank, reads the site's own pages the same way, and reports what can be seen of why they rank, what the site is missing, and what to add. It states what it cannot see (map results, backlinks, Google Business Profile data, and structured data unless raw HTML was read).
- New skill `keyword-gap`: compares the ranking keywords of the site and its three competitors, removes brand and out-of-area terms, and groups the rest into topics where the site is missing or behind.
- New skill `content-plan`: turns the research into an ordered backlog of pages to create and pages to improve. It checks each existing page against its change history first, and a page whose last change is still being measured waits. An item whose history could not be fully read is set aside, not planned.
- New skill `history`: the logged changes to a page or the site, with dates, reasons, and who made them.
- Every pipeline step states the most live calls it can make and waits for a yes. The pipeline proposes and edits no page. The only thing it can change in SEO Genius is starting a crawl from `start`, on a yes.
- `brief`: small wording fixes on a block that carries two reasons, and on matching a page in the change index.
- The existing `competitors` skill is unchanged and stays the quick position check.

## 1.1.0 (2026-10-01)

- New skill `brief`: the site briefing in one read-only call (recent changes and their measurement status, fields frozen against a re-edit, pages that need attention, search performance, opportunities, what worked), with up to three next moves taken from it.
- `brief` also checks one edit before it is made and returns allow, warn, or block with the reasons and dates, so a field changed very recently is not changed again, an edit that would cut a measurement short is flagged, and a revert is caught. It only checks; it never edits a page.
- `log-change` runs the same check before it asks for confirmation and shows the result as a history note before you confirm. A shipped change is still logged.
- `log-change` records the pull request URL or commit SHA of an edit when one is given.
- The structural checker accepts mixed line endings on a Windows checkout.

## 1.0.2 (2026-09-24)

- Fix `log-change`: every call failed server validation. The skill now sends the typed fields `log_page_change` accepts, including the required `change_kind`, instead of the deprecated `changes_made` object and the unrecognized `change_reason` and `change_impact`.
- `log-change` declines to write an edit that no change kind covers (image alt text, for example) and returns it as text instead.

## 1.0.1 (2026-09-11)

- Version bump so installs from before the `page-check` fix receive it. A colon in its description kept the skill loader from registering the skill.

## 1.0.0 (2026-09-11)

- First release.
- Connects the SEO Genius MCP server (OAuth, no keys in the plugin).
- Six skills: audit, page-check, keywords, quick-wins, competitors, log-change.
