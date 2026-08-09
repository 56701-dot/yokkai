from __future__ import annotations

from dataclasses import dataclass

import numpy as np

from .constants import IDX, JOINT_ANGLES, LANDMARK_COUNT


@dataclass(frozen=True)
class FeatureBatch:
    """Features for sequence models and graph models from the same pose window."""

    sequence: np.ndarray  # [T, F]
    graph: np.ndarray  # [T, V, 7] = xyz, velocity xyz, visibility
    valid_mask: np.ndarray  # [T]


def _safe_unit(vector: np.ndarray, fallback: np.ndarray) -> np.ndarray:
    norm = np.linalg.norm(vector, axis=-1, keepdims=True)
    return np.where(norm > 1e-6, vector / np.maximum(norm, 1e-6), fallback)


def _central_difference(values: np.ndarray, timestamps: np.ndarray) -> np.ndarray:
    output = np.zeros_like(values, dtype=np.float32)
    if len(values) < 2:
        return output
    dt = np.maximum(np.diff(timestamps), 1e-3)
    output[0] = (values[1] - values[0]) / dt[0]
    output[-1] = (values[-1] - values[-2]) / dt[-1]
    if len(values) > 2:
        span = np.maximum(timestamps[2:] - timestamps[:-2], 1e-3)
        reshape = (len(span),) + (1,) * (values.ndim - 1)
        output[1:-1] = (values[2:] - values[:-2]) / span.reshape(reshape)
    return output


class BiomechanicsFeatures:
    """Convert BlazePose landmarks into camera/scale-invariant movement features."""

    def __init__(self, visibility_threshold: float = 0.5, min_visible_ratio: float = 0.55):
        self.visibility_threshold = visibility_threshold
        self.min_visible_ratio = min_visible_ratio

    @property
    def sequence_dim(self) -> int:
        angle_count = len(JOINT_ANGLES)
        return LANDMARK_COUNT * 3 * 2 + angle_count * 2 + LANDMARK_COUNT

    @property
    def graph_channels(self) -> int:
        return 7

    def transform(
        self,
        landmarks: np.ndarray,
        timestamps: np.ndarray | None = None,
    ) -> FeatureBatch:
        """
        Args:
            landmarks: [T, 33, 4] in x, y, z, visibility order. World landmarks are preferred.
            timestamps: monotonic seconds. Uniform 30 FPS is assumed when omitted.
        """
        points = np.asarray(landmarks, dtype=np.float32)
        if points.ndim != 3 or points.shape[1:] != (LANDMARK_COUNT, 4):
            raise ValueError(f"Expected [T, 33, 4], got {points.shape}")
        if not np.isfinite(points).all():
            points = self._interpolate_non_finite(points)

        frame_count = len(points)
        if timestamps is None:
            timestamps = np.arange(frame_count, dtype=np.float32) / 30.0
        timestamps = np.asarray(timestamps, dtype=np.float32)
        if timestamps.shape != (frame_count,):
            raise ValueError("timestamps must have shape [T]")

        visibility = np.clip(points[..., 3], 0.0, 1.0)
        normalized = self._normalize_body_frame(points[..., :3], visibility)
        velocity = _central_difference(normalized, timestamps)
        angles = self._joint_angles(normalized)
        angular_velocity = _central_difference(angles, timestamps)

        sequence = np.concatenate(
            (
                normalized.reshape(frame_count, -1),
                velocity.reshape(frame_count, -1),
                angles,
                angular_velocity,
                visibility,
            ),
            axis=-1,
        ).astype(np.float32)
        graph = np.concatenate(
            (normalized, velocity, visibility[..., None]),
            axis=-1,
        ).astype(np.float32)
        valid_mask = (
            np.mean(visibility >= self.visibility_threshold, axis=1) >= self.min_visible_ratio
        )
        return FeatureBatch(sequence=sequence, graph=graph, valid_mask=valid_mask)

    def _normalize_body_frame(
        self,
        positions: np.ndarray,
        visibility: np.ndarray,
    ) -> np.ndarray:
        left_hip, right_hip = positions[:, IDX["left_hip"]], positions[:, IDX["right_hip"]]
        left_shoulder = positions[:, IDX["left_shoulder"]]
        right_shoulder = positions[:, IDX["right_shoulder"]]
        hip_center = (left_hip + right_hip) * 0.5
        shoulder_center = (left_shoulder + right_shoulder) * 0.5

        lateral = right_hip - left_hip
        shoulder_lateral = right_shoulder - left_shoulder
        lateral_ok = (
            visibility[:, IDX["left_hip"]] >= self.visibility_threshold
        ) & (visibility[:, IDX["right_hip"]] >= self.visibility_threshold)
        lateral = np.where(lateral_ok[:, None], lateral, shoulder_lateral)

        up = shoulder_center - hip_center
        x_axis = _safe_unit(lateral, np.array([1.0, 0.0, 0.0], dtype=np.float32))
        up = up - np.sum(up * x_axis, axis=-1, keepdims=True) * x_axis
        y_axis = _safe_unit(up, np.array([0.0, -1.0, 0.0], dtype=np.float32))
        z_axis = _safe_unit(
            np.cross(x_axis, y_axis),
            np.array([0.0, 0.0, -1.0], dtype=np.float32),
        )
        x_axis = _safe_unit(np.cross(y_axis, z_axis), x_axis)

        torso = np.linalg.norm(shoulder_center - hip_center, axis=-1)
        hip_width = np.linalg.norm(right_hip - left_hip, axis=-1)
        scale = np.maximum(torso, hip_width * 1.5)
        reliable = scale > 1e-4
        fallback_scale = np.median(scale[reliable]) if reliable.any() else 1.0
        scale = np.where(reliable, scale, fallback_scale)

        centered = (positions - hip_center[:, None, :]) / scale[:, None, None]
        basis = np.stack((x_axis, y_axis, z_axis), axis=1)
        return np.einsum("tvc,tkc->tvk", centered, basis).astype(np.float32)

    @staticmethod
    def _joint_angles(positions: np.ndarray) -> np.ndarray:
        results = []
        for a, b, c in JOINT_ANGLES.values():
            ba = positions[:, a] - positions[:, b]
            bc = positions[:, c] - positions[:, b]
            denominator = np.linalg.norm(ba, axis=-1) * np.linalg.norm(bc, axis=-1)
            cosine = np.sum(ba * bc, axis=-1) / np.maximum(denominator, 1e-6)
            results.append(np.arccos(np.clip(cosine, -1.0, 1.0)) / np.pi)
        return np.stack(results, axis=-1).astype(np.float32)

    @staticmethod
    def _interpolate_non_finite(points: np.ndarray) -> np.ndarray:
        clean = points.copy()
        time = np.arange(len(clean))
        for landmark in range(clean.shape[1]):
            for channel in range(clean.shape[2]):
                values = clean[:, landmark, channel]
                valid = np.isfinite(values)
                if valid.any():
                    clean[:, landmark, channel] = np.interp(time, time[valid], values[valid])
                else:
                    clean[:, landmark, channel] = 0.0
        return clean
