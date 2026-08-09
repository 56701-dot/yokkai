from __future__ import annotations

from pathlib import Path
from typing import Any

import numpy as np

from .inference import RealtimePoseClassifier


def create_app(checkpoint_path: str | Path, device: str | None = None):
    """Create a stateless FastAPI bridge suitable for browser BlazePose clients."""
    try:
        from fastapi import FastAPI, HTTPException
    except ImportError as exc:
        raise RuntimeError("Install with: pip install -e '.[serve]'") from exc

    classifier = RealtimePoseClassifier(checkpoint_path, device=device)
    app = FastAPI(title="FitQuest Pose Biomechanics API", version="1.0.0")

    @app.get("/health")
    def health() -> dict[str, Any]:
        return {
            "status": "ok",
            "model": classifier.config["model"]["type"],
            "window_frames": classifier.window_frames,
        }

    @app.post("/v1/predict-window")
    def predict_window(payload: dict[str, Any]) -> dict[str, Any]:
        try:
            landmarks = np.asarray(payload["landmarks"], dtype=np.float32)
            timestamps = payload.get("timestamps")
            timestamp_array = (
                np.asarray(timestamps, dtype=np.float32) if timestamps is not None else None
            )
            return classifier.predict_window(landmarks, timestamp_array).to_dict()
        except (KeyError, TypeError, ValueError) as exc:
            raise HTTPException(status_code=422, detail=str(exc)) from exc

    return app
