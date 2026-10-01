# Changelog

## 1.1.0 (2026-10-01)

- New skill `brief`: the site briefing in one read-only call (recent changes and their measurement status, fields frozen against a re-edit, pages that need attention, search performance, opportunities, what worked), with up to three next moves taken from it.
- `brief` also checks one edit before it is made and returns allow, warn, or block with the reasons and dates, so a field still being measured is not changed again and a revert is caught.
- `log-change` runs the same check before it asks for confirmation and adds the result to the entry as a history note. A shipped change is still logged.
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
