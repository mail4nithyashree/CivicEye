#!/usr/bin/env python3
"""
CivicEye — Phase 4: YOLO Dataset Exporter
Exports images and normalized YOLO bounding box label files (.txt) into:
  dataset_working/images/{train,val,test}
  dataset_working/labels/{train,val,test}
with strict coordinate validation, anti-leakage hash partitioning,
clean image format conversion (JPEG RGB), and auto-generation of data.yaml.
"""

import os
import sys
import json
import random
import shutil
from collections import defaultdict
from PIL import Image
import numpy as np

try:
    import av
except ImportError:
    av = None

# Ensure UTF-8 output
if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8')

ROOT_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATASET_WORKING_DIR = os.path.join(ROOT_DIR, "dataset_working")

# Canonical 10 Civic-Issue Classes
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

def open_image_robustly(filepath):
    """Robust image loader supporting misnamed AVIF/HEIF containers and standard formats."""
    try:
        img = Image.open(filepath)
        img.load()
        return img.convert('RGB')
    except Exception:
        if av:
            try:
                with av.open(filepath) as container:
                    for frame in container.decode(video=0):
                        return frame.to_image().convert('RGB')
            except Exception:
                pass
    return None

def validate_and_clamp_bbox(xc, yc, w, h):
    """
    Validates and clamps YOLO coordinates strictly into [0.0, 1.0].
    Returns (clamped_xc, clamped_yc, clamped_w, clamped_h) or None if degenerate.
    """
    if w <= 0.001 or h <= 0.001:
        return None

    # Calculate bounding box edges
    x1 = max(0.0, min(1.0, xc - w / 2.0))
    y1 = max(0.0, min(1.0, yc - h / 2.0))
    x2 = max(0.0, min(1.0, xc + w / 2.0))
    y2 = max(0.0, min(1.0, yc + h / 2.0))

    new_w = x2 - x1
    new_h = y2 - y1

    if new_w < 0.005 or new_h < 0.005:
        return None

    new_xc = x1 + new_w / 2.0
    new_yc = y1 + new_h / 2.0

    return round(new_xc, 6), round(new_yc, 6), round(new_w, 6), round(new_h, 6)

def export_yolo_dataset(source_type="proposed", split_ratios=(0.70, 0.20, 0.10), seed=42):
    random.seed(seed)

    manifest_path = os.path.join(DATASET_WORKING_DIR, "manifest.json")
    if not os.path.exists(manifest_path):
        print(f"Error: Manifest file not found at {manifest_path}. Run audit_and_inventory.py first.")
        return

    with open(manifest_path, 'r', encoding='utf-8') as f:
        manifest_data = json.load(f)

    # Load annotations based on source_type
    if source_type == "verified":
        ann_path = os.path.join(DATASET_WORKING_DIR, "annotations_verified.json")
        if not os.path.exists(ann_path):
            print(f"Verified annotations file not found at {ann_path}. Using proposed instead.")
            ann_path = os.path.join(DATASET_WORKING_DIR, "annotations_proposed.json")
            source_type = "proposed"
    else:
        ann_path = os.path.join(DATASET_WORKING_DIR, "annotations_proposed.json")

    if not os.path.exists(ann_path):
        print(f"Error: Annotations file not found at {ann_path}. Run auto_annotate_pipeline.py first.")
        return

    with open(ann_path, 'r', encoding='utf-8') as f:
        ann_data = json.load(f)

    annotations = ann_data.get("annotations", {})

    print("=" * 80)
    print(f"CIVICEYE YOLO DATASET EXPORTER (Source: {source_type.upper()} ANNOTATIONS)")
    print("=" * 80)

    # Prepare output directories
    for split in ['train', 'val', 'test']:
        img_dir = os.path.join(DATASET_WORKING_DIR, "images", split)
        lbl_dir = os.path.join(DATASET_WORKING_DIR, "labels", split)
        shutil.rmtree(img_dir, ignore_errors=True)
        shutil.rmtree(lbl_dir, ignore_errors=True)
        os.makedirs(img_dir, exist_ok=True)
        os.makedirs(lbl_dir, exist_ok=True)

    # Group images by unique SHA256 to guarantee ZERO leakage across splits
    sha_to_images = defaultdict(list)
    for img_info in manifest_data["images"]:
        sha_to_images[img_info["sha256"]].append(img_info)

    unique_hashes = sorted(list(sha_to_images.keys()))
    random.shuffle(unique_hashes)

    n_total = len(unique_hashes)
    n_train = int(round(n_total * split_ratios[0]))
    n_val = int(round(n_total * split_ratios[1]))
    n_test = n_total - n_train - n_val

    hash_to_split = {}
    for i, h in enumerate(unique_hashes):
        if i < n_train:
            hash_to_split[h] = 'train'
        elif i < n_train + n_val:
            hash_to_split[h] = 'val'
        else:
            hash_to_split[h] = 'test'

    print(f"Total Unique Images: {n_total}")
    print(f"Split Distribution (by Unique Hash): Train={n_train} ({split_ratios[0]*100:.0f}%), Val={n_val} ({split_ratios[1]*100:.0f}%), Test={n_test} ({split_ratios[2]*100:.0f}%)")

    exported_counts = {'train': 0, 'val': 0, 'test': 0}
    class_box_counts = {split: defaultdict(int) for split in ['train', 'val', 'test']}
    background_counts = {'train': 0, 'val': 0, 'test': 0}

    for sha, img_list in sha_to_images.items():
        # Select canonical primary image for this unique hash
        primary_info = img_list[0]
        split = hash_to_split[sha]
        img_id = primary_info["image_id"]
        abs_path = primary_info["absolute_path"]
        category_type = primary_info["category_type"]
        mapped_class_id = primary_info["mapped_class_id"]

        pil_img = open_image_robustly(abs_path)
        if pil_img is None:
            continue

        # Target export filename
        base_name = f"{img_id}_{primary_info['mapped_class_name'].replace(' ', '_').replace('/', '_')}"
        target_img_path = os.path.join(DATASET_WORKING_DIR, "images", split, f"{base_name}.jpg")
        target_lbl_path = os.path.join(DATASET_WORKING_DIR, "labels", split, f"{base_name}.txt")

        # Save standard RGB JPEG (normalized format for PyTorch/YOLO)
        pil_img.save(target_img_path, "JPEG", quality=95)

        # Retrieve annotations
        ann_record = annotations.get(img_id, {})
        boxes = ann_record.get("boxes", [])

        valid_label_lines = []
        if category_type == "target_issue":
            for b in boxes:
                cls_id = int(b["class_id"])
                raw_box = b["bbox_normalized"]
                clamped = validate_and_clamp_bbox(raw_box[0], raw_box[1], raw_box[2], raw_box[3])
                if clamped is not None:
                    valid_label_lines.append(f"{cls_id} {clamped[0]:.6f} {clamped[1]:.6f} {clamped[2]:.6f} {clamped[3]:.6f}")
                    class_box_counts[split][cls_id] += 1

            if not valid_label_lines:
                # If target issue had no localized box, we do not fabricate one, but preserve the image
                background_counts[split] += 1
        else:
            # Verified background / negative road image: 0 boxes per YOLO standard
            background_counts[split] += 1

        # Write YOLO label file (.txt)
        with open(target_lbl_path, 'w', encoding='utf-8') as lf:
            if valid_label_lines:
                lf.write("\n".join(valid_label_lines) + "\n")

        exported_counts[split] += 1

    # Generate data.yaml with exact class structure
    yaml_content = f"""# CivicEye 10-Class Multi-Infrastructure Issue Dataset Configuration
# Generated automatically by CivicEye YOLO Dataset Exporter

path: {os.path.abspath(DATASET_WORKING_DIR).replace('\\', '/')} # Dataset root directory
train: images/train      # Training images (relative to path)
val: images/val          # Validation images (relative to path)
test: images/test        # Test images (relative to path)

# Classes
nc: 10
names:
  0: alligator cracking
  1: cracking
  2: pothole
  3: manhole defect
  4: waterlogging
  5: road divider damage
  6: damaged traffic sign
  7: street light fault
  8: debris / road blockage
  9: damaged footpath

# Department Mapping Reference:
# 0, 1, 2: Road Maintenance Department (ROAD)
# 3:       Water Supply & Drainage Department (TWAD / DRAIN)
# 4:       Stormwater / Drainage Department (DRAIN)
# 5, 6:    Traffic / Road Safety Department (SAFETY)
# 7:       Street Lighting Department (LIGHTING)
# 8:       Solid Waste Management Department (SWM)
# 9:       Public Works Department (PWD)
"""

    yaml_path = os.path.join(DATASET_WORKING_DIR, "data.yaml")
    with open(yaml_path, 'w', encoding='utf-8') as yf:
        yf.write(yaml_content)

    print("\n--- EXPORT STATISTICS ---")
    print(f"{'Split':<10} | {'Images':<8} | {'Annotated Boxes':<18} | {'Background Imgs (0 boxes)'}")
    print("-" * 65)
    for split in ['train', 'val', 'test']:
        total_boxes = sum(class_box_counts[split].values())
        print(f"{split:<10} | {exported_counts[split]:<8} | {total_boxes:<18} | {background_counts[split]}")
    print("-" * 65)

    print("\n--- PER-CLASS BOUNDING BOX DISTRIBUTION ---")
    print(f"{'Class ID':<8} | {'Class Name':<25} | {'Train Boxes':<12} | {'Val Boxes':<10} | {'Test Boxes':<10} | {'Total Boxes'}")
    print("-" * 85)
    for cls_id in range(10):
        c_tr = class_box_counts['train'][cls_id]
        c_va = class_box_counts['val'][cls_id]
        c_te = class_box_counts['test'][cls_id]
        c_tot = c_tr + c_va + c_te
        print(f"{cls_id:<8} | {CLASS_NAMES[cls_id]:<25} | {c_tr:<12} | {c_va:<10} | {c_te:<10} | {c_tot}")
    print("-" * 85)

    print(f"\nDataset exported successfully to: {DATASET_WORKING_DIR}")
    print(f"Dataset YAML configured at:       {yaml_path}")
    print("=" * 80)

if __name__ == "__main__":
    src = "verified" if os.path.exists(os.path.join(DATASET_WORKING_DIR, "annotations_verified.json")) and os.path.getsize(os.path.join(DATASET_WORKING_DIR, "annotations_verified.json")) > 100 else "proposed"
    export_yolo_dataset(source_type=src)
