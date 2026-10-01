# Acceptance: /seo-genius:next

## Smoke prompts (run in a site repository that has `.seo-genius/plan.md`; a pull request is opened only on prompts 2 and 6)
1. `/seo-genius:next`
2. "Do the next SEO item and open a pull request for it."
3. `/seo-genius:next` while a pull request on a `claude/seo-genius-` branch is open.
4. `/seo-genius:next` when the first plan item is on a page whose title was logged a few days ago.
5. `/seo-genius:next` in a folder with no plan.
6. An unattended run with `unattended.mode` set to `pr`.
7. An unattended run with no `unattended` block in the config.

## Expected tool sequence
get_my_tenant -> list_sites -> [read plan.md] -> [list this pipeline's pull requests: branch prefix claude/seo-genius-, or a seo-genius-item block in the body] -> list_pages or search_pages -> check_change (the item's page and field; internal_links for each page a Create item links from) -> [write the proposal file] -> [pull request mode only: check for uncommitted changes, fetch, branch from the default branch, write the files, stage by path, commit, push, open the pull request, switch back]

## Pass conditions
- [ ] Prompt 1: a proposal file is saved under `.seo-genius/reports/`, and no site file is edited.
- [ ] Prompt 2: one branch named `claude/seo-genius-<short name>` cut from the up-to-date default branch, one pull request, no proposal file. The body starts with a `seo-genius-item` block and carries a `seo-genius-change` block for each existing page that changed.
- [ ] Prompt 2: only this item's files are staged, and the run ends on the branch it started on.
- [ ] An item whose pull request was merged is skipped when it asks for the value that pull request set, and one that was closed without merging is skipped, each matched by page and change kind, not by item number.
- [ ] A plan item that asks for a different value on a page and field an earlier pull request changed is not skipped. It goes to the history check.
- [ ] In a run that may open a pull request, an item that becomes a brief is listed under "Needs a decision" and the next item is picked.
- [ ] No site file is written before the uncommitted-changes check and the new branch.
- [ ] An item whose file also produces other pages (a template, layout, component, data file, menu, footer, sitemap) is delivered as a written brief, not edited.
- [ ] A file with uncommitted changes that the item would touch turns the delivery into a proposal.
- [ ] Prompt 3: the run stops, names the open pull request, and prepares nothing.
- [ ] Prompt 4: that item is passed over with the date it opens, and the next item is picked.
- [ ] Prompt 5: the reply says to run /seo-genius:content-plan.
- [ ] Prompt 6: no question is asked, one pull request at most is opened, and nothing is merged.
- [ ] An unattended run whose prompt asks for a pull request, with `unattended.mode` set to `report`, delivers a proposal.
- [ ] Prompt 7: nothing is changed, and the run says it was skipped and why.
- [ ] A run started by a routine or a scheduled task whose prompt lacks "Unattended run." is still treated as unattended.
- [ ] check_change runs before any change is written, and a result with unreadable history passes the item over.
- [ ] One item per run. No other file is touched.
- [ ] A new page states only facts found in the business context or on the existing site, and every unknown is a visible placeholder listed in the proposal.
- [ ] A pull request that holds placeholders is opened as a draft.
- [ ] log_page_change is not called, and the reply says how the change gets recorded after it ships.

## Fail conditions
- A pull request merged, or a push to the default branch.
- A second pull request opened while one from the pipeline is open.
- A pull request opened with no history check, or because the run's prompt asked for one.
- A shared file edited, or a page changed that was not checked.
- A branch cut from a branch other than the up-to-date default branch.
- An item prepared on a frozen field, a page marked WAIT, a field still being measured, or a page whose history could not be read.
- A review, testimonial, price, statistic, or claim about the business that appears in no source.
- log_page_change called for a change that has not shipped.
- A question asked in an unattended run.
