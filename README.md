# VALSEA transcription comparison

## Local development

Install the official Floci CLI once:

```bash
brew install floci-io/floci/floci
```

Copy the server environment and start the app:

```bash
cp apps/server/.env.example apps/server/.env
bun run dev
```

`bun run dev` starts Floci for local GCS. Use `bun run dev:cloud:stop` to stop it. SQLite data is stored in `.data/valsea.sqlite`.

## Production infrastructure

The backend runs on one Compute Engine `e2-micro` VM. Pulumi creates:

- One 30 GB boot disk for the OS, SQLite, Docker, and 2 GB swap.
- An IPv6-only subnet and external IPv6 address. It does not assign a public IPv4 address.
- An IPv6 SSH firewall rule. The app only listens on VM localhost until a tunnel is added.
- A GCS audio bucket and VM service account.

Configure Pulumi with the SSH public key that matches the CI private key:

```bash
cd packages/infra
pulumi stack init dev
pulumi config set gcp:project "$GCP_PROJECT_ID"
pulumi config set gcp:region us-west1
pulumi config set sshUsername deploy
pulumi config set sshPublicKey "$(cat ~/.ssh/oci-eu-frankfurt.pub)"
pulumi up
```

Limit SSH to a known IPv6 CIDR when possible:

```bash
pulumi config set --path 'sshSourceRanges[0]' '2001:db8::1/128'
```

The `serverIpv6` Pulumi output is the VM external IPv6 address. Add the Cloudflare Tunnel separately and target `http://localhost:3000`.

## CI deployment

The server workflow builds the Docker image in GitHub Actions, streams it to the VM through SSH, and recreates the Compose services. It does not use an image registry or retain rollback images.

Set these GitHub Actions secrets:

- `VM_HOST`: an SSH endpoint that can reach the VM.
- `VM_SSH_PRIVATE_KEY`: the private key for the configured SSH public key.
- `PRODUCTION_ENV`: the complete production environment file.

Set the optional `VM_USER` repository variable when the SSH user is not `deploy`.

GitHub-hosted runners do not provide direct IPv6 connectivity. Set `VM_HOST` to the SSH subdomain after you add it. A Cloudflare-proxied SSH hostname also requires a `cloudflared` SSH proxy configuration in CI; a subdomain alone does not proxy port 22.

Use this structure for `PRODUCTION_ENV`:

```dotenv
NODE_ENV=production
BETTER_AUTH_SECRET=replace-with-at-least-32-characters
BETTER_AUTH_URL=https://api.example.com
CORS_ORIGIN=https://app.example.com
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
VALSEA_API_KEY=
GCP_PROJECT_ID=
GCP_REGION=us-west1
GCS_AUDIO_BUCKET=
```

Get `GCS_AUDIO_BUCKET` from the Pulumi `audioBucketName` output.
