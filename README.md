# VALSEA transcription comparison

## Local development

Install the official Floci CLI once:

```bash
brew install floci-io/floci/floci
```

Then start the app normally:

```bash
bun run dev
```

`bun run dev` starts the Floci GCP emulator through `floci gcp start` before starting the workspace dev processes. The Floci CLI owns emulator lifecycle and readiness; use `bun run dev:cloud:stop` to stop it.
