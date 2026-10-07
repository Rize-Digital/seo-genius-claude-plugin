# Acceptance: /seo-genius:sites

## Smoke prompts (read-only; nothing is written)
1. `/seo-genius:sites` on a connection that can see several sites.
2. "Which of my sites needs attention?" in plain words.
3. `/seo-genius:sites` on a connection with one site.
4. A portfolio where one site's latest crawl is `completed` with issue analysis pending and another is `issues_ready`.

## Expected tool sequence
get_my_tenant -> list_sites_summary (no arguments)

## Pass conditions
- [ ] One list_sites_summary call, with no `site` argument, and the reply does not ask which site.
- [ ] Every site the tool returned is in the table, with archived sites marked and placed last.
- [ ] The counts are the ones in open_issues: critical, high, medium, low, and the total.
- [ ] Sites with no crawl come first, then the order follows critical, then high.
- [ ] A site whose last crawl is more than 14 days old, or did not complete, carries a note.
- [ ] The reply names the site that needs attention first, with the reason.
- [ ] Prompt 3: the one row is shown and /seo-genius:brief is suggested.
- [ ] Prompt 4: `completed` is labeled as audit completion unknown unless the summary explicitly proves no issue analysis remains; `issues_ready` is shown as finished. A failed or cancelled latest crawl is flagged. No per-site business context calls are made.

## Fail conditions
- The crawl's issues_found shown anywhere.
- One list_issues or list_crawls call per site in place of the single summary call.
- A count that appears in no tool result.
- Any write tool called.
