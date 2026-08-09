from __future__ import annotations

import json
from dataclasses import dataclass
from pathlib import Path
from typing import Any

import numpy as np


@dataclass(frozen=True)
class ExtractionResult:
    output_path: Path
    frame_count: int
    detected_ratio: float
    fps: float
    used_world_landmarks: bool


def _landmark_array(items: Any) -> np.ndarray | None:
    if items is None:
        return None
    values = getattr(items, "landmark", items)
    if not values:
        return None
    return np.asarray(
        [
            [
                float(point.x),
                float(point.y),
                float(point.z),
                float(getattr(point, "visibility", 1.0)),
            ]
            for point in values
        ],
        dtype=np.float32,
    )


def extract_video(
    video_path: str | Path,
    output_path: str | Path,
    *,
    model_complexity: int = 2,
    min_detection_confidence: float = 0.6,
    min_tracking_confidence: float = 0.6,
    prefer_world_landmarks: bool = True,
) -> ExtractionResult:
    """Extract one BlazePose sequence and save a compressed, audit-friendly NPZ."""
    try:
        import cv2
        import mediapipe as mp
    except ImportError as exc:
        raise RuntimeError("Install the project dependencies before extracting videos") from exc

    source = Path(video_path).resolve()
    destination = Path(output_path).resolve()
    destination.parent.mkdir(parents=True, exist_ok=True)
    capture = cv2.VideoCapture(str(source))
    if not capture.isOpened():
        raise FileNotFoundError(f"Cannot open video: {source}")

    fps = float(capture.get(cv2.CAP_PROP_FPS))
    if not np.isfinite(fps) or fps <= 0:
        fps = 30.0

    frames: list[np.ndarray] = []
    timestamps: list[float] = []
    detected = 0
    used_world = False
    last_valid = np.zeros((33, 4), dtype=np.float32)

    pose_api = mp.solutions.pose
    with pose_api.Pose(
        static_image_mode=False,
        model_complexity=model_complexity,
        smooth_landmarks=True,
        enable_segmentation=False,
        min_detection_confidence=min_detection_confidence,
        min_tracking_confidence=min_tracking_confidence,
    ) as pose:
        frame_index = 0
        while True:
            success, frame = capture.read()
            if not success:
                break
            rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
            result = pose.process(rgb)
            world = _landmark_array(result.pose_world_landmarks)
            image = _landmark_array(result.pose_landmarks)
            selected = world if prefer_world_landmarks and world is not None else image
            if selected is not None:
                last_valid = selected
                detected += 1
                used_world = used_world or selected is world
            else:
                last_valid = last_valid.copy()
                last_valid[:, 3] = 0.0
            frames.append(last_valid)
            timestamps.append(frame_index / fps)
            frame_index += 1
    capture.release()

    if not frames:
        raise ValueError(f"No frames found in video: {source}")

    metadata = {
        "source_video": str(source),
        "fps": fps,
        "coordinate_space": "world" if used_world else "image",
        "model_complexity": model_complexity,
    }
    np.savez_compressed(
        destination,
        landmarks=np.stack(frames),
        timestamps=np.asarray(timestamps, dtype=np.float32),
        metadata=np.asarray(json.dumps(metadata)),
    )
    return ExtractionResult(
        output_path=destination,
        frame_count=len(frames),
        detected_ratio=detected / len(frames),
        fps=fps,
        used_world_landmarks=used_world,
    )
