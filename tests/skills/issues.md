# Acceptance: /seo-genius:issues

## Smoke prompts (each confirmed action writes a real row; run only after the maintainer approves)
1. `/seo-genius:issues record that the driveway page has no FAQ section; two competitors' ranking pages have one`
2. "This issue is a false positive, dismiss it" naming an open issue.
3. "Raise the severity of the missing title issue on the homepage to high."
4. Prompt 1 on a read-only account.
5. Prompt 1 when an open issue already describes the same finding.
6. "Mark this issue as fixed."

## Expected tool sequence
Record: get_my_tenant -> list_sites -> list_issues (q, status open, limit 50) -> search_pages or list_pages -> list_crawls (limit 20) -> [confirm with user] -> create_issue
Correct: get_my_tenant -> list_sites -> list_issues (q or page_id) -> [confirm with user] -> update_issue
Dismiss: get_my_tenant -> list_sites -> list_issues (q or page_id) -> [ask for the reason, confirm] -> reject_issue

## Pass conditions
- [ ] Every write waits for a yes.
- [ ] Prompt 1: the open issues are searched first; create_issue carries crawl_id, issue_type, severity, description, and a reason that names the evidence.
- [ ] The severity is one of critical, high, medium, low.
- [ ] Prompt 2: reject_issue carries the reason in the user's words.
- [ ] Prompt 3: the reply shows the before and after, and update_issue sends only the fields that change.
- [ ] Prompt 4: no write, and the entry is returned as copyable text.
- [ ] Prompt 5: the existing issue is shown, and the reply offers to correct it instead.
- [ ] Prompt 6: the reply points to /seo-genius:log-change and writes nothing.
- [ ] A write error is reported as not saved, with the error text.

## Fail conditions
- A write without the user's confirmation.
- A duplicate issue created without the open issues being searched.
- A reason or piece of evidence that appears in no source.
- reject_issue called with no reason.
- mark_issue_fixed called from this skill.
- A write on a read-only account.
