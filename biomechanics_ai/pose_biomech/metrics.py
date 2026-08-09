from __future__ import annotations

from typing import Any

import numpy as np
from sklearn.metrics import (
    accuracy_score,
    balanced_accuracy_score,
    confusion_matrix,
    f1_score,
    precision_recall_fscore_support,
    roc_auc_score,
)


def expected_calibration_error(
    probabilities: np.ndarray,
    targets: np.ndarray,
    bins: int = 15,
) -> float:
    confidence = probabilities.max(axis=1)
    predictions = probabilities.argmax(axis=1)
    edges = np.linspace(0.0, 1.0, bins + 1)
    error = 0.0
    for low, high in zip(edges[:-1], edges[1:]):
        selected = (confidence > low) & (confidence <= high)
        if selected.any():
            accuracy = np.mean(predictions[selected] == targets[selected])
            error += selected.mean() * abs(accuracy - confidence[selected].mean())
    return float(error)


def classification_metrics(
    targets: np.ndarray,
    probabilities: np.ndarray,
    class_names: list[str],
) -> dict[str, Any]:
    predictions = probabilities.argmax(axis=1)
    precision, recall, f1, support = precision_recall_fscore_support(
        targets,
        predictions,
        labels=np.arange(len(class_names)),
        zero_division=0,
    )
    metrics: dict[str, Any] = {
        "accuracy": float(accuracy_score(targets, predictions)),
        "balanced_accuracy": float(balanced_accuracy_score(targets, predictions)),
        "macro_f1": float(f1_score(targets, predictions, average="macro", zero_division=0)),
        "ece": expected_calibration_error(probabilities, targets),
        "confusion_matrix": confusion_matrix(
            targets, predictions, labels=np.arange(len(class_names))
        ).tolist(),
        "per_class": {
            name: {
                "precision": float(precision[index]),
                "recall": float(recall[index]),
                "f1": float(f1[index]),
                "support": int(support[index]),
            }
            for index, name in enumerate(class_names)
        },
    }
    try:
        metrics["macro_auroc_ovr"] = float(
            roc_auc_score(
                targets,
                probabilities,
                labels=np.arange(len(class_names)),
                multi_class="ovr",
                average="macro",
            )
        )
    except ValueError:
        metrics["macro_auroc_ovr"] = None
    return metrics


def multitask_metrics(
    exercise_targets: np.ndarray,
    exercise_probabilities: np.ndarray,
    form_targets: np.ndarray,
    form_probabilities: np.ndarray,
    exercise_classes: list[str],
    form_classes: list[str],
) -> dict[str, Any]:
    result = {
        "exercise": classification_metrics(
            exercise_targets, exercise_probabilities, exercise_classes
        )
    }
    valid_form = form_targets >= 0
    if valid_form.any():
        result["form"] = classification_metrics(
            form_targets[valid_form],
            form_probabilities[valid_form],
            form_classes,
        )
        per_exercise: dict[str, Any] = {}
        for exercise_index, exercise_name in enumerate(exercise_classes):
            selected = valid_form & (exercise_targets == exercise_index)
            if selected.sum() >= 2:
                per_exercise[exercise_name] = classification_metrics(
                    form_targets[selected],
                    form_probabilities[selected],
                    form_classes,
                )
        result["form_by_exercise"] = per_exercise
    return result
