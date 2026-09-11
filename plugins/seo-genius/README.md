# SEO Genius for Claude Code

SEO audit, keyword research, rankings, competitor analysis, and quick wins for your website, from inside Claude Code. The plugin connects Claude to the SEO Genius memory layer: your crawled site data, open issues, tracked keywords, and business context, plus a log of every change you make so the next session starts where the last one stopped.

## What you need

- An SEO Genius account on Pro or above. Connecting an LLM uses the `mcp` scope, which the Free plan does not include.
- Claude Code with the `/plugin` command.

## Install

```text
/plugin marketplace add Rize-Digital/seo-genius-claude-plugin
/plugin install seo-genius@seo-genius-plugins
```

Then connect once:

```text
/mcp
```

Choose `seo-genius`, then Authenticate. Your browser opens the SEO Genius sign-in. Pick the workspace to connect. That is it; the connection stays authorized.

## Commands

| Command | What it does |
|---|---|
| `/seo-genius:audit` | Top five open issues with current and recommended values, plus the one fix to do first. |
| `/seo-genius:page-check <page>` | Everything wrong with one page, side by side with the recommended values. |
| `/seo-genius:keywords <terms>` | Local search volume, CPC, and competition for your terms, in one batched call. |
| `/seo-genius:quick-wins` | Three single-field fixes with paste-ready values, and the keywords within reach of page one. |
| `/seo-genius:competitors <terms>` | Your local ranking baseline, your organic rivals, and a live position check for named terms. |
| `/seo-genius:log-change <what you changed>` | Records a change you shipped, with the reason, so SEO Genius can measure it on the next crawl. |

You can also just ask in plain words ("what's wrong with my homepage?") and Claude picks the right skill.

## How the skills behave

- They confirm which site they are working on before doing anything.
- They read what SEO Genius already stores before making any live call, and they say when a call spends your Data-for-SEO quota.
- They target your metro, not the whole country.
- Every number comes from a tool result. Missing data is reported as missing, never guessed.
- Lists are capped and paginated; the reply says what was capped.
- The only write is `log-change`, and it asks for your confirmation first. Logging records that a change happened. It does not claim the change worked.

## Data and privacy

The plugin talks only to the SEO Genius server you authorized. It reads your site's crawl data, issues, keywords, and business context, and writes change-log entries when you ask it to. Live keyword and ranking calls are proxied by SEO Genius and count against your plan's quota.

## Using an API key instead

For headless or CI runs where a browser sign-in is not possible, register the server with a key from SEO Genius settings and skip the plugin's built-in connection:

```text
claude mcp add --transport http seo-genius https://api.seogenius.ai/api/mcp/v1 --header "Authorization: Bearer YOUR_API_KEY"
```

Register it under a different name from the plugin's own server entry, for example `seo-genius-key`, so the two do not collide. The skills call tools by their bare names and work under either registration. Use one connection at a time: two registrations of the same server in one session can shadow each other's tools.

## Troubleshooting

| You see | Do this |
|---|---|
| The commands exist but the tools are missing, or a 401 | Run `/mcp`, choose `seo-genius`, Authenticate. |
| 403 "MCP scope required" or "feature_locked" | Your plan does not include LLM connections. Upgrade to Pro or above, then run `/mcp` again. |
| "No sites in this workspace" | Add a site in the SEO Genius dashboard and run a crawl. |
| A rate-limit message | Wait a minute and try again. |
| A skill says data is missing | It is. The skill will not fill the gap with a guess. |

## Updating

```text
/plugin marketplace update seo-genius-plugins
```

## License

MIT. See LICENSE in the repository.
