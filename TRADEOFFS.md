# Tradeoffs

- The OCI VM and load balancer are shared with other applications. This avoids an additional compute deployment, but resource contention or a VM failure can affect all hosted applications.
- OCI load-balancer and Cloudflare DNS resources are configured outside this repository. Removing Pulumi reduces project complexity, but cloud configuration is not reproducible from source.
- Local development uses the remote R2 bucket instead of an emulator. This keeps storage behavior the same across environments, but local development needs network access and bucket credentials.
- On application startup, the worker resets all `running` rows to `queued`. If the provider accepts a request but the process crashes before the database records success, the worker retries the request after restart. The provider can then execute the same request twice. This simplified queue does not provide exactly-once processing. Leases or an outbox could reduce this risk.
- Qwen uses its Transformers backend on one A10G instead of vLLM. This keeps the small single-request service simple and reduces image size, but it gives less throughput under concurrent load.
- Torch and Qwen ASR are installed only in the Modal image, so local type checking uses minimal checked-in stubs and disables `reportMissingModuleSource`; those stubs must stay aligned with the small API surface used here. BasedPyright also allows unknown types from `modal` because Modal 1.5.4's decorator stubs are partially untyped.
