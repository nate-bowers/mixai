"""
mix.ai — Audio Analysis Microservice
POST /analyze  — accepts an audio file, returns BPM, key, energy curve, mix cues
GET  /health   — liveness check

Speed strategy:
  - Load only the first 60 s at 22 kHz for BPM + key (avoids decoding entire file)
  - Load full track at 8 kHz for energy curve + duration (tiny array, fast)
  - Use soxr_qq resampler (fastest available)
  - Synthesise beat grid from tempo instead of running full beat_track
"""

import tempfile
import os
import time
from pathlib import Path

import numpy as np
import librosa
import soundfile as sf
from fastapi import FastAPI, UploadFile, File, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

app = FastAPI(title="mix.ai Analysis API", version="0.3.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

ANALYSIS_SR   = 22050   # for BPM + key
ENERGY_SR     = 8000    # for energy curve (tiny array, any SR works)
MAX_ANALYSIS  = 60      # seconds — enough for accurate BPM + key
RESAMPLE_TYPE = "soxr_qq"  # fastest resampler; falls back gracefully

CAMELOT_MAP = {
    "C major": "8B",  "A minor": "8A",
    "G major": "9B",  "E minor": "9A",
    "D major": "10B", "B minor": "10A",
    "A major": "11B", "F# minor": "11A",
    "E major": "12B", "C# minor": "12A",
    "B major": "1B",  "G# minor": "1A",
    "F# major": "2B", "D# minor": "2A",
    "C# major": "3B", "A# minor": "3A",
    "F major": "7B",  "D minor": "7A",
    "Bb major": "6B", "G minor": "6A",
    "Eb major": "5B", "C minor": "5A",
    "Ab major": "4B", "F minor": "4A",
}


class AnalysisResult(BaseModel):
    bpm: float
    key: str
    beat_times: list[float]
    energy_curve: list[float]
    suggested_mix_in: float
    suggested_mix_out: float
    duration: float


@app.get("/health")
def health():
    return {"status": "ok"}


@app.post("/analyze", response_model=AnalysisResult)
async def analyze(file: UploadFile = File(...)):
    suffix = Path(file.filename or "audio.mp3").suffix or ".mp3"
    with tempfile.NamedTemporaryFile(suffix=suffix, delete=False) as tmp:
        tmp.write(await file.read())
        tmp_path = tmp.name

    try:
        t0 = time.time()
        result = _analyze_file(tmp_path)
        print(f"[analyze] done in {time.time()-t0:.2f}s — {result.bpm:.1f} BPM, {result.key}")
        return result
    except Exception as exc:
        import traceback; traceback.print_exc()
        raise HTTPException(status_code=422, detail=str(exc))
    finally:
        os.unlink(tmp_path)


def _analyze_file(path: str) -> AnalysisResult:
    # ── 1. Load first 60 s at 22 kHz — skip decoding the rest ────────────────
    t = time.time()
    try:
        y, sr = librosa.load(
            path, mono=True, sr=ANALYSIS_SR,
            duration=MAX_ANALYSIS, res_type=RESAMPLE_TYPE,
        )
    except Exception:
        # fallback: no resampler available, load native
        y, sr = librosa.load(path, mono=True, duration=MAX_ANALYSIS)
    print(f"  load 60s:      {time.time()-t:.2f}s  ({len(y)/sr:.1f}s @ {sr} Hz)")

    # ── 2. Load full track at 8 kHz for energy + duration ────────────────────
    t = time.time()
    try:
        y_full, sr_full = librosa.load(
            path, mono=True, sr=ENERGY_SR, res_type=RESAMPLE_TYPE,
        )
    except Exception:
        y_full, sr_full = librosa.load(path, mono=True)
    duration = len(y_full) / sr_full
    print(f"  load full 8k:  {time.time()-t:.2f}s  ({duration:.1f}s total)")

    # ── 3. BPM via onset-strength tempo (10× faster than beat_track) ─────────
    t = time.time()
    onset_env = librosa.onset.onset_strength(y=y, sr=sr, hop_length=512)
    try:
        tempo_vals = librosa.feature.rhythm.tempo(
            onset_envelope=onset_env, sr=sr, aggregate=None,
        )
    except AttributeError:
        # older librosa
        tempo_vals = librosa.beat.tempo(onset_envelope=onset_env, sr=sr, aggregate=None)
    bpm = float(np.median(tempo_vals))
    print(f"  tempo:         {time.time()-t:.2f}s  → {bpm:.1f} BPM")

    # ── 4. Synthesise beat grid from tempo ────────────────────────────────────
    beat_interval = 60.0 / bpm
    # offset by half a beat to avoid starting at 0 (usually silence)
    beat_times = np.arange(beat_interval * 0.5, duration, beat_interval).tolist()

    # ── 5. Key via chroma_stft (3× faster than chroma_cqt) ───────────────────
    t = time.time()
    chroma = librosa.feature.chroma_stft(y=y, sr=sr, hop_length=2048, n_fft=4096)
    key_label = _detect_key(chroma)
    camelot = CAMELOT_MAP.get(key_label, "8A")
    print(f"  key:           {time.time()-t:.2f}s  → {key_label} ({camelot})")

    # ── 6. Energy curve — RMS per beat-length window at 8 kHz ────────────────
    t = time.time()
    hop = max(1, int(beat_interval * sr_full))
    energy_curve = []
    for i in range(0, len(y_full), hop):
        chunk = y_full[i : i + hop]
        if len(chunk) > 0:
            energy_curve.append(float(np.sqrt(np.mean(chunk ** 2))))
    if not energy_curve:
        energy_curve = [0.5]
    max_e = max(energy_curve) or 1.0
    energy_curve = [e / max_e for e in energy_curve]
    print(f"  energy:        {time.time()-t:.2f}s  ({len(energy_curve)} beats)")

    # ── 7. Mix cue points ─────────────────────────────────────────────────────
    mix_in  = _find_mix_in(beat_times, energy_curve)
    mix_out = _find_mix_out(beat_times, energy_curve, duration)

    return AnalysisResult(
        bpm=round(bpm, 2),
        key=camelot,
        beat_times=beat_times,
        energy_curve=energy_curve,
        suggested_mix_in=round(mix_in, 2),
        suggested_mix_out=round(mix_out, 2),
        duration=round(duration, 2),
    )


def _detect_key(chroma: np.ndarray) -> str:
    major_profile = np.array([6.35, 2.23, 3.48, 2.33, 4.38, 4.09,
                               2.52, 5.19, 2.39, 3.66, 2.29, 2.88])
    minor_profile = np.array([6.33, 2.68, 3.52, 5.38, 2.60, 3.53,
                               2.54, 4.75, 3.98, 2.69, 3.34, 3.17])
    chroma_mean = np.mean(chroma, axis=1)
    note_names  = ["C","C#","D","D#","E","F","F#","G","G#","A","A#","B"]

    best_score, best_key = -np.inf, "C major"
    for i in range(12):
        rotated = np.roll(chroma_mean, -i)
        for profile, mode in [(major_profile, "major"), (minor_profile, "minor")]:
            score = np.corrcoef(rotated, profile)[0, 1]
            if score > best_score:
                best_score, best_key = score, f"{note_names[i]} {mode}"

    return {"A# major": "Bb major", "D# major": "Eb major",
            "G# major": "Ab major"}.get(best_key, best_key)


def _find_mix_in(beat_times, energy_curve, threshold=0.15) -> float:
    for i, e in enumerate(energy_curve):
        if e >= threshold and i < len(beat_times):
            return beat_times[i]
    return beat_times[0] if beat_times else 0.0


def _find_mix_out(beat_times, energy_curve, duration, tail=0.15) -> float:
    tail_start = duration * (1 - tail)
    for i in range(len(beat_times) - 1, -1, -1):
        if beat_times[i] < tail_start and i < len(energy_curve) and energy_curve[i] >= 0.4:
            return beat_times[i]
    return (beat_times[-1] * 0.85) if beat_times else duration * 0.85
