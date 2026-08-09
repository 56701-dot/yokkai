from __future__ import annotations

from torch import nn

from .lstm import PoseLSTM
from .stgcn import PoseSTGCN
from .transformer import PoseTransformer


MODEL_TYPES = {
    "lstm": PoseLSTM,
    "transformer": PoseTransformer,
    "stgcn": PoseSTGCN,
}


def build_model(model_type: str, **kwargs: object) -> nn.Module:
    normalized = model_type.lower().replace("-", "")
    if normalized not in MODEL_TYPES:
        raise ValueError(f"Unknown model type {model_type!r}; choose from {sorted(MODEL_TYPES)}")
    return MODEL_TYPES[normalized](**kwargs)
