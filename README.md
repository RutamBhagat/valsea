# Valsea

Valsea compares audio transcriptions from VALSEA, Cloudflare Workers AI Whisper Large V3 Turbo, and Qwen3-ASR-1.7B on Modal. The repository contains a TanStack Start web application, an Elysia server, shared authentication and database packages, and the Cloudflare web deployment definition.

## Requirements

- Bun 1.4 or later
- Docker with Docker Compose
- A Cloudflare R2 bucket

## Local development

```bash
bun install
cp apps/server/.env.example apps/server/.env
cp apps/web/.env.example apps/web/.env
bun run db:push
bun run dev
```

The API listens on `http://localhost:3000`. The web application listens on `http://localhost:3001`.

Production web application: https://app-valsea.rutam.dpdns.org

Required server variables are documented in `apps/server/.env.example`. Keep all provider credentials in the server environment. The browser must not receive them.

## API documentation

- Local OpenAPI UI: `http://localhost:3000/openapi`
- Production OpenAPI UI: https://valsea.rutam.dpdns.org/openapi
- Production OpenAPI JSON: https://valsea.rutam.dpdns.org/openapi/json

## Production deployment

The server runs as an ARM64 Docker container on the OCI `a1` VM. OCI Load Balancer terminates TLS and routes `valsea.rutam.dpdns.org` to port `8001` on the VM. Cloudflare provides proxied DNS for that hostname.

Provision `/opt/valsea/server.env` on `a1` before the first deployment. Use these production origins:

```env
BETTER_AUTH_URL=https://valsea.rutam.dpdns.org
CORS_ORIGIN=<deployed-web-origin>
```

`.github/workflows/deploy-server.yml` performs these operations:

1. Run the repository checks and build.
2. Build the ARM64 server image on a native ARM GitHub runner.
3. connect to `a1` through Tailscale.
4. Transfer the image and Compose file over SSH.
5. Replace the running container and verify `http://127.0.0.1:8001/`.
6. Restore the previous image if the health check fails.

Configure the GitHub `production` environment with:

- `OCI_USER`
- `TS_OAUTH_CLIENT_ID`
- `TS_AUDIENCE`

The Tailscale OAuth client must permit the `tag:ci` device tag. The tailnet policy must permit `tag:ci` to reach `a1` on TCP port 22.

## Web deployment

The Cloudflare web deployment remains in `packages/infra/alchemy.run.ts` and does not provision OCI resources:

```bash
VITE_SERVER_URL=https://valsea.rutam.dpdns.org bun run deploy
```

## Checks

```bash
bun run check
bun run build
```
