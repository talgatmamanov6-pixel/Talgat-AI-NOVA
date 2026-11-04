import hmac
import io
import os
from threading import Lock

import soundfile
import torch
from fastapi import FastAPI, Header, HTTPException, Response
from pydantic import BaseModel, Field
from qwen_tts import Qwen3TTSModel

token = os.environ["QWEN_VOICE_TOKEN"]
if not token:
    raise RuntimeError("QWEN_VOICE_TOKEN must be set")

torch.set_num_threads(int(os.getenv("VOICE_CPU_THREADS", "4")))
model = Qwen3TTSModel.from_pretrained(
    os.getenv("VOICE_MODEL", "Qwen/Qwen3-TTS-12Hz-0.6B-Base"),
    device_map="cpu", dtype=torch.float32, attn_implementation="sdpa",
)
reference = model.create_voice_clone_prompt(
    ref_audio=os.environ["VOICE_REFERENCE_FILE"], x_vector_only_mode=True,
)
generation = Lock()
app = FastAPI(docs_url=None, redoc_url=None, openapi_url=None)

class SpeechRequest(BaseModel):
    text: str = Field(min_length=1, max_length=120)

@app.get("/health")
def health():
    return {"ready": True}

@app.post("/speech")
def speak(body: SpeechRequest, authorization: str = Header(default="")):
    if not hmac.compare_digest(authorization.encode(), ("Bearer " + token).encode()):
        raise HTTPException(status_code=401)
    if not generation.acquire(blocking=False):
        raise HTTPException(status_code=429)
    try:
        with torch.inference_mode():
            waves, rate = model.generate_voice_clone(
                text=body.text, language="Russian", voice_clone_prompt=reference,
            )
        output = io.BytesIO()
        soundfile.write(output, waves[0], rate, format="WAV")
        return Response(output.getvalue(), media_type="audio/wav")
    finally:
        generation.release()
