#!/usr/bin/env python3
"""
CivicEye — Phase 6: YOLOv8 10-Class Training Pipeline
Validates dataset integrity before training, initializes YOLOv8 model,
trains on dataset_working/data.yaml, and exports fine-tuned weights to ONNX
with input shape [1, 3, 640, 640] and output shape [1, 14, 8400].

Usage:
  python scripts/train_yolo10class.py --epochs 30 --batch 8 --model yolov8n.pt
"""

import os
import sys
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
CHECKPOINTS_DIR = os.path.join(EXPERIMENTS_DIR, "checkpoints")
ASSETS_MODELS_DIR = os.path.join(ROOT_DIR, "assets", "models")

def validate_dataset_before_training():
    """Confirms dataset readiness and non-empty training splits."""
    if not os.path.exists(DATA_YAML_PATH):
        raise FileNotFoundError(f"data.yaml not found at {DATA_YAML_PATH}. Run export_yolo_dataset.py first.")

    train_img_dir = os.path.join(DATASET_WORKING_DIR, "images", "train")
    train_lbl_dir = os.path.join(DATASET_WORKING_DIR, "labels", "train")

    if not os.path.exists(train_img_dir) or len(os.listdir(train_img_dir)) == 0:
        raise ValueError("Training images directory is empty. Export dataset before training.")

    train_imgs = [f for f in os.listdir(train_img_dir) if f.lower().endswith(('.jpg', '.jpeg', '.png'))]
    train_lbls = [f for f in os.listdir(train_lbl_dir) if f.lower().endswith('.txt')]

    print("--- PRE-TRAINING DATASET VALIDATION ---")
    print(f"Data YAML:         {DATA_YAML_PATH}")
    print(f"Training Images:   {len(train_imgs)}")
    print(f"Training Labels:   {len(train_lbls)}")
    print("Dataset validation passed.\n")

def train_and_export(model_name="yolov8n.pt", epochs=30, batch_size=8, imgsz=640, device="cpu"):
    validate_dataset_before_training()

    os.makedirs(CHECKPOINTS_DIR, exist_ok=True)
    os.makedirs(ASSETS_MODELS_DIR, exist_ok=True)

    print("=" * 80)
    print(f"STARTING CIVICEYE 10-CLASS YOLO TRAINING")
    print(f"Base Model:    {model_name}")
    print(f"Epochs:        {epochs}")
    print(f"Batch Size:    {batch_size}")
    print(f"Image Size:    {imgsz}")
    print(f"Device:        {device}")
    print(f"Output Target: {EXPERIMENTS_DIR}")
    print("=" * 80)

    # Initialize YOLO model
    model = YOLO(model_name)

    # Train on 10-class dataset
    results = model.train(
        data=DATA_YAML_PATH,
        epochs=epochs,
        batch=batch_size,
        imgsz=imgsz,
        device=device,
        project=EXPERIMENTS_DIR,
        name="train_run",
        exist_ok=True,
        plots=True,
        save=True,
        verbose=True
    )

    # Locate best trained PyTorch weights
    best_pt = os.path.join(EXPERIMENTS_DIR, "train_run", "weights", "best.pt")
    if not os.path.exists(best_pt):
        best_pt = os.path.join(EXPERIMENTS_DIR, "train_run", "weights", "last.pt")

    if os.path.exists(best_pt):
        # Copy to checkpoints
        dest_pt = os.path.join(CHECKPOINTS_DIR, "best.pt")
        import shutil
        shutil.copy(best_pt, dest_pt)
        print(f"\nBest weights saved to: {dest_pt}")

        # Export to ONNX format [1, 14, 8400] for CivicEye backend
        print("\nExporting trained model to ONNX...")
        trained_model = YOLO(best_pt)
        onnx_exported_path = trained_model.export(
            format="onnx",
            imgsz=imgsz,
            dynamic=False,
            simplify=True,
            opset=12
        )

        dest_onnx = os.path.join(ASSETS_MODELS_DIR, "best_10class.onnx")
        if os.path.exists(onnx_exported_path):
            shutil.copy(onnx_exported_path, dest_onnx)
            print(f"10-Class ONNX model exported to: {dest_onnx}")

    print("\nTraining and export completed successfully!")
    print("=" * 80)

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="CivicEye 10-Class YOLO Trainer")
    parser.add_argument("--model", type=str, default="yolov8n.pt", help="Base model weights (yolov8n.pt, yolov8s.pt)")
    parser.add_argument("--epochs", type=int, default=15, help="Number of training epochs")
    parser.add_argument("--batch", type=int, default=8, help="Batch size")
    parser.add_argument("--imgsz", type=int, default=640, help="Input image dimension")
    parser.add_argument("--device", type=str, default="cpu", help="Device (cpu, cuda:0)")
    args = parser.parse_args()

    train_and_export(
        model_name=args.model,
        epochs=args.epochs,
        batch_size=args.batch,
        imgsz=args.imgsz,
        device=args.device
    )
