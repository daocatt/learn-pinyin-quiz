# Agent Workspace Guidelines

## Cloudflare Multi-Account Support (wrangler-a / wrangler-b)
This environment supports multiple Cloudflare accounts through isolated home directories:
- **`wrangler-a`**: Maps to `HOME=~/.wrangler-a npx wrangler` (Cloudflare Account A)
- **`wrangler-b`**: Maps to `HOME=~/.wrangler-b npx wrangler` (Cloudflare Account B)

When running commands via non-interactive shells (where zsh aliases are not automatically loaded), always run with the corresponding HOME prefix:
- For `wrangler-b ...`: use `HOME="$HOME/.wrangler-b" npx wrangler ...` (or run in interactive shell `zsh -i -c 'wrangler-b ...'`)
- For `wrangler-a ...`: use `HOME="$HOME/.wrangler-a" npx wrangler ...`
