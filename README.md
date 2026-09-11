# seo-genius-claude-plugin

The Claude Code plugin for [SEO Genius](https://seogenius.ai). This repository is also its own plugin marketplace, so you can install from here today.

```text
/plugin marketplace add Rize-Digital/seo-genius-claude-plugin
/plugin install seo-genius@seo-genius-plugins
```

Full instructions, commands, and troubleshooting: [plugins/seo-genius/README.md](plugins/seo-genius/README.md).

## Layout

```text
.claude-plugin/marketplace.json   the marketplace config file
plugins/seo-genius/               the plugin: config, MCP server, six skills, README
scripts/check.mjs                 structural checks (node scripts/check.mjs)
tests/skills/                     acceptance checklists per skill
```

## Development

```text
node scripts/check.mjs
claude plugin validate plugins/seo-genius --strict
claude --plugin-dir plugins/seo-genius
```

Issues and pull requests are welcome. Skill text is customer-facing copy and is reviewed before release.

## License

MIT
