import os
import hashlib
from PIL import Image
from collections import defaultdict
import json

def get_file_md5(filepath):
    hasher = hashlib.md5()
    try:
        with open(filepath, 'rb') as f:
            buf = f.read(65536)
            while len(buf) > 0:
                hasher.update(buf)
                buf = f.read(65536)
        return hasher.hexdigest()
    except Exception as e:
        return None

def verify_image(filepath):
    try:
        with Image.open(filepath) as img:
            img.verify()
        with Image.open(filepath) as img:
            return True, img.size, img.format, img.mode
    except Exception as e:
        return False, None, None, str(e)

def audit_directory(base_dir):
    report = {
        "base_dir": base_dir,
        "classes": {},
        "total_files": 0,
        "corrupted_files": [],
        "formats": defaultdict(int),
        "hashes": defaultdict(list)
    }
    
    if not os.path.exists(base_dir):
        return report

    for item in sorted(os.listdir(base_dir)):
        item_path = os.path.join(base_dir, item)
        if os.path.isdir(item_path):
            cls_name = item
            files = [f for f in os.listdir(item_path) if os.path.isfile(os.path.join(item_path, f))]
            report["classes"][cls_name] = {
                "count": len(files),
                "files": []
            }
            for f in files:
                f_path = os.path.join(item_path, f)
                report["total_files"] += 1
                valid, size, fmt, info = verify_image(f_path)
                md5 = get_file_md5(f_path)
                if md5:
                    report["hashes"][md5].append((cls_name, f, f_path))
                if not valid:
                    report["corrupted_files"].append((cls_name, f, info))
                else:
                    report["formats"][fmt] += 1
                report["classes"][cls_name]["files"].append({
                    "name": f,
                    "valid": valid,
                    "size": size,
                    "format": fmt,
                    "md5": md5
                })
    return report

print("Auditing AI/training_images...")
train_audit = audit_directory("AI/training_images")
print(f"Training Total Files: {train_audit['total_files']}")
for cls, d in train_audit["classes"].items():
    print(f"  {cls}: {d['count']} images")

print("\nAuditing AI/test_images...")
test_audit = audit_directory("AI/test_images")
print(f"Test Total Files: {test_audit['total_files']}")
for cls, d in test_audit["classes"].items():
    print(f"  {cls}: {d['count']} images")

print("\nAuditing dataset_working...")
dw_images_audit = {}
if os.path.exists("dataset_working/images"):
    for split in ["train", "val", "test"]:
        s_dir = os.path.join("dataset_working/images", split)
        if os.path.exists(s_dir):
            files = os.listdir(s_dir)
            print(f"dataset_working/images/{split}: {len(files)} images")

print("\nChecking for duplicates within training...")
train_dups = {k: v for k, v in train_audit["hashes"].items() if len(v) > 1}
print(f"Duplicate image sets in training: {len(train_dups)}")
for k, v in list(train_dups.items())[:10]:
    print(f"  Hash {k[:8]}: {[x[0] + '/' + x[1] for x in v]}")

print("\nChecking for duplicates within test...")
test_dups = {k: v for k, v in test_audit["hashes"].items() if len(v) > 1}
print(f"Duplicate image sets in test: {len(test_dups)}")
for k, v in list(test_dups.items())[:10]:
    print(f"  Hash {k[:8]}: {[x[0] + '/' + x[1] for x in v]}")

print("\nChecking for cross-split duplicates (Train vs Test)...")
cross_dups = []
for h, train_list in train_audit["hashes"].items():
    if h in test_audit["hashes"]:
        test_list = test_audit["hashes"][h]
        cross_dups.append((train_list, test_list))
print(f"Exact cross-split duplicate pairs: {len(cross_dups)}")
for t_list, te_list in cross_dups[:10]:
    print(f"  Train: {[x[0] + '/' + x[1] for x in t_list]} <-> Test: {[x[0] + '/' + x[1] for x in te_list]}")

print("\nCorrupted files in training:", len(train_audit["corrupted_files"]))
for cf in train_audit["corrupted_files"]:
    print(" ", cf)
print("Corrupted files in test:", len(test_audit["corrupted_files"]))
for cf in test_audit["corrupted_files"]:
    print(" ", cf)

with open("audit_summary.json", "w") as f:
    json.dump({
        "train_classes": {cls: d["count"] for cls, d in train_audit["classes"].items()},
        "test_classes": {cls: d["count"] for cls, d in test_audit["classes"].items()},
        "train_total": train_audit["total_files"],
        "test_total": test_audit["total_files"],
        "train_dups": len(train_dups),
        "test_dups": len(test_dups),
        "cross_dups": len(cross_dups)
    }, f, indent=2)
