from __future__ import annotations

import argparse
import base64
import hashlib
import io
import json
import math
import os
import re
import statistics
import time
import unicodedata
import urllib.error
import urllib.parse
import urllib.request
import wave
from collections.abc import Callable, Sequence
from dataclasses import dataclass
from pathlib import Path
from typing import Literal, cast
from uuid import uuid4


ProviderId = Literal["valsea", "qwen", "gemini"]

PROJECT_DIR = Path(__file__).resolve().parents[1]
REPOSITORY_ROOT = PROJECT_DIR.parents[1]
DEFAULT_MANIFEST_PATH = REPOSITORY_ROOT / "packages" / "benchmark" / "benchmark_manifest.json"
DEFAULT_RESULT_PATH = PROJECT_DIR / "benchmark_result.json"
DEFAULT_ENV_PATH = PROJECT_DIR.parent / "server" / ".env"

MIN_SAMPLE_COUNT = 1
DEFAULT_SAMPLE_COUNT = 5
MAX_SAMPLE_COUNT = 10

MERALION_DATASET = "MERaLiON/Multitask-National-Speech-Corpus-v1"
MERALION_CONFIG = "ASR-PART4-Test"
MERALION_SPLIT = "train"
DATASET_SERVER = "https://datasets-server.huggingface.co"
GEMINI_URL = "https://generativelanguage.googleapis.com/v1beta/interactions"
VALSEA_URL = "https://api.valsea.ai/v1/audio/transcriptions"

TOKEN_RE = re.compile(r"[\u3400-\u4DBF\u4E00-\u9FFF]|[a-z0-9]+(?:'[a-z0-9]+)?")
LANGUAGE_RE = re.compile(r"[\u3400-\u4DBF\u4E00-\u9FFF]|[A-Za-z]")
SPEAKER_TAG_RE = re.compile(r"<Speaker\d+>:\s*")
SHA256_RE = re.compile(r"[0-9a-f]{64}")


@dataclass(frozen=True, slots=True)
class ManifestSample:
    row_index: int
    duration_seconds: float
    audio_sha256: str
    reference: str

    @property
    def sample_id(self) -> str:
        return f"part4-{self.row_index:04d}"

    @property
    def audio_filename(self) -> str:
        return f"{self.sample_id}.wav"


@dataclass(frozen=True, slots=True)
class BenchmarkManifest:
    version: int
    default_sample_count: int
    samples: tuple[ManifestSample, ...]


@dataclass(frozen=True, slots=True)
class AudioSample:
    manifest: ManifestSample
    audio: bytes
    content_type: str


@dataclass(frozen=True, slots=True)
class ProviderResult:
    provider: ProviderId
    sample_id: str
    reference: str
    prediction: str | None
    latency_ms: float
    error_rate: float | None
    error: str | None
    edits: int | None
    reference_tokens: int | None


ProviderCall = Callable[[bytes, str, str], str]


def _expect_dict(value: object, context: str) -> dict[str, object]:
    if not isinstance(value, dict):
        raise ValueError(f"{context} must be an object")
    return cast(dict[str, object], value)


def _expect_list(value: object, context: str) -> list[object]:
    if not isinstance(value, list):
        raise ValueError(f"{context} must be an array")
    return cast(list[object], value)


def _expect_str(value: object, context: str) -> str:
    if not isinstance(value, str):
        raise ValueError(f"{context} must be a string")
    return value


def _expect_int(value: object, context: str) -> int:
    if not isinstance(value, int):
        raise ValueError(f"{context} must be an integer")
    return value


def _expect_float(value: object, context: str) -> float:
    if not isinstance(value, int | float):
        raise ValueError(f"{context} must be a number")
    return float(value)


def load_env_file(path: Path) -> None:
    if not path.exists():
        return

    for raw_line in path.read_text().splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        value = value.strip()
        if len(value) >= 2 and value[0] == value[-1] and value[0] in {'"', "'"}:
            value = value[1:-1]
        os.environ.setdefault(key.strip(), value)


def require_env(name: str) -> str:
    value = os.environ.get(name)
    if not value:
        raise RuntimeError(f"Missing required environment variable: {name}")
    return value


def load_manifest(path: Path) -> BenchmarkManifest:
    payload: object = json.loads(path.read_text())
    manifest = _expect_dict(payload, "benchmark manifest")
    version = _expect_int(manifest.get("version"), "benchmark manifest version")
    if version < 1:
        raise ValueError("benchmark manifest version must be positive")

    expected_source = {
        "dataset": MERALION_DATASET,
        "config": MERALION_CONFIG,
        "split": MERALION_SPLIT,
    }
    for field, expected in expected_source.items():
        actual = _expect_str(manifest.get(field), f"benchmark manifest {field}")
        if actual != expected:
            raise ValueError(f"benchmark manifest {field} must be {expected!r}")

    default_sample_count = _expect_int(
        manifest.get("default_sample_count"), "benchmark manifest default_sample_count"
    )
    if default_sample_count != DEFAULT_SAMPLE_COUNT:
        raise ValueError(
            f"benchmark manifest default_sample_count must be {DEFAULT_SAMPLE_COUNT}"
        )

    raw_samples = _expect_list(manifest.get("samples"), "benchmark manifest samples")
    samples: list[ManifestSample] = []
    for index, raw_sample in enumerate(raw_samples):
        item = _expect_dict(raw_sample, f"benchmark manifest item {index}")
        samples.append(
            ManifestSample(
                row_index=_expect_int(item.get("row_index"), f"item {index}.row_index"),
                duration_seconds=_expect_float(
                    item.get("duration_seconds"), f"item {index}.duration_seconds"
                ),
                audio_sha256=_expect_str(
                    item.get("audio_sha256"), f"item {index}.audio_sha256"
                ),
                reference=_expect_str(item.get("reference"), f"item {index}.reference"),
            )
        )
    validate_manifest(samples)
    return BenchmarkManifest(
        version=version,
        default_sample_count=default_sample_count,
        samples=tuple(samples),
    )


def _language_switches(text: str) -> int:
    sequence: list[str] = []
    for match in LANGUAGE_RE.finditer(text):
        token = match.group(0)
        language = "zh" if ord(token[0]) >= 0x3400 else "en"
        if not sequence or sequence[-1] != language:
            sequence.append(language)
    return max(0, len(sequence) - 1)


def validate_manifest(samples: Sequence[ManifestSample]) -> None:
    if len(samples) != MAX_SAMPLE_COUNT:
        raise ValueError(
            f"MERaLiON Part 4 benchmark manifest must contain exactly {MAX_SAMPLE_COUNT} samples"
        )

    if len({sample.row_index for sample in samples}) != len(samples):
        raise ValueError("MERaLiON Part 4 benchmark manifest contains duplicate row indices")

    for sample in samples:
        if not 15 <= sample.duration_seconds <= 35:
            raise ValueError(f"{sample.sample_id} duration is outside the 15-35 second window")
        if not SHA256_RE.fullmatch(sample.audio_sha256):
            raise ValueError(f"{sample.sample_id} has an invalid audio SHA-256")
        if _language_switches(SPEAKER_TAG_RE.sub(" ", sample.reference)) < 4:
            raise ValueError(
                f"{sample.sample_id} does not contain repeated Mandarin-English switches"
            )


def _request_bytes(request: urllib.request.Request, timeout: float) -> bytes:
    try:
        with urllib.request.urlopen(request, timeout=timeout) as response:
            return response.read()
    except urllib.error.HTTPError as exc:
        body = exc.read().decode("utf-8", errors="replace")[:500]
        raise RuntimeError(f"HTTP {exc.code}: {body}") from exc
    except urllib.error.URLError as exc:
        raise RuntimeError(f"Network request failed: {exc.reason}") from exc


def _request_json(request: urllib.request.Request, timeout: float) -> dict[str, object]:
    payload: object = json.loads(_request_bytes(request, timeout))
    return _expect_dict(payload, "HTTP response")


def fetch_audio_sample(sample: ManifestSample) -> AudioSample:
    params = urllib.parse.urlencode(
        {
            "dataset": MERALION_DATASET,
            "config": MERALION_CONFIG,
            "split": MERALION_SPLIT,
            "offset": sample.row_index,
            "length": 1,
        }
    )
    request = urllib.request.Request(f"{DATASET_SERVER}/rows?{params}")
    payload = _request_json(request, timeout=30)
    rows = _expect_list(payload.get("rows"), "dataset rows")
    if len(rows) != 1:
        raise RuntimeError(f"MERaLiON row {sample.row_index} was not returned")

    row_wrapper = _expect_dict(rows[0], "dataset row wrapper")
    actual_row_index = _expect_int(row_wrapper.get("row_idx"), "dataset row index")
    row = _expect_dict(row_wrapper.get("row"), "dataset row")
    actual_reference = _expect_str(row.get("answer"), "dataset transcription")

    if actual_row_index != sample.row_index:
        raise RuntimeError(f"MERaLiON row {sample.row_index} changed index")
    if actual_reference != sample.reference:
        raise RuntimeError(f"MERaLiON sample {sample.sample_id} reference changed")

    audio_entries = _expect_list(row.get("context"), "dataset audio")
    if not audio_entries:
        raise RuntimeError(f"MERaLiON sample {sample.sample_id} has no audio asset")
    audio_entry = _expect_dict(audio_entries[0], "dataset audio asset")
    audio_url = _expect_str(audio_entry.get("src"), "dataset audio URL")
    content_type = _expect_str(audio_entry.get("type"), "dataset audio content type")
    audio = _request_bytes(urllib.request.Request(audio_url), timeout=30)

    actual_sha256 = hashlib.sha256(audio).hexdigest()
    if actual_sha256 != sample.audio_sha256:
        raise RuntimeError(f"MERaLiON sample {sample.sample_id} audio hash changed")

    try:
        with wave.open(io.BytesIO(audio), "rb") as wav_file:
            actual_duration = wav_file.getnframes() / wav_file.getframerate()
    except wave.Error as exc:
        raise RuntimeError(f"MERaLiON sample {sample.sample_id} is not valid WAV audio") from exc
    if abs(actual_duration - sample.duration_seconds) > 0.01:
        raise RuntimeError(f"MERaLiON sample {sample.sample_id} duration changed")

    return AudioSample(manifest=sample, audio=audio, content_type=content_type)


def mixed_tokens(text: str) -> list[str]:
    without_speaker_tags = SPEAKER_TAG_RE.sub(" ", text)
    normalized = unicodedata.normalize("NFKC", without_speaker_tags).lower()
    return TOKEN_RE.findall(normalized)


def edit_distance(reference: Sequence[str], prediction: Sequence[str]) -> int:
    previous = list(range(len(prediction) + 1))
    for ref_index, ref_token in enumerate(reference, start=1):
        current = [ref_index]
        for pred_index, pred_token in enumerate(prediction, start=1):
            current.append(
                min(
                    current[-1] + 1,
                    previous[pred_index] + 1,
                    previous[pred_index - 1] + (ref_token != pred_token),
                )
            )
        previous = current
    return previous[-1]


def score_mer(reference: str, prediction: str) -> tuple[int, int, float]:
    reference_tokens = mixed_tokens(reference)
    prediction_tokens = mixed_tokens(prediction)
    if not reference_tokens:
        raise ValueError("Cannot score an empty reference")
    edits = edit_distance(reference_tokens, prediction_tokens)
    return edits, len(reference_tokens), edits / len(reference_tokens)


def call_valsea(audio: bytes, filename: str, content_type: str) -> str:
    boundary = f"----valsea-benchmark-{uuid4().hex}"
    form_fields = (
        ("model", "valsea-transcribe"),
        ("language", "english"),
        ("enable_correction", "false"),
        ("enable_tags", "false"),
    )
    prefix = b"".join(
        (
            f"--{boundary}\r\n"
            f'Content-Disposition: form-data; name="{name}"\r\n\r\n'
            f"{value}\r\n"
        ).encode()
        for name, value in form_fields
    ) + (
        f"--{boundary}\r\n"
        f'Content-Disposition: form-data; name="file"; filename="{Path(filename).name}"\r\n'
        f"Content-Type: {content_type}\r\n\r\n"
    ).encode()
    suffix = f"\r\n--{boundary}--\r\n".encode()
    request = urllib.request.Request(
        VALSEA_URL,
        data=prefix + audio + suffix,
        method="POST",
        headers={
            "Authorization": f"Bearer {require_env('VALSEA_API_KEY')}",
            "Content-Type": f"multipart/form-data; boundary={boundary}",
        },
    )
    payload = _request_json(request, timeout=120)
    return _expect_str(payload.get("text"), "VALSEA transcription")


def call_qwen(audio: bytes, _filename: str, content_type: str) -> str:
    request = urllib.request.Request(
        require_env("QWEN_MODAL_URL"),
        data=audio,
        method="POST",
        headers={
            "Content-Type": content_type,
            "Modal-Key": require_env("MODAL_PROXY_TOKEN_ID"),
            "Modal-Secret": require_env("MODAL_PROXY_TOKEN_SECRET"),
        },
    )
    payload = _request_json(request, timeout=300)
    return _expect_str(payload.get("text"), "Qwen transcription")


def _gemini_output_text(payload: dict[str, object]) -> str:
    steps = _expect_list(payload.get("steps"), "Gemini interaction steps")
    text_parts: list[str] = []
    for raw_step in steps:
        step = _expect_dict(raw_step, "Gemini interaction step")
        if step.get("type") != "model_output":
            continue
        content = _expect_list(step.get("content"), "Gemini model output content")
        for raw_block in content:
            block = _expect_dict(raw_block, "Gemini model output block")
            if block.get("type") == "text":
                text_parts.append(_expect_str(block.get("text"), "Gemini output text"))
    if not text_parts:
        raise RuntimeError("Gemini interaction returned no text output")
    return "".join(text_parts)


def call_gemini(audio: bytes, _filename: str, content_type: str) -> str:
    body = json.dumps(
        {
            "model": "gemini-3.5-transcribe",
            "input": [
                {
                    "type": "audio",
                    "data": base64.b64encode(audio).decode("ascii"),
                    "mime_type": content_type,
                }
            ],
            "generation_config": {
                "transcription_config": {"mode": {"type": "verbatim"}}
            },
        }
    ).encode()
    request = urllib.request.Request(
        GEMINI_URL,
        data=body,
        method="POST",
        headers={
            "Content-Type": "application/json",
            "x-goog-api-key": require_env("GEMINI_API_KEY"),
        },
    )
    return _gemini_output_text(_request_json(request, timeout=120))


PROVIDERS: dict[ProviderId, ProviderCall] = {
    "valsea": call_valsea,
    "qwen": call_qwen,
    "gemini": call_gemini,
}

# Gemini's free tier is limited enough that an unpaced benchmark can hit 429s.
# Pacing happens outside run_provider so it is not counted as request latency.
MIN_REQUEST_INTERVAL_SECONDS: dict[ProviderId, float] = {"gemini": 21.0}


def run_provider(provider: ProviderId, sample: AudioSample) -> ProviderResult:
    started = time.perf_counter()
    try:
        prediction = PROVIDERS[provider](
            sample.audio,
            sample.manifest.audio_filename,
            sample.content_type,
        )
        latency_ms = (time.perf_counter() - started) * 1000
        edits, reference_tokens, error_rate = score_mer(sample.manifest.reference, prediction)
        return ProviderResult(
            provider=provider,
            sample_id=sample.manifest.sample_id,
            reference=sample.manifest.reference,
            prediction=prediction,
            latency_ms=latency_ms,
            error_rate=error_rate,
            error=None,
            edits=edits,
            reference_tokens=reference_tokens,
        )
    except Exception as exc:
        latency_ms = (time.perf_counter() - started) * 1000
        return ProviderResult(
            provider=provider,
            sample_id=sample.manifest.sample_id,
            reference=sample.manifest.reference,
            prediction=None,
            latency_ms=latency_ms,
            error_rate=None,
            error=f"{type(exc).__name__}: {exc}",
            edits=None,
            reference_tokens=None,
        )


def percentile_nearest_rank(values: Sequence[float], percentile: float) -> float:
    if not values:
        raise ValueError("Cannot calculate a percentile from no values")
    ordered = sorted(values)
    rank = max(1, math.ceil(percentile * len(ordered)))
    return ordered[rank - 1]


def summarize(provider: ProviderId, results: Sequence[ProviderResult]) -> dict[str, object]:
    provider_results = [result for result in results if result.provider == provider]
    successes = [result for result in provider_results if result.error is None]
    latencies = [result.latency_ms for result in successes]
    total_edits = sum(result.edits or 0 for result in successes)
    total_reference_tokens = sum(result.reference_tokens or 0 for result in successes)
    return {
        "provider": provider,
        "mixed_error_rate": (
            total_edits / total_reference_tokens if total_reference_tokens else None
        ),
        "p50_latency_ms": statistics.median(latencies) if latencies else None,
        "p95_latency_ms": percentile_nearest_rank(latencies, 0.95) if latencies else None,
        "succeeded": len(successes),
        "failed": len(provider_results) - len(successes),
    }


def result_payload(
    results: Sequence[ProviderResult],
    providers: Sequence[ProviderId],
    manifest_version: int,
    samples: Sequence[ManifestSample],
) -> dict[str, object]:
    return {
        "manifest_version": manifest_version,
        "dataset": MERALION_DATASET,
        "config": MERALION_CONFIG,
        "split": MERALION_SPLIT,
        "sample_count": len(samples),
        "selected_sample_ids": [sample.sample_id for sample in samples],
        "metric": "MER (Mandarin characters + English words)",
        "provider_conditions": {
            "valsea": "language=english, correction/tags disabled (Free-tier-compatible routing)",
            "qwen": "automatic multilingual transcription",
            "gemini": "verbatim mode, automatic language detection, requests paced 21s apart",
        },
        "summary": [summarize(provider, results) for provider in providers],
        "samples": [
            {
                "provider": result.provider,
                "sample_id": result.sample_id,
                "reference": result.reference,
                "prediction": result.prediction,
                "latency_ms": round(result.latency_ms, 2),
                "error_rate": (
                    round(result.error_rate, 6) if result.error_rate is not None else None
                ),
                "error": result.error,
            }
            for result in results
        ],
    }


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Benchmark MERaLiON Part 4 Mandarin-English code-switched transcription"
    )
    parser.add_argument("--manifest", type=Path, default=DEFAULT_MANIFEST_PATH)
    parser.add_argument("--output", type=Path, default=DEFAULT_RESULT_PATH)
    parser.add_argument("--env-file", type=Path, default=DEFAULT_ENV_PATH)
    parser.add_argument(
        "--sample-count",
        type=int,
        choices=range(MIN_SAMPLE_COUNT, MAX_SAMPLE_COUNT + 1),
        default=None,
        metavar=f"{{{MIN_SAMPLE_COUNT}..{MAX_SAMPLE_COUNT}}}",
        help=(
            "number of samples to run from the start of the deterministic manifest "
            f"(manifest default: {DEFAULT_SAMPLE_COUNT})"
        ),
    )
    parser.add_argument(
        "--providers",
        nargs="+",
        choices=tuple(PROVIDERS),
        default=list(PROVIDERS),
    )
    parser.add_argument("--validate-only", action="store_true")
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    manifest_path = cast(Path, args.manifest)
    output_path = cast(Path, args.output)
    env_path = cast(Path, args.env_file)
    requested_sample_count = cast(int | None, args.sample_count)
    providers = cast(list[ProviderId], args.providers)
    validate_only = cast(bool, args.validate_only)

    manifest = load_manifest(manifest_path)
    sample_count = requested_sample_count or manifest.default_sample_count
    samples = manifest.samples[:sample_count]
    audio_samples = [fetch_audio_sample(sample) for sample in samples]
    if validate_only:
        print(f"Validated {len(audio_samples)} fixed MERaLiON Part 4 code-switching samples")
        return

    load_env_file(env_path)
    results: list[ProviderResult] = []
    last_request_started: dict[ProviderId, float] = {}
    for sample in audio_samples:
        for provider in providers:
            minimum_interval = MIN_REQUEST_INTERVAL_SECONDS.get(provider, 0)
            previous_start = last_request_started.get(provider)
            if previous_start is not None:
                sleep_seconds = minimum_interval - (time.monotonic() - previous_start)
                if sleep_seconds > 0:
                    time.sleep(sleep_seconds)
            last_request_started[provider] = time.monotonic()
            result = run_provider(provider, sample)
            results.append(result)
            status = "ok" if result.error is None else result.error
            print(f"{sample.manifest.sample_id} {provider}: {status}")

    output_path.write_text(
        json.dumps(
            result_payload(results, providers, manifest.version, samples),
            ensure_ascii=False,
            indent=2,
        )
        + "\n"
    )
    print(f"Wrote {output_path}")
    failed = [result for result in results if result.error is not None]
    if failed:
        raise SystemExit(f"Benchmark completed with {len(failed)} failed provider requests")


if __name__ == "__main__":
    main()
