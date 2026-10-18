# CivicEye Field Inspector Setup & Verification Guide

This guide documents the Field Inspector role implementation, test-user provisioning, and testing workflows for CivicEye.

---

## 👥 Provisioned Test User Accounts

The following test users are configured and ready in Firebase Authentication and Cloud Firestore:

| Role | Persona | Email | Password | Target Dashboard |
| :--- | :--- | :--- | :--- | :--- |
| **Field Inspector** | Officer | `inspector@civiceye.gov` | `Inspector@123` | `/officer/field-dashboard` |
| **Main Officer** | Officer | `officer@civiceye.gov` | `Officer@123` | `/officer/main-dashboard` |
| **Citizen** | Citizen | Any registered citizen | (citizen password) | `/(tabs)` |

---

## 🛠️ How to Create / Seed New Field Inspector Users

You can provision additional Field Inspectors anytime using the provided CLI utility script:

```bash
# Default (creates inspector@civiceye.gov)
node scripts/create_inspector.mjs

# Custom Field Inspector account
node scripts/create_inspector.mjs inspector_south@civiceye.gov Inspector@123 "Inspector Raman (South Zone)"
```

### Firestore Schema Reference (`users/{uid}`)

```json
{
  "fullName": "Field Inspector (Coimbatore)",
  "name": "Field Inspector (Coimbatore)",
  "email": "inspector@civiceye.gov",
  "role": "field_inspector",
  "department": "Road Maintenance",
  "active": true,
  "createdAt": "2026-09-07T14:02:00.000Z",
  "lastLoginAt": "2026-09-07T14:02:00.000Z"
}
```

---

## 🔄 End-to-End Verification Scenarios

### Test 1: Citizen Submission
1. Sign in as Citizen on `login.tsx`.
2. Tap "Report Issue", capture/select a road photo, tag location, submit complaint.
3. The complaint is created in Firestore with status `"Submitted"`.

### Test 2: Main Officer Assignment
1. Sign in as Main Officer (`officer@civiceye.gov` / `Officer@123`) using the **Officer** persona toggle.
2. Main Officer Dashboard opens (`/officer/main-dashboard`).
3. Tap on the new complaint card -> Tap **"Assign Field Inspector"**.
4. Select `"Field Inspector (Coimbatore)"` -> Confirm Assignment.
5. Complaint document updates with:
   - `assignedInspectorId: "<Inspector UID>"`
   - `assignedInspectorName: "Field Inspector (Coimbatore)"`
   - `inspectionStatus: "PENDING"`
   - `status: "Under Review"`

### Test 3: Field Inspector Login & Real-Time Dashboard
1. Sign out of Main Officer account -> On login screen, select **Officer** persona.
2. Sign in as Field Inspector (`inspector@civiceye.gov` / `Inspector@123`).
3. Field Inspector Dashboard opens (`/officer/field-dashboard`).
4. Immediately see:
   - "Welcome, Field Inspector"
   - Metrics cards: Total Assigned, Pending Inspection, Verified, Rejected
   - Assigned complaints list queried in real-time (`assignedInspectorId == currentUser.uid`).

### Test 4: Field Inspection & Map Navigation
1. Tap **"Inspect Complaint (On-Site)"** on an assigned card.
2. Inspection Screen opens (`/officer/inspection-screen?id=...`).
3. View citizen-submitted photo and description.
4. Tap **"Open Location in Maps"** -> Launches Google Maps/Apple Maps to navigate to the pothole/road damage.

### Test 5: Genuine Issue Verification
1. On Inspection screen, select **"Genuine Issue"**.
2. Enter observation remarks: *"Pothole inspected on site. Depth 10cm, urgent repair needed."*
3. (Optional) Tap **"Take Photo"** or **"Choose Gallery"** to attach inspection evidence.
4. Tap **"Submit Genuine Verification"**.
5. Firestore updates:
   - `inspectionStatus: "VALID"`
   - `inspectionResult: "genuine"`
   - `inspectorRemarks: "..."`
   - `inspectionEvidenceUrl: "..."` (if photo taken)
6. Main Officer dashboard immediately reflects `Verified (Valid)` ready to move to `In Progress`.

### Test 6: Fake / Invalid Issue Rejection
1. On Inspection screen, select **"Fake / Invalid"**.
2. Enter remarks and tap Submit.
3. Modal pops up with mandatory rejection reason presets (e.g., *"No road damage found at specified location"* or Custom).
4. Confirm Rejection.
5. Firestore updates:
   - `status: "Rejected"`
   - `inspectionStatus: "INVALID"`
   - `inspectionResult: "fake"`
   - `rejectionReason: "..."`
6. **Citizen's dashboard updates in real-time** showing the rejection card with reason.

### Test 7: Role Guards & Security
- Field Inspector cannot access Main Officer operations.
- Field Inspector cannot inspect complaints assigned to another inspector (shows Access Denied).
- Citizen accounts cannot access `/officer/*` screens.
