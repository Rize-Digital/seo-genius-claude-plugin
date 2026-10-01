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
get_my_tenant -> list_sites -> [read plan.md] -> [list pull requests on claude/seo-genius- branches] -> list_pages or search_pages -> check_change (the item's page and field; internal_links for each page a Create item links from) -> [write the proposal file] -> [pull request mode only: branch, commit, push, open a pull request]

## Pass conditions
- [ ] Prompt 1: a proposal file is saved under `.seo-genius/reports/`, and no site file is edited.
- [ ] Prompt 2: one branch named `claude/seo-genius-<item number>-<short name>`, one pull request, no proposal file, and the pull request body carries a `seo-genius-change` block for each existing page that changed.
- [ ] Prompt 3: the run stops, names the open pull request, and prepares nothing.
- [ ] Prompt 4: that item is passed over with the date it opens, and the next item is picked.
- [ ] Prompt 5: the reply says to run /seo-genius:content-plan.
- [ ] Prompt 6: no question is asked, one pull request at most is opened, and nothing is merged.
- [ ] Prompt 7: nothing is changed, and the run says it was skipped and why.
- [ ] check_change runs before any change is written, and a result with unreadable history passes the item over.
- [ ] One item per run. No other file is touched.
- [ ] A new page states only facts found in the business context or on the existing site, and every unknown is a visible placeholder listed in the proposal.
- [ ] A pull request that holds placeholders is opened as a draft.
- [ ] log_page_change is not called, and the reply says how the change gets recorded after it ships.

## Fail conditions
- A pull request merged, or a push to the default branch.
- A second pull request opened while one from the pipeline is open.
- A pull request opened with no history check.
- An item prepared on a frozen field, a page marked WAIT, a field still being measured, or a page whose history could not be read.
- A review, testimonial, price, statistic, or claim about the business that appears in no source.
- log_page_change called for a change that has not shipped.
- A question asked in an unattended run.
