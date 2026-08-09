from __future__ import annotations

import copy
import json
import random
from pathlib import Path
from typing import Any

import numpy as np
import torch
import yaml
from torch import nn
from torch.utils.data import DataLoader

from .dataset import LabelMaps, PoseSequenceDataset, load_manifest, validate_group_splits
from .features import BiomechanicsFeatures
from .metrics import multitask_metrics
from .models import build_model


def load_config(path: str | Path) -> dict[str, Any]:
    config_path = Path(path).resolve()
    with config_path.open("r", encoding="utf-8") as handle:
        config = yaml.safe_load(handle)
    config["_project_dir"] = str(config_path.parent.parent)
    return config


def resolve_device(value: str) -> torch.device:
    if value == "auto":
        if torch.cuda.is_available():
            return torch.device("cuda")
        if hasattr(torch.backends, "mps") and torch.backends.mps.is_available():
            return torch.device("mps")
        return torch.device("cpu")
    return torch.device(value)


def seed_everything(seed: int) -> None:
    random.seed(seed)
    np.random.seed(seed)
    torch.manual_seed(seed)
    if torch.cuda.is_available():
        torch.cuda.manual_seed_all(seed)


def _model_forward(
    model: nn.Module,
    batch: dict[str, torch.Tensor],
    device: torch.device,
) -> dict[str, torch.Tensor]:
    input_kind = getattr(model, "input_kind")
    values = batch[input_kind].to(device, non_blocking=True)
    mask = batch["valid_mask"].to(device, non_blocking=True)
    return model(values, mask)


def _loss(
    output: dict[str, torch.Tensor],
    batch: dict[str, torch.Tensor],
    config: dict[str, Any],
    device: torch.device,
) -> tuple[torch.Tensor, dict[str, float]]:
    training = config["training"]
    exercise_target = batch["exercise_target"].to(device)
    form_target = batch["form_target"].to(device)
    exercise_weights = config.get("_exercise_class_weights")
    form_weights = config.get("_form_class_weights")
    exercise_loss = nn.functional.cross_entropy(
        output["exercise_logits"],
        exercise_target,
        weight=(
            torch.as_tensor(exercise_weights, dtype=torch.float32, device=device)
            if exercise_weights is not None
            else None
        ),
        label_smoothing=float(training.get("label_smoothing", 0.0)),
    )
    form_mask = form_target >= 0
    if form_mask.any():
        form_loss = nn.functional.cross_entropy(
            output["form_logits"][form_mask],
            form_target[form_mask],
            weight=(
                torch.as_tensor(form_weights, dtype=torch.float32, device=device)
                if form_weights is not None
                else None
            ),
            label_smoothing=float(training.get("label_smoothing", 0.0)),
        )
    else:
        form_loss = output["form_logits"].sum() * 0.0
    total = (
        float(training["exercise_loss_weight"]) * exercise_loss
        + float(training["form_loss_weight"]) * form_loss
    )
    return total, {
        "loss": float(total.detach()),
        "exercise_loss": float(exercise_loss.detach()),
        "form_loss": float(form_loss.detach()),
    }


def run_epoch(
    model: nn.Module,
    loader: DataLoader,
    config: dict[str, Any],
    device: torch.device,
    optimizer: torch.optim.Optimizer | None = None,
) -> tuple[dict[str, float], dict[str, np.ndarray]]:
    training = optimizer is not None
    model.train(training)
    losses: list[dict[str, float]] = []
    collected: dict[str, list[np.ndarray]] = {
        "exercise_target": [],
        "form_target": [],
        "exercise_probability": [],
        "form_probability": [],
    }
    for batch in loader:
        if optimizer is not None:
            optimizer.zero_grad(set_to_none=True)
        with torch.set_grad_enabled(training):
            output = _model_forward(model, batch, device)
            loss, loss_parts = _loss(output, batch, config, device)
            if optimizer is not None:
                loss.backward()
                nn.utils.clip_grad_norm_(
                    model.parameters(), float(config["training"]["grad_clip_norm"])
                )
                optimizer.step()
        losses.append(loss_parts)
        collected["exercise_target"].append(batch["exercise_target"].numpy())
        collected["form_target"].append(batch["form_target"].numpy())
        collected["exercise_probability"].append(
            output["exercise_logits"].softmax(dim=-1).detach().cpu().numpy()
        )
        collected["form_probability"].append(
            output["form_logits"].softmax(dim=-1).detach().cpu().numpy()
        )
    mean_losses = {
        key: float(np.mean([entry[key] for entry in losses])) for key in losses[0]
    }
    arrays = {key: np.concatenate(value) for key, value in collected.items()}
    return mean_losses, arrays


def build_training_components(config: dict[str, Any]):
    data_config = config["data"]
    project_dir = Path(config["_project_dir"])
    manifest_path = Path(data_config["manifest"])
    if not manifest_path.is_absolute():
        manifest_path = project_dir / manifest_path
    manifest = load_manifest(manifest_path)
    validate_group_splits(manifest, "trainer_id")
    if "source_video_path" in manifest.columns:
        validate_group_splits(manifest, "source_video_path")

    label_maps = LabelMaps.from_classes(
        data_config["exercise_classes"], data_config["form_classes"]
    )
    feature_extractor = BiomechanicsFeatures(
        visibility_threshold=float(data_config["visibility_threshold"]),
        min_visible_ratio=float(data_config["min_visible_ratio"]),
    )
    augment_config = data_config["augment"]
    common = {
        "manifest": manifest,
        "label_maps": label_maps,
        "feature_extractor": feature_extractor,
        "window_frames": int(data_config["window_frames"]),
    }
    train_dataset = PoseSequenceDataset(
        split="train",
        augment=bool(augment_config["enabled"]),
        mirror_probability=float(augment_config["mirror_probability"]),
        noise_std=float(augment_config["noise_std"]),
        time_warp_range=tuple(augment_config["time_warp_range"]),
        seed=int(config["seed"]),
        **common,
    )
    val_dataset = PoseSequenceDataset(split="val", augment=False, **common)

    model_config = config["model"]
    model = build_model(
        model_config["type"],
        input_dim=feature_extractor.sequence_dim,
        graph_channels=feature_extractor.graph_channels,
        hidden_dim=int(model_config["hidden_dim"]),
        layers=int(model_config["layers"]),
        heads=int(model_config.get("heads", 4)),
        dropout=float(model_config["dropout"]),
        exercise_classes=len(data_config["exercise_classes"]),
        form_classes=len(data_config["form_classes"]),
    )
    return model, train_dataset, val_dataset


def train(config_path: str | Path) -> Path:
    config = load_config(config_path)
    seed_everything(int(config["seed"]))
    device = resolve_device(config["device"])
    model, train_dataset, val_dataset = build_training_components(config)
    if config["training"].get("class_weighting") == "balanced":
        exercise_counts = (
            train_dataset.frame["exercise_label"]
            .value_counts()
            .reindex(config["data"]["exercise_classes"], fill_value=0)
            .to_numpy(dtype=np.float32)
        )
        form_counts = (
            train_dataset.frame["form_label"]
            .value_counts()
            .reindex(config["data"]["form_classes"], fill_value=0)
            .to_numpy(dtype=np.float32)
        )

        def balanced_weights(counts: np.ndarray) -> list[float]:
            present = counts > 0
            weights = np.zeros_like(counts)
            weights[present] = counts[present].sum() / (present.sum() * counts[present])
            return weights.tolist()

        config["_exercise_class_weights"] = balanced_weights(exercise_counts)
        config["_form_class_weights"] = balanced_weights(form_counts)
    model.to(device)
    training = config["training"]
    loader_options = {
        "batch_size": int(training["batch_size"]),
        "num_workers": int(training["num_workers"]),
        "pin_memory": device.type == "cuda",
    }
    train_loader = DataLoader(train_dataset, shuffle=True, **loader_options)
    val_loader = DataLoader(val_dataset, shuffle=False, **loader_options)
    optimizer = torch.optim.AdamW(
        model.parameters(),
        lr=float(training["learning_rate"]),
        weight_decay=float(training["weight_decay"]),
    )
    scheduler = torch.optim.lr_scheduler.CosineAnnealingLR(
        optimizer, T_max=int(training["epochs"])
    )

    output_dir = Path(training["output_dir"])
    if not output_dir.is_absolute():
        output_dir = Path(config["_project_dir"]) / output_dir
    output_dir.mkdir(parents=True, exist_ok=True)
    checkpoint_path = output_dir / "best.pt"
    history: list[dict[str, Any]] = []
    best_score = -float("inf")
    patience = 0

    for epoch in range(1, int(training["epochs"]) + 1):
        train_losses, _ = run_epoch(model, train_loader, config, device, optimizer)
        val_losses, arrays = run_epoch(model, val_loader, config, device)
        metrics = multitask_metrics(
            arrays["exercise_target"],
            arrays["exercise_probability"],
            arrays["form_target"],
            arrays["form_probability"],
            config["data"]["exercise_classes"],
            config["data"]["form_classes"],
        )
        score = metrics["exercise"]["macro_f1"]
        if "form" in metrics:
            score = 0.5 * score + 0.5 * metrics["form"]["macro_f1"]
        record = {
            "epoch": epoch,
            "learning_rate": optimizer.param_groups[0]["lr"],
            "train": train_losses,
            "validation": val_losses,
            "metrics": metrics,
            "selection_score": score,
        }
        history.append(record)
        print(json.dumps(record, ensure_ascii=False))

        if score > best_score:
            best_score = score
            patience = 0
            torch.save(
                {
                    "state_dict": copy.deepcopy(model.state_dict()),
                    "config": {key: value for key, value in config.items() if not key.startswith("_")},
                    "feature_dim": train_dataset.features.sequence_dim,
                    "graph_channels": train_dataset.features.graph_channels,
                    "epoch": epoch,
                    "selection_score": score,
                },
                checkpoint_path,
            )
        else:
            patience += 1
        scheduler.step()
        if patience >= int(training["patience"]):
            break

    (output_dir / "history.json").write_text(
        json.dumps(history, indent=2, ensure_ascii=False), encoding="utf-8"
    )
    return checkpoint_path


def evaluate_checkpoint(
    checkpoint_path: str | Path,
    manifest_path: str | Path | None = None,
    split: str = "test",
) -> dict[str, Any]:
    checkpoint = torch.load(checkpoint_path, map_location="cpu", weights_only=False)
    config = checkpoint["config"]
    config["_project_dir"] = str(Path(checkpoint_path).resolve().parents[2])
    if manifest_path is not None:
        config["data"]["manifest"] = str(Path(manifest_path).resolve())
    device = resolve_device(config["device"])
    data_config = config["data"]
    path = Path(data_config["manifest"])
    if not path.is_absolute():
        path = Path(config["_project_dir"]) / path
    manifest = load_manifest(path)
    labels = LabelMaps.from_classes(
        data_config["exercise_classes"], data_config["form_classes"]
    )
    features = BiomechanicsFeatures(
        visibility_threshold=float(data_config["visibility_threshold"]),
        min_visible_ratio=float(data_config["min_visible_ratio"]),
    )
    dataset = PoseSequenceDataset(
        manifest,
        split,
        labels,
        features,
        window_frames=int(data_config["window_frames"]),
    )
    model_config = config["model"]
    model = build_model(
        model_config["type"],
        input_dim=features.sequence_dim,
        graph_channels=features.graph_channels,
        hidden_dim=int(model_config["hidden_dim"]),
        layers=int(model_config["layers"]),
        heads=int(model_config.get("heads", 4)),
        dropout=float(model_config["dropout"]),
        exercise_classes=len(data_config["exercise_classes"]),
        form_classes=len(data_config["form_classes"]),
    )
    model.load_state_dict(checkpoint["state_dict"])
    model.to(device)
    loader = DataLoader(
        dataset,
        batch_size=int(config["training"]["batch_size"]),
        shuffle=False,
        num_workers=int(config["training"]["num_workers"]),
    )
    losses, arrays = run_epoch(model, loader, config, device)
    result = {
        "losses": losses,
        "metrics": multitask_metrics(
            arrays["exercise_target"],
            arrays["exercise_probability"],
            arrays["form_target"],
            arrays["form_probability"],
            data_config["exercise_classes"],
            data_config["form_classes"],
        ),
    }
    output = Path(checkpoint_path).resolve().parent / f"evaluation_{split}.json"
    output.write_text(json.dumps(result, indent=2, ensure_ascii=False), encoding="utf-8")
    return result
