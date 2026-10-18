#!/usr/bin/env python3
"""
CivicEye — Dataset and Annotation Validation Suite
Validates YOLO format annotations, class IDs, bounding box boundaries,
image integrity, duplicate detection, and cross-split data leakage.
Generates visual previews with ground-truth bounding boxes.
"""

import os
import sys
import hashlib
from pathlib import Path
from PIL import Image, ImageDraw

# Color palette for 10 target classes (RGB tuples)
CLASS_COLORS = {
    0: (239, 68, 68),    # alligator cracking - Red
    1: (249, 115, 22),   # cracking - Orange
    2: (234, 179, 8),    # pothole - Yellow
    3: (59, 130, 246),   # manhole defect - Blue
    4: (6, 182, 212),    # waterlogging - Cyan
    5: (168, 85, 247),   # road divider damage - Purple
    6: (236, 72, 153),   # damaged traffic sign - Pink
    7: (245, 158, 11),   # street light fault - Amber
    8: (107, 114, 128),  # debris / road blockage - Gray
    9: (16, 185, 129),   # damaged footpath - Emerald
}

def parse_simple_yaml(yaml_path):
    """Simple parser for data.yaml without requiring PyYAML dependency."""
    config = {'nc': 0, 'names': {}, 'train': '', 'val': '', 'test': '', 'path': ''}
    in_names = False
    with open(yaml_path, 'r', encoding='utf-8') as f:
        for line in f:
            raw_line = line.strip()
            if not raw_line or raw_line.startswith('#'):
                continue
            if raw_line.startswith('nc:'):
                config['nc'] = int(raw_line.split(':', 1)[1].strip())
            elif raw_line.startswith('path:'):
                config['path'] = raw_line.split(':', 1)[1].strip()
            elif raw_line.startswith('train:'):
                config['train'] = raw_line.split(':', 1)[1].strip()
            elif raw_line.startswith('val:'):
                config['val'] = raw_line.split(':', 1)[1].strip()
            elif raw_line.startswith('test:'):
                config['test'] = raw_line.split(':', 1)[1].strip()
            elif raw_line.startswith('names:'):
                in_names = True
            elif in_names:
                if ':' in raw_line and not raw_line.startswith('#'):
                    parts = raw_line.split(':', 1)
                    key = int(parts[0].strip())
                    val = parts[1].strip().strip('"').strip("'")
                    config['names'][key] = val
                else:
                    in_names = False
    return config

def get_file_hash(file_path):
    """Compute SHA-256 hash of a file to detect duplicates."""
    sha256 = hashlib.sha256()
    with open(file_path, 'rb') as f:
        for chunk in iter(lambda: f.read(65536), b''):
            sha256.update(chunk)
    return sha256.hexdigest()

def draw_yolo_preview(image_path, label_path, class_names, output_path):
    """Draw bounding boxes and class names onto the image and save to preview."""
    try:
        img = Image.open(image_path).convert('RGB')
        draw = ImageDraw.Draw(img)
        w_img, h_img = img.size

        if os.path.exists(label_path):
            with open(label_path, 'r', encoding='utf-8') as f:
                for line in f:
                    parts = line.strip().split()
                    if len(parts) != 5:
                        continue
                    cls_id = int(parts[0])
                    xc, yc, bw, bh = map(float, parts[1:])
                    
                    x1 = int((xc - bw / 2.0) * w_img)
                    y1 = int((yc - bh / 2.0) * h_img)
                    x2 = int((xc + bw / 2.0) * w_img)
                    y2 = int((yc + bh / 2.0) * h_img)

                    color = CLASS_COLORS.get(cls_id, (0, 255, 0))
                    class_name = class_names.get(cls_id, f"class_{cls_id}")

                    # Draw thicker rectangle
                    for offset in range(3):
                        draw.rectangle([x1 - offset, y1 - offset, x2 + offset, y2 + offset], outline=color)

                    # Draw label banner
                    label_text = f"ID {cls_id}: {class_name}"
                    banner_w = len(label_text) * 8 + 12
                    banner_h = 20
                    draw.rectangle([x1, max(0, y1 - banner_h), x1 + banner_w, max(banner_h, y1)], fill=color)
                    draw.text((x1 + 4, max(2, y1 - banner_h + 2)), label_text, fill=(255, 255, 255))

        # Add image info footer banner
        footer_text = f"CivicEye Ground-Truth | {os.path.basename(image_path)} ({w_img}x{h_img})"
        draw.rectangle([0, h_img - 22, w_img, h_img], fill=(15, 23, 42))
        draw.text((8, h_img - 18), footer_text, fill=(226, 232, 240))

        img.save(output_path, 'JPEG', quality=95)
        return True
    except Exception as e:
        print(f"  [ERROR] Failed to draw preview for {image_path}: {e}")
        return False

def validate_dataset(dataset_dir):
    """Main validation pipeline."""
    dataset_path = Path(dataset_dir).resolve()
    yaml_file = dataset_path / 'data.yaml'

    print("=" * 70)
    print(" [CIVICEYE DATASET & ANNOTATION VALIDATOR]")
    print(f" Root: {dataset_path}")
    print("=" * 70)

    if not yaml_file.exists():
        print(f"[CRITICAL] data.yaml not found at {yaml_file}")
        return False

    config = parse_simple_yaml(yaml_file)
    nc = config['nc']
    names = config['names']
    print(f"\n* Dataset Configuration (data.yaml):")
    print(f"   - Number of classes (nc): {nc}")
    print(f"   - Registered classes ({len(names)}):")
    for cid, cname in sorted(names.items()):
        print(f"     [{cid}] {cname}")

    splits = ['train', 'val', 'test']
    image_extensions = {'.jpg', '.jpeg', '.png', '.bmp', '.webp'}

    total_images = 0
    total_labels = 0
    total_objects = 0
    class_counts = {cid: 0 for cid in range(nc)}
    split_counts = {s: {'images': 0, 'labels': 0, 'objects': 0} for s in splits}

    errors = []
    warnings = []
    review_list = []
    seen_hashes = {}  # hash -> (split, filename)
    duplicate_count = 0
    leakage_count = 0

    previews_dir = dataset_path / 'previews'
    previews_dir.mkdir(parents=True, exist_ok=True)

    print("\n" + "-" * 70)
    print(" Validating Splits & Annotations:")
    print("-" * 70)

    for split in splits:
        img_dir = dataset_path / 'images' / split
        lbl_dir = dataset_path / 'labels' / split

        img_dir.mkdir(parents=True, exist_ok=True)
        lbl_dir.mkdir(parents=True, exist_ok=True)

        img_files = sorted([f for f in img_dir.iterdir() if f.suffix.lower() in image_extensions])
        lbl_files = sorted([f for f in lbl_dir.iterdir() if f.suffix.lower() == '.txt'])

        split_counts[split]['images'] = len(img_files)
        split_counts[split]['labels'] = len(lbl_files)
        total_images += len(img_files)
        total_labels += len(lbl_files)

        print(f"\n[Split: {split.upper()}] - Found {len(img_files)} images, {len(lbl_files)} label files")

        # Map stem to label file
        lbl_map = {f.stem: f for f in lbl_files}
        img_map = {f.stem: f for f in img_files}

        # Check for orphan label files
        for stem, lpath in lbl_map.items():
            if stem not in img_map:
                errors.append(f"[{split}] Orphan label file without matching image: {lpath.name}")

        # Validate each image and its label
        for img_path in img_files:
            stem = img_path.stem
            
            # 1. Check image integrity
            try:
                with Image.open(img_path) as im:
                    im.verify()
                with Image.open(img_path) as im:
                    w, h = im.size
                    if w <= 0 or h <= 0:
                        errors.append(f"[{split}] Image has invalid dimensions ({w}x{h}): {img_path.name}")
            except Exception as e:
                errors.append(f"[{split}] Corrupt/unreadable image file {img_path.name}: {e}")
                continue

            # 2. Check for duplicate images & cross-split leakage
            file_hash = get_file_hash(img_path)
            if file_hash in seen_hashes:
                prev_split, prev_name = seen_hashes[file_hash]
                if prev_split != split:
                    leakage_count += 1
                    errors.append(f"[DATA LEAKAGE] Image {img_path.name} in '{split}' is identical to {prev_name} in '{prev_split}'!")
                else:
                    duplicate_count += 1
                    warnings.append(f"[DUPLICATE] Image {img_path.name} is identical to {prev_name} within split '{split}'.")
            else:
                seen_hashes[file_hash] = (split, img_path.name)

            # 3. Check corresponding label file
            if stem not in lbl_map:
                warnings.append(f"[{split}] Missing label file for image: {img_path.name} (Background/Unlabeled)")
                continue

            lbl_path = lbl_map[stem]
            try:
                with open(lbl_path, 'r', encoding='utf-8') as lf:
                    lines = [l.strip() for l in lf.readlines() if l.strip()]

                if len(lines) == 0:
                    warnings.append(f"[{split}] Empty label file: {lbl_path.name}")
                    review_list.append((img_path.name, "Empty annotation file"))
                    continue

                for line_idx, line in enumerate(lines, 1):
                    tokens = line.split()
                    if len(tokens) != 5:
                        errors.append(f"[{split}:{lbl_path.name}:L{line_idx}] Expected 5 tokens (class x y w h), found {len(tokens)}: '{line}'")
                        review_list.append((img_path.name, f"Malformed token count at line {line_idx}"))
                        continue

                    # Validate class ID
                    try:
                        cls_id = int(tokens[0])
                    except ValueError:
                        errors.append(f"[{split}:{lbl_path.name}:L{line_idx}] Non-integer class ID '{tokens[0]}'")
                        review_list.append((img_path.name, f"Invalid class ID format '{tokens[0]}'"))
                        continue

                    if cls_id < 0 or cls_id >= nc:
                        errors.append(f"[{split}:{lbl_path.name}:L{line_idx}] Class ID {cls_id} out of bounds [0, {nc-1}]")
                        review_list.append((img_path.name, f"Class ID {cls_id} not in data.yaml"))
                        continue

                    # Validate box coordinates
                    try:
                        xc, yc, bw, bh = map(float, tokens[1:])
                    except ValueError:
                        errors.append(f"[{split}:{lbl_path.name}:L{line_idx}] Non-numeric coordinate values: '{line}'")
                        review_list.append((img_path.name, "Non-numeric coordinates"))
                        continue

                    # Coordinate bounds check
                    if bw <= 0.0 or bh <= 0.0:
                        errors.append(f"[{split}:{lbl_path.name}:L{line_idx}] Zero/negative box width ({bw}) or height ({bh})")
                        review_list.append((img_path.name, "Zero-area box"))
                        continue

                    x1 = xc - bw / 2.0
                    y1 = yc - bh / 2.0
                    x2 = xc + bw / 2.0
                    y2 = yc + bh / 2.0

                    tolerance = 0.02
                    if x1 < -tolerance or y1 < -tolerance or x2 > 1.0 + tolerance or y2 > 1.0 + tolerance:
                        errors.append(f"[{split}:{lbl_path.name}:L{line_idx}] Bounding box out of bounds: [{x1:.3f}, {y1:.3f}, {x2:.3f}, {y2:.3f}]")
                        review_list.append((img_path.name, "Out of bounds bounding box"))
                        continue

                    class_counts[cls_id] += 1
                    split_counts[split]['objects'] += 1
                    total_objects += 1

                # Generate visual preview
                preview_file = previews_dir / f"{stem}_preview.jpg"
                draw_yolo_preview(img_path, lbl_path, names, preview_file)
                print(f"   [OK] Validated {img_path.name} -> Preview saved to previews/{preview_file.name}")

            except Exception as e:
                errors.append(f"[{split}] Error parsing label {lbl_path.name}: {e}")

    # Print Summary Report
    print("\n" + "=" * 70)
    print(" [VALIDATION RESULTS SUMMARY]")
    print("=" * 70)
    print(f" Total Images:    {total_images}")
    print(f" Total Labels:    {total_labels}")
    print(f" Total Objects:   {total_objects}")
    print(f" Duplicates:      {duplicate_count}")
    print(f" Data Leakage:    {leakage_count}")
    print(f" Total Errors:    {len(errors)}")
    print(f" Total Warnings:  {len(warnings)}")

    print("\n* Split Distribution:")
    for s in splits:
        sc = split_counts[s]
        print(f"   - {s.upper():<6} : {sc['images']} images | {sc['labels']} labels | {sc['objects']} objects")

    print("\n* Per-Class Object Counts:")
    for cid in range(nc):
        cname = names.get(cid, f"Class {cid}")
        cnt = class_counts[cid]
        status = "[PRESENT]" if cnt > 0 else "[DATA GAP - 0 SAMPLES]"
        print(f"   [{cid}] {cname:<25} : {cnt:>4} objects  {status}")

    if review_list:
        print("\n* Manual Review Items:")
        for item, reason in review_list:
            print(f"   - {item}: {reason}")

    if errors:
        print("\n* Errors Found:")
        for err in errors:
            print(f"   - {err}")
    else:
        print("\n[SUCCESS] Zero syntax or coordinate errors detected!")

    if warnings:
        print("\n* Warnings:")
        for w in warnings:
            print(f"   - {w}")

    print("=" * 70)
    print(f" Visual previews generated at: {previews_dir.as_posix()}")
    print("=" * 70)

    return len(errors) == 0

if __name__ == '__main__':
    dataset_target = sys.argv[1] if len(sys.argv) > 1 else 'dataset_working'
    success = validate_dataset(dataset_target)
    sys.exit(0 if success else 1)
