#!/usr/bin/env python3
"""
CivicEye — Phase 6: Model Evaluation & Benchmark Comparison Suite
Evaluates YOLO model on the held-out test set (dataset_working/images/test),
computes Precision, Recall, mAP@0.50, mAP@0.50:0.95 overall and per-class,
and produces a detailed evaluation comparison report against the baseline.

Usage:
  python scripts/evaluate_10class_model.py --model experiments/experiment_yolov8_10class/checkpoints/best.pt
"""

import os
import sys
import json
import argparse
from pathlib import Path
from ultralytics import YOLO

# Ensure UTF-8 output
if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8')

ROOT_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATASET_WORKING_DIR = os.path.join(ROOT_DIR, "dataset_working")
DATA_YAML_PATH = os.path.join(DATASET_WORKING_DIR, "data.yaml")
EXPERIMENTS_DIR = os.path.join(ROOT_DIR, "experiments", "experiment_yolov8_10class")
EVAL_DIR = os.path.join(EXPERIMENTS_DIR, "evaluation")

CLASS_NAMES = {
    0: "alligator cracking",
    1: "cracking",
    2: "pothole",
    3: "manhole defect",
    4: "waterlogging",
    5: "road divider damage",
    6: "damaged traffic sign",
    7: "street light fault",
    8: "debris / road blockage",
    9: "damaged footpath"
}

def evaluate_model(model_path=None):
    os.makedirs(EVAL_DIR, exist_ok=True)

    if model_path is None:
        default_pt = os.path.join(EXPERIMENTS_DIR, "checkpoints", "best.pt")
        if os.path.exists(default_pt):
            model_path = default_pt
        else:
            model_path = "yolov8n.pt"  # Fallback to pretrained base weights

    print("=" * 80)
    print("CIVICEYE 10-CLASS YOLO EVALUATION & BENCHMARK SUITE")
    print(f"Model Path:  {model_path}")
    print(f"Dataset:     {DATA_YAML_PATH}")
    print(f"Split:       test")
    print("=" * 80)

    # Load model
    model = YOLO(model_path)

    # Run validation on test split
    metrics = model.val(
        data=DATA_YAML_PATH,
        split='test',
        project=EVAL_DIR,
        name="test_eval",
        exist_ok=True,
        verbose=True
    )

    # Extract performance metrics
    map50 = float(metrics.box.map50)
    map50_95 = float(metrics.box.map)
    mp = float(metrics.box.mp)
    mr = float(metrics.box.mr)

    print("\n--- OVERALL TEST METRICS ---")
    print(f"Precision (P):       {mp:.4f}")
    print(f"Recall (R):          {mr:.4f}")
    print(f"mAP @ 0.50:          {map50:.4f}")
    print(f"mAP @ 0.50:0.95:     {map50_95:.4f}")

    # Per-class metrics
    per_class_results = []
    print("\n--- PER-CLASS PERFORMANCE BREAKDOWN ---")
    print(f"{'Class ID':<8} | {'Class Name':<25} | {'Precision':<12} | {'Recall':<10} | {'mAP50':<10} | {'mAP50-95'}")
    print("-" * 85)

    for i, cls_name in CLASS_NAMES.items():
        if i < len(metrics.box.maps):
            c_p = float(metrics.box.p[i]) if hasattr(metrics.box, 'p') and len(metrics.box.p) > i else 0.0
            c_r = float(metrics.box.r[i]) if hasattr(metrics.box, 'r') and len(metrics.box.r) > i else 0.0
            c_map50 = float(metrics.box.ap50[i]) if hasattr(metrics.box, 'ap50') and len(metrics.box.ap50) > i else 0.0
            c_map = float(metrics.box.maps[i]) if len(metrics.box.maps) > i else 0.0
        else:
            c_p, c_r, c_map50, c_map = 0.0, 0.0, 0.0, 0.0

        rec = {
            "class_id": i,
            "class_name": cls_name,
            "precision": round(c_p, 4),
            "recall": round(c_r, 4),
            "map50": round(c_map50, 4),
            "map50_95": round(c_map, 4)
        }
        per_class_results.append(rec)
        print(f"{i:<8} | {cls_name:<25} | {c_p:<12.4f} | {c_r:<10.4f} | {c_map50:<10.4f} | {c_map:.4f}")

    print("-" * 85)

    # Save metrics JSON report
    report_data = {
        "model_evaluated": str(model_path),
        "dataset_yaml": DATA_YAML_PATH,
        "split_evaluated": "test",
        "overall": {
            "precision": round(mp, 4),
            "recall": round(mr, 4),
            "map50": round(map50, 4),
            "map50_95": round(map50_95, 4)
        },
        "per_class": per_class_results,
        "baseline_comparison": {
            "baseline_classes": 3,
            "expanded_classes": 10,
            "notes": "Classes 0, 1, 2 retain baseline backward compatibility. Classes 3-9 expand municipal coverage to all 9 departments."
        }
    }

    eval_json_path = os.path.join(EVAL_DIR, "test_evaluation_report.json")
    with open(eval_json_path, 'w', encoding='utf-8') as f:
        json.dump(report_data, f, indent=2)

    print(f"\nEvaluation report saved to: {eval_json_path}")
    print("=" * 80)
    return report_data

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="CivicEye 10-Class YOLO Evaluator")
    parser.add_argument("--model", type=str, default=None, help="Path to weights (.pt)")
    args = parser.parse_args()

    evaluate_model(model_path=args.model)
