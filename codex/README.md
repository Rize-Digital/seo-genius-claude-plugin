# SEO Genius for Codex

The same skills as the Claude Code plugin, read from the same files, plus the SEO Genius MCP server. Codex installs this repository as a plugin marketplace directly.

## What you need

- An SEO Genius account on Pro or above. Connecting an LLM uses the `mcp` scope, which the Free plan does not include.
- The Codex CLI with the `codex plugin` and `codex mcp` commands.
- Node.js 18 or later for the pipeline skills (`start`, `competitor-dive`, `keyword-gap`, `content-plan`, `weekly`, `report`, `next`, `schedule`). They keep the site's plan and research in a local ledger through the plugin's `scripts/ledger.mjs`.

## Install

```text
codex plugin marketplace add Rize-Digital/seo-genius-claude-plugin
codex plugin add seo-genius@seo-genius-plugins
codex mcp login seo-genius
```

The login opens the SEO Genius sign-in in your browser. Pick the workspace to connect. Codex keeps the connection authorized.

Then add the block in [AGENTS.md](AGENTS.md) to the `AGENTS.md` at the root of your site's repository (create the file if there is none). It tells Codex to read the site briefing before any change, to check a field before editing it, to log every change it ships, and to ask before calls that spend your search-data quota.

## Use

Ask in plain words ("what's wrong with my homepage?") or name a skill:

```text
$seo-genius:brief
$seo-genius:audit
$seo-genius:page-check /services/
```

The skills, the research pipeline, and what each one costs are described in the [plugin README](../plugins/seo-genius/README.md). Where it says `/seo-genius:<skill>`, type `$seo-genius:<skill>` in Codex. Where it says `/mcp`, run `codex mcp login seo-genius`. Where a skill runs `node "${CLAUDE_PLUGIN_ROOT}/scripts/..."`, that is the plugin's installed folder; the AGENTS.md block says how to find it when the variable is not set.

## MCP server only

If you want the tools without the skills, skip the two `codex plugin` commands and add [config.toml](config.toml) to `~/.codex/config.toml` instead, then run `codex mcp login seo-genius`. Use one or the other: both define a server named `seo-genius`.

## Check the connection

```text
codex mcp list
```

`seo-genius` should show `enabled`, with `OAuth` in the Auth column. `Not logged in` there means the login did not finish: run `codex mcp login seo-genius` again. Then ask Codex to call `get_my_tenant`; it returns your workspace, plan, and whether this connection can write.

## Approvals and unattended runs

Codex asks before it calls an MCP tool unless the server marks that tool read-only. Tools that change data in SEO Genius (`log_page_change`, `mark_issue_fixed`, `create_issue`, `save_research`, `update_issue`, `reject_issue`, `update_business_context`, `trigger_crawl`, `save_plan_items`) and tools that spend search-data quota always ask.

`codex exec` has nobody to answer, so it refuses every call that would ask, with `MCP tool call requires approval, but approval policy is never`. In a non-interactive run, use the read-only skills (`brief`, `audit`, `page-check`, `history`), and run anything that writes or spends in an interactive session. The scheduled pipeline (`weekly`, `report`, `next`) syncs its plan with `save_plan_items`, so under `codex exec` it cannot finish; schedule it with Claude routines (`/seo-genius:schedule`), or run it by hand in an interactive Codex session.

## Updates

```text
codex plugin marketplace upgrade seo-genius-plugins
```

Then remove the plugin and add it again to pick up the new version. Codex keeps each installed version in its own folder, named by the version in `.codex-plugin/plugin.json`.
