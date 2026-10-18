#!/usr/bin/env python3
"""
CivicEye — Combined MobileNetV2 & YOLOv8 Inference Pipeline Test Suite
Tests the two-tier inference architecture:
1. MobileNetV2 Scene & Context Gatekeeper (224x224)
2. YOLOv8 Road Defect Object Detector (640x640)
Measures latency, classification accuracy, non-road filtering, and edge cases.
"""

import os
import time
import numpy as np
import onnxruntime as ort
from PIL import Image

CLASSIFIER_PATH = 'assets/models/mobilenetv2.onnx'
YOLO_PATH = 'assets/models/best.onnx'

EXPLICIT_INDOOR_CLASSES = {
    508, 916, 620, 664, 782, 673, 487, 526, 530, 532, 537, 553, 559, 564, 574, 590, 604, 608, 629, 638,
    645, 651, 668, 679, 688, 703, 720, 722, 735, 755, 759, 765, 768, 770, 776, 785, 794, 804, 808,
    831, 834, 846, 852, 854, 857, 859, 861, 898, 900, 903,
}

OUTDOOR_AND_ROAD_CLASSES = {
    436, 468, 475, 497, 511, 544, 627, 654, 656, 675, 705, 734, 817, 825, 864, 867, 874, 919, 920, 922,
    970, 971, 972, 973, 974, 975, 976, 977, 978, 979, 980, 981, 982, 983, 984
}

CLASS_ID_MAP = {
    0: 'alligator cracking',
    1: 'cracking',
    2: 'pothole',
}

def softmax(x):
    e_x = np.exp(x - np.max(x))
    return e_x / e_x.sum(axis=-1, keepdims=True)

def preprocess_mobilenet(img):
    img_resized = img.resize((224, 224), Image.BILINEAR)
    arr = np.array(img_resized, dtype=np.float32) / 255.0
    mean = np.array([0.485, 0.456, 0.406], dtype=np.float32)
    std = np.array([0.229, 0.224, 0.225], dtype=np.float32)
    norm = (arr - mean) / std
    norm = np.transpose(norm, (2, 0, 1))
    return np.expand_dims(norm, 0).astype(np.float32)

def letterbox_yolo(im, new_shape=(640, 640), color=(114, 114, 114)):
    shape = im.size
    r = min(new_shape[0] / shape[0], new_shape[1] / shape[1])
    new_unpad = (int(round(shape[0] * r)), int(round(shape[1] * r)))
    dw, dh = (new_shape[0] - new_unpad[0]) / 2, (new_shape[1] - new_unpad[1]) / 2
    if shape != new_unpad:
        im = im.resize(new_unpad, Image.BILINEAR)
    top, bottom = int(round(dh - 0.1)), int(round(dh + 0.1))
    left, right = int(round(dw - 0.1)), int(round(dw + 0.1))
    new_im = Image.new('RGB', new_shape, color)
    new_im.paste(im, (left, top))
    arr = np.array(new_im, dtype=np.float32) / 255.0
    arr = np.transpose(arr, (2, 0, 1))
    return np.expand_dims(arr, 0).astype(np.float32), r, (dw, dh)

def validate_scene_mobilenet(session, img):
    """Replicates server.js validateRoadPresence MobileNet stage."""
    # 1. Pixel Heuristics
    arr = np.array(img, dtype=np.float32) / 255.0
    lum = 0.299 * arr[:, :, 0] + 0.587 * arr[:, :, 1] + 0.114 * arr[:, :, 2]
    mean_lum = float(np.mean(lum))
    var_lum = float(np.var(lum))

    if mean_lum < 0.05 and var_lum < 0.005:
        return False, 0.01, 'dark_image (underexposed)', 0.1
    if mean_lum > 0.94 and var_lum < 0.004:
        return False, 0.01, 'overexposed_image (washed out)', 0.1

    # 2. MobileNetV2 Inference
    t0 = time.perf_counter()
    tensor = preprocess_mobilenet(img)
    outputs = session.run(None, {'data': tensor})[0]
    lat_ms = (time.perf_counter() - t0) * 1000
    probs = softmax(outputs[0])
    
    top_idx = int(np.argmax(probs))
    top_prob = float(probs[top_idx])

    top5_indices = np.argsort(probs)[-5:][::-1]
    indoor_w = sum(probs[i] for i in top5_indices if i in EXPLICIT_INDOOR_CLASSES)
    animal_w = sum(probs[i] for i in top5_indices if 0 <= i <= 397 and i not in OUTDOOR_AND_ROAD_CLASSES)
    plant_w = sum(probs[i] for i in top5_indices if 985 <= i <= 998)

    if indoor_w > 0.35 or (top_idx in EXPLICIT_INDOOR_CLASSES and top_prob > 0.25):
        return False, float(1.0 - indoor_w), f"Indoor object (Class {top_idx}, prob {top_prob:.2f})", lat_ms

    if animal_w > 0.50 or (top_idx <= 397 and top_prob > 0.60 and top_idx not in OUTDOOR_AND_ROAD_CLASSES):
        return False, float(1.0 - animal_w), f"Animal/Pet (Class {top_idx}, prob {top_prob:.2f})", lat_ms

    if plant_w > 0.40 or (985 <= top_idx <= 998 and top_prob > 0.45):
        return False, float(1.0 - plant_w), f"Dense flora (Class {top_idx}, prob {top_prob:.2f})", lat_ms

    return True, 0.95, "Valid road/outdoor scene", lat_ms

def run_yolo_detection(session, img):
    """Runs YOLOv8 defect detection."""
    t0 = time.perf_counter()
    tensor, r, (dw, dh) = letterbox_yolo(img)
    outputs = session.run(None, {'images': tensor})[0][0] # [7, 8400]
    lat_ms = (time.perf_counter() - t0) * 1000

    detections = []
    for a in range(8400):
        cx, cy, w, h = outputs[0, a], outputs[1, a], outputs[2, a], outputs[3, a]
        scores = outputs[4:, a]
        best_cls = int(np.argmax(scores))
        score = float(scores[best_cls])
        if score >= 0.02:
            # calibrate
            norm = (score - 0.02) / 0.98
            cal = 0.35 + 0.63 * np.sqrt(norm)
            detections.append({
                'classId': best_cls,
                'issueType': CLASS_ID_MAP.get(best_cls, f'class_{best_cls}'),
                'rawConf': score,
                'calConf': min(0.99, max(0.30, cal)),
            })
    detections.sort(key=lambda x: x['calConf'], reverse=True)
    return detections, lat_ms

def main():
    print("=" * 70)
    print(" [CIVICEYE COMBINED INFERENCE PIPELINE BENCHMARK]")
    print(f" MobileNetV2: {CLASSIFIER_PATH}")
    print(f" YOLOv8:      {YOLO_PATH}")
    print("=" * 70)

    # Load ONNX sessions
    t0 = time.perf_counter()
    cls_session = ort.InferenceSession(CLASSIFIER_PATH, providers=['CPUExecutionProvider'])
    cls_load_ms = (time.perf_counter() - t0) * 1000

    t0 = time.perf_counter()
    yolo_session = ort.InferenceSession(YOLO_PATH, providers=['CPUExecutionProvider'])
    yolo_load_ms = (time.perf_counter() - t0) * 1000

    print(f"\n* Model Warmup & Load Times:")
    print(f"   - MobileNetV2 Load Time: {cls_load_ms:.1f} ms")
    print(f"   - YOLOv8 Load Time:      {yolo_load_ms:.1f} ms")

    # Construct test image battery
    test_cases = []

    # 1. Real Road Images
    if os.path.exists('dataset_working/images/test/pothole_user_crop.jpg'):
        test_cases.append(('pothole_user_crop.jpg (Road Pothole)', Image.open('dataset_working/images/test/pothole_user_crop.jpg').convert('RGB'), True))
    if os.path.exists('dataset_working/images/test/cropped_crack.jpg'):
        test_cases.append(('cropped_crack.jpg (Road Crack)', Image.open('dataset_working/images/test/cropped_crack.jpg').convert('RGB'), True))

    # 2. Synthetic Edge & Non-Road Cases
    # A. Underexposed (pure black)
    black_img = Image.new('RGB', (400, 300), (5, 5, 5))
    test_cases.append(('Synthetic: Severe Underexposure (Black)', black_img, False))

    # B. Overexposed (pure white)
    white_img = Image.new('RGB', (400, 300), (250, 250, 250))
    test_cases.append(('Synthetic: Severe Overexposure (White)', white_img, False))

    # C. Pure Greenery (Forest/Grass without pavement)
    green_arr = np.zeros((300, 400, 3), dtype=np.uint8)
    green_arr[:, :, 0] = 30
    green_arr[:, :, 1] = 180
    green_arr[:, :, 2] = 40
    green_img = Image.fromarray(green_arr)
    test_cases.append(('Synthetic: Dense Greenery (No Road)', green_img, False))

    # D. Clean Asphalt Road (No Defect)
    asphalt_arr = np.random.normal(85, 8, (300, 400, 3)).clip(0, 255).astype(np.uint8)
    asphalt_img = Image.fromarray(asphalt_arr)
    test_cases.append(('Synthetic: Clean Asphalt Road (No Defect)', asphalt_img, True))

    print("\n" + "-" * 70)
    print(" Executing Combined Pipeline Tests:")
    print("-" * 70)

    results = []

    for name, img, expected_valid in test_cases:
        print(f"\n>> Test Case: {name}")
        t_start = time.perf_counter()

        # Step 1: MobileNetV2 Gatekeeper
        is_road, conf, reason, *rest = validate_scene_mobilenet(cls_session, img)
        cls_time = rest[0] if rest else 0.0

        if not is_road:
            total_lat = (time.perf_counter() - t_start) * 1000
            print(f"   [STOP] Gatekeeper Filter: REJECTED (Reason: {reason})")
            print(f"   [TIME] Latency: Gatekeeper={cls_time:.1f}ms | YOLOv8=SKIPPED | Total={total_lat:.1f}ms")
            results.append({
                'name': name,
                'gatekeeper': 'REJECTED',
                'reason': reason,
                'detections': 'N/A (Skipped)',
                'latency_ms': total_lat,
                'status': 'PASS' if not expected_valid else 'FAIL'
            })
            continue

        print(f"   [PASS] Gatekeeper Filter: ACCEPTED (Confidence: {conf:.2f})")

        # Step 2: YOLOv8 Detector
        detections, yolo_time = run_yolo_detection(yolo_session, img)
        total_lat = (time.perf_counter() - t_start) * 1000

        if detections:
            top = detections[0]
            det_summary = f"{top['issueType']} ({top['calConf']*100:.1f}%)"
            print(f"   [DET] YOLOv8 Detection: {det_summary} [{len(detections)} candidate boxes]")
        else:
            det_summary = "no_major_issue (0 detections)"
            print(f"   [DET] YOLOv8 Detection: no_major_issue (Clean Road)")

        print(f"   [TIME] Latency: Gatekeeper={cls_time:.1f}ms | YOLOv8={yolo_time:.1f}ms | Total={total_lat:.1f}ms")

        results.append({
            'name': name,
            'gatekeeper': 'ACCEPTED',
            'reason': 'Valid Road Scene',
            'detections': det_summary,
            'latency_ms': total_lat,
            'status': 'PASS' if expected_valid else 'FAIL'
        })

    print("\n" + "=" * 70)
    print(" [COMBINED PIPELINE SUMMARY TABLE]")
    print("=" * 70)
    print(f"{'Test Case':<42} | {'Gatekeeper':<10} | {'YOLOv8 Output':<25} | {'Latency':<9} | {'Status'}")
    print("-" * 105)
    for r in results:
        print(f"{r['name'][:40]:<42} | {r['gatekeeper']:<10} | {r['detections'][:24]:<25} | {r['latency_ms']:>6.1f} ms | {r['status']}")
    print("=" * 105)

if __name__ == '__main__':
    main()
