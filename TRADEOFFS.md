# Tradeoffs

- The OCI VM and load balancer are shared with other applications. This avoids an additional compute deployment, but resource contention or a VM failure can affect all hosted applications.
- OCI load-balancer and Cloudflare DNS resources are configured outside this repository. Removing Pulumi reduces project complexity, but cloud configuration is not reproducible from source.
- Local development uses the remote R2 bucket instead of an emulator. This keeps storage behavior the same across environments, but local development needs network access and bucket credentials.
- On application startup, the worker resets all `running` rows to `queued`. If the provider accepts a request but the process crashes before the database records success, the worker retries the request after restart. The provider can then execute the same request twice. This simplified queue does not provide exactly-once processing. Leases or an outbox could reduce this risk.
- Qwen uses its Transformers backend on one A10G instead of vLLM. The endpoint has a one-container limit to cap GPU costs. This keeps the service simple, but concurrent requests must wait.

