# CivicEye — Phase 3: Dataset Preparation and Annotation Validation Report

**Validation Date:** October 8, 2026  
**Auditor:** Antigravity AI Assistant  
**Project:** CivicEye — Multi-Class Municipal Infrastructure Issue Detection  
**Repository Path:** `c:/Users/Nithya/CivicEye-Miniproject`  
**Working Dataset Path:** `c:/Users/Nithya/CivicEye-Miniproject/dataset_working`  

---

## 1. Executive Summary

Phase 3 established a dedicated, non-destructive **working dataset directory** (`dataset_working/`) configured for the approved **10-class municipal taxonomy**.

All original project files, model weights, database schemas, and API definitions remain 100% untouched and preserved. An automated dataset validation suite ([`scripts/validate_dataset.py`](file:///c:/Users/Nithya/CivicEye-Miniproject/scripts/validate_dataset.py)) was developed to enforce strict YOLO annotation syntax, normalized boundary constraints, file pairing, and cryptographic SHA-256 duplicate/leakage detection.

---

## 2. Working Dataset Architecture & Location

The working dataset is isolated in a separate top-level directory to protect production assets:

```
dataset_working/
├── data.yaml                     # YOLOv8 dataset configuration
├── classes.txt                   # Ordered class list
├── images/
│   ├── train/                    # Training images (Ready for batch ingestion)
│   ├── val/                      # Validation images
│   └── test/                     # Test/evaluation images
│       ├── cropped_crack.jpg
│       └── pothole_user_crop.jpg
├── labels/
│   ├── train/                    # Training label files (.txt)
│   ├── val/                      # Validation label files (.txt)
│   └── test/                     # Test label files (.txt)
│       ├── cropped_crack.txt
│       └── pothole_user_crop.txt
└── previews/                     # Ground-truth visual overlays
    ├── cropped_crack_preview.jpg
    └── pothole_user_crop_preview.jpg
```

---

## 3. Approved Class Names & Class-ID Mapping

The working dataset defines the 10 approved target classes. IDs 0–2 are kept identical to the active model for seamless backward compatibility:

| Class ID | Class Name | Responsible Department | Department Code | Annotation Standard & Visual Features |
| :---: | :--- | :--- | :---: | :--- |
| **0** | `alligator cracking` | Road Maintenance | `ROAD` | Interconnected polygonal/hexagonal fatigue crack network. |
| **1** | `cracking` | Road Maintenance | `ROAD` | Single continuous longitudinal or transverse pavement fissures. |
| **2** | `pothole` | Road Maintenance | `ROAD` | Surface asphalt cavities, missing pavement chunks, bowl depressions. |
| **3** | `manhole defect` | Water Supply & Drainage | `TWAD` / `DRAIN` | Open manholes, displaced covers, sunken frames, or damaged lids. |
| **4** | `waterlogging` | Stormwater / Drainage | `DRAIN` | Stagnant rainwater ponding on carriageway or pedestrian paths. |
| **5** | `road divider damage` | Traffic & Road Safety | `SAFETY` | Fractured concrete kerbs, displaced median blocks, broken barriers. |
| **6** | `damaged traffic sign` | Traffic & Road Safety | `SAFETY` | Bent, scratched, faded, obscured signboards or bare signposts. |
| **7** | `street light fault` | Street Lighting | `LIGHTING` | Broken luminaire heads, leaning poles, or exposed/dangling wires. |
| **8** | `debris / road blockage`| Solid Waste Management | `SWM` | Construction rubble, uncollected garbage dumps, fallen tree boughs. |
| **9** | `damaged footpath` | Public Works Department | `PWD` | Broken walkway concrete slabs, missing pavers, uneven walkway. |

---

## 4. Dataset Counts & Distribution

### 4.1 Split Distribution

| Split | Verified Image Count | Verified Label Count | Labelled Object Count | Integrity Status |
| :--- | :---: | :---: | :---: | :--- |
| **Train** | 0 | 0 | 0 | Empty (Awaiting data ingestion) |
| **Val** | 0 | 0 | 0 | Empty (Awaiting data ingestion) |
| **Test** | 2 | 2 | 2 | 100% Validated (Zero errors) |
| **TOTAL** | **2** | **2** | **2** | **Zero Syntax Errors** |

### 4.2 Per-Class Object Distribution in Working Dataset

| Class ID | Target Class Name | Verified Objects in Working Set | Status |
| :---: | :--- | :---: | :--- |
| **0** | `alligator cracking` | 0 | Data Gap — 0 samples in local repo |
| **1** | `cracking` | 1 | Verified (`cropped_crack.jpg`) |
| **2** | `pothole` | 1 | Verified (`pothole_user_crop.jpg`) |
| **3** | `manhole defect` | 0 | Data Gap — 0 samples in local repo |
| **4** | `waterlogging` | 0 | Data Gap — 0 samples in local repo |
| **5** | `road divider damage` | 0 | Data Gap — 0 samples in local repo |
| **6** | `damaged traffic sign` | 0 | Data Gap — 0 samples in local repo |
| **7** | `street light fault` | 0 | Data Gap — 0 samples in local repo |
| **8** | `debris / road blockage`| 0 | Data Gap — 0 samples in local repo |
| **9** | `damaged footpath` | 0 | Data Gap — 0 samples in local repo |

---

## 5. Annotation Validation Results

The dataset was analyzed using the custom validator script [`scripts/validate_dataset.py`](file:///c:/Users/Nithya/CivicEye-Miniproject/scripts/validate_dataset.py):

* **File Pairing Check**: 100% image-to-label pairing. Zero orphan label files or missing labels.
* **Token Count & Format**: Every line contains exactly 5 space-separated tokens (`<class_id> <x_center> <y_center> <width> <height>`).
* **Class ID Bounds**: All class IDs fall within `[0, 9]`.
* **Coordinate Normalization**: All center coordinates and dimensions fall strictly within `(0.0, 1.0]`.
* **Bounding Box Bounds Check**: All bounding box corners (`x1, y1, x2, y2`) satisfy `0.0 <= coord <= 1.0` within standard tolerance (`0.02`).
* **Total Coordinate/Syntax Errors**: **0 Errors**.

---

## 6. Duplicate Detection & Cross-Split Data Leakage Check

The validation tool computes SHA-256 cryptographic hashes for every image file across all splits:

* **Duplicate Image Count**: **0** (No duplicate image hashes within any split).
* **Cross-Split Data Leakage**: **0** (Zero hash overlap between `train`, `val`, and `test` directories).

---

## 7. Visual Previews Generated

Visual preview images with color-coded bounding boxes, ground-truth class IDs, class names, and image dimensions were generated and saved to:
[`dataset_working/previews/`](file:///c:/Users/Nithya/CivicEye-Miniproject/dataset_working/previews)

- **`cropped_crack_preview.jpg`**: Displays ID 1 (`cracking`) boundary on 404×246 road pavement.
- **`pothole_user_crop_preview.jpg`**: Displays ID 2 (`pothole`) cavity boundary on 404×246 road asphalt.

---

## 8. Remaining Data Gaps & Ingestion Recommendations

To prepare this working dataset for a full YOLOv8 training run:

1. **Required Training Volume**: Collect approximately 300–500 annotated images per class across the 10 target classes (approx. 3,000–5,000 total training images).
2. **Recommended Sources for Ingestion**:
   - Road Defect Datasets: RDD2022 (Road Damage Dataset) for alligator cracking, longitudinal/transverse cracks, and potholes.
   - Municipal Civic Datasets: Roboflow Universe Municipal Datasets for open manholes, waterlogging, damaged signage, streetlights, and sidewalk defects.
3. **Partitioning Standard**: Ingest data into `dataset_working/` adhering to an 70% Train / 20% Val / 10% Test split with zero image leakage.

---

## 9. Commands to Rerun Validation Checks

To re-run the full validation suite anytime after adding new images or annotations:

```powershell
python scripts/validate_dataset.py dataset_working
```

Exit code `0` indicates 100% clean annotations and zero syntax/boundary errors.

---
*Report stored at: `DATASET_VALIDATION_REPORT.md`*
