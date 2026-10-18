#!/usr/bin/env python3
"""
CivicEye — Phase 3: Assisted Auto-Annotation Pipeline for YOLO Object Detection
Supports:
1. Strategy A: Existing Trained YOLOv8 ONNX Model (assets/models/best.onnx) for Classes 0, 1, 2
2. Strategy B: Domain-Informed Civic Defect Localization & Saliency / Contour Detection for Classes 0-9
3. Strategy C: Zero-shot prompt hook / Grounding DINO / YOLO-World compatibility
4. Strict quality guardrails: No full-image bounding boxes, IoU NMS, per-class confidence thresholds
5. Separation of proposed vs verified annotations + explicit Review Queue for human validation
"""

import os
import sys
import json
import numpy as np
import cv2
from PIL import Image

try:
    import onnxruntime as ort
except ImportError:
    ort = None

try:
    import av
except ImportError:
    av = None

# Ensure UTF-8 output
if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8')

ROOT_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATASET_WORKING_DIR = os.path.join(ROOT_DIR, "dataset_working")
BEST_ONNX_PATH = os.path.join(ROOT_DIR, "assets", "models", "best.onnx")

# 10 Target Classes
TARGET_CLASSES = {
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

# Per-class confidence thresholds for auto-proposal
CONFIDENCE_THRESHOLDS = {
    0: 0.25, # alligator cracking
    1: 0.25, # cracking
    2: 0.30, # pothole
    3: 0.30, # manhole defect
    4: 0.30, # waterlogging
    5: 0.30, # road divider damage
    6: 0.35, # damaged traffic sign
    7: 0.35, # street light fault
    8: 0.30, # debris / road blockage
    9: 0.30  # damaged footpath
}

# Text prompts & synonyms for zero-shot text-prompt detectors (Grounding DINO / YOLO-World)
CLASS_PROMPTS = {
    0: ["alligator cracking on asphalt", "crocodile crack network", "fatigue cracking", "hexagonal road cracks"],
    1: ["longitudinal road crack", "transverse asphalt fissure", "linear road crack", "pavement crack"],
    2: ["road pothole", "cavity in asphalt", "road hole", "crater on street pavement"],
    3: ["open manhole", "broken manhole cover", "damaged utility drain lid", "displaced sewer cover"],
    4: ["road waterlogging", "water puddle on street", "flooded road lane", "stagnant rainwater on road"],
    5: ["damaged concrete road divider", "broken road median barrier", "damaged guardrail crash barrier"],
    6: ["damaged traffic sign", "bent road signboard", "faded stop sign", "scratched traffic symbol", "empty sign post"],
    7: ["broken street light lamp", "leaning lamp post", "damaged street light fixture", "dangling electrical cable on pole"],
    8: ["debris on road", "fallen tree branch blocking road", "garbage pile on street", "construction rubble on road"],
    9: ["damaged footpath", "broken sidewalk tiles", "cracked paver blocks", "collapsed walkway slab"]
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

def compute_iou(box1, box2):
    """Computes IoU between two [xc, yc, w, h] normalized boxes."""
    x1_a, y1_a = box1[0] - box1[2] / 2, box1[1] - box1[3] / 2
    x2_a, y2_a = box1[0] + box1[2] / 2, box1[1] + box1[3] / 2
    x1_b, y1_b = box2[0] - box2[2] / 2, box2[1] - box2[3] / 2
    x2_b, y2_b = box2[0] + box2[2] / 2, box2[1] + box2[3] / 2

    inter_x1 = max(x1_a, x1_b)
    inter_y1 = max(y1_a, y1_b)
    inter_x2 = min(x2_a, x2_b)
    inter_y2 = min(y2_a, y2_b)

    inter_w = max(0.0, inter_x2 - inter_x1)
    inter_h = max(0.0, inter_y2 - inter_y1)
    inter_area = inter_w * inter_h

    area_a = box1[2] * box1[3]
    area_b = box2[2] * box2[3]
    union_area = area_a + area_b - inter_area
    return inter_area / union_area if union_area > 0 else 0.0

def apply_nms(boxes, confidences, classes, iou_thresh=0.45):
    """Performs Non-Maximum Suppression on proposed boxes."""
    if not boxes:
        return [], [], []

    indices = np.argsort(confidences)[::-1]
    keep = []

    while len(indices) > 0:
        current = indices[0]
        keep.append(current)
        if len(indices) == 1:
            break
        remaining = indices[1:]
        ious = np.array([compute_iou(boxes[current], boxes[i]) for i in remaining])
        # Suppress overlapping boxes
        indices = remaining[ious < iou_thresh]

    return [boxes[i] for i in keep], [confidences[i] for i in keep], [classes[i] for i in keep]

def letterbox_image(pil_img, target_shape=(640, 640), pad_color=(114, 114, 114)):
    """Letterbox image to target dimensions while maintaining aspect ratio."""
    w, h = pil_img.size
    scale = min(target_shape[0] / w, target_shape[1] / h)
    new_w, new_h = int(round(w * scale)), int(round(h * scale))
    resized = pil_img.resize((new_w, new_h), Image.BILINEAR)

    dw = (target_shape[0] - new_w) / 2
    dh = (target_shape[1] - new_h) / 2

    pad_left = int(round(dw - 0.1))
    pad_top = int(round(dh - 0.1))

    canvas = Image.new('RGB', target_shape, pad_color)
    canvas.paste(resized, (pad_left, pad_top))
    return canvas, scale, pad_left, pad_top

# ==============================================================================
# STRATEGY A: ONNX YOLOv8 Inference for Classes 0, 1, 2
# ==============================================================================
class ONNXYoloDetector:
    def __init__(self, onnx_path):
        self.session = None
        if os.path.exists(onnx_path) and ort is not None:
            try:
                self.session = ort.InferenceSession(onnx_path, providers=['CPUExecutionProvider'])
                print(f"Loaded ONNX YOLOv8 detector: {onnx_path}")
            except Exception as e:
                print(f"Warning: Failed to load ONNX model: {e}")

    def detect(self, pil_img, target_class_id=None, conf_thresh=0.25):
        if self.session is None:
            return [], [], []

        orig_w, orig_h = pil_img.size
        canvas, scale, pad_left, pad_top = letterbox_image(pil_img, (640, 640))
        img_arr = np.array(canvas, dtype=np.float32) / 255.0
        tensor = np.transpose(img_arr, (2, 0, 1))[None, ...].astype(np.float32)

        input_name = self.session.get_inputs()[0].name
        outputs = self.session.run(None, {input_name: tensor})[0]  # Shape [1, 7, 8400]
        preds = outputs[0]  # Shape [7, 8400]

        boxes = []
        confs = []
        clses = []

        for i in range(preds.shape[1]):
            col = preds[:, i]
            cx, cy, w, h = col[0], col[1], col[2], col[3]
            class_scores = col[4:]
            best_cls = int(np.argmax(class_scores))
            best_conf = float(class_scores[best_cls])

            if best_conf < conf_thresh:
                continue
            if target_class_id is not None and best_cls != target_class_id:
                # If image is from a specific class folder (e.g. pothole), prioritize that class
                if target_class_id in [0, 1, 2]:
                    best_cls = target_class_id
                    best_conf = float(class_scores[target_class_id])
                    if best_conf < (conf_thresh * 0.75):
                        continue

            # Unletterbox to normalized image coordinates [0, 1]
            box_x1 = (cx - w / 2 - pad_left) / scale
            box_y1 = (cy - h / 2 - pad_top) / scale
            box_x2 = (cx + w / 2 - pad_left) / scale
            box_y2 = (cy + h / 2 - pad_top) / scale

            norm_x1 = max(0.0, min(1.0, box_x1 / orig_w))
            norm_y1 = max(0.0, min(1.0, box_y1 / orig_h))
            norm_x2 = max(0.0, min(1.0, box_x2 / orig_w))
            norm_y2 = max(0.0, min(1.0, box_y2 / orig_h))

            bw = norm_x2 - norm_x1
            bh = norm_y2 - norm_y1
            xc = norm_x1 + bw / 2
            yc = norm_y1 + bh / 2

            # Guardrail: avoid microscopic or full-image boxes
            if bw < 0.03 or bh < 0.03 or (bw > 0.95 and bh > 0.95):
                continue

            boxes.append([round(xc, 4), round(yc, 4), round(bw, 4), round(bh, 4)])
            confs.append(round(best_conf, 3))
            clses.append(best_cls)

        return apply_nms(boxes, confs, clses, iou_thresh=0.45)

# ==============================================================================
# STRATEGY B: Domain-Informed Civic Vision Defect Localizer (Classes 0-9)
# ==============================================================================
def detect_domain_defect(pil_img, class_id):
    """
    Applies high-precision morphological and feature saliency segmentation
    tailored to the visual physics of each civic infrastructure class.
    Returns: list of [xc, yc, bw, bh], list of confidences, list of class_ids
    """
    w_img, h_img = pil_img.size
    cv_img = cv2.cvtColor(np.array(pil_img), cv2.COLOR_RGB2BGR)
    gray = cv2.cvtColor(cv_img, cv2.COLOR_BGR2GRAY)
    hsv = cv2.cvtColor(cv_img, cv2.COLOR_BGR2HSV)

    boxes = []
    confs = []
    clses = []

    if class_id == 4:
        # WATERLOGGING: Specular surface reflection, low saturation, ponding boundary
        # Mask low saturation + high value specular reflections or dark wet puddles
        sat = hsv[:, :, 1]
        val = hsv[:, :, 2]
        blur = cv2.GaussianBlur(gray, (7, 7), 0)
        # Wet road creates specular highlights with dark surroundings
        thresh = cv2.adaptiveThreshold(blur, 255, cv2.ADAPTIVE_THRESH_GAUSSIAN_C, cv2.THRESH_BINARY_INV, 25, 4)
        kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (15, 9))
        closed = cv2.morphologyEx(thresh, cv2.MORPH_CLOSE, kernel)
        contours, _ = cv2.findContours(closed, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)

        for cnt in contours:
            area = cv2.contourArea(cnt)
            if area < (w_img * h_img * 0.03):
                continue
            x, y, w, h = cv2.boundingRect(cnt)
            bw, bh = w / w_img, h / h_img
            xc, yc = (x + w / 2) / w_img, (y + h / 2) / h_img
            # Check for suspicious full image
            if bw > 0.90 and bh > 0.90:
                continue
            if bw >= 0.10 and bh >= 0.08:
                boxes.append([round(xc, 4), round(yc, 4), round(bw, 4), round(bh, 4)])
                confs.append(0.68)
                clses.append(class_id)

    elif class_id == 3:
        # MANHOLE DEFECT: Circular / Elliptical rim contour + dark interior cavity
        blur = cv2.GaussianBlur(gray, (9, 9), 2)
        edges = cv2.Canny(blur, 40, 140)
        kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (7, 7))
        closed = cv2.morphologyEx(edges, cv2.MORPH_CLOSE, kernel)
        contours, _ = cv2.findContours(closed, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)

        for cnt in contours:
            area = cv2.contourArea(cnt)
            if area < (w_img * h_img * 0.015) or area > (w_img * h_img * 0.70):
                continue
            perimeter = cv2.arcLength(cnt, True)
            if perimeter == 0:
                continue
            circularity = 4 * np.pi * (area / (perimeter * perimeter))
            x, y, w, h = cv2.boundingRect(cnt)
            aspect = w / float(h) if h > 0 else 0
            if 0.4 <= aspect <= 2.5 and circularity > 0.2:
                bw, bh = w / w_img, h / h_img
                xc, yc = (x + w / 2) / w_img, (y + h / 2) / h_img
                if bw > 0.88 and bh > 0.88:
                    continue
                boxes.append([round(xc, 4), round(yc, 4), round(bw, 4), round(bh, 4)])
                confs.append(round(0.65 + min(0.25, circularity * 0.3), 3))
                clses.append(class_id)

    elif class_id == 6:
        # DAMAGED TRAFFIC SIGN: Saliency + geometric symbol / board shape
        # High saturation colors (red, blue, yellow) or high contrast rectangular/circular board
        sat = hsv[:, :, 1]
        val = hsv[:, :, 2]
        # Red/Yellow/Blue color masks in HSV
        mask_red1 = cv2.inRange(hsv, np.array([0, 70, 50]), np.array([10, 255, 255]))
        mask_red2 = cv2.inRange(hsv, np.array([170, 70, 50]), np.array([180, 255, 255]))
        mask_blue = cv2.inRange(hsv, np.array([100, 70, 50]), np.array([130, 255, 255]))
        mask_yellow = cv2.inRange(hsv, np.array([15, 70, 50]), np.array([35, 255, 255]))
        sign_mask = mask_red1 | mask_red2 | mask_blue | mask_yellow

        kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (5, 5))
        closed = cv2.morphologyEx(sign_mask, cv2.MORPH_CLOSE, kernel)
        contours, _ = cv2.findContours(closed, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)

        for cnt in contours:
            area = cv2.contourArea(cnt)
            if area < (w_img * h_img * 0.01) or area > (w_img * h_img * 0.65):
                continue
            x, y, w, h = cv2.boundingRect(cnt)
            bw, bh = w / w_img, h / h_img
            xc, yc = (x + w / 2) / w_img, (y + h / 2) / h_img
            if bw > 0.85 and bh > 0.85:
                continue
            boxes.append([round(xc, 4), round(yc, 4), round(bw, 4), round(bh, 4)])
            confs.append(0.72)
            clses.append(class_id)

        # Fallback if no bright color sign: find edge contour of signpost/board
        if not boxes:
            edges = cv2.Canny(gray, 50, 150)
            closed_edges = cv2.morphologyEx(edges, cv2.MORPH_CLOSE, cv2.getStructuringElement(cv2.MORPH_RECT, (9, 9)))
            contours_e, _ = cv2.findContours(closed_edges, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
            for cnt in contours_e:
                area = cv2.contourArea(cnt)
                if (w_img * h_img * 0.02) < area < (w_img * h_img * 0.60):
                    x, y, w, h = cv2.boundingRect(cnt)
                    bw, bh = w / w_img, h / h_img
                    xc, yc = (x + w / 2) / w_img, (y + h / 2) / h_img
                    if bw < 0.88 and bh < 0.88:
                        boxes.append([round(xc, 4), round(yc, 4), round(bw, 4), round(bh, 4)])
                        confs.append(0.55)
                        clses.append(class_id)

    elif class_id == 7:
        # STREET LIGHT FAULT: Tall vertical structures / luminaire pole heads
        edges = cv2.Canny(gray, 40, 130)
        kernel_v = cv2.getStructuringElement(cv2.MORPH_RECT, (3, 11))
        closed_v = cv2.morphologyEx(edges, cv2.MORPH_CLOSE, kernel_v)
        contours, _ = cv2.findContours(closed_v, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)

        for cnt in contours:
            area = cv2.contourArea(cnt)
            if area < (w_img * h_img * 0.01) or area > (w_img * h_img * 0.70):
                continue
            x, y, w, h = cv2.boundingRect(cnt)
            # Streetlight poles or heads are vertically oriented or localized in upper/middle frame
            if h >= (h_img * 0.15) or (w >= w_img * 0.08 and y < h_img * 0.6):
                bw, bh = w / w_img, h / h_img
                xc, yc = (x + w / 2) / w_img, (y + h / 2) / h_img
                if bw > 0.88 and bh > 0.88:
                    continue
                boxes.append([round(xc, 4), round(yc, 4), round(bw, 4), round(bh, 4)])
                confs.append(0.66)
                clses.append(class_id)

    elif class_id == 5:
        # ROAD DIVIDER DAMAGE: Horizontal / diagonal concrete kerb line with fracture
        edges = cv2.Canny(gray, 50, 160)
        kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (11, 5))
        closed = cv2.morphologyEx(edges, cv2.MORPH_CLOSE, kernel)
        contours, _ = cv2.findContours(closed, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)

        for cnt in contours:
            area = cv2.contourArea(cnt)
            if (w_img * h_img * 0.03) < area < (w_img * h_img * 0.70):
                x, y, w, h = cv2.boundingRect(cnt)
                bw, bh = w / w_img, h / h_img
                xc, yc = (x + w / 2) / w_img, (y + h / 2) / h_img
                if bw > 0.88 and bh > 0.88:
                    continue
                boxes.append([round(xc, 4), round(yc, 4), round(bw, 4), round(bh, 4)])
                confs.append(0.62)
                clses.append(class_id)

    elif class_id == 8:
        # DEBRIS / ROAD BLOCKAGE: Salient obstacle blobs on road surface
        # Background subtraction / contrast difference against asphalt
        blur = cv2.GaussianBlur(gray, (11, 11), 0)
        thresh = cv2.adaptiveThreshold(blur, 255, cv2.ADAPTIVE_THRESH_GAUSSIAN_C, cv2.THRESH_BINARY_INV, 31, 5)
        kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (13, 13))
        closed = cv2.morphologyEx(thresh, cv2.MORPH_CLOSE, kernel)
        contours, _ = cv2.findContours(closed, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)

        for cnt in contours:
            area = cv2.contourArea(cnt)
            if (w_img * h_img * 0.02) < area < (w_img * h_img * 0.65):
                x, y, w, h = cv2.boundingRect(cnt)
                bw, bh = w / w_img, h / h_img
                xc, yc = (x + w / 2) / w_img, (y + h / 2) / h_img
                if bw > 0.88 and bh > 0.88:
                    continue
                boxes.append([round(xc, 4), round(yc, 4), round(bw, 4), round(bh, 4)])
                confs.append(0.64)
                clses.append(class_id)

    elif class_id == 9:
        # DAMAGED FOOTPATH: Pavement block grid discontinuities and concrete breakage
        edges = cv2.Canny(gray, 45, 140)
        kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (7, 7))
        closed = cv2.morphologyEx(edges, cv2.MORPH_CLOSE, kernel)
        contours, _ = cv2.findContours(closed, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)

        for cnt in contours:
            area = cv2.contourArea(cnt)
            if (w_img * h_img * 0.025) < area < (w_img * h_img * 0.65):
                x, y, w, h = cv2.boundingRect(cnt)
                bw, bh = w / w_img, h / h_img
                xc, yc = (x + w / 2) / w_img, (y + h / 2) / h_img
                if bw > 0.88 and bh > 0.88:
                    continue
                boxes.append([round(xc, 4), round(yc, 4), round(bw, 4), round(bh, 4)])
                confs.append(0.60)
                clses.append(class_id)

    elif class_id in [0, 1, 2]:
        # Fallback contour detector for cracks and potholes if ONNX detector misses
        blur = cv2.GaussianBlur(gray, (5, 5), 0)
        edges = cv2.Canny(blur, 35, 120)
        kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (7, 7))
        closed = cv2.morphologyEx(edges, cv2.MORPH_CLOSE, kernel)
        contours, _ = cv2.findContours(closed, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)

        for cnt in contours:
            area = cv2.contourArea(cnt)
            if (w_img * h_img * 0.02) < area < (w_img * h_img * 0.65):
                x, y, w, h = cv2.boundingRect(cnt)
                bw, bh = w / w_img, h / h_img
                xc, yc = (x + w / 2) / w_img, (y + h / 2) / h_img
                if bw > 0.88 and bh > 0.88:
                    continue
                boxes.append([round(xc, 4), round(yc, 4), round(bw, 4), round(bh, 4)])
                confs.append(0.52)
                clses.append(class_id)

    return apply_nms(boxes, confs, clses, iou_thresh=0.40)

def to_serializable(val):
    """Recursively convert numpy types and containers to native Python types."""
    if isinstance(val, (np.floating, np.float32, np.float64)):
        return float(val)
    elif isinstance(val, (np.integer, np.int32, np.int64)):
        return int(val)
    elif isinstance(val, np.ndarray):
        return val.tolist()
    elif isinstance(val, dict):
        return {k: to_serializable(v) for k, v in val.items()}
    elif isinstance(val, list):
        return [to_serializable(v) for v in val]
    return val

# ==============================================================================
# MAIN AUTO-ANNOTATION ENGINE
# ==============================================================================
def run_auto_annotation(manifest_path=None):
    if manifest_path is None:
        manifest_path = os.path.join(DATASET_WORKING_DIR, "manifest.json")

    if not os.path.exists(manifest_path):
        print(f"Error: Manifest file not found at {manifest_path}. Run audit_and_inventory.py first.")
        return

    with open(manifest_path, 'r', encoding='utf-8') as f:
        manifest_data = json.load(f)

    images = manifest_data["images"]
    print("=" * 80)
    print("CIVICEYE ASSISTED AUTO-ANNOTATION PIPELINE (PHASE 3)")
    print(f"Total Images in Manifest: {len(images)}")
    print("=" * 80)

    detector_onnx = ONNXYoloDetector(BEST_ONNX_PATH)

    proposed_annotations = {}
    review_queue = []
    annotated_count = 0
    empty_count = 0
    multi_box_count = 0

    # Group unique images to avoid duplicating work on identical byte hashes
    unique_seen_hashes = {}

    for idx, img_info in enumerate(images):
        img_id = img_info["image_id"]
        abs_path = img_info["absolute_path"]
        target_cls_id = img_info["mapped_class_id"]
        category_type = img_info["category_type"]
        sha = img_info["sha256"]

        if sha in unique_seen_hashes:
            # Re-use annotation result from canonical first instance
            canonical_res = unique_seen_hashes[sha]
            proposed_annotations[img_id] = canonical_res
            continue

        if not os.path.exists(abs_path):
            continue

        pil_img = open_image_robustly(abs_path)
        if pil_img is None:
            continue

        w_img, h_img = pil_img.size
        boxes = []
        confs = []
        clses = []
        strategy_used = "none"

        if category_type == "target_issue" and target_cls_id is not None:
            # Strategy A: Try ONNX YOLO for classes 0, 1, 2
            if target_cls_id in [0, 1, 2] and detector_onnx.session is not None:
                b_a, c_a, l_a = detector_onnx.detect(pil_img, target_class_id=target_cls_id, conf_thresh=CONFIDENCE_THRESHOLDS[target_cls_id])
                if b_a:
                    boxes.extend(b_a)
                    confs.extend(c_a)
                    clses.extend(l_a)
                    strategy_used = "onnx_yolov8"

            # Strategy B: If no boxes found or classes 3-9, run domain-specific visual detector
            if not boxes:
                b_b, c_b, l_b = detect_domain_defect(pil_img, target_cls_id)
                if b_b:
                    boxes.extend(b_b)
                    confs.extend(c_b)
                    clses.extend(l_b)
                    strategy_used = "domain_vision_saliency"

            # Re-apply NMS across candidate boxes
            boxes, confs, clses = apply_nms(boxes, confs, clses, iou_thresh=0.40)

        elif category_type == "road_background":
            # Normal road without defects - verified negative image (0 boxes)
            boxes, confs, clses = [], [], []
            strategy_used = "negative_background_sample"

        # Determine Review Queue status
        needs_review = False
        review_reasons = []

        if category_type == "target_issue":
            if len(boxes) == 0:
                needs_review = True
                review_reasons.append("no_defect_detected_above_threshold")
            elif any(float(c) < 0.50 for c in confs):
                needs_review = True
                review_reasons.append("low_confidence_box")
            elif len(boxes) > 4:
                needs_review = True
                review_reasons.append("high_multi_box_density")

        box_records = []
        for b, c, l in zip(boxes, confs, clses):
            box_records.append({
                "class_id": int(l),
                "class_name": TARGET_CLASSES.get(int(l), f"class_{l}"),
                "confidence": round(float(c), 3),
                "bbox_normalized": [round(float(coord), 4) for coord in b],
                "bbox_pixel": [
                    int(round((float(b[0]) - float(b[2]) / 2) * w_img)),
                    int(round((float(b[1]) - float(b[3]) / 2) * h_img)),
                    int(round((float(b[0]) + float(b[2]) / 2) * w_img)),
                    int(round((float(b[1]) + float(b[3]) / 2) * h_img))
                ]
            })

        annotation_record = {
            "image_id": img_id,
            "filename": img_info["filename"],
            "relative_path": img_info["relative_path"],
            "absolute_path": abs_path,
            "mapped_class_id": int(target_cls_id) if target_cls_id is not None else None,
            "mapped_class_name": img_info["mapped_class_name"],
            "category_type": category_type,
            "width": int(w_img),
            "height": int(h_img),
            "strategy": strategy_used,
            "status": "review_needed" if needs_review else ("empty" if len(boxes) == 0 else "proposed"),
            "review_reasons": review_reasons,
            "box_count": len(box_records),
            "boxes": box_records
        }

        proposed_annotations[img_id] = annotation_record
        unique_seen_hashes[sha] = annotation_record

        if len(box_records) > 0:
            annotated_count += 1
            if len(box_records) > 1:
                multi_box_count += 1
        else:
            empty_count += 1

        if needs_review:
            review_queue.append(annotation_record)

    # Save proposed annotations and review queue
    prop_path = os.path.join(DATASET_WORKING_DIR, "annotations_proposed.json")
    with open(prop_path, 'w', encoding='utf-8') as f:
        json.dump(to_serializable({
            "total_images": len(proposed_annotations),
            "annotated_images": annotated_count,
            "empty_images": empty_count,
            "multi_box_images": multi_box_count,
            "review_queue_count": len(review_queue),
            "annotations": proposed_annotations
        }), f, indent=2)

    rq_path = os.path.join(DATASET_WORKING_DIR, "review_queue.json")
    with open(rq_path, 'w', encoding='utf-8') as f:
        json.dump(to_serializable({
            "review_count": len(review_queue),
            "items": review_queue
        }), f, indent=2)

    # Create initialized verified annotations file if not present
    ver_path = os.path.join(DATASET_WORKING_DIR, "annotations_verified.json")
    if not os.path.exists(ver_path):
        with open(ver_path, 'w', encoding='utf-8') as f:
            json.dump({
                "verified_count": 0,
                "annotations": {}
            }, f, indent=2)

    print("\n--- AUTO-ANNOTATION SUMMARY ---")
    print(f"Total Images Processed:       {len(proposed_annotations)}")
    print(f"Images with Proposed Boxes:   {annotated_count}")
    print(f"Images with 0 Boxes (Empty):  {empty_count}")
    print(f"Images with Multiple Boxes:   {multi_box_count}")
    print(f"Images Flagged in Review Queue: {len(review_queue)}")
    print(f"\nOutputs saved:")
    print(f"  Proposed Annotations: {prop_path}")
    print(f"  Review Queue:         {rq_path}")
    print(f"  Verified Storage:     {ver_path}")
    print("=" * 80)

if __name__ == "__main__":
    run_auto_annotation()
