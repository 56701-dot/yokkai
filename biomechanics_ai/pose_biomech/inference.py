from __future__ import annotations

from collections import deque
from dataclasses import asdict, dataclass
from pathlib import Path
from typing import Any

import numpy as np
import torch

from .dataset import resample_sequence
from .features import BiomechanicsFeatures
from .models import build_model
from .training import resolve_device


@dataclass(frozen=True)
class Prediction:
    ready: bool
    exercise: str | None = None
    exercise_confidence: float = 0.0
    form: str | None = None
    form_confidence: float = 0.0
    valid_frame_ratio: float = 0.0
    abstained: bool = False
    reason: str | None = None

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


class RealtimePoseClassifier:
    """Stateful sliding-window inference with confidence gating and EMA smoothing."""

    def __init__(
        self,
        checkpoint_path: str | Path,
        *,
        device: str | None = None,
    ):
        checkpoint = torch.load(checkpoint_path, map_location="cpu", weights_only=False)
        self.config = checkpoint["config"]
        data = self.config["data"]
        model_config = self.config["model"]
        self.exercise_classes = list(data["exercise_classes"])
        self.form_classes = list(data["form_classes"])
        self.window_frames = int(data["window_frames"])
        self.features = BiomechanicsFeatures(
            visibility_threshold=float(data["visibility_threshold"]),
            min_visible_ratio=float(data["min_visible_ratio"]),
        )
        self.device = resolve_device(device or self.config.get("device", "auto"))
        self.model = build_model(
            model_config["type"],
            input_dim=self.features.sequence_dim,
            graph_channels=self.features.graph_channels,
            hidden_dim=int(model_config["hidden_dim"]),
            layers=int(model_config["layers"]),
            heads=int(model_config.get("heads", 4)),
            dropout=float(model_config["dropout"]),
            exercise_classes=len(self.exercise_classes),
            form_classes=len(self.form_classes),
        )
        self.model.load_state_dict(checkpoint["state_dict"])
        self.model.to(self.device).eval()

        inference = self.config["inference"]
        self.exercise_threshold = float(inference["confidence_threshold"])
        self.form_threshold = float(inference["form_confidence_threshold"])
        self.smoothing_alpha = float(inference["smoothing_alpha"])
        self.stride_frames = int(inference["stride_frames"])
        self.min_valid_frames = float(inference["min_valid_frames"])
        self.landmark_buffer: deque[np.ndarray] = deque(maxlen=self.window_frames)
        self.timestamp_buffer: deque[float] = deque(maxlen=self.window_frames)
        self.frame_counter = 0
        self._exercise_ema: np.ndarray | None = None
        self._form_ema: np.ndarray | None = None

    def reset(self) -> None:
        self.landmark_buffer.clear()
        self.timestamp_buffer.clear()
        self.frame_counter = 0
        self._exercise_ema = None
        self._form_ema = None

    def push(self, landmarks: np.ndarray, timestamp: float) -> Prediction:
        frame = np.asarray(landmarks, dtype=np.float32)
        if frame.shape != (33, 4):
            raise ValueError(f"Expected one [33, 4] frame, got {frame.shape}")
        self.landmark_buffer.append(frame)
        self.timestamp_buffer.append(float(timestamp))
        self.frame_counter += 1
        if len(self.landmark_buffer) < self.window_frames:
            return Prediction(
                ready=False,
                reason=f"collecting_window:{len(self.landmark_buffer)}/{self.window_frames}",
            )
        if self.frame_counter % self.stride_frames:
            return Prediction(ready=False, reason="stride")
        return self.predict_window(
            np.stack(self.landmark_buffer),
            np.asarray(self.timestamp_buffer, dtype=np.float32),
            smooth=True,
        )

    def predict_window(
        self,
        landmarks: np.ndarray,
        timestamps: np.ndarray | None = None,
        *,
        smooth: bool = False,
    ) -> Prediction:
        values = np.asarray(landmarks, dtype=np.float32)
        if values.ndim != 3 or values.shape[1:] != (33, 4):
            raise ValueError(f"Expected [T, 33, 4], got {values.shape}")
        if len(values) != self.window_frames:
            values, timestamps = resample_sequence(values, self.window_frames, timestamps)
        features = self.features.transform(values, timestamps)
        valid_ratio = float(features.valid_mask.mean())
        if valid_ratio < self.min_valid_frames:
            return Prediction(
                ready=True,
                valid_frame_ratio=valid_ratio,
                abstained=True,
                reason="insufficient_visible_landmarks",
            )

        input_name = getattr(self.model, "input_kind")
        selected = features.sequence if input_name == "sequence" else features.graph
        tensor = torch.from_numpy(selected).unsqueeze(0).to(self.device)
        mask = torch.from_numpy(features.valid_mask).unsqueeze(0).to(self.device)
        with torch.inference_mode():
            output = self.model(tensor, mask)
        exercise_probability = output["exercise_logits"].softmax(-1)[0].cpu().numpy()
        form_probability = output["form_logits"].softmax(-1)[0].cpu().numpy()
        if smooth:
            exercise_probability = self._smooth(exercise_probability, "exercise")
            form_probability = self._smooth(form_probability, "form")

        exercise_index = int(exercise_probability.argmax())
        form_index = int(form_probability.argmax())
        exercise_confidence = float(exercise_probability[exercise_index])
        form_confidence = float(form_probability[form_index])
        abstained = exercise_confidence < self.exercise_threshold
        form = (
            self.form_classes[form_index]
            if not abstained and form_confidence >= self.form_threshold
            else None
        )
        reason = None
        if abstained:
            reason = "low_exercise_confidence"
        elif form is None:
            reason = "low_form_confidence"
        return Prediction(
            ready=True,
            exercise=None if abstained else self.exercise_classes[exercise_index],
            exercise_confidence=exercise_confidence,
            form=form,
            form_confidence=form_confidence,
            valid_frame_ratio=valid_ratio,
            abstained=abstained,
            reason=reason,
        )

    def _smooth(self, probability: np.ndarray, target: str) -> np.ndarray:
        attribute = "_exercise_ema" if target == "exercise" else "_form_ema"
        previous = getattr(self, attribute)
        smoothed = (
            probability
            if previous is None
            else self.smoothing_alpha * probability + (1.0 - self.smoothing_alpha) * previous
        )
        setattr(self, attribute, smoothed)
        return smoothed
