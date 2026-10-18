#!/usr/bin/env python3
"""
CivicEye — Phase 5: Interactive Annotation Review & Quality Control Web Application
Streamlit UI to inspect real images, accept/edit/reject proposed bounding boxes,
manage the review queue, and export the verified YOLO dataset.

Run with:
  streamlit run scripts/review_annotations_app.py
"""

import os
import sys
import json
import streamlit as st
from PIL import Image, ImageDraw, ImageFont
import numpy as np

# Set Streamlit Page Configuration
st.set_page_config(
    page_title="CivicEye Annotation Reviewer",
    page_icon="🔍",
    layout="wide",
    initial_sidebar_state="expanded"
)

ROOT_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATASET_WORKING_DIR = os.path.join(ROOT_DIR, "dataset_working")
MANIFEST_PATH = os.path.join(DATASET_WORKING_DIR, "manifest.json")
PROPOSED_PATH = os.path.join(DATASET_WORKING_DIR, "annotations_proposed.json")
VERIFIED_PATH = os.path.join(DATASET_WORKING_DIR, "annotations_verified.json")
REVIEW_QUEUE_PATH = os.path.join(DATASET_WORKING_DIR, "review_queue.json")

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

CLASS_COLORS = {
    0: (239, 68, 68),
    1: (249, 115, 22),
    2: (234, 179, 8),
    3: (59, 130, 246),
    4: (6, 182, 212),
    5: (168, 85, 247),
    6: (236, 72, 153),
    7: (245, 158, 11),
    8: (107, 114, 128),
    9: (16, 185, 129)
}

def load_data():
    if not os.path.exists(PROPOSED_PATH):
        return None, {}, {}, []

    with open(PROPOSED_PATH, 'r', encoding='utf-8') as f:
        proposed_data = json.load(f)

    verified_data = {"verified_count": 0, "annotations": {}}
    if os.path.exists(VERIFIED_PATH):
        try:
            with open(VERIFIED_PATH, 'r', encoding='utf-8') as f:
                verified_data = json.load(f)
        except Exception:
            pass

    review_queue = []
    if os.path.exists(REVIEW_QUEUE_PATH):
        try:
            with open(REVIEW_QUEUE_PATH, 'r', encoding='utf-8') as f:
                review_queue = json.load(f).get("items", [])
        except Exception:
            pass

    return proposed_data, verified_data, review_queue

def save_verified_data(verified_data):
    with open(VERIFIED_PATH, 'w', encoding='utf-8') as f:
        json.dump(verified_data, f, indent=2)

def draw_boxes_on_image(pil_img, boxes):
    img = pil_img.copy().convert('RGB')
    draw = ImageDraw.Draw(img)
    w_img, h_img = img.size

    for b in boxes:
        cls_id = int(b.get("class_id", 0))
        color = CLASS_COLORS.get(cls_id, (0, 255, 0))
        cls_name = CLASS_NAMES.get(cls_id, f"class_{cls_id}")
        conf = b.get("confidence", 1.0)

        raw_box = b.get("bbox_normalized", [0.5, 0.5, 0.2, 0.2])
        xc, yc, bw, bh = raw_box

        x1 = max(0, int((xc - bw / 2.0) * w_img))
        y1 = max(0, int((yc - bh / 2.0) * h_img))
        x2 = min(w_img - 1, int((xc + bw / 2.0) * w_img))
        y2 = min(h_img - 1, int((yc + bh / 2.0) * h_img))

        for offset in range(3):
            draw.rectangle([x1 - offset, y1 - offset, x2 + offset, y2 + offset], outline=color)

        label_txt = f"[{cls_id}] {cls_name} ({conf:.2f})"
        banner_w = len(label_txt) * 8 + 10
        banner_h = 20
        draw.rectangle([x1, max(0, y1 - banner_h), x1 + banner_w, max(banner_h, y1)], fill=color)
        draw.text((x1 + 4, max(2, y1 - banner_h + 2)), label_txt, fill=(255, 255, 255))

    return img

def main():
    st.title("🔍 CivicEye — Assisted Annotation Review & QC Dashboard")
    st.markdown("Interactive tool to inspect auto-proposed bounding boxes, accept/modify annotations, and curate verified ground truth.")

    proposed_data, verified_data, review_queue = load_data()

    if proposed_data is None:
        st.error("No proposed annotations found. Run `python scripts/auto_annotate_pipeline.py` first.")
        return

    all_proposed = proposed_data.get("annotations", {})
    verified_annotations = verified_data.get("annotations", {})

    # Top metrics
    col1, col2, col3, col4 = st.columns(4)
    with col1:
        st.metric("Total Scanned Images", proposed_data.get("total_images", 0))
    with col2:
        st.metric("Proposed Auto-Labels", proposed_data.get("annotated_images", 0))
    with col3:
        st.metric("Review Queue Needed", len(review_queue))
    with col4:
        st.metric("Human Verified Ground Truth", len(verified_annotations))

    st.sidebar.header("Filter & Navigation")

    # Filter by class
    class_filter_options = ["All Classes"] + [f"[{k}] {v}" for k, v in CLASS_NAMES.items()] + ["Non-Issue / Background"]
    selected_class_filter = st.sidebar.selectbox("Filter by Class", class_filter_options)

    # Filter by status
    status_filter = st.sidebar.selectbox("Filter by Status", ["All", "Proposed", "Needs Review", "Verified", "Empty"])

    # Build image ID list based on filters
    filtered_ids = []
    for img_id, rec in all_proposed.items():
        is_verified = img_id in verified_annotations
        status = "Verified" if is_verified else ("Needs Review" if rec.get("status") == "review_needed" else ("Empty" if rec.get("box_count") == 0 else "Proposed"))

        # Status filter match
        if status_filter != "All" and status != status_filter:
            continue

        # Class filter match
        if selected_class_filter != "All Classes":
            if selected_class_filter == "Non-Issue / Background":
                if rec.get("category_type") == "target_issue":
                    continue
            else:
                sel_cls_id = int(selected_class_filter.split("]")[0].replace("[", ""))
                has_cls = any(int(b.get("class_id")) == sel_cls_id for b in rec.get("boxes", [])) or rec.get("mapped_class_id") == sel_cls_id
                if not has_cls:
                    continue

        filtered_ids.append(img_id)

    st.sidebar.write(f"**Found {len(filtered_ids)} matching images**")

    if not filtered_ids:
        st.warning("No images match the selected filters.")
        return

    # Image selector
    current_img_id = st.sidebar.selectbox("Select Image ID", filtered_ids)
    current_rec = all_proposed[current_img_id]

    # Check if verified
    is_verified = current_img_id in verified_annotations
    active_boxes = verified_annotations[current_img_id]["boxes"] if is_verified else current_rec.get("boxes", [])

    # Main Image Display
    col_img, col_ctrl = st.columns([1.5, 1])

    with col_img:
        abs_path = current_rec["absolute_path"]
        if os.path.exists(abs_path):
            try:
                pil_img = Image.open(abs_path).convert('RGB')
                annotated_img = draw_boxes_on_image(pil_img, active_boxes)
                st.image(annotated_img, caption=f"{current_rec['filename']} | {current_rec['width']}x{current_rec['height']} | Status: {'VERIFIED' if is_verified else current_rec['status'].upper()}", use_container_width=True)
            except Exception as e:
                st.error(f"Failed to load image: {e}")
        else:
            st.error(f"Image path not found: {abs_path}")

    with col_ctrl:
        st.subheader("Image Information")
        st.markdown(f"- **ID**: `{current_img_id}`")
        st.markdown(f"- **File**: `{current_rec['filename']}`")
        st.markdown(f"- **Source Folder**: `{current_rec['mapped_class_name']}`")
        st.markdown(f"- **Detection Strategy**: `{current_rec.get('strategy', 'N/A')}`")
        st.markdown(f"- **Status**: `{'VERIFIED' if is_verified else current_rec['status']}`")
        if current_rec.get("review_reasons"):
            st.warning(f"Review Reasons: {', '.join(current_rec['review_reasons'])}")

        st.subheader("Reviewer Actions")

        # Action 1: Accept & Verify
        if st.button("✅ Accept & Verify Annotations", type="primary", use_container_width=True):
            verified_annotations[current_img_id] = {
                "image_id": current_img_id,
                "filename": current_rec["filename"],
                "absolute_path": current_rec["absolute_path"],
                "boxes": active_boxes,
                "verified_by": "Human Reviewer",
                "status": "verified"
            }
            verified_data["verified_count"] = len(verified_annotations)
            verified_data["annotations"] = verified_annotations
            save_verified_data(verified_data)
            st.success(f"Image {current_img_id} verified successfully!")
            st.rerun()

        # Action 2: Clear / Reject Boxes
        if st.button("❌ Clear / Reject All Boxes (Mark Background)", use_container_width=True):
            verified_annotations[current_img_id] = {
                "image_id": current_img_id,
                "filename": current_rec["filename"],
                "absolute_path": current_rec["absolute_path"],
                "boxes": [],
                "verified_by": "Human Reviewer",
                "status": "verified"
            }
            verified_data["verified_count"] = len(verified_annotations)
            verified_data["annotations"] = verified_annotations
            save_verified_data(verified_data)
            st.info(f"Marked {current_img_id} as verified background (0 boxes).")
            st.rerun()

        st.markdown("---")
        st.subheader("Manual Box Editor")

        # Add or edit a box
        new_cls_id = st.selectbox("Class to Add/Modify", options=list(CLASS_NAMES.keys()), format_func=lambda k: f"[{k}] {CLASS_NAMES[k]}")
        box_xc = st.slider("Center X (xc)", 0.0, 1.0, 0.5, 0.01)
        box_yc = st.slider("Center Y (yc)", 0.0, 1.0, 0.5, 0.01)
        box_w = st.slider("Width (w)", 0.01, 1.0, 0.3, 0.01)
        box_h = st.slider("Height (h)", 0.01, 1.0, 0.3, 0.01)

        if st.button("➕ Add Custom Bounding Box"):
            new_box = {
                "class_id": new_cls_id,
                "class_name": CLASS_NAMES[new_cls_id],
                "confidence": 1.0,
                "bbox_normalized": [box_xc, box_yc, box_w, box_h]
            }
            if current_img_id not in verified_annotations:
                verified_annotations[current_img_id] = {
                    "image_id": current_img_id,
                    "filename": current_rec["filename"],
                    "absolute_path": current_rec["absolute_path"],
                    "boxes": list(active_boxes),
                    "status": "verified"
                }
            verified_annotations[current_img_id]["boxes"].append(new_box)
            verified_data["verified_count"] = len(verified_annotations)
            verified_data["annotations"] = verified_annotations
            save_verified_data(verified_data)
            st.success("Added new bounding box!")
            st.rerun()

    # Batch Operations in Sidebar
    st.sidebar.markdown("---")
    st.sidebar.subheader("Batch Operations")

    if st.sidebar.button("⚡ Batch-Accept High Confidence (>= 0.60)"):
        count_accepted = 0
        for i_id, r in all_proposed.items():
            if i_id not in verified_annotations and r.get("box_count", 0) > 0:
                confs = [b.get("confidence", 0) for b in r.get("boxes", [])]
                if all(c >= 0.60 for c in confs):
                    verified_annotations[i_id] = {
                        "image_id": i_id,
                        "filename": r["filename"],
                        "absolute_path": r["absolute_path"],
                        "boxes": r["boxes"],
                        "verified_by": "Batch Auto-Accept",
                        "status": "verified"
                    }
                    count_accepted += 1
        verified_data["verified_count"] = len(verified_annotations)
        verified_data["annotations"] = verified_annotations
        save_verified_data(verified_data)
        st.sidebar.success(f"Batch accepted {count_accepted} high-confidence images!")
        st.rerun()

    if st.sidebar.button("💾 Export Verified Dataset to YOLO Format"):
        import subprocess
        result = subprocess.run([sys.executable, os.path.join(ROOT_DIR, "scripts", "export_yolo_dataset.py")], capture_output=True, text=True)
        st.sidebar.text(result.stdout)
        st.sidebar.success("YOLO Dataset Export Complete!")

if __name__ == "__main__":
    main()
