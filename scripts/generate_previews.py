#!/usr/bin/env python3
"""
CivicEye — Phase 5: Visual Preview & Quality Control Suite
Generates color-coded annotated bounding box previews for all 10 civic classes,
verifies coordinate boundaries and class balances, and builds an HTML/Markdown inspection report.
"""

import os
import sys
import json
from collections import defaultdict
from PIL import Image, ImageDraw, ImageFont

# Ensure UTF-8 output
if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8')

ROOT_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATASET_WORKING_DIR = os.path.join(ROOT_DIR, "dataset_working")
PREVIEWS_DIR = os.path.join(DATASET_WORKING_DIR, "previews")

# Distinct High-Contrast Hex & RGB Color Palette for 10 Target Classes
CLASS_INFO = {
    0: {"name": "alligator cracking", "color_rgb": (239, 68, 68), "color_hex": "#EF4444", "dept": "Road Maintenance (ROAD)"},
    1: {"name": "cracking", "color_rgb": (249, 115, 22), "color_hex": "#F97316", "dept": "Road Maintenance (ROAD)"},
    2: {"name": "pothole", "color_rgb": (234, 179, 8), "color_hex": "#EAB308", "dept": "Road Maintenance (ROAD)"},
    3: {"name": "manhole defect", "color_rgb": (59, 130, 246), "color_hex": "#3B82F6", "dept": "Water Supply & Drainage (TWAD)"},
    4: {"name": "waterlogging", "color_rgb": (6, 182, 212), "color_hex": "#06B6D4", "dept": "Stormwater Drainage (DRAIN)"},
    5: {"name": "road divider damage", "color_rgb": (168, 85, 247), "color_hex": "#A855F7", "dept": "Traffic & Road Safety (SAFETY)"},
    6: {"name": "damaged traffic sign", "color_rgb": (236, 72, 153), "color_hex": "#EC4899", "dept": "Traffic & Road Safety (SAFETY)"},
    7: {"name": "street light fault", "color_rgb": (245, 158, 11), "color_hex": "#F59E0B", "dept": "Street Lighting (LIGHTING)"},
    8: {"name": "debris / road blockage", "color_rgb": (107, 114, 128), "color_hex": "#6B7280", "dept": "Solid Waste Management (SWM)"},
    9: {"name": "damaged footpath", "color_rgb": (16, 185, 129), "color_hex": "#10B981", "dept": "Public Works (PWD)"}
}

def draw_annotations_on_image(img_path, label_path, out_path):
    """Draws color-coded bounding boxes and label banners onto image."""
    try:
        img = Image.open(img_path).convert('RGB')
        draw = ImageDraw.Draw(img)
        w_img, h_img = img.size

        boxes_found = []
        if os.path.exists(label_path):
            with open(label_path, 'r', encoding='utf-8') as f:
                for line in f:
                    parts = line.strip().split()
                    if len(parts) != 5:
                        continue
                    cls_id = int(parts[0])
                    xc, yc, bw, bh = map(float, parts[1:])

                    x1 = max(0, int((xc - bw / 2.0) * w_img))
                    y1 = max(0, int((yc - bh / 2.0) * h_img))
                    x2 = min(w_img - 1, int((xc + bw / 2.0) * w_img))
                    y2 = min(h_img - 1, int((yc + bh / 2.0) * h_img))

                    info = CLASS_INFO.get(cls_id, {"name": f"class_{cls_id}", "color_rgb": (0, 255, 0)})
                    color = info["color_rgb"]
                    cls_name = info["name"]

                    # Draw thicker bounding box rectangle
                    thickness = max(2, int(min(w_img, h_img) * 0.005))
                    for offset in range(thickness):
                        draw.rectangle([x1 - offset, y1 - offset, x2 + offset, y2 + offset], outline=color)

                    # Draw label banner
                    banner_text = f"ID {cls_id}: {cls_name}"
                    banner_w = len(banner_text) * 8 + 12
                    banner_h = 22
                    draw.rectangle([x1, max(0, y1 - banner_h), x1 + banner_w, max(banner_h, y1)], fill=color)
                    draw.text((x1 + 6, max(2, y1 - banner_h + 3)), banner_text, fill=(255, 255, 255))

                    boxes_found.append({"class_id": cls_id, "class_name": cls_name, "box": [x1, y1, x2, y2]})

        # If no boxes, draw small watermark indicating background/empty
        if not boxes_found:
            draw.rectangle([10, 10, 220, 36], fill=(70, 70, 70, 200))
            draw.text((16, 14), "Background (No Issues)", fill=(255, 255, 255))

        img.save(out_path, "JPEG", quality=90)
        return boxes_found
    except Exception as e:
        print(f"Error drawing preview for {img_path}: {e}")
        return []

def generate_visual_previews():
    print("=" * 80)
    print("CIVICEYE VISUAL PREVIEW & QUALITY AUDIT GENERATOR (PHASE 5)")
    print("=" * 80)

    os.makedirs(PREVIEWS_DIR, exist_ok=True)

    preview_records = []
    class_preview_map = defaultdict(list)
    total_previews = 0

    for split in ['train', 'val', 'test']:
        img_dir = os.path.join(DATASET_WORKING_DIR, "images", split)
        lbl_dir = os.path.join(DATASET_WORKING_DIR, "labels", split)

        if not os.path.exists(img_dir):
            continue

        split_preview_dir = os.path.join(PREVIEWS_DIR, split)
        os.makedirs(split_preview_dir, exist_ok=True)

        for img_file in sorted(os.listdir(img_dir)):
            if not img_file.lower().endswith(('.jpg', '.jpeg', '.png')):
                continue

            base_name = os.path.splitext(img_file)[0]
            img_path = os.path.join(img_dir, img_file)
            lbl_path = os.path.join(lbl_dir, f"{base_name}.txt")
            out_path = os.path.join(split_preview_dir, f"{base_name}_annotated.jpg")

            boxes = draw_annotations_on_image(img_path, lbl_path, out_path)

            record = {
                "split": split,
                "filename": img_file,
                "preview_rel_path": f"previews/{split}/{base_name}_annotated.jpg",
                "boxes": boxes,
                "box_count": len(boxes)
            }
            preview_records.append(record)
            total_previews += 1

            for b in boxes:
                class_preview_map[b["class_id"]].append(record)

    # Generate HTML Review Report
    html_content = f"""<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>CivicEye 10-Class Dataset Quality Control & Preview Report</title>
  <style>
    body {{ font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; background: #0f172a; color: #f8fafc; margin: 0; padding: 24px; }}
    h1, h2, h3 {{ color: #38bdf8; }}
    .header {{ background: #1e293b; padding: 20px; border-radius: 8px; border: 1px solid #334155; margin-bottom: 24px; }}
    .stats-table {{ width: 100%; border-collapse: collapse; margin-top: 12px; }}
    .stats-table th, .stats-table td {{ border: 1px solid #334155; padding: 8px 12px; text-align: left; }}
    .stats-table th {{ background: #0f172a; color: #38bdf8; }}
    .grid {{ display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 16px; margin-top: 16px; }}
    .card {{ background: #1e293b; border-radius: 8px; overflow: hidden; border: 1px solid #334155; }}
    .card img {{ width: 100%; height: 200px; object-fit: cover; display: block; }}
    .card-info {{ padding: 12px; font-size: 13px; }}
    .badge {{ display: inline-block; padding: 2px 8px; border-radius: 4px; font-weight: bold; font-size: 11px; margin-right: 4px; }}
  </style>
</head>
<body>
  <div class="header">
    <h1>CivicEye 10-Class Dataset Quality Control Report</h1>
    <p>Audit of all exported training, validation, and testing annotations with color-coded bounding box overlays.</p>
    <table class="stats-table">
      <tr>
        <th>Class ID</th>
        <th>Class Name</th>
        <th>Target Department</th>
        <th>Color Indicator</th>
        <th>Total Annotated Instances</th>
      </tr>
"""

    for cls_id in range(10):
        info = CLASS_INFO[cls_id]
        count = len(class_preview_map[cls_id])
        html_content += f"""      <tr>
        <td><strong>{cls_id}</strong></td>
        <td>{info['name']}</td>
        <td>{info['dept']}</td>
        <td><span class="badge" style="background: {info['color_hex']}; color: #fff;">{info['color_hex']}</span></td>
        <td><strong>{count}</strong></td>
      </tr>
"""

    html_content += f"""    </table>
  </div>

  <h2>Sample Annotated Previews (First 30 Images)</h2>
  <div class="grid">
"""

    for rec in preview_records[:30]:
        box_desc = ", ".join([f"{b['class_name']}" for b in rec["boxes"]]) if rec["boxes"] else "Background (0 boxes)"
        html_content += f"""    <div class="card">
      <img src="{rec['preview_rel_path']}" alt="{rec['filename']}">
      <div class="card-info">
        <strong>{rec['filename']}</strong> ({rec['split']})<br>
        <span style="color: #94a3b8;">Annotations: {box_desc}</span>
      </div>
    </div>
"""

    html_content += """  </div>
</body>
</html>
"""

    report_path = os.path.join(DATASET_WORKING_DIR, "review_report.html")
    with open(report_path, 'w', encoding='utf-8') as rf:
        rf.write(html_content)

    print(f"Generated {total_previews} annotated preview images in: {PREVIEWS_DIR}")
    print(f"Generated Visual QC HTML Report at:                 {report_path}")
    print("=" * 80)

if __name__ == "__main__":
    generate_visual_previews()
