<p align="center">
  <img src="apps/web/public/logo.webp" alt="Valsea" width="128">
</p>

<h1 align="center">Tradeoffs</h1>

## Backend architecture

![Valsea backend architecture](docs/architecture.png)

## Decisions

- The OCI VM is shared with other applications. This avoids an additional compute deployment, but resource contention or a VM failure can affect all hosted applications.
- OCI network and Cloudflare DNS resources are configured outside this repository. This keeps application deployment small, but cloud configuration is not reproducible from source.
- Cloudflare stays in front of Uncloud Caddy. Caddy now obtains and renews the public origin certificate automatically, but certificate issuance depends on Cloudflare forwarding the ACME HTTP challenge to the VM.
- Uncloud uses `start-first` updates for VALSEA, so the old and new processes briefly share the SQLite bind mount. WAL mode permits this and avoids deployment downtime, but a schema change that is not backward-compatible with the prior process can fail during the overlap.
- Audio stays in memory during a comparison. The browser uses a temporary object URL for replay. This removes object storage, but replay is lost after a page refresh and server memory use grows with concurrent uploads. A 10 MB file limit bounds this use and matches VALSEA's upload limit.
- Provider calls run concurrently inside the comparison request. This removes background processing and reduces latency, but the request must stay open until the slowest provider finishes. A server restart loses the in-flight comparison, and the user must submit it again.
- Live benchmarks run as an in-process background task, while the browser polls progress from SQLite. This keeps deployment small and preserves progress across page refreshes, but a server restart interrupts the task. Opening the saved run again restarts it from the first sample.
- SQLite stores only comparison metadata and final provider results. This keeps the schema small, but it does not retain individual provider start and completion timestamps.
- Qwen uses its Transformers backend on one A10G instead of vLLM. The endpoint has a one-container limit to cap GPU costs. This keeps the service simple, but concurrent requests must wait.
- The Gemini adapter sends audio inline to the Interactions API. This avoids temporary Gemini file lifecycle management, but the 20 MB total request limit allows only about 15 MB of raw audio after base64 encoding.
- The benchmark fetches its 10 fixed MERaLiON Part 4 clips through Hugging Face's dataset viewer API instead of installing the full `datasets`/audio stack or downloading the roughly 840 MB test configuration. This keeps reproduction lightweight, but benchmark retrieval depends on the public viewer service; committed references, durations, and audio hashes are validated so dataset changes fail loudly.
- VALSEA requires an explicit language route in the live transcription API, while Qwen and Gemini can auto-detect the MERaLiON code switches. The benchmark uses VALSEA's Free-tier-compatible `english` route and disables correction/tags. That keeps the benchmark reproducible without an account upgrade, but VALSEA receives a routing hint the other two providers do not.
