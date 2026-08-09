from __future__ import annotations

import numpy as np
import torch
from torch import nn

from ..constants import LANDMARK_COUNT, POSE_EDGES
from .common import MultiTaskHeads


def normalized_adjacency() -> torch.Tensor:
    adjacency = np.eye(LANDMARK_COUNT, dtype=np.float32)
    for source, target in POSE_EDGES:
        adjacency[source, target] = 1.0
        adjacency[target, source] = 1.0
    degree = adjacency.sum(axis=1)
    inv_sqrt = np.diag(np.power(np.maximum(degree, 1.0), -0.5))
    return torch.from_numpy(inv_sqrt @ adjacency @ inv_sqrt)


class STGCNBlock(nn.Module):
    def __init__(self, input_dim: int, output_dim: int, dropout: float):
        super().__init__()
        self.graph_projection = nn.Linear(input_dim, output_dim)
        self.temporal = nn.Sequential(
            nn.Conv2d(output_dim, output_dim, kernel_size=(5, 1), padding=(2, 0)),
            nn.BatchNorm2d(output_dim),
            nn.GELU(),
            nn.Dropout(dropout),
        )
        self.residual = (
            nn.Identity()
            if input_dim == output_dim
            else nn.Linear(input_dim, output_dim, bias=False)
        )

    def forward(self, values: torch.Tensor, adjacency: torch.Tensor) -> torch.Tensor:
        # values: [B, T, V, C]
        graph = torch.einsum("vw,btwc->btvc", adjacency, values)
        graph = self.graph_projection(graph)
        temporal = self.temporal(graph.permute(0, 3, 1, 2)).permute(0, 2, 3, 1)
        return temporal + self.residual(values)


class PoseSTGCN(nn.Module):
    input_kind = "graph"

    def __init__(
        self,
        graph_channels: int,
        hidden_dim: int,
        layers: int,
        exercise_classes: int,
        form_classes: int,
        dropout: float = 0.2,
        **_: object,
    ):
        super().__init__()
        self.register_buffer("adjacency", normalized_adjacency())
        dimensions = [graph_channels] + [hidden_dim] * layers
        self.blocks = nn.ModuleList(
            STGCNBlock(dimensions[index], dimensions[index + 1], dropout)
            for index in range(layers)
        )
        self.heads = MultiTaskHeads(
            hidden_dim,
            hidden_dim,
            exercise_classes,
            form_classes,
            dropout,
        )

    def forward(
        self,
        graph: torch.Tensor,
        valid_mask: torch.Tensor | None = None,
    ) -> dict[str, torch.Tensor]:
        encoded = graph
        for block in self.blocks:
            encoded = block(encoded, self.adjacency)
        if valid_mask is None:
            pooled = encoded.mean(dim=(1, 2))
        else:
            weights = valid_mask.to(encoded.dtype)[:, :, None, None]
            pooled = (encoded * weights).sum(dim=(1, 2))
            denominator = (
                valid_mask.to(encoded.dtype).sum(dim=1, keepdim=True) * encoded.shape[2]
            )
            pooled = pooled / denominator.clamp_min(1.0)
        return self.heads(pooled)
