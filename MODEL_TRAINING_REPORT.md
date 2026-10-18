# CivicEye — Phase 4: YOLOv8 Model Upgrade and Training Report

**Report Date:** October 9, 2026  
**Auditor / ML Engineer:** Antigravity AI Assistant  
**Project:** CivicEye — Multi-Class Municipal Infrastructure Issue Detection  
**Repository Path:** `c:/Users/Nithya/CivicEye-Miniproject`  
**Experiment Directory:** `c:/Users/Nithya/CivicEye-Miniproject/experiments/experiment_yolov8_10class`  

---

## 1. Executive Summary

Phase 4 evaluated the training prerequisites, baseline model performance, and hardware environment for upgrading CivicEye from its 3-class baseline to the approved **10-class municipal infrastructure detector**.

### Key Milestones:
1. **Pre-Training Verification Completed**: Audited dataset splits, class mappings, memory, disk, and Python ML toolchains.
2. **Existing Assets Fully Preserved**: The production weights ([`assets/models/best.onnx`](file:///c:/Users/Nithya/CivicEye-Miniproject/assets/models/best.onnx)), Express backend API, and Expo mobile client remain 100% active and untouched.
3. **Isolated Experiment Environment Created**: Initialized [`experiments/experiment_yolov8_10class/`](file:///c:/Users/Nithya/CivicEye-Miniproject/experiments/experiment_yolov8_10class) with structured configuration, checkpoint directories, and prediction preview logging.
4. **Baseline Inference & Prediction Previews Generated**: Baseline 3-class ONNX evaluation executed on test images with bounding boxes and calibrated confidence scores.
5. **Accurate Pre-Training Status**: In strict accordance with engineering audit guidelines, training execution is paused pending the ingestion of annotated training images into `dataset_working/images/train/` and installation of the PyTorch/Ultralytics training suite.

---

## 2. Dataset & Configuration Used

* **Dataset Configuration File**: [`dataset_working/data.yaml`](file:///c:/Users/Nithya/CivicEye-Miniproject/dataset_working/data.yaml)
* **Dataset Root**: `c:/Users/Nithya/CivicEye-Miniproject/dataset_working`
* **Target Classes (`nc: 10`)**:
  - `0`: `alligator cracking` (Road Maintenance — `ROAD`)
  - `1`: `cracking` (Road Maintenance — `ROAD`)
  - `2`: `pothole` (Road Maintenance — `ROAD`)
  - `3`: `manhole defect` (Water Supply & Drainage — `TWAD` / `DRAIN`)
  - `4`: `waterlogging` (Stormwater / Drainage — `DRAIN`)
  - `5`: `road divider damage` (Traffic & Road Safety — `SAFETY`)
  - `6`: `damaged traffic sign` (Traffic & Road Safety — `SAFETY`)
  - `7`: `street light fault` (Street Lighting — `LIGHTING`)
  - `8`: `debris / road blockage` (Solid Waste Management — `SWM`)
  - `9`: `damaged footpath` (Public Works Department — `PWD`)

### Dataset Verification Status:
* **Train Split (`images/train/`)**: **0 images** (Data gap identified in Phase 2 & 3).
* **Val Split (`images/val/`)**: **0 images**.
* **Test Split (`images/test/`)**: **2 images** (`cropped_crack.jpg`, `pothole_user_crop.jpg`) with 100% verified labels.

---

## 3. Starting Weights & Model Architecture

* **Production Baseline Model**: [`assets/models/best.onnx`](file:///c:/Users/Nithya/CivicEye-Miniproject/assets/models/best.onnx)
  * **Architecture**: Ultralytics YOLOv8 (v8.4.120)
  * **Input Shape**: `[1, 3, 640, 640]` Float32
  * **Output Shape**: `[1, 7, 8400]` (4 box coordinates + 3 class scores)
* **Target Fine-Tuning Checkpoint**: `yolov8n.pt` / `yolov8s.pt` (Lightweight mobile-ready architecture)
  * **Expected Output Shape**: `[1, 14, 8400]` (4 box coordinates + 10 class scores)

---

## 4. Hardware Environment & Training Hyperparameters

### 4.1 Verified Hardware Resources

| Resource | Verified Specification | Compatibility Notes |
| :--- | :--- | :--- |
| **GPU** | NVIDIA GeForce GTX 1650 (4096 MiB VRAM) | Supported via CUDA 12.5 (Batch size 8 @ 640×640) |
| **GPU Driver** | 555.97 / WDDM | CUDA 12.5 ready |
| **System RAM** | 8.0 GB (7.76 GB visible, ~0.5 GB free) | Recommend 2 worker threads to avoid paging |
| **Free Disk Space** | 185.0 GB available on `C:\` | Ample storage for checkpoints and datasets |
| **Python Runtime** | `Python 3.13.1` (64-bit Windows) | Requires PyTorch + Ultralytics wheels |

### 4.2 Configured Hyperparameters ([`experiments/experiment_yolov8_10class/config.json`](file:///c:/Users/Nithya/CivicEye-Miniproject/experiments/experiment_yolov8_10class/config.json))

```json
{
  "imgsz": 640,
  "batch_size": 8,
  "epochs": 100,
  "patience": 15,
  "optimizer": "AdamW",
  "lr0": 0.001,
  "lrf": 0.01,
  "workers": 2,
  "device": 0,
  "augmentations": {
    "hsv_h": 0.015,
    "hsv_s": 0.7,
    "hsv_v": 0.4,
    "fliplr": 0.5,
    "mosaic": 1.0,
    "mixup": 0.0
  }
}
```

---

## 5. Pre-Training Verification & Execution Status

### Status: **Pre-Training Checks Completed — Execution Safely Paused**

**Reasoning**:
1. **Empty Training Split**: `dataset_working/images/train/` contains 0 training images. Running YOLOv8 training on an empty dataset would immediately fail or generate corrupt empty weights.
2. **Missing Local Training Suite**: `torch` and `ultralytics` are not currently installed in the host Python 3.13.1 environment. (ONNX Runtime inference is active and verified).
3. **Safety Protocol**: In compliance with strict Pair Programming guidelines, training is held until external training image batches are ingested into `dataset_working/images/train/`.

---

## 6. Baseline Model Evaluation Results

The existing model ([`assets/models/best.onnx`](file:///c:/Users/Nithya/CivicEye-Miniproject/assets/models/best.onnx)) was evaluated on the test images via CPU ONNX Runtime:

| Test Sample | Ground Truth | Top Detection | Raw Conf | Calibrated Conf | Priority Assigned | Box Coordinates `[x1, y1, x2, y2]` |
| :--- | :--- | :--- | :---: | :---: | :---: | :--- |
| `pothole_user_crop.jpg` (404×246) | `pothole` (ID 2) | **`pothole` (ID 2)** | `0.0594` | **47.6%** | `MEDIUM` | `[225.3, 186.6, 404.0, 246.0]` |
| `cropped_crack.jpg` (404×246) | `cracking` (ID 1) | `no_major_issue` | `< 0.020` | `0.0%` | `NONE` | (Below raw anchor threshold `0.020`) |

### Observations:
* `pothole_user_crop.jpg` successfully detected the primary road pothole cavity with calibrated confidence of **47.6%** (`MEDIUM` priority), correctly routing to `Road Maintenance Department`.
* `cropped_crack.jpg` has low-contrast hairline cracking that fell below the raw 0.020 detection threshold of the current 3-class baseline model, highlighting the need for fine-tuning on high-resolution cracked road datasets.

---

## 7. Prediction Previews Generated

Visual overlays showing bounding boxes, predicted class names, and confidence scores were generated and saved to:  
[`experiments/experiment_yolov8_10class/evaluation/prediction_previews/`](file:///c:/Users/Nithya/CivicEye-Miniproject/experiments/experiment_yolov8_10class/evaluation/prediction_previews)

* [`pothole_user_crop_pred.jpg`](file:///c:/Users/Nithya/CivicEye-Miniproject/experiments/experiment_yolov8_10class/evaluation/prediction_previews/pothole_user_crop_pred.jpg): Bounding box overlay for `pothole` (ID 2).
* [`cropped_crack_pred.jpg`](file:///c:/Users/Nithya/CivicEye-Miniproject/experiments/experiment_yolov8_10class/evaluation/prediction_previews/cropped_crack_pred.jpg): Clean baseline evaluation frame.

---

## 8. Experiment Directory & Checkpoint Tracking

```
experiments/experiment_yolov8_10class/
├── config.json                     # Complete training & hardware config
├── checkpoints/                    # Target directory for best.pt & last.pt
└── evaluation/
    └── prediction_previews/        # Visual prediction previews
        ├── cropped_crack_pred.jpg
        └── pothole_user_crop_pred.jpg
```

---

## 9. Recommended Next Steps for Phase 5

1. **Step 1: Ingest Training Images**: Ingest 300–500 images per class for the 10 target classes into `dataset_working/images/train/` and `dataset_working/labels/train/`.
2. **Step 2: Environment Setup**: Install PyTorch with CUDA and Ultralytics (`pip install torch torchvision --index-url https://download.pytorch.org/whl/cu124; pip install ultralytics`).
3. **Step 3: Execute Fine-Tuning**: Launch YOLOv8n fine-tuning using `experiments/experiment_yolov8_10class/config.json`.
4. **Step 4: Export to ONNX**: Export fine-tuned weights (`best.pt`) to ONNX (`[1, 14, 8400]`) for seamless backend integration.

---
*Report stored at: `MODEL_TRAINING_REPORT.md`*
