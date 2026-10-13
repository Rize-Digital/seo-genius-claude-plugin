<!-- seo-genius:begin -->
## SEO Genius

This repository is a website connected to SEO Genius. Use the `seo-genius` MCP server for any SEO work on it.

1. Start every SEO session with `get_site_briefing`, before planning or making any change. Org-wide connections first call `list_sites` and pass `site` on every call.
2. Before you change a field on a page, call `check_change` for that page and field. A `block` verdict means wait; a `warn` means say why you are going ahead.
3. After a page change ships, call `log_page_change` with the reason. A change that is not logged cannot be measured. If it clears an open issue, show the issue and call `mark_issue_fixed` only after the user says yes.
4. `keyword_research`, `ranked_keywords`, `competitor_domains`, `serp_rank_check`, and `keyword_gap` spend the account's search-data quota. Say how many calls you will make and wait for a yes.
5. Every number you report comes from a tool result. Missing data is reported as missing.
6. If a write tool is refused because the account is read-only, give the change as text instead.

The SEO Genius skills were written for Claude Code. In Codex:

- `/seo-genius:<skill>` means the `$seo-genius:<skill>` skill, for example `$seo-genius:brief`.
- `/mcp` means `codex mcp login seo-genius`.
- `WebFetch` means whatever web fetch tool this session has.
<!-- seo-genius:end -->
