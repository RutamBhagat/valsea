import modal

MODEL_ID = "Qwen/Qwen3-ASR-1.7B"
HF_CACHE_DIR = "/cache"

image = (
    modal.Image.debian_slim(python_version="3.12")
    .apt_install("ffmpeg", "libsndfile1", "sox")
    .pip_install("qwen-asr==0.0.6", "torch==2.9.1")
    .env(
        {
            "HF_HOME": HF_CACHE_DIR,
            "HF_HUB_CACHE": f"{HF_CACHE_DIR}/hub",
            "HF_XET_HIGH_PERFORMANCE": "1",
        }
    )
)

with image.imports():
    import torch
    from qwen_asr import Qwen3ASRModel

weights = modal.Volume.from_name("qwen3-asr-weights", create_if_missing=True)
app = modal.App("qwen3-asr")


@app.cls(
    image=image,
    gpu="A10G",
    volumes={HF_CACHE_DIR: weights},
    startup_timeout=900,
)
class QwenASR:
    model: object | None = None

    @modal.enter()
    def load_model(self) -> None:
        self.model = Qwen3ASRModel.from_pretrained(
            MODEL_ID,
            dtype=torch.bfloat16,
            device_map="cuda:0",
            max_inference_batch_size=1,
            max_new_tokens=256,
        )
