import numpy as np

from pose_biomech.features import BiomechanicsFeatures


def synthetic_pose(frames: int = 20) -> np.ndarray:
    pose = np.zeros((frames, 33, 4), dtype=np.float32)
    pose[..., 3] = 1.0
    pose[:, 23, :3] = [-0.2, 0.0, 0.0]
    pose[:, 24, :3] = [0.2, 0.0, 0.0]
    pose[:, 11, :3] = [-0.25, -0.7, 0.0]
    pose[:, 12, :3] = [0.25, -0.7, 0.0]
    pose[:, 25, :3] = [-0.2, 0.7, 0.0]
    pose[:, 26, :3] = [0.2, 0.7, 0.0]
    pose[:, 27, :3] = [-0.2, 1.4, 0.0]
    pose[:, 28, :3] = [0.2, 1.4, 0.0]
    pose[:, 13, :3] = [-0.5, -0.4, 0.0]
    pose[:, 14, :3] = [0.5, -0.4, 0.0]
    pose[:, 15, :3] = [-0.6, 0.0, 0.0]
    pose[:, 16, :3] = [0.6, 0.0, 0.0]
    pose[:, 31, :3] = [-0.2, 1.5, -0.2]
    pose[:, 32, :3] = [0.2, 1.5, -0.2]
    return pose


def test_feature_shapes_and_finiteness():
    extractor = BiomechanicsFeatures()
    result = extractor.transform(synthetic_pose())
    assert result.sequence.shape == (20, extractor.sequence_dim)
    assert result.graph.shape == (20, 33, extractor.graph_channels)
    assert result.valid_mask.all()
    assert np.isfinite(result.sequence).all()


def test_translation_and_scale_invariance():
    extractor = BiomechanicsFeatures()
    pose = synthetic_pose()
    transformed = pose.copy()
    transformed[..., :3] = transformed[..., :3] * 2.7 + np.array([4.0, -3.0, 1.2])
    original_features = extractor.transform(pose).sequence
    transformed_features = extractor.transform(transformed).sequence
    np.testing.assert_allclose(original_features, transformed_features, atol=2e-4)
