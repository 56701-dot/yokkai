from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path

import numpy as np
import pandas as pd
import torch
from torch.utils.data import Dataset

from .constants import LEFT_RIGHT_PAIRS
from .features import BiomechanicsFeatures


REQUIRED_COLUMNS = {
    "sample_id",
    "landmarks_path",
    "trainer_id",
    "exercise_label",
    "form_label",
    "split",
}


@dataclass(frozen=True)
class LabelMaps:
    exercise: dict[str, int]
    form: dict[str, int]

    @classmethod
    def from_classes(cls, exercise_classes: list[str], form_classes: list[str]) -> "LabelMaps":
        return cls(
            exercise={name: index for index, name in enumerate(exercise_classes)},
            form={name: index for index, name in enumerate(form_classes)},
        )


def load_manifest(path: str | Path) -> pd.DataFrame:
    manifest_path = Path(path)
    frame = pd.read_csv(manifest_path)
    missing = REQUIRED_COLUMNS - set(frame.columns)
    if missing:
        raise ValueError(f"Manifest is missing columns: {sorted(missing)}")
    if frame["sample_id"].duplicated().any():
        raise ValueError("sample_id must be unique")
    frame.attrs["root"] = manifest_path.resolve().parent
    return frame


def validate_group_splits(frame: pd.DataFrame, group_column: str = "trainer_id") -> None:
    """Raise when a trainer/source appears in multiple splits."""
    counts = frame.groupby(group_column)["split"].nunique()
    leaking = counts[counts > 1].index.tolist()
    if leaking:
        raise ValueError(f"Data leakage: {group_column} appears in multiple splits: {leaking[:10]}")


def resample_sequence(
    landmarks: np.ndarray,
    target_frames: int,
    timestamps: np.ndarray | None = None,
) -> tuple[np.ndarray, np.ndarray]:
    if len(landmarks) == 0:
        raise ValueError("Cannot resample an empty sequence")
    source_time = (
        np.asarray(timestamps, dtype=np.float32)
        if timestamps is not None
        else np.linspace(0.0, 1.0, len(landmarks), dtype=np.float32)
    )
    target_time = np.linspace(source_time[0], source_time[-1], target_frames, dtype=np.float32)
    flattened = np.asarray(landmarks, dtype=np.float32).reshape(len(landmarks), -1)
    output = np.empty((target_frames, flattened.shape[1]), dtype=np.float32)
    for channel in range(flattened.shape[1]):
        output[:, channel] = np.interp(target_time, source_time, flattened[:, channel])
    return output.reshape(target_frames, 33, 4), target_time


class PoseSequenceDataset(Dataset):
    def __init__(
        self,
        manifest: pd.DataFrame,
        split: str,
        label_maps: LabelMaps,
        feature_extractor: BiomechanicsFeatures,
        *,
        window_frames: int = 96,
        augment: bool = False,
        mirror_probability: float = 0.5,
        noise_std: float = 0.008,
        time_warp_range: tuple[float, float] = (0.9, 1.1),
        seed: int = 42,
    ):
        self.frame = manifest.loc[manifest["split"] == split].reset_index(drop=True)
        if self.frame.empty:
            raise ValueError(f"No rows found for split={split!r}")
        self.root = Path(manifest.attrs.get("root", "."))
        self.labels = label_maps
        self.features = feature_extractor
        self.window_frames = window_frames
        self.augment = augment
        self.mirror_probability = mirror_probability
        self.noise_std = noise_std
        self.time_warp_range = time_warp_range
        self.rng = np.random.default_rng(seed)

    def __len__(self) -> int:
        return len(self.frame)

    def __getitem__(self, index: int) -> dict[str, torch.Tensor | str]:
        row = self.frame.iloc[index]
        path = Path(row["landmarks_path"])
        path = path if path.is_absolute() else self.root / path
        with np.load(path, allow_pickle=False) as payload:
            landmarks = payload["landmarks"].astype(np.float32)
            timestamps = payload["timestamps"].astype(np.float32) if "timestamps" in payload else None

        if self.augment:
            landmarks, timestamps = self._augment(landmarks, timestamps)
        landmarks, timestamps = resample_sequence(landmarks, self.window_frames, timestamps)
        batch = self.features.transform(landmarks, timestamps)

        exercise_label = str(row["exercise_label"])
        form_label = str(row["form_label"])
        if exercise_label not in self.labels.exercise:
            raise ValueError(f"Unknown exercise label: {exercise_label}")
        form_index = self.labels.form.get(form_label, -1)
        return {
            "sequence": torch.from_numpy(batch.sequence),
            "graph": torch.from_numpy(batch.graph),
            "valid_mask": torch.from_numpy(batch.valid_mask),
            "exercise_target": torch.tensor(self.labels.exercise[exercise_label], dtype=torch.long),
            "form_target": torch.tensor(form_index, dtype=torch.long),
            "sample_id": str(row["sample_id"]),
        }

    def _augment(
        self,
        landmarks: np.ndarray,
        timestamps: np.ndarray | None,
    ) -> tuple[np.ndarray, np.ndarray | None]:
        augmented = landmarks.copy()
        if self.rng.random() < self.mirror_probability:
            augmented[..., 0] *= -1.0
            for left, right in LEFT_RIGHT_PAIRS:
                augmented[:, [left, right]] = augmented[:, [right, left]]
        noise = self.rng.normal(0.0, self.noise_std, augmented[..., :3].shape)
        augmented[..., :3] += noise.astype(np.float32) * augmented[..., 3:4]
        if timestamps is not None:
            speed = self.rng.uniform(*self.time_warp_range)
            timestamps = timestamps / speed
        return augmented, timestamps
