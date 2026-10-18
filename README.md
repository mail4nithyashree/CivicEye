# CivicEye — AI-Powered Civic Issue Reporting & Municipal Routing System

**Repository:** `https://github.com/mail4nithyashree/CivicEye.git`  
**GitHub Owner:** `mail4nithyashree`  
**Collaborator:** `kasbiya44` (Write Access)  
**Base Branch:** `main`  
**Development Branch:** `ai-prediction-improvements`  
**Firebase Project:** `civiceye-c127c`

---

## 📌 Overview

CivicEye is a full-stack, mobile and web-enabled municipal governance platform designed to detect, prioritize, and route civic infrastructure issues (potholes, cracks, waterlogging, manhole damage, etc.) in real time. It integrates a two-tier computer vision pipeline combining **MobileNetV2** (scene gatekeeper / dissimilar image filter) and **YOLOv8** (multi-class bounding-box detector) with automated municipal department routing and on-site field verification workflows.

---

## 🏛️ System Architecture

```
[Citizen Upload] ──> [MobileNetV2 Scene Gatekeeper]
                            │
             ┌──────────────┴──────────────┐
             ▼                             ▼
    [Dissimilar / Unclear]        [Validated Road / Civic Scene]
             │                             │
    [Early Exit (~2ms)]           [YOLOv8 Object Detector]
   (Invalid Image Rejection)               │
                                  ┌────────┴────────┐
                                  ▼                 ▼
                         [Defect Detected]   [Clean Surface]
                                  │                 │
                         [Priority + Dept]  [no_major_issue]
```

1. **Scene Gatekeeper (MobileNetV2 + Heuristics)**:
   - Validates that the uploaded photo is an outdoor civic scene.
   - Detects and rejects unrelated imagery (flowers, foliage, pets, human portraits, indoor items, overexposed/blank canvases).
   - Returns `analysisStatus: 'dissimilar_image'` or `'unclear_image'`.
2. **Defect Detector (YOLOv8 ONNX)**:
   - Detects road surface defects (`pothole`, `cracking`, `alligator cracking`, etc.).
   - Computes calibrated confidence and surface-area-based priority (`HIGH`, `MEDIUM`, `LOW`, `NONE`).
3. **Department Routing & Workflow**:
   - Routes complaints to the responsible municipal departments (Road Maintenance, TWAD Drainage, Traffic Safety, Street Lighting, Solid Waste Management, PWD).
   - Multi-role support for Citizens, Field Inspectors, and Main Officers.

---

## 🔑 Firebase Project Configuration

- **Project ID:** `civiceye-c127c`
- **Project Number:** `930740300088`
- **Web App ID:** `1:930740300088:web:75042d21b2efa28fea79cd`
- **Auth Domain:** `civiceye-c127c.firebaseapp.com`
- **Storage Bucket:** `civiceye-c127c.firebasestorage.app`

### Pre-Configured Test Accounts

| Role | Email | Password | Access / Purpose |
| :--- | :--- | :--- | :--- |
| **Citizen** | `citizen1@civiceye.demo` | `Password@123` | Report complaints, view status & notifications |
| **Field Inspector** | `inspector@civiceye.gov` | `Inspector@123` | On-site inspection, BoQ budget estimation |
| **Main Officer** | `main@civiceye.gov` | `Officer@123` | Department triage, inspector assignment, resolution |

---

## 🚀 Quick Start & Reproduction

### 1. Prerequisites
- Node.js 18+ (tested with v22 LTS)
- Git & Git LFS (for ONNX model weights in `assets/models/`)
- Python 3.10+ (for robustness evaluations)

### 2. Installation
```bash
git clone https://github.com/mail4nithyashree/CivicEye.git
cd CivicEye
git checkout ai-prediction-improvements
npm install
```

### 3. Environment Variables
Create `.env.backend` (excluded from Git for security):
```env
PORT=3000
CLOUDINARY_CLOUD_NAME=your_cloudinary_cloud_name
CLOUDINARY_API_KEY=your_cloudinary_api_key
CLOUDINARY_API_SECRET=your_cloudinary_api_secret
```

### 4. Start the Backend Server
```bash
node server.js
```
The server will start listening at `http://localhost:3000` with the pre-loaded MobileNetV2 and YOLOv8 models.

### 5. Start the Expo Application
```bash
npx expo start
```

---

## 🧪 Verification & Test Suites

Execute all verified end-to-end integration and routing test suites:

```bash
# 1. 10-Class Department Routing & Prioritization (16/16 Passed)
node --experimental-strip-types scripts/test_10class_routing.mjs

# 2. Complete Multi-Department Description Routing (30/30 Passed)
node --experimental-strip-types scripts/test_all_department_routing.mjs

# 3. False AI Detection & Rejection Flow (All 7 Scenarios Passed)
node --experimental-strip-types scripts/test_image_mismatch_rejection_flow.mjs

# 4. Phase 8 Comprehensive E2E Pipeline (28/28 Passed)
node --experimental-strip-types scripts/test_phase8_e2e_integration.mjs

# 5. Full Manual Field Verification Flow
node --experimental-strip-types scripts/test_manual_verification_flow.mjs

# 6. End-to-End Budget Split & BoQ Calculation
node --experimental-strip-types scripts/test_e2e_budget_split_flow.mjs

# 7. AI Robustness & Stress Benchmark (Python)
python scripts/evaluate_robustness.py
```

---

## 🤝 Collaborator Setup for `kasbiya44`

1. Accept the GitHub repository invitation at `https://github.com/mail4nithyashree/CivicEye/invitations`.
2. Clone the repository and install Git LFS:
   ```bash
   git lfs install
   git clone https://github.com/mail4nithyashree/CivicEye.git
   ```
3. Use the `ai-prediction-improvements` branch for development:
   ```bash
   git checkout ai-prediction-improvements
   ```
4. Never commit sensitive credentials or `.env.backend` files. Always preserve `main` as the stable base branch.
