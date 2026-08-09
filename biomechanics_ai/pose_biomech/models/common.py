from __future__ import annotations

import torch
from torch import nn


class MultiTaskHeads(nn.Module):
    def __init__(
        self,
        input_dim: int,
        hidden_dim: int,
        exercise_classes: int,
        form_classes: int,
        dropout: float,
    ):
        super().__init__()
        self.shared = nn.Sequential(
            nn.LayerNorm(input_dim),
            nn.Linear(input_dim, hidden_dim),
            nn.GELU(),
            nn.Dropout(dropout),
        )
        self.exercise = nn.Linear(hidden_dim, exercise_classes)
        self.form = nn.Linear(hidden_dim, form_classes)

    def forward(self, embedding: torch.Tensor) -> dict[str, torch.Tensor]:
        shared = self.shared(embedding)
        return {
            "exercise_logits": self.exercise(shared),
            "form_logits": self.form(shared),
            "embedding": shared,
        }


def masked_mean(values: torch.Tensor, mask: torch.Tensor | None) -> torch.Tensor:
    if mask is None:
        return values.mean(dim=1)
    weights = mask.to(values.dtype).unsqueeze(-1)
    return (values * weights).sum(dim=1) / weights.sum(dim=1).clamp_min(1.0)
