from __future__ import annotations

import math

import torch
from torch import nn

from .common import MultiTaskHeads, masked_mean


class SinusoidalPositionEncoding(nn.Module):
    def __init__(self, hidden_dim: int, max_frames: int = 512):
        super().__init__()
        position = torch.arange(max_frames).unsqueeze(1)
        frequency = torch.exp(
            torch.arange(0, hidden_dim, 2) * (-math.log(10_000.0) / hidden_dim)
        )
        encoding = torch.zeros(max_frames, hidden_dim)
        encoding[:, 0::2] = torch.sin(position * frequency)
        encoding[:, 1::2] = torch.cos(position * frequency[: encoding[:, 1::2].shape[1]])
        self.register_buffer("encoding", encoding.unsqueeze(0), persistent=False)

    def forward(self, values: torch.Tensor) -> torch.Tensor:
        return values + self.encoding[:, : values.shape[1]]


class PoseTransformer(nn.Module):
    input_kind = "sequence"

    def __init__(
        self,
        input_dim: int,
        hidden_dim: int,
        layers: int,
        heads: int,
        exercise_classes: int,
        form_classes: int,
        dropout: float = 0.2,
        **_: object,
    ):
        super().__init__()
        if hidden_dim % heads:
            raise ValueError("hidden_dim must be divisible by heads")
        self.projection = nn.Sequential(nn.LayerNorm(input_dim), nn.Linear(input_dim, hidden_dim))
        self.position = SinusoidalPositionEncoding(hidden_dim)
        layer = nn.TransformerEncoderLayer(
            d_model=hidden_dim,
            nhead=heads,
            dim_feedforward=hidden_dim * 4,
            dropout=dropout,
            activation="gelu",
            batch_first=True,
            norm_first=True,
        )
        self.encoder = nn.TransformerEncoder(layer, num_layers=layers, enable_nested_tensor=False)
        self.heads = MultiTaskHeads(
            hidden_dim,
            hidden_dim,
            exercise_classes,
            form_classes,
            dropout,
        )

    def forward(
        self,
        sequence: torch.Tensor,
        valid_mask: torch.Tensor | None = None,
    ) -> dict[str, torch.Tensor]:
        encoded = self.position(self.projection(sequence))
        padding_mask = ~valid_mask if valid_mask is not None else None
        encoded = self.encoder(encoded, src_key_padding_mask=padding_mask)
        return self.heads(masked_mean(encoded, valid_mask))
