import os
import sys
import glob
import numpy as np
from PIL import Image
import onnxruntime as ort
import hashlib

# Ensure safe UTF-8 output encoding across Windows and POSIX shells
if hasattr(sys.stdout, 'reconfigure'):
    try:
        sys.stdout.reconfigure(encoding='utf-8')
    except Exception:
        pass

def get_image_hash(filepath):
    with open(filepath, 'rb') as f:
        return hashlib.sha256(f.read()).hexdigest()[:16]

def letterbox_image(img, target_size=(640, 640), pad_color=114):
    iw, ih = img.size
    tw, th = target_size
    scale = min(tw / iw, th / ih)
    nw, nh = int(round(iw * scale)), int(round(ih * scale))
    
    resized = img.resize((nw, nh), Image.BILINEAR)
    new_img = Image.new('RGB', target_size, (pad_color, pad_color, pad_color))
    pad_x = (tw - nw) // 2
    pad_y = (th - nh) // 2
    new_img.paste(resized, (pad_x, pad_y))
    return new_img, scale, pad_x, pad_y

def run_diagnostics(custom_images=None):
    print("=" * 80)
    print("[DIAGNOSTIC] CIVICEYE PIPELINE DIAGNOSTIC & ROOT-CAUSE VERIFICATION")
    print("=" * 80)
    
    yolo_path = "assets/models/best.onnx"
    mnet_path = "assets/models/mobilenetv2.onnx"
    
    if not os.path.exists(yolo_path):
        print(f"[ERROR] YOLO model not found at {yolo_path}")
        return
    if not os.path.exists(mnet_path):
        print(f"[ERROR] MobileNetV2 model not found at {mnet_path}")
        return
        
    # 1. Model Loading Check
    yolo_session = ort.InferenceSession(yolo_path, providers=['CPUExecutionProvider'])
    mnet_session = ort.InferenceSession(mnet_path, providers=['CPUExecutionProvider'])
    
    print("\n--- 1. MODEL METADATA & ACTUAL TRAINED CLASSES ---")
    yolo_meta = yolo_session.get_modelmeta().custom_metadata_map
    print(f"YOLO Model File:        {yolo_path} ({os.path.getsize(yolo_path)/(1024*1024):.2f} MB)")
    print(f"YOLO Training Source:   {yolo_meta.get('description', 'N/A')}")
    print(f"YOLO Version:           {yolo_meta.get('version', 'N/A')}")
    print(f"YOLO Trained Names:     {yolo_meta.get('names', 'N/A')}")
    print(f"YOLO Input Shape:       {yolo_session.get_inputs()[0].shape}")
    print(f"YOLO Output Shape:      {yolo_session.get_outputs()[0].shape}")
    
    print(f"\nMobileNetV2 File:       {mnet_path} ({os.path.getsize(mnet_path)/(1024*1024):.2f} MB)")
    print(f"MobileNetV2 Input:      {mnet_session.get_inputs()[0].shape}")
    print(f"MobileNetV2 Output:     {mnet_session.get_outputs()[0].shape}")
    
    # 2. Test Images Evaluation
    test_images = [
        ("Real Pothole", "assets/models/pothole_user_crop.jpg"),
        ("Real Crack", "assets/models/cropped_crack.jpg"),
        ("Clean Asphalt", "experiments/experiment_yolov8_10class/evaluation/robustness_tests/TEST_08_CLEAN_ASPHALT.jpg"),
        ("Overexposed White", "experiments/experiment_yolov8_10class/evaluation/robustness_tests/TEST_09_OVEREXPOSED_WHITE.jpg"),
        ("Underexposed Black", "experiments/experiment_yolov8_10class/evaluation/robustness_tests/TEST_10_UNDEREXPOSED_BLACK.jpg"),
        ("Icon Graphic (Non-road)", "assets/images/icon.png"),
        ("React Logo (Non-road)", "assets/images/react-logo.png"),
    ]
    
    if custom_images:
        test_images = [(f"Custom Input {i+1}", p) for i, p in enumerate(custom_images)]
    
    print("\n--- 2. INFERENCE RUN ACROSS TEST IMAGES ---")
    
    for label, img_path in test_images:
        if not os.path.exists(img_path):
            continue
            
        img_hash = get_image_hash(img_path)
        img = Image.open(img_path).convert('RGB')
        w, h = img.size
        
        # Preprocess for MobileNetV2 (224x224, ImageNet norm)
        mnet_img = img.resize((224, 224), Image.BILINEAR)
        mnet_arr = np.array(mnet_img).astype(np.float32) / 255.0
        mnet_arr = (mnet_arr - [0.485, 0.456, 0.406]) / [0.229, 0.224, 0.225]
        mnet_tensor = np.transpose(mnet_arr, (2, 0, 1))[np.newaxis, :, :, :].astype(np.float32)
        
        mnet_out = mnet_session.run(None, {mnet_session.get_inputs()[0].name: mnet_tensor})[0][0]
        exp_scores = np.exp(mnet_out - np.max(mnet_out))
        probs = exp_scores / np.sum(exp_scores)
        top5_idx = np.argsort(probs)[-5:][::-1]
        
        # Preprocess for YOLOv8 (640x640 letterbox)
        letterboxed, scale, pad_x, pad_y = letterbox_image(img, (640, 640), 114)
        yolo_arr = np.array(letterboxed).astype(np.float32) / 255.0
        yolo_tensor = np.transpose(yolo_arr, (2, 0, 1))[np.newaxis, :, :, :].astype(np.float32)
        
        yolo_out = yolo_session.run(None, {yolo_session.get_inputs()[0].name: yolo_tensor})[0]
        anchors = yolo_out[0]
        scores_c0 = anchors[4, :]
        scores_c1 = anchors[5, :]
        scores_c2 = anchors[6, :]
        
        max_c0, max_c1, max_c2 = float(np.max(scores_c0)), float(np.max(scores_c1)), float(np.max(scores_c2))
        max_overall = max(max_c0, max_c1, max_c2)
        
        count_002 = int(np.sum((scores_c0 >= 0.020) | (scores_c1 >= 0.020) | (scores_c2 >= 0.020)))
        count_025 = int(np.sum((scores_c0 >= 0.250) | (scores_c1 >= 0.250) | (scores_c2 >= 0.250)))
        count_045 = int(np.sum((scores_c0 >= 0.450) | (scores_c1 >= 0.450) | (scores_c2 >= 0.450)))
        
        print(f"\n[{label}] ({img_path})")
        print(f"  SHA256 Hash:        {img_hash}")
        print(f"  Dimensions:         {w} x {h}")
        print(f"  Top MobileNetV2:    Class {top5_idx[0]} (p={probs[top5_idx[0]]:.4f}), Class {top5_idx[1]} (p={probs[top5_idx[1]]:.4f})")
        print(f"  YOLO Max Scores:    Alligator: {max_c0:.4f}, Crack: {max_c1:.4f}, Pothole: {max_c2:.4f} (Max: {max_overall:.4f})")
        print(f"  Anchor Hits:        thresh>=0.020: {count_002} | thresh>=0.250: {count_025} | thresh>=0.450: {count_045}")
        
        if max_overall >= 0.020:
            best_cls = 0 if max_c0 == max_overall else (1 if max_c1 == max_overall else 2)
            cls_name = {0: 'alligator cracking', 1: 'cracking', 2: 'pothole'}[best_cls]
            norm_val = (max_overall - 0.020) / (1.0 - 0.020)
            calibrated = 0.35 + 0.63 * np.sqrt(norm_val)
            calibrated = min(0.99, max(0.30, round(calibrated, 2)))
            print(f"  --> Pipeline Output: '{cls_name}' with CALIBRATED confidence {int(calibrated*100)}% (Raw: {max_overall:.4f})")
        else:
            print(f"  --> Pipeline Output: 'no_major_issue' (0 detections)")

    print("\n" + "=" * 80)
    print("[DIAGNOSTIC] PIPELINE DIAGNOSTIC COMPLETED SUCCESSFULLY")
    print("=" * 80 + "\n")

if __name__ == "__main__":
    custom_args = sys.argv[1:] if len(sys.argv) > 1 else None
    run_diagnostics(custom_args)
