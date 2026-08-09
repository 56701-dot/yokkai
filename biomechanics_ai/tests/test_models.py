import pytest
import torch

from pose_biomech.features import BiomechanicsFeatures
from pose_biomech.models import build_model


@pytest.mark.parametrize("model_type", ["lstm", "transformer", "stgcn"])
def test_model_output_contract(model_type):
    features = BiomechanicsFeatures()
    model = build_model(
        model_type,
        input_dim=features.sequence_dim,
        graph_channels=features.graph_channels,
        hidden_dim=48,
        layers=2,
        heads=4,
        dropout=0.1,
        exercise_classes=4,
        form_classes=2,
    )
    mask = torch.ones(2, 24, dtype=torch.bool)
    values = (
        torch.randn(2, 24, features.sequence_dim)
        if model.input_kind == "sequence"
        else torch.randn(2, 24, 33, features.graph_channels)
    )
    output = model(values, mask)
    assert output["exercise_logits"].shape == (2, 4)
    assert output["form_logits"].shape == (2, 2)
    assert output["embedding"].shape == (2, 48)
