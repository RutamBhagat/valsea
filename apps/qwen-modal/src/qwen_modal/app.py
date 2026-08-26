import asyncio
from importlib import import_module
from tempfile import NamedTemporaryFile
from typing import Protocol, runtime_checkable

import modal
from fastapi import HTTPException, Request


class _Transcription(Protocol):
    text: str


@runtime_checkable
class _ASRModel(Protocol):
    def transcribe(
        self, *, audio: str, language: str | None
    ) -> list[_Transcription]: ...


@runtime_checkable
class _ModelFactory(Protocol):
    def from_pretrained(self, model_id: str, **kwargs: object) -> object: ...


MODEL_ID = "Qwen/Qwen3-ASR-1.7B"
HF_CACHE_DIR = "/cache"

image = (
    modal.Image.debian_slim(python_version="3.12")
    .apt_install("ffmpeg", "libsndfile1", "sox")
    .pip_install(
        "fastapi[standard]>=0.115,<1", "qwen-asr==0.0.6", "torch==2.9.1"
    )
    .env(
        {
            "HF_HOME": HF_CACHE_DIR,
            "HF_HUB_CACHE": f"{HF_CACHE_DIR}/hub",
            "HF_XET_HIGH_PERFORMANCE": "1",
        }
    )
)

weights = modal.Volume.from_name("qwen3-asr-weights", create_if_missing=True)
app = modal.App("qwen3-asr")


@app.cls(
    image=image,
    gpu="A10G",
    max_containers=1,
    volumes={HF_CACHE_DIR: weights},
    startup_timeout=900,
)
class QwenASR:
    model: object | None = None

    @modal.enter()
    def load_model(self) -> None:
        model_class = getattr(import_module("qwen_asr"), "Qwen3ASRModel", None)
        if not isinstance(model_class, _ModelFactory):
            raise TypeError("qwen_asr.Qwen3ASRModel is not available")

        dtype: object = getattr(import_module("torch"), "bfloat16", None)
        if dtype is None:
            raise TypeError("torch.bfloat16 is not available")

        model = model_class.from_pretrained(
            MODEL_ID,
            dtype=dtype,
            device_map="cuda:0",
            max_inference_batch_size=1,
            max_new_tokens=256,
        )
        if not isinstance(model, _ASRModel):
            raise TypeError("Loaded model does not provide transcribe()")
        self.model = model

    @modal.fastapi_endpoint(
        method="POST", docs=True, requires_proxy_auth=True
    )
    async def transcribe(self, request: Request) -> dict[str, str]:
        audio = await request.body()
        if not audio:
            raise HTTPException(status_code=400, detail="The MP3 body is empty")
        if not isinstance(self.model, _ASRModel):
            raise TypeError("The ASR model is not loaded")

        return await asyncio.to_thread(self._transcribe, self.model, audio)

    @staticmethod
    def _transcribe(model: _ASRModel, audio: bytes) -> dict[str, str]:
        with NamedTemporaryFile(suffix=".mp3") as audio_file:
            audio_file.write(audio)
            audio_file.flush()
            results = model.transcribe(audio=audio_file.name, language=None)

        if not results:
            raise RuntimeError("The ASR model returned no transcription")
        return {"text": results[0].text}
