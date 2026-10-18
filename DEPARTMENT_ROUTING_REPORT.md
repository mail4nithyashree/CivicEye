# CivicEye — Phase 7: Department Routing and Complaint Prioritization Report

**Report Date:** October 9, 2026  
**Auditor / Systems Engineer:** Antigravity AI Assistant  
**Project:** CivicEye — Multi-Class Municipal Infrastructure Issue Detection  
**Repository Path:** `c:/Users/Nithya/CivicEye-Miniproject`  
**Test Suite:** [`scripts/test_10class_routing.mjs`](file:///c:/Users/Nithya/CivicEye-Miniproject/scripts/test_10class_routing.mjs)  

---

## 1. Existing Complaint & Routing Workflow Audit

Inspection of the frontend ([`app/report.tsx`](file:///c:/Users/Nithya/CivicEye-Miniproject/app/report.tsx)), backend server ([`server.js`](file:///c:/Users/Nithya/CivicEye-Miniproject/server.js)), and Firestore services ([`services/complaintService.ts`](file:///c:/Users/Nithya/CivicEye-Miniproject/services/complaintService.ts)) confirms the complete end-to-end lifecycle:

```
[1. Citizen Capture] ──> [2. AI Inference Engine] ──> [3. Complaint Creation (Firestore)]
 (Image + GPS + Text)    (MobileNetV2 + YOLOv8)        (Initial Status: 'Submitted')
                                                                     │
                                                                     ▼
[6. Resolution & Citizen Alert] <── [5. Authority Work Order] <── [4. Field Inspection]
 (Status: 'Resolved' + Email)      (Status: 'In Progress')        (Status: 'Verified' / 'Rejected')
```

### Key Lifecycle Principles:
1. **Separation of Detection vs Verification**: AI predictions are stored as candidate detections (`detectedIssue`, `confidence`, `allDetections`, `primaryDetection`). Detections **never** automatically bypass field inspection or fabricate authority work orders.
2. **Authority & Role Boundaries**:
   - `citizen`: Can create complaints and track status.
   - `inspector`: Dispatched to physical location, confirms defect presence (`inspectionDetails`), estimates budget/timeline, or rejects fake reports (`/api/verify-complaint`, `/api/reject-complaint`).
   - `main_officer`: Assigns complaints to maintenance wings (e.g. CCMC, State Highways) and issues work orders.

---

## 2. Verified Department Records & Schema Fields

### 2.1 Supported Municipal Departments ([`services/departmentMapping.ts`](file:///c:/Users/Nithya/CivicEye-Miniproject/services/departmentMapping.ts))

| Department Code | Full Department Name | Domain & Jurisdiction |
| :---: | :--- | :--- |
| **`ROAD`** | **Road Maintenance Department** | Asphalt road surface, potholes, longitudinal/alligator cracks, pavement fatigue |
| **`DRAIN`** / **`TWAD`** | **Stormwater / Drainage & TWAD** | Open manholes, broken drain covers, catchpit blockages, road waterlogging |
| **`SAFETY`** | **Traffic / Road Safety Department** | Damaged medians/dividers, bent/vandalized traffic signs, bare signposts |
| **`LIGHTING`** | **Street Lighting Department** | Broken luminaires, leaning lamp posts, dangling electrical cables |
| **`SWM`** | **Solid Waste Management Department** | Road debris dumps, construction rubble, uncollected garbage overflows |
| **`PWD`** | **Public Works Department** | Broken pedestrian footpaths, government corridors, arterial walkways |
| **`SEWER`** | **Sewerage Division** | Underground sewer line chokes, sewage overflows |
| **`BUILDING`** | **Public Building Maintenance** | Municipal building damage, government office wall/roof leaks |
| **`PARKS`** | **Parks and Public Spaces** | Damaged park benches, broken playground equipment |
| **`TREES`** | **Tree / Greenery Maintenance** | Fallen road trees, dangerously overgrown vegetation |

### 2.2 Firestore Complaint Schema Fields ([`services/complaintService.ts`](file:///c:/Users/Nithya/CivicEye-Miniproject/services/complaintService.ts))

```typescript
interface Complaint {
  id: string;
  citizenId: string;
  citizenName: string;
  citizenEmail: string;
  title: string;
  description: string;
  imageUrl: string;
  location: {
    latitude: number;
    longitude: number;
    address: string;
    roadName: string;
    region: string;
  };
  // AI Detection Fields
  detectedIssue: string;
  confidence: number;
  priority: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW' | 'NONE';
  allDetections: Detection[];
  primaryDetection: Detection | null;
  // Routing & Department
  department: string;
  departmentCode: string;
  routingStatus: string;
  routingMessage: string;
  // Lifecycle & Verification
  status: 'Submitted' | 'Pending Field Verification' | 'Verified' | 'In Progress' | 'Resolved' | 'Rejected';
  inspectionStatus: 'PENDING' | 'VALID' | 'INVALID';
  inspectionDetails?: InspectionDetails;
  statusHistory: StatusHistoryItem[];
  createdAt: Timestamp;
  updatedAt: Timestamp;
}
```

---

## 3. Configurable Issue-to-Department Mapping

The approved 10 target classes are synchronized across [`services/detectionConfig.ts`](file:///c:/Users/Nithya/CivicEye-Miniproject/services/detectionConfig.ts), [`services/departmentMapping.ts`](file:///c:/Users/Nithya/CivicEye-Miniproject/services/departmentMapping.ts), and [`server.js`](file:///c:/Users/Nithya/CivicEye-Miniproject/server.js):

| Class ID | Target Class Name | Assigned Department | Department Code | Routing Status |
| :---: | :--- | :--- | :---: | :--- |
| **0** | `alligator cracking` | Road Maintenance | `ROAD` | `Direct` |
| **1** | `cracking` | Road Maintenance | `ROAD` | `Direct` |
| **2** | `pothole` | Road Maintenance | `ROAD` | `Direct` |
| **3** | `manhole defect` | Stormwater / Drainage | `DRAIN` | `Moved to Stormwater / Drainage` |
| **4** | `waterlogging` | Stormwater / Drainage | `DRAIN` | `Moved to Stormwater / Drainage` |
| **5** | `road divider damage` | Traffic / Road Safety Department | `SAFETY` | `Moved to Traffic / Road Safety Department` |
| **6** | `damaged traffic sign` | Traffic / Road Safety Department | `SAFETY` | `Moved to Traffic / Road Safety Department` |
| **7** | `street light fault` | Street Lighting Department | `LIGHTING` | `Moved to Street Lighting Department` |
| **8** | `debris / road blockage`| Solid Waste Management | `SWM` | `Moved to Solid Waste Management` |
| **9** | `damaged footpath` | Public Works Department | `PWD` | `Moved to Public Works Department` |

---

## 4. Multi-Detection Primary Ranking & Fallback Rules

### 4.1 Multi-Factor Primary Issue Selection
When an image contains multiple bounding-box detections, CivicEye avoids arbitrary confidence-only ranking. Detections are sorted using a multi-factor hierarchy:

1. **Hazard Severity Profile**: Physical danger level (`HIGH` > `MEDIUM` > `LOW` > `NONE`).
   - *Example*: A dangerous `manhole defect` (`HIGH`) always takes precedence over a superficial hairline crack (`LOW`), even if the crack has higher raw model confidence.
2. **Defect Surface Area on Roadway**: Normalized bounding box area (`width * height`).
3. **Calibrated Confidence**: Used as a tie-breaker when two issues share the same severity and scale.

### 4.2 Fallback & Unknown Class Safety
* **Unknown / Unrecognized Issue**: Safely defaults to `Road Maintenance` (`ROAD`) with a manual review flag.
* **No Major Issue (`no_major_issue`)**: Assigned `priority: 'NONE'`, providing immediate peace-of-mind feedback without cluttering officer dispatch queues.

---

## 5. Explainable Prioritization Rules

Priority is computed dynamically in [`services/detectionConfig.ts`](file:///c:/Users/Nithya/CivicEye-Miniproject/services/detectionConfig.ts#L32) using transparent criteria:

* **`HIGH` Priority**:
  - `manhole defect`: Immediate life/injury risk to two-wheelers and pedestrians.
  - `pothole`: Area `>= 0.08` of frame, confidence `>= 0.45`, or multiple potholes (`detectionCount > 1`).
  - `waterlogging`: Large surface puddle (area `>= 0.10`) creating hydroplaning risk.
  - `alligator cracking`: Widespread structural base failure (area `>= 0.10`).
  - `road divider damage` & `street light fault`: Collision and night vision hazards.
* **`MEDIUM` Priority**:
  - Linear cracks, damaged footpaths, bent traffic signs, moderate debris.
* **`LOW` Priority**:
  - Small, localized hairline cracks and minor surface irregularities.
* **`NONE`**:
  - Clean roadway surface without actionable defects.

---

## 6. Security & Authorization Protections

* **Firestore Security Rules ([`firestore.rules`](file:///c:/Users/Nithya/CivicEye-Miniproject/firestore.rules))**:
  - Enforces role-based access control (RBAC). Citizens can create complaints where `citizenId == request.auth.uid`.
  - Restricts `status` modifications to `'Verified'`, `'In Progress'`, `'Resolved'`, or `'Rejected'` strictly to authenticated officers (`role in ['inspector', 'main_officer']`).
* **Resilient Backend Service Proxies ([`server.js`](file:///c:/Users/Nithya/CivicEye-Miniproject/server.js#L996-L1126))**:
  - Field inspection verification and rejection endpoints authenticate through secure server-side tokens, preventing compromised client bypasses.

---

## 7. Files Changed

* [`services/detectionConfig.ts`](file:///c:/Users/Nithya/CivicEye-Miniproject/services/detectionConfig.ts): Added 10-class definitions, updated `calculatePriority()`, `CLASS_ID_MAP`, `ISSUE_DEPARTMENT`, and `VISIBLE_ISSUES_METADATA`.
* [`services/departmentMapping.ts`](file:///c:/Users/Nithya/CivicEye-Miniproject/services/departmentMapping.ts): Added explicit mappings for the 10 target classes in `ISSUE_DEPARTMENT_MAP`.
* [`server.js`](file:///c:/Users/Nithya/CivicEye-Miniproject/server.js): Updated `CLASS_ID_MAP`, `calculatePriority()`, and `ISSUE_DEPT_MAP`.
* [`scripts/test_10class_routing.mjs`](file:///c:/Users/Nithya/CivicEye-Miniproject/scripts/test_10class_routing.mjs): New automated routing and prioritization test suite.

---

## 8. Verification Tests Performed & Results

Execution of [`scripts/test_10class_routing.mjs`](file:///c:/Users/Nithya/CivicEye-Miniproject/scripts/test_10class_routing.mjs) and [`scripts/test_all_department_routing.mjs`](file:///c:/Users/Nithya/CivicEye-Miniproject/scripts/test_all_department_routing.mjs):

```text
===============================================================
🏛️  CIVICEYE 10-CLASS DEPARTMENT ROUTING & PRIORITIZATION TEST
===============================================================

--- 1. Verified 10-Class Department Routing ---
  ✅ PASS: Class [0] 'alligator cracking' routes to Road Maintenance (ROAD)
  ✅ PASS: Class [1] 'cracking' routes to Road Maintenance (ROAD)
  ✅ PASS: Class [2] 'pothole' routes to Road Maintenance (ROAD)
  ✅ PASS: Class [3] 'manhole defect' routes to Stormwater / Drainage (DRAIN)
  ✅ PASS: Class [4] 'waterlogging' routes to Stormwater / Drainage (DRAIN)
  ✅ PASS: Class [5] 'road divider damage' routes to Traffic / Road Safety Department (SAFETY)
  ✅ PASS: Class [6] 'damaged traffic sign' routes to Traffic / Road Safety Department (SAFETY)
  ✅ PASS: Class [7] 'street light fault' routes to Street Lighting Department (LIGHTING)
  ✅ PASS: Class [8] 'debris / road blockage' routes to Solid Waste Management (SWM)
  ✅ PASS: Class [9] 'damaged footpath' routes to Public Works Department (PWD)

--- 2. Fallback & Unknown Class Safety ---
  ✅ PASS: Unknown class safely defaults to Road Maintenance (ROAD)
  ✅ PASS: no_major_issue defaults to Road Maintenance (ROAD)

--- 3. Explainable Prioritization Tests ---
  ✅ PASS: Manhole defect is always immediately HIGH priority (Life Hazard)
  ✅ PASS: Pothole priority scales with surface area and detection count
  ✅ PASS: Clean road (no_major_issue) assigns priority NONE

--- 4. Multi-Detection Primary Selection ---
  ✅ PASS: High-hazard manhole takes precedence over minor surface crack

===============================================================
📊 FINAL SUMMARY: 16 PASSED, 0 FAILED (100% SUCCESS)
===============================================================
```

---

## 9. Command to Reproduce Tests

```powershell
node --experimental-strip-types scripts/test_10class_routing.mjs
node --experimental-strip-types scripts/test_all_department_routing.mjs
```

---
*Report stored at: `DEPARTMENT_ROUTING_REPORT.md`*
