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
- The server runs committed migrations with Drizzle Kit before it starts. This keeps migration logic out of the application.
- Audio stays in memory during a comparison. The browser uses a temporary object URL for replay. This removes object storage, but replay is lost after a page refresh and server memory use grows with concurrent uploads. A 10 MB file limit bounds this use and matches VALSEA's upload limit.
- Comparisons accept only WAV audio. This gives all providers the same lossless source, but users must convert other audio formats before upload and the 10 MB limit permits shorter recordings than compressed formats.
- Provider adapters receive one Web `File` instead of separate bytes and metadata. This removes boundary conversion and keeps the WAV name and MIME type together.
- Provider calls run concurrently as an in-process background task after the server stores pending rows and returns the comparison ID. The browser polls once per second and shows each result independently, but a server restart leaves unfinished rows pending because the audio is not stored for recovery.
- Live benchmarks run as an in-process background task, while the browser polls progress from SQLite. This keeps deployment small and preserves progress across page refreshes, but a server restart interrupts the task. Opening the saved run again restarts it from the first sample.
- Benchmark and comparison runs are scoped to their authenticated user. Existing rows from before this change have no user ID and are intentionally hidden instead of assigned to an arbitrary account.
- SQLite stores comparison metadata and each provider's pending or final result. This keeps the schema small, but it does not retain individual provider start and completion timestamps.
- Qwen uses its Transformers backend on one A10G instead of vLLM. A Modal Volume retains the Hugging Face weight cache between containers, and `@modal.enter` loads the cached model into GPU memory before the service becomes ready. This avoids repeated network downloads, but it does not remove model initialization.
- The server and benchmark call Qwen through the Modal SDK instead of an HTTP endpoint. This removes the custom HTTP request contract and limits invocation to deployed Modal methods, but their credentials have workspace access rather than endpoint-only proxy access.
- The Qwen service sets `max_containers=1` and permits scale-to-zero. This caps GPU use and removes idle GPU cost, but the first request after scale-to-zero takes approximately 20 seconds to start the container and load the model into GPU memory. Warm requests are faster, while overlapping requests must wait for the single container.
- The Gemini adapter sends audio inline to the Interactions API. This avoids temporary Gemini file lifecycle management, but the 20 MB total request limit allows only about 15 MB of raw audio after base64 encoding.
- The benchmark fetches its 10 fixed MERaLiON Part 4 clips through Hugging Face's dataset viewer API instead of installing the full `datasets`/audio stack or downloading the roughly 840 MB test configuration. This keeps reproduction lightweight, but benchmark retrieval depends on the public viewer service; committed references, durations, and audio hashes are validated so dataset changes fail loudly.
- MER treats each Mandarin character and each normalized English word as one token, then aggregates all edits over all reference tokens. This gives one reproducible score for code-switched speech, but it measures exact token agreement and does not measure semantic equivalence.
- Provider latency includes Qwen cold starts when they occur, but excludes Gemini quota pacing. This represents user-visible provider time, but the fixed sample set is too small for stable tail-latency claims.
- VALSEA requires an explicit language route in the live transcription API, while Qwen and Gemini can auto-detect the MERaLiON code switches. The benchmark uses VALSEA's Free-tier-compatible `english` route and disables correction/tags. That keeps the benchmark reproducible without an account upgrade, but VALSEA receives a routing hint the other two providers do not.
