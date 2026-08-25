# Tradeoffs

- Local Cloud Tasks uses plaintext gRPC to Floci on `localhost:4588` because Floci exposes Cloud Tasks over the real gRPC wire protocol. Production still uses the standard `@google-cloud/tasks` client defaults with Google-managed TLS/auth, so the transport override is local-only.
