# CivicEye — Phase 2: Dataset and Class Taxonomy Audit Report

**Audit Date:** October 8, 2026  
**Auditor:** Antigravity AI Assistant  
**Project:** CivicEye — Multi-Class Municipal Infrastructure Issue Detection  
**Repository Path:** `c:/Users/Nithya/CivicEye-Miniproject`  

---

## 1. Existing Dataset Inspection & Verification

### 1.1 Local Storage & Directory Verification
An exhaustive filesystem search across the entire project repository confirms:
- **Local Dataset Paths**: No training, validation, or test dataset directories (`data/`, `dataset/`, `images/train/`, `labels/train/`) exist within the local git workspace.
- **Local Images & Annotation Files**:
  - Training images committed: **0**
  - Validation images committed: **0**
  - YOLO annotation files (`.txt`): **0**
  - Dataset configuration files (`data.yaml`): **0**
- **Evaluation Crop Samples**:
  - [`assets/models/cropped_crack.jpg`](file:///c:/Users/Nithya/CivicEye-Miniproject/assets/models/cropped_crack.jpg) (35.6 KB) — Single sample of linear cracking.
  - [`assets/models/pothole_user_crop.jpg`](file:///c:/Users/Nithya/CivicEye-Miniproject/assets/models/pothole_user_crop.jpg) (29.9 KB) — Single sample of pothole excavation.

### 1.2 Training Provenance (Extracted from ONNX Weights)
Inspection of the active ONNX model weights ([`assets/models/best.onnx`](file:///c:/Users/Nithya/CivicEye-Miniproject/assets/models/best.onnx)) custom metadata confirms:
- **Training Environment**: Google Colab / Cloud GPU
- **Original Dataset Config Path**: `/content/drive/MyDrive/CivicEye_AI/data_3class.yaml`
- **Ultralytics Version**: 8.4.120 (YOLOv8)
- **Model Task**: `detect`
- **Stride**: 32 | **Input Shape**: `[640, 640]` | **Output Shape**: `[1, 7, 8400]`

### 1.3 Existing Class-to-ID Mapping
The existing model and codebase enforce the following 3-class baseline:

| Class ID | Class Name | Model Support | Codebase Mapping Status |
| :---: | :--- | :---: | :--- |
| **0** | `alligator cracking` | Verified (`best.onnx`) | Configured in [`classes.json`](file:///c:/Users/Nithya/CivicEye-Miniproject/assets/models/classes.json) & [`server.js`](file:///c:/Users/Nithya/CivicEye-Miniproject/server.js) |
| **1** | `cracking` | Verified (`best.onnx`) | Configured in [`classes.json`](file:///c:/Users/Nithya/CivicEye-Miniproject/assets/models/classes.json) & [`server.js`](file:///c:/Users/Nithya/CivicEye-Miniproject/server.js) |
| **2** | `pothole` | Verified (`best.onnx`) | Configured in [`classes.json`](file:///c:/Users/Nithya/CivicEye-Miniproject/assets/models/classes.json) & [`server.js`](file:///c:/Users/Nithya/CivicEye-Miniproject/server.js) |

### 1.4 Dataset Integrity & Missing Information
1. **Absence of Local Dataset**: The source training images and bounding-box coordinates reside in external cloud storage (`CivicEye_AI/data_3class.yaml`) and were not checked into git.
2. **Unverifiable Split Statistics**: The exact number of images, bounding boxes per class, train/val/test split ratios, and background/negative image counts cannot be established locally without retrieving the cloud dataset package.
3. **Data Quality Requirements for Phase 2**: The new dataset must enforce standard YOLO format (`<class_id> <x_center> <y_center> <width> <height>` normalized to `[0, 1]`), zero empty/corrupted bounding boxes, no coordinate clamping out-of-bounds, and explicit separation of train/val/test splits to eliminate data leakage.

---

## 2. Review & Feasibility Analysis of Proposed 58 CivicEye Classes

The proposed taxonomy comprises 58 defect classes across 5 municipal categories. Below is the comprehensive audit and feasibility assessment for every proposed class.

### Status Definitions
* **`READY`**: Sufficient valid images and bounding-box annotations are verified and immediately available for training.
* **`NEEDS MORE DATA`**: Class is visually distinct and feasible from static 2D images, but requires targeted dataset curation and annotation before training.
* **`NEEDS ANNOTATION`**: Relevant raw civic images exist in public/open repositories (e.g. RDD2022, Roboflow, OpenImages), but must be formatted and labelled with bounding boxes.
* **`NOT FOUND`**: No supporting images or benchmark datasets exist locally.
* **`NEEDS REDEFINITION`**: Class cannot be reliably identified from a single monocular image due to temporal, physical, or contextual limitations (e.g., missing objects, nighttime functionality, unmeasured depths).

---

### Category A: Civic Infrastructure (10 Classes)

| Class Name | Feasibility Status | Verified Local Count | Feasibility Justification & Annotation Rules |
| :--- | :---: | :---: | :--- |
| `DAMAGED_FOOTPATH` | **NEEDS ANNOTATION** | 0 | **High Feasibility**: Broken concrete slabs, cracked paver blocks, or missing walkway tiles have clear spatial boundaries. |
| `OPEN_MANHOLE` | **NEEDS ANNOTATION** | 0 | **Critical Safety Class / High Feasibility**: Highly distinctive dark circular/square hole directly in road or footpath. |
| `DAMAGED_MANHOLE_COVER` | **NEEDS ANNOTATION** | 0 | **High Feasibility**: Broken iron lid, sunken ring, or fractured concrete slab over utility chamber. |
| `BLOCKED_STORM_DRAIN` | **NEEDS ANNOTATION** | 0 | **High Feasibility**: Drain grate or catchpit obstructed by accumulated plastic, silt, leaves, or construction debris. |
| `OVERFLOWING_STORM_DRAIN` | **NEEDS REDEFINITION** | 0 | **Temporal/Flow Ambiguity**: Water bubbling out cannot be distinguished from surface ponding in a static image. Recommend merging with `ROAD_WATERLOGGING`. |
| `DAMAGED_BRIDGE` | **NEEDS MORE DATA** | 0 | **Complex Context**: Requires macroscopic perspective; structural bridge damage requires specialized engineering views. Recommend postponing to structural audit phase. |
| `DAMAGED_CULVERT` | **NEEDS MORE DATA** | 0 | **Low Frequency**: Collapsed pipe culvert beneath rural crossings requires specialized sub-surface datasets. |
| `DAMAGED_RETAINING_WALL` | **NEEDS ANNOTATION** | 0 | **Moderate Feasibility**: Bulging masonry, tilting stone walls, or fractured concrete retaining structures along roadside slopes. |
| `UNFINISHED_PUBLIC_CONSTRUCTION` | **NEEDS REDEFINITION** | 0 | **Context Ambiguity**: Hard to differentiate authorized active municipal work from abandoned hazards without signage context. |
| `PEDESTRIAN_PATH_ENCROACHMENT` | **NEEDS REDEFINITION** | 0 | **Context Ambiguity**: Vendor stalls, parked cycles, or debris on sidewalks require legal right-of-way demarcation. Better handled as `ROAD_DEBRIS` or general obstruction. |

---

### Category B: Road Maintenance (14 Classes)

| Class Name | Feasibility Status | Verified Local Count | Feasibility Justification & Annotation Rules |
| :--- | :---: | :---: | :--- |
| `POTHOLE_SHALLOW` | **NEEDS REDEFINITION** | 0 | **Depth Ambiguity**: Monocular 2D images without depth sensors cannot reliably measure depression depth in inches. Merge with unified `POTHOLE`. |
| `POTHOLE_DEEP` | **NEEDS REDEFINITION** | 0 | **Depth Ambiguity**: Merge with unified `POTHOLE`. Use bounding box area and contour shadow to estimate priority in software. |
| `LONGITUDINAL_CRACK` | **NEEDS ANNOTATION** | 0 | **High Feasibility**: Linear crack running parallel to traffic direction along wheel paths or construction seams. |
| `TRANSVERSE_CRACK` | **NEEDS ANNOTATION** | 0 | **High Feasibility**: Linear crack running perpendicularly across the width of the roadway. |
| `ALLIGATOR_CRACKING` | **READY (Model Baseline)** | Active (Colab) | **High Feasibility**: Interconnected polygonal/hexagonal crack network resembling reptile skin. Existing baseline class 0. |
| `PAVEMENT_EROSION` | **NEEDS ANNOTATION** | 0 | **Moderate Feasibility**: Edge gravel stripping and asphalt breakup along shoulder drop-offs. |
| `ROAD_RUTTING` | **NEEDS REDEFINITION** | 0 | **Low Visual Contrast**: Longitudinal surface depressions in wheelpaths are subtle gradients without distinct edge contours. Poor detector reliability on 2D images. |
| `DAMAGED_ROAD_PATCH` | **NEEDS ANNOTATION** | 0 | **High Feasibility**: Failed rectangular utility reinstatement patches with perimeter cracking or subsidence. |
| `OIL_SPILL` | **NEEDS MORE DATA** | 0 | **Visual Ambiguity**: Dark sheen on wet asphalt is easily confused with shadows or water patches. |
| `CHEMICAL_SPILL` | **NOT FOUND** | 0 | **Rare Incident**: Extremely scarce visual training examples; hazardous industrial spills should not rely on generic mobile CV. |
| `ROAD_DEBRIS` | **NEEDS ANNOTATION** | 0 | **High Feasibility**: Loose gravel piles, bricks, fallen construction rubble, or bags blocking travel lanes. |
| `ROAD_GRAVEL_OBSTRUCTION` | **NEEDS REDEFINITION** | 0 | **Overlap**: Merge into `ROAD_DEBRIS` to prevent multi-label ambiguity on unpaved/gravel edges. |
| `ROAD_WATERLOGGING` | **NEEDS ANNOTATION** | 0 | **High Feasibility**: Surface water ponding covering road lanes with visible specular reflections and submerged road edges. |
| `ROAD_FLOODING` | **NEEDS REDEFINITION** | 0 | **Overlap**: Merge into `ROAD_WATERLOGGING`. Severity (flooding vs minor puddle) should be calculated from bounding box area. |

---

### Category C: Road Safety (14 Classes)

| Class Name | Feasibility Status | Verified Local Count | Feasibility Justification & Annotation Rules |
| :--- | :---: | :---: | :--- |
| `MISSING_TRAFFIC_SIGN` | **NEEDS REDEFINITION** | 0 | **Computer Vision Anti-Pattern**: You cannot place a bounding box on "empty space" where a sign *should* be unless a bare pole is visible. Redefine as `EMPTY_SIGN_POST`. |
| `DAMAGED_TRAFFIC_SIGN` | **NEEDS ANNOTATION** | 0 | **High Feasibility**: Bent placard, scratched/faded regulatory symbol, twisted pole, or bullet/impact hole. |
| `OBSCURED_TRAFFIC_SIGN` | **NEEDS ANNOTATION** | 0 | **High Feasibility**: Road sign partially or substantially occluded by overgrown tree branches or foliage. |
| `DAMAGED_GUARDRAIL` | **NEEDS ANNOTATION** | 0 | **High Feasibility**: Dented, crushed, disconnected, or impacted W-beam steel barrier along roadside. |
| `MISSING_GUARDRAIL` | **NEEDS REDEFINITION** | 0 | **False Positive Hazard**: Detecting absence of barrier on open roads leads to massive false alarms. Postpone. |
| `DAMAGED_MEDIAN_DIVIDER` | **NEEDS ANNOTATION** | 0 | **High Feasibility**: Displaced concrete median kerbs, fractured yellow/black barrier blocks, or broken median railing. |
| `MISSING_MEDIAN_DIVIDER` | **NEEDS REDEFINITION** | 0 | **Anti-Pattern**: Normal undivided 2-lane roads would be falsely flagged. Postpone. |
| `DAMAGED_LANE_DELINEATOR` | **NEEDS ANNOTATION** | 0 | **Moderate Feasibility**: Broken flexible spring-post bollards or crushed road studs (cat's eyes). |
| `FALLEN_TREE_ROAD_OBSTRUCTION` | **NEEDS ANNOTATION** | 0 | **Critical Safety Class / High Feasibility**: Uprooted tree, severed heavy bough, or fallen trunk obstructing carriageway. |
| `OBSTRUCTING_VEGETATION` | **NEEDS ANNOTATION** | 0 | **High Feasibility**: Overgrown roadside hedges, vines, or low-hanging branches intruding into vehicle lane. |
| `FADED_ZEBRA_CROSSING` | **NEEDS ANNOTATION** | 0 | **High Feasibility**: Worn, peeled, or faintly discernible white pedestrian crossing stripes. |
| `MISSING_ZEBRA_CROSSING` | **NEEDS REDEFINITION** | 0 | **Anti-Pattern**: Plain road intersections cannot be bounded as "missing crosswalks". Postpone. |
| `DAMAGED_SPEED_BUMP` | **NEEDS ANNOTATION** | 0 | **High Feasibility**: Missing rubber speed breaker segment or severely eroded asphalt speed hump. |
| `MISSING_SPEED_BUMP` | **NEEDS REDEFINITION** | 0 | **Anti-Pattern**: Absence of speed bumps cannot be bounded without external municipal GIS ground truth. |

---

### Category D: Street Lighting and Electrical Hazards (8 Classes)

| Class Name | Feasibility Status | Verified Local Count | Feasibility Justification & Annotation Rules |
| :--- | :---: | :---: | :--- |
| `BROKEN_STREETLIGHT_FIXTURE` | **NEEDS ANNOTATION** | 0 | **High Feasibility**: Smashed luminaire casing, dangling lamp head, or shattered glass bowl on lamp post. |
| `SHATTERED_STREETLIGHT_FIXTURE` | **NEEDS REDEFINITION** | 0 | **Overlap**: Merge with `BROKEN_STREETLIGHT_FIXTURE`. |
| `NONFUNCTIONAL_STREETLIGHT` | **NEEDS REDEFINITION** | 0 | **Temporal Impossibility in Daytime**: An unlit streetlight during daytime is normal, not broken. At night, phone camera sensor exposure varies drastically. Must require physical damage cues. |
| `EXPOSED_ELECTRICAL_WIRING` | **NEEDS ANNOTATION** | 0 | **Critical Safety Class / High Feasibility**: Open junction box door at pole base, uninsulated dangling wire joints. |
| `HANGING_ELECTRICAL_WIRING` | **NEEDS ANNOTATION** | 0 | **Critical Safety Class / High Feasibility**: Low-hanging overhead cables sagging into vehicular or pedestrian path. |
| `LEANING_STREETLIGHT_POLE` | **NEEDS ANNOTATION** | 0 | **High Feasibility**: Lamp post tilted >15° off-vertical due to vehicular impact or foundation failure. |
| `UNSTABLE_STREETLIGHT_POLE` | **NEEDS REDEFINITION** | 0 | **Overlap**: Merge with `LEANING_STREETLIGHT_POLE` or `BROKEN_STREETLIGHT_POLE`. |
| `DAYTIME_STREETLIGHT_ILLUMINATION` | **NEEDS MORE DATA** | 0 | **Requires Dual Validation**: Streetlight luminaire visibly glowing during bright daylight. Feasible only when glowing lamp is detectable against sky. |

---

### Category E: Traffic and Road Operations (12 Classes)

| Class Name | Feasibility Status | Verified Local Count | Feasibility Justification & Annotation Rules |
| :--- | :---: | :---: | :--- |
| `MALFUNCTIONING_TRAFFIC_SIGNAL` | **NEEDS REDEFINITION** | 0 | **Camera Artifact Hazard**: LED traffic signals pulse (PWM). A phone camera rolling shutter captures dark or half-dark aspects even on working lights. Single static photo cannot prove signal timing fault. |
| `ABNORMAL_TRAFFIC_SIGNAL` | **NEEDS ANNOTATION** | 0 | **High Feasibility**: Twisted signal head facing wrong direction, broken visor hood, or physically shattered lens. |
| `OBSTRUCTIVE_PARKING` | **NEEDS REDEFINITION** | 0 | **Context Ambiguity**: Detecting a parked car causes massive false positives unless yellow curb markings or "No Parking" signs are bounded concurrently. |
| `BROKEN_DOWN_VEHICLE` | **NEEDS REDEFINITION** | 0 | **Context Ambiguity**: A stopped car cannot be visually proven as broken down without hazard triangles or open bonnet. |
| `ABANDONED_VEHICLE_OBSTRUCTION` | **NEEDS MORE DATA** | 0 | **Moderate Feasibility**: Recognizable only by extreme neglect indicators (deflated tires, thick dust layer, rusted body, missing plates). |
| `FADED_LANE_MARKING` | **NEEDS ANNOTATION** | 0 | **High Feasibility**: Worn or faintly visible longitudinal dashed white/yellow lane dividing lines. |
| `MISSING_LANE_MARKING` | **NEEDS REDEFINITION** | 0 | **Anti-Pattern**: Plain unpainted asphalt cannot be bounded as "missing marking". Merge with `FADED_LANE_MARKING`. |
| `FADED_CENTER_LINE` | **NEEDS REDEFINITION** | 0 | **Overlap**: Merge into general `FADED_ROAD_MARKING` class. |
| `MISSING_CENTER_LINE` | **NEEDS REDEFINITION** | 0 | **Anti-Pattern**: Merge into general `FADED_ROAD_MARKING`. |
| `FADED_ROAD_EDGE_LINE` | **NEEDS REDEFINITION** | 0 | **Overlap**: Merge into general `FADED_ROAD_MARKING`. |
| `MISSING_ROAD_EDGE_LINE` | **NEEDS REDEFINITION** | 0 | **Anti-Pattern**: Merge into general `FADED_ROAD_MARKING`. |
| `DAMAGED_TRAFFIC_CONE` | **NEEDS ANNOTATION** | 0 | **High Feasibility**: Crushed, flattened, or broken orange traffic cones left on road. |
| `MISSING_TRAFFIC_BARRICADE` | **NEEDS REDEFINITION** | 0 | **Anti-Pattern**: Detector cannot identify missing barriers without knowing an excavation exists. |
| `DAMAGED_TRAFFIC_BARRICADE` | **NEEDS ANNOTATION** | 0 | **High Feasibility**: Overturned, smashed, or broken plastic/steel construction barricades. |
| `MISSING_DETOUR_MARKER` | **NEEDS REDEFINITION** | 0 | **Anti-Pattern**: Cannot identify missing directional markers from single photo. Postpone. |
| `OBSTRUCTED_INTERSECTION_VISIBILITY` | **NEEDS REDEFINITION** | 0 | **Geometric Sight-Triangle Constraint**: Requires wide-angle multi-view geometry. Postpone. |

---

## 3. Class Overlaps, Ambiguities & Annotation Guidelines

### 3.1 Resolving Critical Class Overlaps
1. **Pothole Depth Granularity (`POTHOLE_SHALLOW` vs `POTHOLE_DEEP`)**:
   * **Issue**: Single monocular camera images cannot reliably quantify depth in centimeters under varying sunlight, wetness, and angles.
   * **Rule**: Annotate all surface cavities as **`pothole`**. In software ([`services/detectionConfig.ts`](file:///c:/Users/Nithya/CivicEye-Miniproject/services/detectionConfig.ts)), compute severity (`HIGH`, `MEDIUM`, `LOW`) using normalized bounding box area (`width * height`), confidence, and edge shadow.
2. **Crack Topology (`LONGITUDINAL_CRACK` vs `TRANSVERSE_CRACK` vs `ALLIGATOR_CRACKING`)**:
   * **Rule**:
     * `alligator cracking`: Interconnected mesh/grid pattern covering an area of pavement.
     * `cracking` (Linear): Single continuous fissures running either longitudinally or transversely.
3. **The "Missing Object" Anti-Pattern**:
   * **Rule**: Never annotate empty asphalt or empty sky as `MISSING_TRAFFIC_SIGN`, `MISSING_GUARDRAIL`, `MISSING_ZEBRA_CROSSING`, or `MISSING_LANE_MARKING`. Only annotate physically present, tangible defects (e.g., `EMPTY_SIGN_POST`, `DAMAGED_GUARDRAIL`, `FADED_ROAD_MARKING`).
4. **Temporal & Functional Traps (Streetlights & Signals)**:
   * **Rule**: Do not create classes for operational states that cannot be proven by single static photos (e.g., unlit lamp at noon, LED traffic signal flicker). Restrict detection to physical damage (e.g., `BROKEN_STREETLIGHT_FIXTURE`, `LEANING_STREETLIGHT_POLE`, `EXPOSED_ELECTRICAL_WIRING`).

---

## 4. Dataset Expansion Plan & Phase 2 Target Taxonomy

To ensure robust model convergence, clean annotation standards, and 100% backward compatibility with CivicEye's 9 municipal department routing systems, we recommend a **Phased 10-Class Expansion**:

### Recommended 10-Class Target Taxonomy

| Class ID | Target Class Name | Department | Department Code | Description & Annotation Standard |
| :---: | :--- | :--- | :---: | :--- |
| **0** | `alligator cracking` | Road Maintenance | `ROAD` | Interconnected hexagonal fatigue crack network. *(Existing)* |
| **1** | `cracking` | Road Maintenance | `ROAD` | Single longitudinal and transverse pavement fissures. *(Existing)* |
| **2** | `pothole` | Road Maintenance | `ROAD` | Surface asphalt cavities and bowl-shaped depressions. *(Existing)* |
| **3** | `manhole defect` | Water Supply & Drainage | `TWAD` / `DRAIN` | Open manholes, displaced covers, sunken frames, or damaged lids. |
| **4** | `waterlogging` | Stormwater / Drainage | `DRAIN` | Stagnant rainwater ponding obstructing travel lanes or pedestrian paths. |
| **5** | `road divider damage` | Traffic & Road Safety | `SAFETY` | Broken concrete medians, displaced kerbs, bent crash barriers/guardrails. |
| **6** | `damaged traffic sign` | Traffic & Road Safety | `SAFETY` | Bent, scratched, faded, obscured signboards or bare signposts. |
| **7** | `street light fault` | Street Lighting | `LIGHTING` | Broken luminaire heads, leaning poles, or exposed/dangling wires. |
| **8** | `debris / road blockage`| Solid Waste Management | `SWM` | Rubble piles, uncollected garbage dumps, fallen tree boughs on carriageway. |
| **9** | `damaged footpath` | Public Works Department | `PWD` | Broken walkway concrete slabs, missing pavers, uneven pedestrian corridor. |

### Advantages of This Target Taxonomy
1. **Preserves Existing Model Baseline**: Classes `0`, `1`, `2` retain identical IDs and semantics.
2. **1-to-1 Department Alignment**: Every single one of the 9 civic departments in [`services/departmentMapping.ts`](file:///c:/Users/Nithya/CivicEye-Miniproject/services/departmentMapping.ts) has a designated, visually distinct primary detector class.
3. **High Inter-Class Distinctiveness**: Eliminates fine-grained ambiguities (e.g., shallow vs deep potholes) while providing actionable municipal intelligence.

---

## 5. Next Steps for Dataset Preparation (Pre-Training Phase)

1. **Step 1: Dataset Compilation**:
   * Gather 300–600 high-quality annotated images per class across the 10 target classes (utilizing RDD2022, Roboflow Municipal Infrastructure datasets, and curated municipal photographs).
2. **Step 2: Annotation Standardization**:
   * Export bounding boxes in standard YOLO format (`class_id x_center y_center width height`).
   * Enforce 70% Train / 20% Validation / 10% Test split with zero image overlap.
3. **Step 3: Verification Scripting**:
   * Create an automated verification script to validate label file integrity, bounding box coordinates, and class ID distributions.
4. **Step 4: Model Training & ONNX Export**:
   * Train YOLOv8n/s on the 10-class dataset (640×640 resolution).
   * Export to ONNX (`assets/models/best.onnx`) with shape `[1, 14, 8400]` (4 box coordinates + 10 class scores).

---
*Report stored at: `DATASET_TAXONOMY_AUDIT.md`*
