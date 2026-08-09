from __future__ import annotations

import torch
from torch import nn

from .common import MultiTaskHeads, masked_mean


class PoseLSTM(nn.Module):
    input_kind = "sequence"

    def __init__(
        self,
        input_dim: int,
        hidden_dim: int,
        layers: int,
        exercise_classes: int,
        form_classes: int,
        dropout: float = 0.2,
        **_: object,
    ):
        super().__init__()
        recurrent_dropout = dropout if layers > 1 else 0.0
        self.input_norm = nn.LayerNorm(input_dim)
        self.encoder = nn.LSTM(
            input_dim,
            hidden_dim,
            num_layers=layers,
            batch_first=True,
            bidirectional=True,
            dropout=recurrent_dropout,
        )
        self.heads = MultiTaskHeads(
            hidden_dim * 2,
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
        encoded, _ = self.encoder(self.input_norm(sequence))
        return self.heads(masked_mean(encoded, valid_mask))
