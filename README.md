# Valsea

Valsea compares audio transcriptions from VALSEA, Gemini 3.5 Transcribe, and Qwen3-ASR-1.7B on Modal. The repository contains a TanStack Start web application, an Elysia server, shared authentication and database packages, and the Cloudflare web deployment definition.

## Requirements

- Bun 1.4 or later
- Docker with Docker Compose

## Local development

```bash
bun install
cp apps/server/.env.example apps/server/.env
cp apps/web/.env.example apps/web/.env
bun run db:push
bun run dev
```

The API listens on `http://localhost:8001`. The web application listens on `http://localhost:3001`.

Production web application: https://app-valsea.rutam.dpdns.org

Modal Qwen transcription endpoint: https://rutambhagat-valsea--qwen3-asr-qwenasr-transcribe.modal.run

The endpoint requires a Modal proxy token in the `Authorization: Bearer $MODAL_PROXY_TOKEN` header.

Required server variables are documented in `apps/server/.env.example`. Keep all provider credentials in the server environment. The browser must not receive them.

## API documentation

- Local OpenAPI UI: `http://localhost:8001/openapi`
- Production OpenAPI UI: https://valsea.rutam.dpdns.org/openapi
- Production OpenAPI JSON: https://valsea.rutam.dpdns.org/openapi/json

## Production deployment

The server runs as an ARM64 Docker container on the OCI `a1` VM. Cloudflare sends proxied traffic for `valsea.rutam.dpdns.org` to the VM's reserved public IP. Kamal 2 and `kamal-proxy` provide deployment, origin TLS, health checks, and gapless container replacement. SQLite data stays in `/var/lib/valsea`.

`.github/workflows/deploy-server.yml` performs these operations:

1. Run the repository checks.
2. Build a `linux/arm64` image with the immutable Git commit SHA.
3. Push the image to `ghcr.io/rutambhagat/valsea`.
4. Connect to `a1` through Tailscale.
5. Run `kamal deploy --skip-push --version "$GITHUB_SHA"`.

The deploy job uses the `production` environment. Configure the application variables from `apps/server/.env.example` and these deployment secrets in that environment:

- `A1_SSH_KNOWN_HOSTS`
- `CLOUDFLARE_ORIGIN_CERTIFICATE`
- `CLOUDFLARE_ORIGIN_PRIVATE_KEY`
- `TS_OAUTH_CLIENT_ID`
- `TS_AUDIENCE`

The workflow uses its short-lived `GITHUB_TOKEN` for GHCR. The Tailscale OAuth client must permit the `tag:ci` device tag. The tailnet policy must permit `tag:ci` to reach `a1` on TCP port 22.

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

## Benchmark

The benchmark uses a versioned manifest of 10 fixed Mandarin-English code-switched utterances from MERaLiON's `Multitask-National-Speech-Corpus-v1` `ASR-PART4-Test` configuration. It scores Mixed Error Rate (Mandarin characters + English words) and p50/p95 provider-request latency.

With the provider credentials already configured in `apps/server/.env`:

```bash
cd apps/qwen-modal
uv run python scripts/benchmark.py --sample-count 5
```

Set `--sample-count` to an integer from 1 through 10. If you omit it, the command uses the first 5 samples. Selection always follows manifest order.

The command validates the selected samples against row metadata, WAV duration, and SHA-256, calls VALSEA, Modal/Qwen, and Gemini directly, and writes `benchmark_result.json`. The result includes the manifest version and selected sample IDs. VALSEA uses `language=english` with correction/tags disabled so the benchmark is reproducible on the Free plan; Qwen and Gemini receive no language hint, and Gemini runs in verbatim mode. Gemini requests are paced 21 seconds apart; that pacing time is excluded from latency.

Observed benchmark result from the latest run:

| Provider              |  MER ↓ | p50 latency | p95 latency |
| --------------------- | -----: | ----------: | ----------: |
| VALSEA                |  45.0% |      9.13 s |     10.85 s |
| Qwen3-ASR-1.7B        |  49.9% |      5.65 s |     13.38 s |
| Gemini 3.5 Transcribe | 48.95% |      6.21 s |      7.98 s |

On this fixed MERaLiON code-switch benchmark, VALSEA currently has the lowest transcription error rate, while Qwen has the lowest median provider-request latency.

Google documents Gemini API rate limits as **per project, not per API key**, across RPM/TPM/RPD dimensions; exceeding any active limit returns a rate-limit error. In the AI Studio project inspected during development, `gemini-3.5-transcribe` showed limits of **3 RPM, 10K TPM, and 25 RPD**. The benchmark API key may belong to a different project/account, so those numbers are an observed reference rather than a guarantee for the key used to reproduce the run. A project with prior transcription traffic can therefore return HTTP 429 during the benchmark even when the request itself is valid. Check the active limits for the API key's project in Google AI Studio and rerun after the quota window clears rather than treating a quota 429 as an ASR failure. See [Gemini API rate limits](https://ai.google.dev/gemini-api/docs/rate-limits).
