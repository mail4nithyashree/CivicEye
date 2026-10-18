#!/usr/bin/env python3
"""
CivicEye — Phase 1 & 2: Dataset Audit and Manifest Inventory Generator
Recursively audits AI/training_images and AI/test_images, normalizes class folder names,
detects corrupted containers, extracts exact SHA-256 and perceptual dHash duplicates,
and creates a clean manifest (JSON and CSV) without modifying original files.
"""

import os
import sys
import json
import csv
import hashlib
from collections import defaultdict
from PIL import Image
import numpy as np

try:
    import av
except ImportError:
    av = None

# Ensure UTF-8 console output
if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8')

ROOT_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
AI_DIR = os.path.join(ROOT_DIR, "AI")
TRAIN_DIR = os.path.join(AI_DIR, "training_images")
TEST_DIR = os.path.join(AI_DIR, "test_images")
DATASET_WORKING_DIR = os.path.join(ROOT_DIR, "dataset_working")

# Exact 10 Civic-Issue Target Classes (Class ID 0-9)
TARGET_CLASS_MAPPING = {
    0: {"name": "alligator cracking", "canonical_folder": "alligator_cracking", "dept": "ROAD"},
    1: {"name": "cracking", "canonical_folder": "cracking", "dept": "ROAD"},
    2: {"name": "pothole", "canonical_folder": "pothole", "dept": "ROAD"},
    3: {"name": "manhole defect", "canonical_folder": "manhole_defect", "dept": "TWAD / DRAIN"},
    4: {"name": "waterlogging", "canonical_folder": "waterlogging", "dept": "DRAIN"},
    5: {"name": "road divider damage", "canonical_folder": "road_divider_damage", "dept": "SAFETY"},
    6: {"name": "damaged traffic sign", "canonical_folder": "damaged_traffic_sign", "dept": "SAFETY"},
    7: {"name": "street light fault", "canonical_folder": "street_light_fault", "dept": "LIGHTING"},
    8: {"name": "debris / road blockage", "canonical_folder": "debris_road_blockage", "dept": "SWM"},
    9: {"name": "damaged footpath", "canonical_folder": "damaged_footpath", "dept": "PWD"}
}

# Folder name aliases and normalization map
FOLDER_TO_CLASS_ID = {
    "alligator_cracking": 0,
    "alligator cracking": 0,
    "alligator-cracking": 0,
    "cracking": 1,
    "crack": 1,
    "cracks": 1,
    "linear_cracking": 1,
    "pothole": 2,
    "potholes": 2,
    "manhole_defect": 3,
    "manhole defect": 3,
    "manhole": 3,
    "open_manhole": 3,
    "damaged_manhole": 3,
    "waterlogging": 4,
    "water_logging": 4,
    "water-logging": 4,
    "waterlog": 4,
    "road_divider_damage": 5,
    "road divider damage": 5,
    "damaged_divider": 5,
    "divider_damage": 5,
    "median_damage": 5,
    "damaged_traffic_sign": 6,
    "damaged traffic sign": 6,
    "traffic_sign_defect": 6,
    "traffic_sign_damaged": 6,
    "street_light_fault": 7,
    "street light fault": 7,
    "broken_streetlight": 7,
    "streetlight_fault": 7,
    "debris_road_blockage": 8,
    "debris / road blockage": 8,
    "debris": 8,
    "road_blockage": 8,
    "debris_road": 8,
    "damaged_footpath": 9,
    "damaged footpath": 9,
    "broken_footpath": 9,
    "footpath_damage": 9,
}

# Non-issue / background categories
NEGATIVE_FOLDERS = {
    "valid_road_no_issue": "road_background",
    "valid_road": "road_background",
    "unrelated_images": "non_road_scene",
    "animals": "non_road_scene",
    "buildings": "non_road_scene",
    "flowers_plants": "non_road_scene",
    "food_objects": "non_road_scene",
    "other_road_issues": "non_road_scene",
    "people": "non_road_scene",
    "random_non_road": "non_road_scene"
}

def compute_sha256(filepath):
    hasher = hashlib.sha256()
    with open(filepath, 'rb') as f:
        while chunk := f.read(65536):
            hasher.update(chunk)
    return hasher.hexdigest()

def open_image_robustly(filepath):
    """Opens image using PIL with fallback for misnamed AVIF/HEIF containers"""
    detected_format = "UNKNOWN"
    try:
        with open(filepath, 'rb') as f:
            header = f.read(32)
        if b'ftypavif' in header or b'ftypm1v1' in header or b'ftypmif1' in header:
            detected_format = "AVIF"
        elif header.startswith(b'\xff\xd8\xff'):
            detected_format = "JPEG"
        elif header.startswith(b'\x89PNG\r\n\x1a\n'):
            detected_format = "PNG"
        elif header.startswith(b'RIFF') and b'WEBP' in header:
            detected_format = "WEBP"

        try:
            img = Image.open(filepath)
            img.load()
            return img.convert('RGB'), detected_format if detected_format != "UNKNOWN" else img.format
        except Exception:
            if av:
                with av.open(filepath) as container:
                    for frame in container.decode(video=0):
                        return frame.to_image().convert('RGB'), "AVIF (PyAV)"
            raise
    except Exception as e:
        return None, f"CORRUPT: {str(e)}"

def compute_dhash(image, hash_size=8):
    """Compute difference hash (dHash) for perceptual similarity"""
    try:
        resized = image.convert('L').resize((hash_size + 1, hash_size), Image.Resampling.LANCZOS)
        pixels = np.array(resized)
        diff = pixels[:, 1:] > pixels[:, :-1]
        return ''.join(['1' if bit else '0' for bit in diff.flatten()])
    except Exception:
        return None

def hamming_distance(hash1, hash2):
    if not hash1 or not hash2 or len(hash1) != len(hash2):
        return 999
    return sum(c1 != c2 for c1, c2 in zip(hash1, hash2))

def build_inventory(input_dirs):
    os.makedirs(DATASET_WORKING_DIR, exist_ok=True)
    manifest = []
    sha_map = defaultdict(list)
    corrupted_files = []
    folder_summary = defaultdict(lambda: {"count": 0, "formats": set(), "mapped_id": None, "type": ""})

    print("=" * 80)
    print("CIVICEYE DATASET AUDIT & INVENTORY BUILDER")
    print("=" * 80)

    for base_dir in input_dirs:
        if not os.path.exists(base_dir):
            print(f"Warning: Directory does not exist: {base_dir}")
            continue

        split_name = os.path.basename(base_dir)
        print(f"\nScanning: {base_dir} (Source split: {split_name})")

        for root, dirs, files in os.walk(base_dir):
            for file in sorted(files):
                ext = os.path.splitext(file)[1].lower()
                if ext not in ['.jpg', '.jpeg', '.png', '.webp', '.bmp', '.tiff', '.avif']:
                    continue

                abs_path = os.path.abspath(os.path.join(root, file))
                rel_path = os.path.relpath(abs_path, ROOT_DIR).replace("\\", "/")
                parent_folder = os.path.basename(root)

                # Class Mapping & Normalization
                norm_key = parent_folder.strip().lower()
                mapped_id = FOLDER_TO_CLASS_ID.get(norm_key, None)
                is_target = mapped_id is not None

                if is_target:
                    class_name = TARGET_CLASS_MAPPING[mapped_id]["name"]
                    category_type = "target_issue"
                elif norm_key in NEGATIVE_FOLDERS:
                    category_type = NEGATIVE_FOLDERS[norm_key]
                    class_name = norm_key
                else:
                    category_type = "unmapped_other"
                    class_name = norm_key

                # Read image
                img, fmt = open_image_robustly(abs_path)
                if img is None:
                    corrupted_files.append((abs_path, fmt))
                    continue

                w, h = img.size
                sha256_hash = compute_sha256(abs_path)
                dhash = compute_dhash(img)
                size_bytes = os.path.getsize(abs_path)

                record = {
                    "image_id": f"IMG_{len(manifest) + 1:04d}",
                    "filename": file,
                    "relative_path": rel_path,
                    "absolute_path": abs_path,
                    "source_split": split_name,
                    "source_folder": parent_folder,
                    "mapped_class_id": mapped_id,
                    "mapped_class_name": class_name,
                    "category_type": category_type,
                    "is_target_issue": is_target,
                    "width": w,
                    "height": h,
                    "aspect_ratio": round(w / h, 3) if h > 0 else 0,
                    "format_detected": fmt,
                    "size_bytes": size_bytes,
                    "sha256": sha256_hash,
                    "dhash": dhash,
                    "annotation_status": "unlabeled"
                }

                manifest.append(record)
                sha_map[sha256_hash].append(record)

                summary = folder_summary[parent_folder]
                summary["count"] += 1
                summary["formats"].add(fmt)
                summary["mapped_id"] = mapped_id
                summary["type"] = category_type

    # Audit Analysis
    print("\n--- 1. FOLDER INVENTORY & CLASS MAPPINGS ---")
    print(f"{'Source Folder':<25} | {'Class ID':<8} | {'Mapped Target Name':<25} | {'Count':<6} | {'Type':<16} | Formats")
    print("-" * 105)
    for folder, data in sorted(folder_summary.items()):
        cls_id_str = str(data["mapped_id"]) if data["mapped_id"] is not None else "N/A"
        target_name = TARGET_CLASS_MAPPING[data["mapped_id"]]["name"] if data["mapped_id"] is not None else folder
        fmts = ", ".join(sorted(data["formats"]))
        print(f"{folder:<25} | {cls_id_str:<8} | {target_name:<25} | {data['count']:<6} | {data['type']:<16} | {fmts}")

    # Duplicates & Cross-Split Leakage
    unique_hashes = len(sha_map)
    duplicate_groups = {h: items for h, items in sha_map.items() if len(items) > 1}
    cross_split_duplicates = []

    for h, items in duplicate_groups.items():
        splits = set(item["source_split"] for item in items)
        if len(splits) > 1:
            cross_split_duplicates.append(items)

    print("\n--- 2. DUPLICATE & INTEGRITY AUDIT ---")
    print(f"Total Scanned Files:         {len(manifest)}")
    print(f"Unique Images (by SHA256):   {unique_hashes}")
    print(f"Duplicate Image Instances:   {len(manifest) - unique_hashes}")
    print(f"Cross-Split Leaked Groups:   {len(cross_split_duplicates)} (Identical files present in both training and test folders)")
    print(f"Corrupted Files:             {len(corrupted_files)}")

    # Near-Duplicate Detection (dHash)
    unique_records = [items[0] for items in sha_map.values()]
    near_dupes = []
    for i in range(len(unique_records)):
        for j in range(i + 1, len(unique_records)):
            d = hamming_distance(unique_records[i]["dhash"], unique_records[j]["dhash"])
            if d <= 4:
                near_dupes.append((unique_records[i], unique_records[j], d))

    print(f"Near-Duplicate Pairs (dHash <= 4): {len(near_dupes)}")

    # Save Manifest Files
    json_path = os.path.join(DATASET_WORKING_DIR, "manifest.json")
    with open(json_path, 'w', encoding='utf-8') as f:
        json.dump({
            "total_files": len(manifest),
            "unique_images": unique_hashes,
            "target_classes": TARGET_CLASS_MAPPING,
            "images": manifest
        }, f, indent=2)

    csv_path = os.path.join(DATASET_WORKING_DIR, "manifest.csv")
    fieldnames = [
        "image_id", "filename", "relative_path", "source_split", "source_folder",
        "mapped_class_id", "mapped_class_name", "category_type", "is_target_issue",
        "width", "height", "aspect_ratio", "format_detected", "size_bytes",
        "sha256", "dhash", "annotation_status"
    ]
    with open(csv_path, 'w', newline='', encoding='utf-8') as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames)
        writer.writeheader()
        for rec in manifest:
            row = {k: rec[k] for k in fieldnames}
            writer.writerow(row)

    print(f"\nManifest successfully saved:")
    print(f"  JSON: {json_path}")
    print(f"  CSV:  {csv_path}")
    print("=" * 80)
    return manifest, sha_map

if __name__ == "__main__":
    build_inventory([TRAIN_DIR, TEST_DIR])
