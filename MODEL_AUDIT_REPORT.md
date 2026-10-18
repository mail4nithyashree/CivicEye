# CivicEye AI Model Audit Report (Phase 1)

**Audit Date:** October 8, 2026  
**Auditor:** Antigravity AI Assistant  
**Project:** CivicEye — Municipal Infrastructure Issue Detection System  
**Repository Path:** `c:/Users/Nithya/CivicEye-Miniproject`  

---

## 1. Executive Summary

This audit evaluates the existing Machine Learning pipeline in CivicEye. The current architecture employs a two-tier AI inference pipeline:
1. **MobileNetV2 (`assets/models/mobilenetv2.onnx`)**: Operates as a **pre-inference scene validator / filter** (ImageNet-1k classifier) to reject non-road scenes, indoor items, selfies, and pets.
2. **YOLOv8 (`assets/models/best.onnx`)**: Operates as the **primary road damage object detector**, trained on 3 classes (`alligator cracking`, `cracking`, `pothole`).

Inference is executed server-side via Node.js (`onnxruntime-node` in `server.js`) and consumed by the React Native / Expo mobile application via HTTP multipart uploads.

---

## 2. Model & Weight Inventory

| Component | File Path | File Size | Architecture / Format | Input Dimensions | Output Dimensions |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Object Detector** | [`assets/models/best.onnx`](file:///c:/Users/Nithya/CivicEye-Miniproject/assets/models/best.onnx) | 103.66 MB (103,659,238 B) | YOLOv8 (Ultralytics v8.4.120) | `[1, 3, 640, 640]` (Float32) | `[1, 7, 8400]` (`output0`) |
| **Scene Validator** | [`assets/models/mobilenetv2.onnx`](file:///c:/Users/Nithya/CivicEye-Miniproject/assets/models/mobilenetv2.onnx) | 14.25 MB (14,246,826 B) | MobileNetV2 (ImageNet-1k) | `[1, 3, 224, 224]` (Float32) | `[1, 1000]` (`mobilenetv20_output_flatten0_reshape0`) |
| **Class Mapping** | [`assets/models/classes.json`](file:///c:/Users/Nithya/CivicEye-Miniproject/assets/models/classes.json) | 72 Bytes | JSON Dictionary | N/A | 3 classes |
| **Sample Images** | [`assets/models/cropped_crack.jpg`](file:///c:/Users/Nithya/CivicEye-Miniproject/assets/models/cropped_crack.jpg)<br>[`assets/models/pothole_user_crop.jpg`](file:///c:/Users/Nithya/CivicEye-Miniproject/assets/models/pothole_user_crop.jpg) | 35.6 KB<br>29.9 KB | JPEG Sample Test Crops | Variable | N/A |

### Model Metadata (Extracted from ONNX Headers)
- **`best.onnx` Metadata:**
  - `description`: Ultralytics best model trained on `/content/drive/MyDrive/CivicEye_AI/data_3class.yaml`
  - `version`: Ultralytics 8.4.120
  - `task`: `detect`
  - `stride`: 32
  - `imgsz`: `[640, 640]`
  - `names`: `{0: 'alligator cracking', 1: 'cracking', 2: 'pothole'}`
  - `date`: `2026-08-15T18:50:18`
- **`mobilenetv2.onnx` Metadata:**
  - ImageNet-1000 standard pretrained vision backbone without custom training metadata.

---

## 3. Actual Roles of Each Model

### 3.1 YOLOv8 (`best.onnx`)
- **Primary Task**: Multi-label Object Detection on civic road imagery.
- **Inference Pipeline**:
  1. Accepts 640×640 letterboxed RGB float32 tensors (`[1, 3, 640, 640]`).
  2. Produces anchor tensor `[1, 7, 8400]` representing 8,400 grid anchors. Each anchor contains 4 bounding box parameters `[cx, cy, w, h]` + 3 class confidence scores.
  3. Applies Non-Maximum Suppression (NMS) with an IoU threshold of `0.45`.
  4. Computes calibrated confidence scores and calculates priority levels (`HIGH`, `MEDIUM`, `LOW`, `NONE`) based on defect type, bounding box surface area, and detection count.
  5. Routes primary detection to the responsible department (`Road Maintenance Department` / `ROAD`).

### 3.2 MobileNetV2 (`mobilenetv2.onnx`)
- **Primary Task**: Context & Road Scene Gatekeeper (Pre-YOLO Filter).
- **Inference Pipeline**:
  1. Downsamples input image to 224×224 RGB and normalizes with ImageNet statistics (`mean=[0.485, 0.456, 0.406]`, `std=[0.229, 0.224, 0.225]`).
  2. Evaluates probabilities across 1,000 ImageNet categories.
  3. Checks against blacklist sets:
     - `EXPLICIT_INDOOR_CLASSES`: Keyboards, laptops, screens, office supplies.
     - `Animals/Pets`: Classes 0–397 (unless flagged as road/terrain).
     - `Plants/Flora`: Classes 985–998.
  4. If an indoor object or non-road subject is detected with confidence, the request is rejected immediately with `isRoad: false` before YOLOv8 execution, preventing false positive damage classifications.

---

## 4. Training Environment & Hardware Capabilities

### 4.1 Local Hardware
- **GPU**: NVIDIA GeForce GTX 1650 (4096 MiB VRAM / 4 GB GDDR)
- **NVIDIA Driver**: 555.97
- **CUDA Version Supported**: CUDA 12.5
- **GPU Status**: Healthy, 0 MiB active VRAM usage, idle.

### 4.2 Software & Runtime Dependencies
- **Operating System**: Windows (x64)
- **Python Runtime**: `Python 3.13.1`
- **Installed ML Packages in Python**:
  - `onnxruntime` (1.29.0)
  - `numpy` (2.2.1)
  - `pillow` (11.1.0)
  - `scipy` (1.15.1)
  - `matplotlib` (3.10.0)
- **Node.js Environment**:
  - `onnxruntime-node` (^1.29.0)
  - `express` (^5.2.1)
  - `firebase` (^12.17.1)
  - `multer` (^2.2.0)
  - `jpeg-js` (^0.4.4), `pngjs` (^7.0.0)
- **Missing Dependencies for Local Training**:
  - `torch` and `torchvision` (PyTorch with CUDA support).
  - `ultralytics` (YOLOv8 training suite).
  - `opencv-python` / `albumentations`.

---

## 5. Current Dataset & Annotation Inspection

- **Local Dataset Status**:
  - **No training/validation/test images** or annotation files (`.txt` in YOLO format, `.xml` in Pascal VOC, or `.json` in COCO) are present in the local repository.
  - **No `data.yaml`** configuration file is present in the repository.
  - **Original training origin**: Model metadata records training in Google Colab from `/content/drive/MyDrive/CivicEye_AI/data_3class.yaml`.
- **Available Local Image Assets**:
  - `assets/models/cropped_crack.jpg` (1 sample)
  - `assets/models/pothole_user_crop.jpg` (1 sample)
- **Class Breakdown in Current Model**:
  - Class 0: `alligator cracking`
  - Class 1: `cracking`
  - Class 2: `pothole`
- **Missing Information**: Exact image counts, annotation counts, train/val/test split ratios, and class balance figures from original training cannot be determined from the repository alone due to absence of dataset files.

---

## 6. Preprocessing, Thresholds & Export Specifications

### 6.1 Preprocessing Pipeline
- **YOLOv8 (`server.js`)**:
  - Aspect-ratio preserving letterbox resizing to 640×640.
  - Background fill: RGB `114` (normalized `114/255.0 = 0.447`).
  - Pixel normalization: `[0.0, 1.0]`.
  - Layout: NCHW `[1, 3, 640, 640]` Float32.
- **MobileNetV2 (`server.js`)**:
  - Bilinear resize to 224×224.
  - Normalization: `(val - mean) / std` with `mean=[0.485, 0.456, 0.406]` and `std=[0.229, 0.224, 0.225]`.
  - Layout: NCHW `[1, 3, 224, 224]` Float32.

### 6.2 Thresholds & Calibration
- **Detection Threshold**: `0.020` raw score filter per anchor (`CLASS_CONF_THRESHOLDS`).
- **NMS IoU Threshold**: `0.45` (`IOU_THRESHOLD`).
- **Road Validation Threshold**: `0.45` (`ROAD_VALIDATION_THRESHOLD`).
- **Confidence Calibration**: `calibrated = 0.35 + 0.63 * sqrt((raw - thresh) / (1 - thresh))`, clamped to `[0.30, 0.99]`.

### 6.3 Export Format Requirements for New Models
- Format: ONNX (`.onnx`) format with opset 12–17.
- Input tensor: `images` `[1, 3, 640, 640]` Float32.
- Output tensor: `output0` `[1, 4 + N, 8400]` Float32 (where `N` is the number of classes).
- Runtime compatibility: Compatible with `onnxruntime-node` (v1.29.0) and `onnxruntime` (Python v1.29.0).

---

## 7. Integration Architecture (Backend, Firebase & Routing)

### 7.1 Backend API ([`server.js`](file:///c:/Users/Nithya/CivicEye-Miniproject/server.js))
- **Port / Host**: `3000` (`0.0.0.0`)
- **Key Endpoints**:
  - `POST /api/analyze-road`: Complete pipeline (MobileNetV2 road validation + YOLOv8 damage detection + NMS + Priority calculation + Department routing).
  - `POST /api/validate-road`: Standalone road scene check.
  - `POST /api/upload-image`: Authenticated Cloudinary image upload.
  - `POST /api/send-email`: SMTP / logging notification service.
  - `POST /api/verify-complaint` & `POST /api/reject-complaint`: Field Inspector workflow proxies.
  - `GET /health`: Backend health & ONNX engine readiness.

### 7.2 Firebase & Firestore ([`firebaseConfig.ts`](file:///c:/Users/Nithya/CivicEye-Miniproject/firebaseConfig.ts), [`firestore.rules`](file:///c:/Users/Nithya/CivicEye-Miniproject/firestore.rules))
- Firestore Collections: `complaints`, `users`, `notifications`.
- Backend Auth: Pre-authenticated officer credentials (`officer.pwd@civiceye.demo` / `main@civiceye.gov`) in `server.js` for resilient server proxy updates.

### 7.3 Department Routing Architecture ([`services/departmentMapping.ts`](file:///c:/Users/Nithya/CivicEye-Miniproject/services/departmentMapping.ts))
- Routing Map (`ISSUE_DEPARTMENT_MAP`):
  - `pothole`, `alligator cracking`, `cracking` ➔ **Road Maintenance Department (`ROAD`)**
  - `road divider damage`, `missing signage` ➔ **Traffic / Road Safety Department (`SAFETY`)**
  - `street light fault` ➔ **Street Lighting Department (`LIGHTING`)**
  - `debris / road blockage`, `Garbage Overflow` ➔ **Solid Waste Management (`SWM`)**
  - `manhole defect`, `waterlogging`, `Drainage Problem` ➔ **Stormwater / Drainage (`DRAIN`) & TWAD**
  - `Building Damage`, `Wall Damage`, `Roof Leakage` ➔ **Public Building Maintenance (`BUILDING`)**
  - `Park Maintenance`, `Playground Damage` ➔ **Parks and Public Spaces (`PARKS`)**
  - `Fallen Tree`, `Overgrown Vegetation` ➔ **Tree / Greenery Maintenance (`TREES`)**
  - `Public Route Issue`, `Damaged Footpath` ➔ **Public Works Department (`PWD`)**

---

## 8. Gap Analysis & Minimum Changes for Multi-Class System

To extend CivicEye into a comprehensive multi-class civic infrastructure detection system:

1. **Dataset Acquisition & Labeling**:
   - Collect and annotate data for target expanded classes (e.g. road damage, open manholes, waterlogging, street light damage, garbage overflow, damaged signage/dividers).
2. **Model Training & ONNX Export**:
   - Train YOLOv8n / YOLOv8s on multi-class civic dataset.
   - Export trained model to ONNX (`assets/models/best.onnx`) with shape `[1, 4 + N, 8400]`.
3. **Dynamic Postprocessing in `server.js`**:
   - Refactor `parseYoloOutput()` in `server.js` to dynamically iterate over `N` classes instead of hardcoding `c0, c1, c2`.
4. **Configuration Alignment**:
   - Update `assets/models/classes.json` with the new class dictionary.
   - Update `CLASS_ID_MAP` and `CLASS_CONF_THRESHOLDS` in `server.js` and `services/detectionConfig.ts`.
5. **Scene Validator Tuning**:
   - Adjust `validateRoadPresence()` in `server.js` so valid non-road civic infrastructure (e.g. parks, streetlights, building facades) is not blocked by MobileNetV2 road checks when non-road civic modes are active.

---
*Report stored at: `MODEL_AUDIT_REPORT.md`*
