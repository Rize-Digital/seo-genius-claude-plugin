# Acceptance: /seo-genius:audit

## Smoke prompts (run in a session with the plugin loaded and the server authorized)
1. `/seo-genius:audit` with no arguments.
2. `/seo-genius:audit <site name from list_sites>` on an org-scoped connection.
3. "What's my SEO like?" typed in plain words, no slash command.

## Expected tool sequence
get_my_tenant -> list_sites -> get_business_context -> list_crawls -> get_crawl -> list_issues (critical) -> list_issues (high) -> get_issue (only if a row lacks current or recommended value)

## Pass conditions
- [ ] The reply echoes the resolved site, its domain, and can_write before any finding.
- [ ] Five issues at most, each with a current value and a recommended value.
- [ ] Every issue is severity high or critical, unless the reply states that none exist at those levels.
- [ ] Exactly one first action, naming a page, a field, and a paste-ready value.
- [ ] The crawl line shows date and page count and never a count of issues from the crawl record.
- [ ] The reply states that lists were capped and that nothing was re-crawled.
- [ ] No page list, no raw JSON, no invented number.
- [ ] Prompt 3 triggers the skill without the slash command.

## Fail conditions
- A reply that shows a crawl issue count.
- A reply that calls search_recommendations.
- A reply that triggers a crawl on a site with a crawl inside 7 days.
