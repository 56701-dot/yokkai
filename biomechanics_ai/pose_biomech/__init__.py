"""Biomechanics-first exercise recognition from MediaPipe BlazePose landmarks."""

from .features import BiomechanicsFeatures, FeatureBatch

__all__ = [
    "BiomechanicsFeatures",
    "FeatureBatch",
    "Prediction",
    "RealtimePoseClassifier",
]

__version__ = "0.1.0"


def __getattr__(name: str):
    # Keep extraction/feature tooling usable before the optional model runtime is loaded.
    if name in {"Prediction", "RealtimePoseClassifier"}:
        from .inference import Prediction, RealtimePoseClassifier

        return {
            "Prediction": Prediction,
            "RealtimePoseClassifier": RealtimePoseClassifier,
        }[name]
    raise AttributeError(name)
