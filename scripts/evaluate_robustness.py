#!/usr/bin/env python3
"""
CivicEye — Phase 6: Detection Robustness & Real-World Stress Evaluation Suite
Evaluates MobileNetV2 gatekeeper and YOLOv8 detector across viewing conditions:
- Lighting (bright, shadow, low-light, overexposed)
- Blur & sensor noise (camera motion, low-resolution)
- Scale & distance variations
- Clean roads & non-road edge cases
Generates visual prediction outputs and a comprehensive failure analysis.
"""

import os
import time
import numpy as np
import onnxruntime as ort
from PIL import Image, ImageDraw, ImageFilter, ImageEnhance

OUTPUT_DIR = 'experiments/experiment_yolov8_10class/evaluation/robustness_tests'
os.makedirs(OUTPUT_DIR, exist_ok=True)

CLASSIFIER_PATH = 'assets/models/mobilenetv2.onnx'
YOLO_PATH = 'assets/models/best.onnx'

CLASS_ID_MAP = {
    0: 'alligator cracking',
    1: 'cracking',
    2: 'pothole',
}

CLASS_COLORS = {
    0: (239, 68, 68),    # Red
    1: (249, 115, 22),   # Orange
    2: (234, 179, 8),    # Yellow
}

EXPLICIT_INDOOR_CLASSES = {
    508, 916, 620, 664, 782, 673, 487, 526, 530, 532, 537, 553, 559, 564, 574, 590, 604, 608, 629, 638,
    645, 651, 668, 679, 688, 703, 720, 722, 735, 755, 759, 765, 768, 770, 776, 785, 794, 804, 808,
    831, 834, 846, 852, 854, 857, 859, 861, 898, 900, 903,
}

OUTDOOR_AND_ROAD_CLASSES = {
    436, 468, 475, 497, 511, 544, 627, 654, 656, 675, 705, 734, 817, 825, 864, 867, 874, 919, 920, 922,
    970, 971, 972, 973, 974, 975, 976, 977, 978, 979, 980, 981, 982, 983, 984
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

def iou(b1, b2):
    x1, y1, x2, y2 = max(b1[0], b2[0]), max(b1[1], b2[1]), min(b1[2], b2[2]), min(b1[3], b2[3])
    inter = max(0, x2 - x1) * max(0, y2 - y1)
    a1 = (b1[2] - b1[0]) * (b1[3] - b1[1])
    a2 = (b2[2] - b2[0]) * (b2[3] - b2[1])
    return inter / (a1 + a2 - inter) if (a1 + a2 - inter) > 0 else 0

def calibrate_conf(raw, thresh=0.02):
    if raw < thresh: return 0.0
    norm = (raw - thresh) / (1.0 - thresh)
    cal = 0.35 + 0.63 * np.sqrt(norm)
    return min(0.99, max(0.30, cal))

def validate_scene_mobilenet(session, img):
    arr = np.array(img, dtype=np.float32) / 255.0
    lum = 0.299 * arr[:, :, 0] + 0.587 * arr[:, :, 1] + 0.114 * arr[:, :, 2]
    mean_lum = float(np.mean(lum))
    var_lum = float(np.var(lum))

    if mean_lum < 0.05 and var_lum < 0.005:
        return False, 0.01, 'dark_image (underexposed)', 0.1
    if mean_lum > 0.94 and var_lum < 0.004:
        return False, 0.01, 'overexposed_image (washed out)', 0.1

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
        return False, float(1.0 - indoor_w), f"Indoor object (Class {top_idx})", lat_ms

    if animal_w > 0.50 or (top_idx <= 397 and top_prob > 0.60 and top_idx not in OUTDOOR_AND_ROAD_CLASSES):
        return False, float(1.0 - animal_w), f"Animal/Pet (Class {top_idx})", lat_ms

    if plant_w > 0.40 or (985 <= top_idx <= 998 and top_prob > 0.45):
        return False, float(1.0 - plant_w), f"Dense flora (Class {top_idx})", lat_ms

    return True, 0.95, "Valid road/outdoor scene", lat_ms

def run_yolo_detection(session, img):
    t0 = time.perf_counter()
    tensor, r, (dw, dh) = letterbox_yolo(img)
    outputs = session.run(None, {'images': tensor})[0][0] # [7, 8400]
    lat_ms = (time.perf_counter() - t0) * 1000

    w_orig, h_orig = img.size
    detections = []
    for a in range(8400):
        cx, cy, w, h = outputs[0, a], outputs[1, a], outputs[2, a], outputs[3, a]
        scores = outputs[4:, a]
        best_cls = int(np.argmax(scores))
        score = float(scores[best_cls])
        if score >= 0.02:
            x1_lb = cx - w/2
            y1_lb = cy - h/2
            x2_lb = cx + w/2
            y2_lb = cy + h/2

            x1 = max(0, (x1_lb - dw) / r)
            y1 = max(0, (y1_lb - dh) / r)
            x2 = min(w_orig, (x2_lb - dw) / r)
            y2 = min(h_orig, (y2_lb - dh) / r)

            cal_c = calibrate_conf(score)
            detections.append({
                'classId': best_cls,
                'issueType': CLASS_ID_MAP.get(best_cls, f'class_{best_cls}'),
                'rawConf': score,
                'calConf': cal_c,
                'box': [x1, y1, x2, y2],
                'lb_box': [x1_lb, y1_lb, x2_lb, y2_lb]
            })

    # NMS
    detections.sort(key=lambda x: x['rawConf'], reverse=True)
    keep = []
    for d in detections:
        if not any(iou(d['lb_box'], k['lb_box']) > 0.45 and d['classId'] == k['classId'] for k in keep):
            keep.append(d)

    return keep, lat_ms

def save_prediction_image(img, detections, gatekeeper_res, filename, title_info):
    preview = img.copy()
    draw = ImageDraw.Draw(preview)
    w_img, h_img = preview.size

    is_road, conf, reason, lat_ms = gatekeeper_res

    # Draw gatekeeper banner at top
    gk_text = f"Gatekeeper: {'ACCEPTED (Road)' if is_road else 'REJECTED (' + reason + ')'} [{lat_ms:.1f}ms]"
    gk_bg = (16, 185, 129) if is_road else (239, 68, 68)
    draw.rectangle([0, 0, w_img, 22], fill=gk_bg)
    draw.text((8, 4), gk_text, fill=(255, 255, 255))

    # Draw detections if accepted
    if is_road and detections:
        for d in detections[:3]:
            x1, y1, x2, y2 = d['box']
            col = CLASS_COLORS.get(d['classId'], (0, 255, 0))
            for off in range(3):
                draw.rectangle([x1 - off, y1 - off, x2 + off, y2 + off], outline=col)
            lbl = f"{d['issueType']}: {d['calConf']*100:.1f}%"
            bw = len(lbl) * 7 + 8
            draw.rectangle([x1, max(22, y1 - 18), x1 + bw, max(40, y1)], fill=col)
            draw.text((x1 + 4, max(24, y1 - 16)), lbl, fill=(255, 255, 255))
    elif is_road and not detections:
        draw.text((8, 30), "YOLOv8: no_major_issue (0 detections)", fill=(245, 158, 11))

    # Footer
    draw.rectangle([0, h_img - 20, w_img, h_img], fill=(15, 23, 42))
    draw.text((8, h_img - 16), title_info, fill=(203, 213, 225))

    out_path = os.path.join(OUTPUT_DIR, filename)
    preview.save(out_path, 'JPEG', quality=95)
    return out_path

def main():
    print("=" * 75)
    print(" [CIVICEYE PHASE 6: DETECTION ROBUSTNESS & STRESS BENCHMARK]")
    print("=" * 75)

    cls_session = ort.InferenceSession(CLASSIFIER_PATH, providers=['CPUExecutionProvider'])
    yolo_session = ort.InferenceSession(YOLO_PATH, providers=['CPUExecutionProvider'])

    # Load base images
    pothole_base = Image.open('dataset_working/images/test/pothole_user_crop.jpg').convert('RGB')
    crack_base = Image.open('dataset_working/images/test/cropped_crack.jpg').convert('RGB')

    test_battery = []

    # 1. Real Held-Out Test Samples (Baseline Ground Truth)
    test_battery.append({
        'id': 'TEST_01_REAL_POTHOLE',
        'desc': 'Real Pothole (Standard View)',
        'img': pothole_base,
        'expected_class': 'pothole',
        'category': 'Real Held-Out Test'
    })
    test_battery.append({
        'id': 'TEST_02_REAL_CRACK',
        'desc': 'Real Road Crack (Standard View)',
        'img': crack_base,
        'expected_class': 'cracking',
        'category': 'Real Held-Out Test'
    })

    # 2. Lighting & Exposure Variations
    # Low light (dark street / dusk)
    enhancer = ImageEnhance.Brightness(pothole_base)
    dark_pothole = enhancer.enhance(0.35)
    test_battery.append({
        'id': 'TEST_03_LOW_LIGHT_POTHOLE',
        'desc': 'Pothole in Low Light / Dusk (35% Brightness)',
        'img': dark_pothole,
        'expected_class': 'pothole',
        'category': 'Lighting Stress'
    })

    # High Glare (Harsh noon sunlight)
    bright_crack = enhancer.enhance(1.85)
    test_battery.append({
        'id': 'TEST_04_HARSH_GLARE_CRACK',
        'desc': 'Crack under Harsh Sunlight Glare (185% Brightness)',
        'img': bright_crack,
        'expected_class': 'cracking',
        'category': 'Lighting Stress'
    })

    # 3. Blur & Image Quality Variations
    # Defocused / Motion Blur
    blurry_pothole = pothole_base.filter(ImageFilter.GaussianBlur(radius=3.5))
    test_battery.append({
        'id': 'TEST_05_MOTION_BLUR_POTHOLE',
        'desc': 'Pothole with Motion / Defocus Blur (r=3.5)',
        'img': blurry_pothole,
        'expected_class': 'pothole',
        'category': 'Image Quality Stress'
    })

    # Sensor Noise (High ISO grain)
    arr_noise = np.array(pothole_base, dtype=np.float32)
    noise = np.random.normal(0, 25, arr_noise.shape)
    noisy_arr = np.clip(arr_noise + noise, 0, 255).astype(np.uint8)
    noisy_pothole = Image.fromarray(noisy_arr)
    test_battery.append({
        'id': 'TEST_06_SENSOR_NOISE_POTHOLE',
        'desc': 'Pothole with High Sensor Noise / ISO Grain',
        'img': noisy_pothole,
        'expected_class': 'pothole',
        'category': 'Image Quality Stress'
    })

    # 4. Scale & Distance Variations (Small / Distant Defect)
    w_p, h_p = pothole_base.size
    small_pothole = pothole_base.resize((w_p // 2, h_p // 2), Image.BILINEAR)
    canvas = Image.new('RGB', (w_p, h_p), (100, 100, 100))
    canvas.paste(small_pothole, (w_p // 4, h_p // 4))
    test_battery.append({
        'id': 'TEST_07_DISTANT_SCALE_POTHOLE',
        'desc': 'Pothole at Greater Distance (50% Downscaled in Frame)',
        'img': canvas,
        'expected_class': 'pothole',
        'category': 'Scale & Distance Stress'
    })

    # 5. Clean Road & Non-Road Edge Cases
    # Clean Asphalt
    asphalt_arr = np.random.normal(85, 6, (246, 404, 3)).clip(0, 255).astype(np.uint8)
    asphalt_img = Image.fromarray(asphalt_arr)
    test_battery.append({
        'id': 'TEST_08_CLEAN_ASPHALT',
        'desc': 'Clean Undamaged Asphalt Surface',
        'img': asphalt_img,
        'expected_class': 'no_major_issue',
        'category': 'False Positive Check'
    })

    # Severe Washout (Overexposed White)
    white_img = Image.new('RGB', (404, 246), (250, 250, 250))
    test_battery.append({
        'id': 'TEST_09_OVEREXPOSED_WHITE',
        'desc': 'Completely Overexposed White Frame',
        'img': white_img,
        'expected_class': 'not_road (rejection)',
        'category': 'Gatekeeper Edge Case'
    })

    # Severe Darkness (Black Frame)
    black_img = Image.new('RGB', (404, 246), (4, 4, 4))
    test_battery.append({
        'id': 'TEST_10_UNDEREXPOSED_BLACK',
        'desc': 'Completely Underexposed Black Frame',
        'img': black_img,
        'expected_class': 'not_road (rejection)',
        'category': 'Gatekeeper Edge Case'
    })

    print(f"\n* Executing Battery of {len(test_battery)} Robustness Test Scenarios...\n")

    results = []

    for t in test_battery:
        t_id = t['id']
        desc = t['desc']
        img = t['img']
        expected = t['expected_class']
        cat = t['category']

        t0 = time.perf_counter()
        # 1. Gatekeeper Stage
        is_road, conf, reason, *rest = validate_scene_mobilenet(cls_session, img)
        lat_gk = rest[0] if rest else 0.1

        # 2. YOLOv8 Stage
        if is_road:
            detections, lat_yolo = run_yolo_detection(yolo_session, img)
            top_det = detections[0]['issueType'] if detections else 'no_major_issue'
            top_conf = detections[0]['calConf'] if detections else 0.0
            top_raw = detections[0]['rawConf'] if detections else 0.0
        else:
            detections = []
            lat_yolo = 0.0
            top_det = f'REJECTED ({reason})'
            top_conf = 0.0
            top_raw = 0.0

        total_lat = (time.perf_counter() - t0) * 1000

        # Save Visual Preview
        fn = f"{t_id}.jpg"
        save_prediction_image(img, detections, (is_road, conf, reason, lat_gk), fn, f"{t_id}: {desc}")

        # Classify outcome
        if 'not_road' in expected:
            status = 'CORRECT_REJECTION' if not is_road else 'FALSE_ACCEPTANCE'
        elif expected == 'no_major_issue':
            status = 'TRUE_NEGATIVE' if top_det == 'no_major_issue' else 'FALSE_POSITIVE'
        elif top_det == expected:
            status = 'TRUE_POSITIVE'
        else:
            status = 'FALSE_NEGATIVE'

        results.append({
            'id': t_id,
            'desc': desc,
            'category': cat,
            'expected': expected,
            'predicted': top_det,
            'cal_conf': top_conf,
            'raw_conf': top_raw,
            'gatekeeper': 'ACCEPTED' if is_road else 'REJECTED',
            'status': status,
            'latency': total_lat,
            'file': fn
        })

        print(f"[{t_id}] {desc}")
        print(f"   -> Expected: {expected} | Actual: {top_det} ({top_conf*100:.1f}%) | Status: {status} [{total_lat:.1f}ms]")

    print("\n" + "=" * 80)
    print(" [PHASE 6 ROBUSTNESS EVALUATION SUMMARY TABLE]")
    print("=" * 80)
    print(f"{'Test ID':<26} | {'Category':<22} | {'Expected':<16} | {'Actual Prediction':<22} | {'Status'}")
    print("-" * 105)
    for r in results:
        print(f"{r['id']:<26} | {r['category']:<22} | {r['expected']:<16} | {r['predicted'][:21]:<22} | {r['status']}")
    print("=" * 105)

if __name__ == '__main__':
    main()
