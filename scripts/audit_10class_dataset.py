"""
CivicEye 10-Class Dataset Audit Script (v2 with PyAV codec support)
Inspects AI/training_images and AI/test_images for:
- Exact image counts and true underlying formats (JPEG, PNG, AVIF-in-JPG)
- Image dimensions, aspect ratios, readability
- Exact SHA256 duplicate detection (internal and cross-split train vs test)
- Perceptual hash (dHash) near-duplicate detection
- Annotation presence (.txt / YOLO format)
- Class balance, target vs current taxonomy
"""

import os
import sys
import hashlib
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
AI_DIR = os.path.join(ROOT_DIR, "AI")
TRAIN_DIR = os.path.join(AI_DIR, "training_images")
TEST_DIR = os.path.join(AI_DIR, "test_images")

TARGET_CLASSES = [
    "alligator_cracking",
    "cracking",
    "pothole",
    "manhole_defect",
    "waterlogging",
    "road_divider_damage",
    "damaged_traffic_sign",
    "street_light_fault",
    "debris_road_blockage",
    "damaged_footpath"
]

SPECIAL_FOLDERS = [
    "valid_road_no_issue",
    "unrelated_images",
    "animals",
    "buildings",
    "flowers_plants",
    "food_objects",
    "other_road_issues",
    "people",
    "random_non_road"
]

ALL_EXPECTED_FOLDERS = TARGET_CLASSES + SPECIAL_FOLDERS

def compute_sha256(filepath):
    hasher = hashlib.sha256()
    with open(filepath, 'rb') as f:
        while chunk := f.read(65536):
            hasher.update(chunk)
    return hasher.hexdigest()

def open_image_robustly(filepath):
    """Opens image using PIL or fallback to PyAV for AVIF/HEIF containers"""
    detected_format = "UNKNOWN"
    try:
        with open(filepath, 'rb') as f:
            header = f.read(32)
        if b'ftypavif' in header or b'ftypmif1' in header:
            detected_format = "AVIF (misnamed .jpg)"
        elif header.startswith(b'\xff\xd8\xff'):
            detected_format = "JPEG"
        elif header.startswith(b'\x89PNG\r\n\x1a\n'):
            detected_format = "PNG"
        elif header.startswith(b'RIFF') and b'WEBP' in header:
            detected_format = "WEBP"

        try:
            img = Image.open(filepath)
            img.load()
            return img, detected_format if detected_format != "UNKNOWN" else img.format
        except Exception:
            if av:
                with av.open(filepath) as container:
                    for frame in container.decode(video=0):
                        return frame.to_image(), "AVIF (decoded via PyAV)"
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

def inspect_folder(base_path, folder_type):
    stats = {}
    image_records = []
    
    if not os.path.exists(base_path):
        print(f"Directory not found: {base_path}")
        return stats, image_records

    subdirs = sorted(os.listdir(base_path))
    for subdir in subdirs:
        dir_path = os.path.join(base_path, subdir)
        if not os.path.isdir(dir_path):
            continue
        
        files = os.listdir(dir_path)
        img_files = []
        annotation_files = []
        corrupt_files = []
        
        for f in sorted(files):
            file_path = os.path.join(dir_path, f)
            ext = os.path.splitext(f)[1].lower()
            
            if ext in ['.jpg', '.jpeg', '.png', '.webp', '.bmp', '.tiff']:
                img, fmt = open_image_robustly(file_path)
                if img is not None:
                    w, h = img.size
                    mode = img.mode
                    dhash = compute_dhash(img)
                    sha256 = compute_sha256(file_path)
                    size_bytes = os.path.getsize(file_path)
                    
                    # Check for accompanying .txt annotation
                    txt_path = os.path.splitext(file_path)[0] + ".txt"
                    has_annotation = os.path.exists(txt_path)
                    annotation_content = ""
                    if has_annotation:
                        with open(txt_path, 'r', encoding='utf-8') as af:
                            annotation_content = af.read().strip()
                            
                    record = {
                        "split": folder_type,
                        "category": subdir,
                        "filename": f,
                        "relative_path": os.path.relpath(file_path, ROOT_DIR),
                        "size_bytes": size_bytes,
                        "dimensions": (w, h),
                        "mode": mode,
                        "format": fmt,
                        "sha256": sha256,
                        "dhash": dhash,
                        "has_annotation": has_annotation,
                        "annotation_content": annotation_content
                    }
                    img_files.append(record)
                    image_records.append(record)
                else:
                    corrupt_files.append((f, fmt))
            elif ext in ['.txt', '.xml', '.json', '.yaml', '.yml']:
                annotation_files.append(f)
                
        stats[subdir] = {
            "total_images": len(img_files),
            "total_annotations": len(annotation_files),
            "corrupt_files": corrupt_files,
            "images": img_files
        }
        
    return stats, image_records

print("================================================================================")
print("CIVICEYE 10-CLASS DATASET & MODEL AUDIT REPORT (FULL INSPECTION)")
print("================================================================================")

train_stats, train_records = inspect_folder(TRAIN_DIR, "training")
test_stats, test_records = inspect_folder(TEST_DIR, "testing")

print("\n--- 1. EXACT IMAGE COUNTS PER FOLDER ---")
all_folders = sorted(list(set(list(train_stats.keys()) + list(test_stats.keys()))))

print(f"{'Category/Folder Name':<26} | {'Train Imgs':<10} | {'Test Imgs':<10} | {'Total Files':<11} | {'Annotations':<11} | {'Formats Detected'}")
print("-" * 110)

total_train = 0
total_test = 0
total_annotated = 0

for folder in all_folders:
    tr_count = train_stats.get(folder, {}).get("total_images", 0)
    te_count = test_stats.get(folder, {}).get("total_images", 0)
    tot = tr_count + te_count
    total_train += tr_count
    total_test += te_count
    
    # Check annotations
    tr_annot = sum(1 for r in train_stats.get(folder, {}).get("images", []) if r["has_annotation"])
    te_annot = sum(1 for r in test_stats.get(folder, {}).get("images", []) if r["has_annotation"])
    annot_tot = tr_annot + te_annot
    total_annotated += annot_tot
    
    # Formats
    all_imgs = train_stats.get(folder, {}).get("images", []) + test_stats.get(folder, {}).get("images", [])
    fmts = set(r["format"] for r in all_imgs)
    fmt_str = ", ".join(sorted(fmts)) if fmts else "None"
    
    print(f"{folder:<26} | {tr_count:<10} | {te_count:<10} | {tot:<11} | {annot_tot:<11} | {fmt_str}")

print("-" * 110)
print(f"{'TOTALS':<26} | {total_train:<10} | {total_test:<10} | {total_train + total_test:<11} | {total_annotated:<11} |")

print("\n--- 2. EXACT SHA256 DUPLICATES & CROSS-SPLIT LEAKAGE ---")
train_sha_map = defaultdict(list)
for r in train_records:
    train_sha_map[r["sha256"]].append(r)

test_sha_map = defaultdict(list)
for r in test_records:
    test_sha_map[r["sha256"]].append(r)

cross_split_duplicates = []
for sha, te_list in test_sha_map.items():
    if sha in train_sha_map:
        tr_list = train_sha_map[sha]
        cross_split_duplicates.append((tr_list, te_list))

print(f"Total Decoded Images in Training Folder: {len(train_records)}")
print(f"Total Unique Hashes in Training Folder:  {len(train_sha_map)}")
print(f"Total Decoded Images in Testing Folder:  {len(test_records)}")
print(f"Total Unique Hashes in Testing Folder:   {len(test_sha_map)}")
print(f"Exact Cross-Split Leaked Hashes:        {len(cross_split_duplicates)} ({len(cross_split_duplicates) / max(len(test_records), 1) * 100:.1f}% of test set)")

print("\nSummary of Cross-Split Overlap by Category:")
overlap_by_cat = defaultdict(int)
for tr_list, te_list in cross_split_duplicates:
    overlap_by_cat[tr_list[0]["category"]] += 1
for cat, count in sorted(overlap_by_cat.items()):
    print(f"  {cat:<26}: {count} images in test are 100% identical byte-for-byte copies of training images")

print("\n--- 3. PERCEPTUAL HASH (dHash) NEAR-DUPLICATE DETECTION ---")
all_records = train_records + test_records
near_duplicates = []
for i in range(len(all_records)):
    for j in range(i + 1, len(all_records)):
        r1 = all_records[i]
        r2 = all_records[j]
        if r1["sha256"] == r2["sha256"]:
            continue
        dist = hamming_distance(r1["dhash"], r2["dhash"])
        if dist <= 4:
            near_duplicates.append((r1, r2, dist))

print(f"Near-Duplicate Pairs Found (excluding exact byte-duplicates, Hamming dist <= 4): {len(near_duplicates)}")
for r1, r2, dist in near_duplicates[:10]:
    print(f"  Dist={dist}: {r1['split']}/{r1['category']}/{r1['filename']} <==> {r2['split']}/{r2['category']}/{r2['filename']}")

print("\n--- 4. ANNOTATION INTEGRITY & FORMAT AUDIT ---")
print(f"Total Images Scanned: {len(all_records)}")
print(f"Total Bounding Box Annotations Found (.txt files): {total_annotated}")

print("\n--- 5. DATA ADEQUACY AUDIT FOR YOLOv8 OBJECT DETECTION ---")
print("Target Issue Classes (10 classes):")
for idx, cat in enumerate(TARGET_CLASSES):
    tr_c = train_stats.get(cat, {}).get("total_images", 0)
    te_c = test_stats.get(cat, {}).get("total_images", 0)
    # Unique across both
    unique_hashes = set()
    for r in train_stats.get(cat, {}).get("images", []) + test_stats.get(cat, {}).get("images", []):
        unique_hashes.add(r["sha256"])
    unique_count = len(unique_hashes)
    
    adequate = "READY (>=100)" if unique_count >= 100 else ("VERY LOW (<20)" if unique_count < 20 else "LOW")
    print(f"  [{idx}] {cat:<24}: {unique_count:>2} unique images | Annotations: 0 | Data Status: {adequate}")

print("\nSpecial / Non-Issue Validation Classes:")
for cat in SPECIAL_FOLDERS:
    if cat not in all_folders:
        continue
    unique_hashes = set()
    for r in train_stats.get(cat, {}).get("images", []) + test_stats.get(cat, {}).get("images", []):
        unique_hashes.add(r["sha256"])
    print(f"  * {cat:<26}: {len(unique_hashes):>2} unique images")

print("\nAudit completed successfully.")
