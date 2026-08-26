# Tradeoffs

- The VM has no public IPv4 address. Standard GitHub-hosted runners cannot deploy to its IPv6 address directly, so SSH deployment needs a Cloudflare tunnel.
- Local development uses the remote R2 bucket instead of an emulator. This keeps storage behavior the same across environments, but local development needs network access and bucket credentials.
