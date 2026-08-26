# Tradeoffs

- Local Cloud Tasks uses plaintext gRPC to Floci on `localhost:4588` because Floci exposes Cloud Tasks over the real gRPC wire protocol. Production still uses the standard `@google-cloud/tasks` client defaults with Google-managed TLS/auth, so the transport override is local-only.
- The API and task handler share one Cloud Run service. This removes duplicate deployment and runtime configuration, but they now scale together and a long transcription can consume capacity used by API requests.
