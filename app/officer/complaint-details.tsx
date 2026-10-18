import StatusBadge from '@/components/StatusBadge';
import PracticalBudgetBreakdownCard from '@/components/PracticalBudgetBreakdownCard';
import CivicImage from '@/components/CivicImage';
import { getStandardEstimatedBudget } from '@/constants/coimbatoreRoads';
import { AppColors } from '@/constants/colors';
import { auth } from '@/firebaseConfig';
import {
  assignToAuthority,
  markComplaintResolved,
  subscribeToComplaint,
  updateAuthorityProgress,
  updateComplaintDepartment,
  verifyComplaintWorkflow,
  isInvalidImageComplaint,
  type Complaint,
} from '@/services/complaintService';
import {
  AVAILABLE_DEPARTMENTS,
  DEPARTMENTS_CONFIG,
  isRoadDepartment,
} from '@/services/departmentMapping';
import { formatResolutionDate } from '@/services/resolutionDuration';
import { createNotification } from '@/services/notificationService';
import { subscribeToOfficerProfile, type Officer } from '@/services/officerService';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRootNavigationState, useRouter } from 'expo-router';
import { onAuthStateChanged, type User } from 'firebase/auth';
import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

const AUTHORITY_OPTIONS = [
  'Coimbatore City Municipal Corporation (CCMC) - North Zone',
  'Coimbatore City Municipal Corporation (CCMC) - East Zone',
  'Coimbatore City Municipal Corporation (CCMC) - Central Zone',
  'Tamil Nadu State Highways Department (C&M) - Coimbatore Division',
  'Highways & Minor Ports Department - Avinashi Road Elevated Wing',
  'National Highways Authority of India (NHAI) - Coimbatore Wing',
];

export default function OfficerComplaintDetailsScreen() {
  const router = useRouter();
  const rootNavigationState = useRootNavigationState();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [user, setUser] = useState<User | null>(auth.currentUser);
  const [officer, setOfficer] = useState<Officer | null>(null);
  const [complaint, setComplaint] = useState<Complaint | null>(null);
  const [loading, setLoading] = useState(true);

  // Authority Assignment Modal
  const [showAssignModal, setShowAssignModal] = useState(false);
  const [selectedAuthority, setSelectedAuthority] = useState(AUTHORITY_OPTIONS[0]);
  const [adminRemarks, setAdminRemarks] = useState('');
  const [assigning, setAssigning] = useState(false);

  // Work Progress / Resolution Modal
  const [showProgressModal, setShowProgressModal] = useState(false);
  const [progressActionType, setProgressActionType] = useState<'In Progress' | 'Resolved' | null>(null);
  const [progressRemarks, setProgressRemarks] = useState('');
  const [updatingProgress, setUpdatingProgress] = useState(false);

  // Department Reassignment Modal State
  const [showDeptModal, setShowDeptModal] = useState(false);
  const [selectedDeptCode, setSelectedDeptCode] = useState<string>('ROAD');
  const [deptRemarks, setDeptRemarks] = useState('');
  const [updatingDept, setUpdatingDept] = useState(false);

  // Field Verification Actions State
  const [showConfirmDeptModal, setShowConfirmDeptModal] = useState(false);
  const [verifyRemarks, setVerifyRemarks] = useState('');
  const [confirmingDept, setConfirmingDept] = useState(false);

  const [showTransferDeptModal, setShowTransferDeptModal] = useState(false);
  const [transferDeptCode, setTransferDeptCode] = useState<string>('SWM');
  const [transferRemarks, setTransferRemarks] = useState('');
  const [transferringDept, setTransferringDept] = useState(false);

  // 1. Auth Listener
  useEffect(() => {
    if (!rootNavigationState?.key) return;
    let isMounted = true;
    const unsub = onAuthStateChanged(auth, u => {
      if (!isMounted) return;
      setUser(u);
      if (!u) {
        setTimeout(() => {
          if (isMounted) router.replace('/login');
        }, 0);
      }
    });
    return () => {
      isMounted = false;
      unsub();
    };
  }, [rootNavigationState?.key, router]);

  // 2. Profile Listener
  useEffect(() => {
    if (!rootNavigationState?.key || !user) return;
    let isMounted = true;
    const unsub = subscribeToOfficerProfile(
      user.uid,
      profile => {
        if (!isMounted) return;
        if (!profile) {
          const email = user.email || '';
          setOfficer({
            id: user.uid,
            email,
            name: email.split('@')[0] || 'Officer',
            role: 'officer',
            department: 'Road Maintenance',
            active: true,
          });
          return;
        }
        setOfficer(profile);
      },
      () => {
        if (!isMounted) return;
        const email = user.email || '';
        setOfficer({
          id: user.uid,
          email,
          name: email.split('@')[0] || 'Officer',
          role: 'officer',
          department: 'Road Maintenance',
          active: true,
        });
      }
    );
    return () => {
      isMounted = false;
      unsub();
    };
  }, [user, rootNavigationState?.key, router]);

  // 3. Complaint Listener
  useEffect(() => {
    if (!id) return;
    const unsub = subscribeToComplaint(
      id,
      data => {
        setComplaint(data);
        if (data?.inspectionDetails?.maintenanceAuthority) {
          setSelectedAuthority(data.inspectionDetails.maintenanceAuthority);
        }
        setLoading(false);
      },
      () => setLoading(false)
    );
    return unsub;
  }, [id]);

  const handleAssignAuthority = async () => {
    if (!complaint || !user || !officer) return;
    if (isInvalidImageComplaint(complaint)) {
      Alert.alert('Action Blocked', 'This complaint was rejected as "Invalid Issue image, raise the complaint with the appropriate image!" and cannot be assigned.');
      return;
    }
    setAssigning(true);
    try {
      await assignToAuthority(complaint.id, {
        assignedAuthority: selectedAuthority,
        adminId: user.uid,
        adminName: officer.name,
        adminRemarks: adminRemarks.trim() || undefined,
      });

      await createNotification({
        recipientRole: 'authority',
        complaintId: complaint.id,
        title: 'Road Defect Assigned',
        message: `Complaint #${complaint.complaintId} in ${complaint.region} assigned to ${selectedAuthority}.`,
        type: 'authority_assigned',
      });

      setShowAssignModal(false);
      Alert.alert('Assignment Complete', `Complaint assigned to ${selectedAuthority}.`);
    } catch (e) {
      console.error('Assignment error:', e);
      Alert.alert('Assignment Error', 'Failed to assign authority.');
    } finally {
      setAssigning(false);
    }
  };

  const handleUpdateProgress = async () => {
    if (!complaint || !user || !officer || !progressActionType) return;
    if (isInvalidImageComplaint(complaint)) {
      Alert.alert('Action Blocked', 'This complaint was rejected as "Invalid Issue image, raise the complaint with the appropriate image!" and cannot be updated.');
      return;
    }
    setUpdatingProgress(true);
    try {
      if (progressActionType === 'In Progress') {
        await updateAuthorityProgress(
          complaint.id,
          'In Progress',
          user.uid,
          officer.name,
          progressRemarks.trim() || 'Work started on-site by maintenance division.'
        );

        await createNotification({
          userId: complaint.citizenId,
          recipientRole: 'citizen',
          complaintId: complaint.id,
          title: 'Repair In Progress',
          message: `Road maintenance work is in progress for #${complaint.complaintId} in ${complaint.region}.`,
          type: 'work_in_progress',
        });
      } else if (progressActionType === 'Resolved') {
        await markComplaintResolved(complaint.id, {
          resolvedBy: user.uid,
          resolvedByName: officer.name,
          resolutionRemarks: progressRemarks.trim() || 'Pavement restored and open for traffic.',
        });

        await createNotification({
          userId: complaint.citizenId,
          recipientRole: 'citizen',
          complaintId: complaint.id,
          title: 'Complaint Resolved',
          message: `Repair work for complaint #${complaint.complaintId} in ${complaint.region} has been completed and marked Resolved by ${officer.name}. Remarks: "${progressRemarks.trim() || 'Pavement restored and open for traffic.'}"`,
          type: 'work_resolved',
        });
      }

      setShowProgressModal(false);
      Alert.alert('Status Updated', `Complaint status transitioned to ${progressActionType}.`);
    } catch (e) {
      console.error('Progress error:', e);
      Alert.alert('Update Error', 'Failed to update progress.');
    } finally {
      setUpdatingProgress(false);
    }
  };

  // Department Change Handlers
  const handleOpenDeptModal = () => {
    if (isInvalidImageComplaint(complaint)) {
      Alert.alert('Action Blocked', 'Cannot reassign department for a rejected complaint.');
      return;
    }
    setSelectedDeptCode(complaint?.departmentCode || 'ROAD');
    setDeptRemarks('');
    setShowDeptModal(true);
  };

  const handleConfirmDeptChange = async () => {
    if (!user || !officer || !complaint) return;
    if (isInvalidImageComplaint(complaint)) {
      Alert.alert('Action Blocked', 'This complaint was rejected as "Invalid Issue image, raise the complaint with the appropriate image!" and cannot be modified.');
      return;
    }
    const targetDept = DEPARTMENTS_CONFIG[selectedDeptCode] || DEPARTMENTS_CONFIG['ROAD'];
    setUpdatingDept(true);
    try {
      await updateComplaintDepartment(
        complaint.id,
        {
          name: targetDept.name,
          code: targetDept.code,
          routingMessageName: targetDept.routingMessageName,
        },
        {
          uid: user.uid,
          name: officer.name,
          role: officer.role,
        },
        complaint.department || complaint.responsibleDepartment || 'Road Maintenance',
        deptRemarks.trim()
      );
      Alert.alert('Department Updated', `Complaint has been moved to the ${targetDept.name} Department.`);
      setShowDeptModal(false);
    } catch (error: any) {
      console.error('Error updating department:', error);
      Alert.alert('Update Failed', error?.message || 'Unable to update department.');
    } finally {
      setUpdatingDept(false);
    }
  };

  // Field Verification: Action A - Confirm Existing Department
  const handleConfirmExistingDept = async () => {
    if (!complaint || !user || !officer) return;
    if (isInvalidImageComplaint(complaint)) {
      Alert.alert('Action Blocked', 'This complaint was rejected as "Invalid Issue image, raise the complaint with the appropriate image!" and cannot be verified.');
      return;
    }
    setConfirmingDept(true);
    try {
      const currentDeptName = complaint.department || complaint.responsibleDepartment || 'Road Maintenance';
      await verifyComplaintWorkflow(complaint.id, {
        action: 'confirm_existing',
        inspectorId: user.uid,
        inspectorName: officer.name,
        remarks: verifyRemarks.trim() || undefined,
      });

      // Citizen notification (safe dispatch)
      try {
        await createNotification({
          userId: complaint.citizenId,
          recipientRole: 'citizen',
          complaintId: complaint.id,
          title: 'Field Verification Confirmed',
          message: `Field inspection confirmed your complaint belongs to the ${currentDeptName} Department and is verified.`,
          type: 'field_verified',
        });
      } catch (notifErr) {
        console.warn('Citizen confirmation notification warning (handled):', notifErr);
      }

      setShowConfirmDeptModal(false);
      setVerifyRemarks('');
      Alert.alert(
        'Department Confirmed',
        `Field inspection confirmed. Complaint is verified under ${currentDeptName}.`
      );
    } catch (e) {
      console.error('Confirm existing department error:', e);
      Alert.alert('Verification Error', 'Failed to confirm existing department.');
    } finally {
      setConfirmingDept(false);
    }
  };

  // Field Verification: Action B - Another Department Involved (Transfer)
  const handleTransferDept = async () => {
    if (!complaint || !user || !officer) return;
    if (isInvalidImageComplaint(complaint)) {
      Alert.alert('Action Blocked', 'This complaint was rejected as "Invalid Issue image, raise the complaint with the appropriate image!" and cannot be transferred.');
      return;
    }
    const targetDept = DEPARTMENTS_CONFIG[transferDeptCode] || DEPARTMENTS_CONFIG['SWM'];
    const currentDeptName = complaint.department || complaint.responsibleDepartment || 'Road Maintenance';

    if (targetDept.name === currentDeptName) {
      Alert.alert('Invalid Department', 'Please select a different department for transfer, or use "Verify Existing Department".');
      return;
    }

    setTransferringDept(true);
    try {
      await verifyComplaintWorkflow(complaint.id, {
        action: 'transfer_department',
        inspectorId: user.uid,
        inspectorName: officer.name,
        newDepartmentName: targetDept.name,
        newDepartmentCode: targetDept.code,
        remarks: transferRemarks.trim() || undefined,
      });

      // Citizen notification (safe dispatch)
      try {
        await createNotification({
          userId: complaint.citizenId,
          recipientRole: 'citizen',
          complaintId: complaint.id,
          title: 'Department Transferred',
          message: `Field verification identified that your complaint involves the ${targetDept.name} Department. Complaint has been re-routed.`,
          type: 'multi_dept_alert',
        });
      } catch (notifErr) {
        console.warn('Citizen transfer notification warning (handled):', notifErr);
      }

      setShowTransferDeptModal(false);
      setTransferRemarks('');
      Alert.alert(
        'Complaint Transferred',
        `Field inspection transferred complaint from ${currentDeptName} to ${targetDept.name}.`
      );
    } catch (e) {
      console.error('Transfer department error:', e);
      Alert.alert('Transfer Error', 'Failed to transfer complaint to another department.');
    } finally {
      setTransferringDept(false);
    }
  };

  if (loading || !officer) {
    return (
      <SafeAreaView style={styles.centered}>
        <ActivityIndicator size="large" color={AppColors.primary} />
      </SafeAreaView>
    );
  }

  if (!complaint) {
    return (
      <SafeAreaView style={styles.centered}>
        <Ionicons name="alert-circle-outline" size={48} color={AppColors.error} />
        <Text style={styles.errorText}>Complaint not found.</Text>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Text style={styles.backBtnText}>Go Back</Text>
        </TouchableOpacity>
      </SafeAreaView>
    );
  }

  const isMainOfficer = officer?.role === 'officer' || officer?.role === 'admin';
  const isRejected = isInvalidImageComplaint(complaint);

  return (
    <SafeAreaView style={styles.safe}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} accessibilityRole="button" accessibilityLabel="Back">
          <Ionicons name="arrow-back" size={24} color={AppColors.textPrimary} />
        </TouchableOpacity>
        <View style={{ alignItems: 'center' }}>
          <Text style={styles.headerTitle}>#{complaint.complaintId}</Text>
          <Text style={styles.headerSub}>{complaint.region} • {complaint.department || complaint.responsibleDepartment}</Text>
        </View>
        <View style={{ width: 24 }} />
      </View>

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        {/* Rejection Alert Banner */}
        {isRejected && (
          <View style={styles.mismatchAlertBanner}>
            <View style={styles.mismatchAlertHeader}>
              <Ionicons name="close-circle" size={22} color="#DC2626" />
              <Text style={styles.mismatchAlertTitle}>Invalid Issue image, raise the complaint with the appropriate image!</Text>
            </View>
            <Text style={styles.mismatchAlertText}>
              This complaint was automatically rejected because the submitted photo did not contain valid civic infrastructure defects.
            </Text>
            {complaint.rejectionReason ? (
              <Text style={styles.mismatchAlertReason}>
                Reason: {complaint.rejectionReason}
              </Text>
            ) : null}
            <View style={styles.mismatchAlertBadge}>
              <Text style={styles.mismatchAlertBadgeText}>INACTIVE • EXCLUDED FROM ACTIVE OFFICER QUEUES</Text>
            </View>
          </View>
        )}

        {/* Defect Photo */}
        <CivicImage
          uri={complaint.imageUri}
          issueType={complaint.issueType}
          style={styles.image}
          resizeMode="cover"
        />

        {/* Status Card */}
        <View style={styles.card}>
          <View style={styles.statusRow}>
            <View>
              <Text style={styles.issueHeading}>{complaint.issueType}</Text>
              <Text style={styles.subInfo}>Citizen: {complaint.citizenEmail}</Text>
              <Text style={styles.subInfoDept}>Dept: {complaint.department || complaint.responsibleDepartment}</Text>
            </View>
            <StatusBadge status={complaint.status} inspectionStatus={complaint.inspectionStatus} size="md" />
          </View>

          {/* AI Model Detection Confidence & Extracted Keyword Badge */}
          {typeof complaint.confidence === 'number' && complaint.confidence > 0 && (
            <View style={styles.aiAccuracyRow}>
              <View style={styles.aiAccuracyBadge}>
                <Ionicons name="sparkles" size={12} color="#047857" />
                <Text style={styles.aiAccuracyBadgeText}>
                  AI Model Accuracy: {Math.round(complaint.confidence > 1 ? complaint.confidence : complaint.confidence * 100)}%
                </Text>
              </View>
              {complaint.matchedKeyword ? (
                <View style={styles.keywordChip}>
                  <Ionicons name="pricetag-outline" size={11} color="#0369A1" />
                  <Text style={styles.keywordChipText}>Keyword: &ldquo;{complaint.matchedKeyword}&rdquo;</Text>
                </View>
              ) : null}
            </View>
          )}

          {/* Citizen Description & Landmark - High Visibility */}
          {complaint.description ? (
            <View style={styles.descHighlightBox}>
              <View style={styles.descHeaderRow}>
                <Ionicons name="chatbox-ellipses" size={14} color={AppColors.primary} />
                <Text style={styles.descHeaderLabel}>Citizen Description &amp; Landmark</Text>
              </View>
              <Text style={styles.descText}>{complaint.description}</Text>
            </View>
          ) : null}

          <View style={styles.metaRow}>
            <View style={styles.metaItem}>
              <Text style={styles.metaLabel}>GPS Coordinates</Text>
              <Text style={styles.metaVal}>{complaint.latitude.toFixed(5)}, {complaint.longitude.toFixed(5)}</Text>
            </View>
            <View style={styles.metaItem}>
              <Text style={styles.metaLabel}>Coimbatore Region</Text>
              <Text style={styles.metaVal}>{complaint.region}</Text>
            </View>
            <View style={styles.metaItem}>
              <Text style={styles.metaLabel}>Est. Budget (INR)</Text>
              <Text style={[styles.metaVal, { color: '#0D9488', fontWeight: '800' }]}>
                ₹{(complaint.inspectionDetails?.estimatedBudget ?? complaint.estimatedBudget ?? getStandardEstimatedBudget(complaint.issueType, complaint.priority || complaint.severity).budget).toLocaleString('en-IN')}
              </Text>
            </View>
          </View>
        </View>

        {/* Department & Routing Card */}
        <View style={styles.card}>
          <View style={styles.cardHeaderRow}>
            <Text style={styles.cardSectionTitle}>Department Routing</Text>
            {isMainOfficer && !isRejected && (
              <TouchableOpacity
                style={styles.changeDeptBtn}
                onPress={handleOpenDeptModal}
                accessibilityRole="button"
                accessibilityLabel="Change Department"
              >
                <Ionicons name="swap-horizontal" size={14} color={AppColors.primary} />
                <Text style={styles.changeDeptBtnText}>Change Dept</Text>
              </TouchableOpacity>
            )}
          </View>

          <View style={styles.deptStatusRow}>
            {(() => {
              const isMoved =
                complaint.routingStatus === 'Moved to Solid Waste Management' ||
                complaint.routingStatus === 'Moved' ||
                complaint.department === 'Solid Waste Management' ||
                complaint.departmentCode === 'SWM' ||
                (complaint.department && complaint.department !== 'Road Maintenance');

              return (
                <>
                  <View style={[
                    styles.deptBadgeLarge,
                    isMoved ? styles.deptBadgeLargeMoved : styles.deptBadgeLargeDirect
                  ]}>
                    <Ionicons
                      name={isMoved ? 'swap-horizontal' : 'business'}
                      size={16}
                      color={isMoved ? '#0369A1' : AppColors.textPrimary}
                    />
                    <Text style={[
                      styles.deptBadgeLargeText,
                      isMoved ? styles.deptBadgeLargeTextMoved : {}
                    ]}>
                      {complaint.department || complaint.responsibleDepartment || 'Road Maintenance'}
                    </Text>
                  </View>

                  <View style={styles.routingTag}>
                    <Text style={styles.routingTagText}>
                      Routing Status: {complaint.routingStatus || (isMoved ? 'Moved to Solid Waste Management' : 'Direct Assignment')}
                    </Text>
                  </View>
                </>
              );
            })()}
          </View>

          <View style={styles.divider} />

          <View style={styles.deptDetailItem}>
            <Text style={styles.infoLabel}>Assigned Officer</Text>
            <Text style={styles.infoValue}>
              {complaint.assignedOfficerName || complaint.assignedOfficer || 'Awaiting Assignment'}
            </Text>
          </View>

          {complaint.assignedInspectorName ? (
            <View style={styles.deptDetailItem}>
              <Text style={styles.infoLabel}>Assigned Field Inspector</Text>
              <Text style={styles.infoValue}>
                {complaint.assignedInspectorName}
              </Text>
            </View>
          ) : null}

          <View style={styles.deptDetailItem}>
            <Text style={styles.infoLabel}>Department Source</Text>
            <Text style={styles.infoValue}>
              {complaint.departmentSource === 'description'
                ? 'Auto-detected from Citizen Description'
                : complaint.departmentSource === 'field_inspector'
                ? 'Field Inspector Correction'
                : complaint.departmentSource === 'officer'
                ? 'Officer Manual Reassignment'
                : 'AI Image Model'}
            </Text>
          </View>

          {complaint.departmentExplanation ? (
            <View style={styles.deptExplanationBox}>
              <Ionicons name="information-circle-outline" size={16} color="#0369A1" />
              <Text style={styles.deptExplanationText}>
                {complaint.departmentExplanation}
              </Text>
            </View>
          ) : null}

          {complaint.departmentRemarks ? (
            <View style={styles.remarksBox}>
              <Text style={styles.remarksLabel}>Department Update Remarks:</Text>
              <Text style={styles.remarksText}>{complaint.departmentRemarks}</Text>
            </View>
          ) : null}

          {complaint.departmentChangedByName && (
            <Text style={styles.infoSubtext}>
              Last modified by {complaint.departmentChangedByName}
              {complaint.departmentChangedAt ? ` on ${complaint.departmentChangedAt.toLocaleDateString('en-IN')}` : ''}
            </Text>
          )}
        </View>

        {/* AI Prediction Box */}
        <View style={styles.card}>
          <View style={styles.boxHeader}>
            <Ionicons name="hardware-chip-outline" size={16} color={AppColors.primary} />
            <Text style={styles.boxTitle}>AI Model Preliminary Output</Text>
          </View>
          <View style={styles.grid2}>
            <View>
              <Text style={styles.metaLabel}>AI Defect Class</Text>
              <Text style={styles.metaVal}>{complaint.issueType.toUpperCase()}</Text>
            </View>
            <View>
              <Text style={styles.metaLabel}>AI Confidence</Text>
              <Text style={styles.metaVal}>{complaint.confidence}%</Text>
            </View>
          </View>

          <View style={[styles.grid2, { marginTop: 8 }]}>
            <View>
              <Text style={styles.metaLabel}>AI Priority / Severity</Text>
              <Text style={styles.metaVal}>{complaint.priority || complaint.severity || 'MEDIUM'}</Text>
            </View>
            <View>
              <Text style={styles.metaLabel}>Budget Status</Text>
              <Text style={[styles.metaVal, { color: '#0D9488' }]}>
                {complaint.inspectionDetails?.estimatedBudget || complaint.estimatedBudget
                  ? `₹${(complaint.inspectionDetails?.estimatedBudget || complaint.estimatedBudget || 0).toLocaleString('en-IN')} (Field Verified)`
                  : 'Pending Field Inspection'}
              </Text>
            </View>
          </View>
        </View>

        {/* FIELD VERIFICATION SECTION (In-Workflow Verification & Routing) */}
        <View style={[styles.card, styles.fieldVerificationCard]}>
          <View style={styles.boxHeader}>
            <Ionicons name="shield-checkmark" size={18} color="#0D9488" />
            <Text style={[styles.boxTitle, { color: '#0D9488' }]}>Field Verification</Text>
          </View>

          {/* Verification Status Banner */}
          {complaint.fieldVerificationStatus === 'department_confirmed' ? (
            <View style={styles.verifiedSuccessBanner}>
              <Ionicons name="checkmark-circle" size={20} color="#047857" />
              <View style={{ flex: 1 }}>
                <Text style={styles.verifiedSuccessTitle}>✓ Existing Department Confirmed</Text>
                <Text style={styles.verifiedSuccessSub}>
                  Complaint verified under {complaint.department || complaint.responsibleDepartment}
                </Text>
              </View>
            </View>
          ) : complaint.fieldVerificationStatus === 'transferred' ? (
            <View style={styles.transferredBanner}>
              <Ionicons name="swap-horizontal" size={20} color="#0369A1" />
              <View style={{ flex: 1 }}>
                <Text style={styles.transferredTitle}>⚠ Another Department Involved &amp; Transferred</Text>
                <Text style={styles.transferredSub}>
                  Re-routed from {complaint.previousDepartment || 'Previous Dept'} to {complaint.department || complaint.responsibleDepartment}
                </Text>
              </View>
            </View>
          ) : complaint.status === 'Verified' || complaint.inspectionDetails ? (
            <View style={styles.verifiedSuccessBanner}>
              <Ionicons name="checkmark-circle" size={20} color="#047857" />
              <View style={{ flex: 1 }}>
                <Text style={styles.verifiedSuccessTitle}>✓ Field Verified &amp; Inspected</Text>
                <Text style={styles.verifiedSuccessSub}>
                  On-site verification completed by {complaint.assignedInspectorName || complaint.inspectionDetails?.inspectedByName || 'Field Inspector'}
                </Text>
              </View>
            </View>
          ) : (
            <View style={styles.pendingVerifyBanner}>
              <Ionicons name="hourglass-outline" size={20} color="#B45309" />
              <View style={{ flex: 1 }}>
                <Text style={styles.pendingVerifyTitle}>Pending Field Verification</Text>
                <Text style={styles.pendingVerifySub}>
                  Verify whether the complaint belongs to {complaint.department || complaint.responsibleDepartment} or another department is involved.
                </Text>
              </View>
            </View>
          )}

          {/* Verification Meta Grid */}
          <View style={styles.grid2}>
            <View>
              <Text style={styles.metaLabel}>Current Department</Text>
              <Text style={styles.metaVal}>{complaint.department || complaint.responsibleDepartment}</Text>
            </View>
            <View>
              <Text style={styles.metaLabel}>Field Verification</Text>
              <Text style={[styles.metaVal, { textTransform: 'capitalize', color: complaint.fieldVerificationStatus === 'department_confirmed' || complaint.status === 'Verified' ? '#047857' : complaint.fieldVerificationStatus === 'transferred' ? '#0369A1' : '#B45309' }]}>
                {complaint.fieldVerificationStatus === 'department_confirmed' ? 'Verified (Confirmed)' : complaint.fieldVerificationStatus === 'transferred' ? 'Transferred' : complaint.status === 'Verified' ? 'Verified' : 'Pending Verification'}
              </Text>
            </View>
          </View>

          <View style={[styles.grid2, { marginTop: 8 }]}>
            <View>
              <Text style={styles.metaLabel}>Assigned Officer</Text>
              <Text style={styles.metaVal}>{complaint.assignedOfficerName || complaint.assignedOfficer || 'Awaiting Assignment'}</Text>
            </View>
            <View>
              <Text style={styles.metaLabel}>Priority</Text>
              <Text style={[styles.metaVal, { color: complaint.priority === 'HIGH' || complaint.priority === 'Critical' ? AppColors.error : '#C2410C' }]}>
                {complaint.priority || complaint.severity || 'LOW'}
              </Text>
            </View>
          </View>

          <View style={[styles.grid2, { marginTop: 8 }]}>
            <View>
              <Text style={styles.metaLabel}>Est. Resolution Duration</Text>
              <Text style={styles.metaVal}>{complaint.estimatedResolutionDuration || (complaint.estimatedResolutionDays ? `${complaint.estimatedResolutionDays} Days` : '3 Days')}</Text>
            </View>
            <View>
              <Text style={styles.metaLabel}>Expected Resolution Date</Text>
              <Text style={styles.metaVal}>{complaint.expectedResolutionDate ? formatResolutionDate(complaint.expectedResolutionDate) : 'Pending Verification'}</Text>
            </View>
          </View>

          {complaint.fieldVerificationRemarks ? (
            <View style={styles.verificationNotesBox}>
              <Text style={styles.metaLabel}>Verification Remarks</Text>
              <Text style={styles.notesText}>&ldquo;{complaint.fieldVerificationRemarks}&rdquo;</Text>
              {complaint.fieldVerifiedBy ? (
                <Text style={styles.signedBy}>— Verified by {complaint.fieldVerifiedBy}</Text>
              ) : null}
            </View>
          ) : null}

          {/* Verification Action Buttons */}
          {!isRejected && (
            <View style={styles.verificationBtnGroup}>
              <TouchableOpacity
                style={styles.verifyConfirmBtn}
                onPress={() => setShowConfirmDeptModal(true)}
                accessible
                accessibilityRole="button"
                accessibilityLabel="Verify Existing Department"
              >
                <Ionicons name="checkmark-circle-outline" size={16} color={AppColors.white} />
                <Text style={styles.verifyConfirmBtnText}>Verify Existing Department</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.verifyTransferBtn}
                onPress={() => {
                  setTransferDeptCode(complaint.departmentCode === 'ROAD' ? 'SWM' : 'ROAD');
                  setTransferRemarks('');
                  setShowTransferDeptModal(true);
                }}
                accessible
                accessibilityRole="button"
                accessibilityLabel="Another Department Involved"
              >
                <Ionicons name="swap-horizontal" size={16} color="#0369A1" />
                <Text style={styles.verifyTransferBtnText}>Another Dept Involved</Text>
              </TouchableOpacity>
            </View>
          )}

          {!isRejected && isRoadDepartment(complaint.department || complaint.responsibleDepartment) && (
            <TouchableOpacity
              style={styles.detailedInspectionLinkBtn}
              onPress={() => router.push({ pathname: '/officer/inspection-screen', params: { id: complaint.id } })}
              accessible
              accessibilityRole="button"
              accessibilityLabel="Open Detailed Road BOQ & Budget Inspection"
            >
              <Ionicons name="construct-outline" size={14} color="#0D9488" />
              <Text style={styles.detailedInspectionLinkText}>Detailed Technical Road BOQ Inspection &rarr;</Text>
            </TouchableOpacity>
          )}

          {/* If Full Physical Inspection Details Exist (Roads) */}
          {complaint.inspectionDetails && (
            <View style={styles.inspectorDetailInnerBox}>
              <Text style={styles.innerSectionTitle}>Technical Road Inspection Summary</Text>
              <View style={styles.grid2}>
                <View>
                  <Text style={styles.metaLabel}>Road Identified</Text>
                  <Text style={styles.metaVal}>{complaint.inspectionDetails.roadName}</Text>
                </View>
                <View>
                  <Text style={styles.metaLabel}>Maintenance Authority</Text>
                  <Text style={styles.authoritySubText}>{complaint.inspectionDetails.maintenanceAuthority}</Text>
                </View>
              </View>

              <View style={[styles.grid2, { marginTop: 8 }]}>
                <View>
                  <Text style={styles.metaLabel}>Verified Issue &amp; Severity</Text>
                  <Text style={styles.metaVal}>{complaint.inspectionDetails.verifiedIssue.toUpperCase()} ({complaint.inspectionDetails.severity})</Text>
                </View>
                <View>
                  <Text style={styles.metaLabel}>Manual Estimated Budget</Text>
                  <Text style={[styles.metaVal, { color: '#0F766E', fontWeight: '800' }]}>
                    ₹{complaint.inspectionDetails.estimatedBudget.toLocaleString('en-IN')}
                  </Text>
                </View>
              </View>

              {complaint.inspectionDetails.inspectorRemarks ? (
                <View style={[styles.verificationNotesBox, { marginTop: 8 }]}>
                  <Text style={styles.metaLabel}>Inspector On-Site Observations</Text>
                  <Text style={styles.notesText}>&ldquo;{complaint.inspectionDetails.inspectorRemarks}&rdquo;</Text>
                </View>
              ) : null}

              {(complaint.inspectionEvidenceUrl || (complaint as any).inspectionDetails?.inspectionEvidenceUrl) ? (
                <View style={{ marginTop: 8 }}>
                  <Text style={styles.metaLabel}>Field Inspector Observation Photo</Text>
                  <CivicImage
                    uri={complaint.inspectionEvidenceUrl || (complaint as any).inspectionDetails?.inspectionEvidenceUrl}
                    style={{ width: '100%', height: 160, borderRadius: 10, marginTop: 6 }}
                    resizeMode="cover"
                  />
                </View>
              ) : null}

              <View style={{ marginTop: 8 }}>
                <PracticalBudgetBreakdownCard
                  budgetBreakdown={complaint.inspectionDetails.budgetBreakdown || complaint.budgetBreakdown}
                  issueType={complaint.inspectionDetails.verifiedIssue}
                  severity={complaint.inspectionDetails.severity}
                  estimatedBudget={complaint.inspectionDetails.estimatedBudget}
                  estimatedBudgetDesc={complaint.inspectionDetails.budgetBreakdown?.description}
                  title="Inspector Verified BOQ Allocation"
                  showBoqToggle={true}
                  initiallyExpanded={false}
                />
              </View>
            </View>
          )}
        </View>

        {/* Resolution Details Card */}
        {(complaint.status === 'Resolved' || complaint.resolutionDetails) && (
          <View style={[styles.card, { backgroundColor: '#F0FDF4', borderColor: '#BBF7D0', borderWidth: 1.5 }]}>
            <View style={styles.boxHeader}>
              <Ionicons name="checkmark-circle" size={18} color="#15803D" />
              <Text style={[styles.boxTitle, { color: '#15803D' }]}>Complaint Resolved</Text>
            </View>
            <View style={styles.metaRow}>
              <View style={styles.metaItem}>
                <Text style={styles.metaLabel}>Resolved By</Text>
                <Text style={styles.metaVal}>{complaint.resolutionDetails?.resolvedByName || complaint.assignedOfficerName || 'Maintenance Division'}</Text>
              </View>
              {complaint.resolutionDetails?.resolvedAt && (
                <View style={styles.metaItem}>
                  <Text style={styles.metaLabel}>Resolved Date</Text>
                  <Text style={styles.metaVal}>
                    {complaint.resolutionDetails.resolvedAt instanceof Date
                      ? complaint.resolutionDetails.resolvedAt.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
                      : 'Completed'}
                  </Text>
                </View>
              )}
            </View>
            {complaint.resolutionDetails?.resolutionRemarks ? (
              <View style={{ marginTop: 8 }}>
                <Text style={styles.metaLabel}>Resolution Remarks</Text>
                <Text style={[styles.metaVal, { fontWeight: '500', marginTop: 2 }]}>
                  {complaint.resolutionDetails.resolutionRemarks}
                </Text>
              </View>
            ) : null}
            {complaint.resolutionDetails?.afterRepairImageUri ? (
              <View style={{ marginTop: 10 }}>
                <Text style={styles.metaLabel}>Repair Evidence Photo</Text>
                <CivicImage
                  uri={complaint.resolutionDetails.afterRepairImageUri}
                  style={{ width: '100%', height: 160, borderRadius: 10, marginTop: 6 }}
                  resizeMode="cover"
                />
              </View>
            ) : null}
          </View>
        )}

        {/* Citizen Verification Status */}
        {complaint.citizenVerification && (
          <View style={styles.card}>
            <View style={styles.boxHeader}>
              <Ionicons name="person-circle-outline" size={16} color="#7E22CE" />
              <Text style={[styles.boxTitle, { color: '#7E22CE' }]}>Citizen Final Verification Status</Text>
            </View>
            <Text style={styles.metaVal}>
              {complaint.citizenVerification.isResolvedSatisfied
                ? '✅ Citizen Confirmed Repair Completed (Closed)'
                : '⚠️ Citizen Disputed Repair (Reopened)'}
            </Text>
            {complaint.citizenVerification.citizenFeedback ? (
              <Text style={styles.notesText}>
                Feedback: &ldquo;{complaint.citizenVerification.citizenFeedback}&rdquo;
              </Text>
            ) : null}
          </View>
        )}

        {/* Audit Log */}
        {complaint.statusHistory && complaint.statusHistory.length > 0 && (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Status Audit Log</Text>
            {complaint.statusHistory.map((item, idx) => (
              <View key={item.id || idx} style={styles.historyRow}>
                <View style={styles.historyDot} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.historyStatus}>{item.newStatus}</Text>
                  {item.remarks ? <Text style={styles.historyRemarks}>{item.remarks}</Text> : null}
                  <Text style={styles.historyBy}>Updated by {item.updatedByName}</Text>
                </View>
              </View>
            ))}
          </View>
        )}

        {/* Action Buttons for Officer / Admin */}
        {isRejected ? (
          <View style={styles.inactiveWorkflowBanner}>
            <Ionicons name="ban-outline" size={20} color="#DC2626" />
            <Text style={styles.inactiveWorkflowText}>
              This complaint is inactive (Invalid Issue image, raise the complaint with the appropriate image!). All further assignments, inspections, and lifecycle transitions are disabled.
            </Text>
          </View>
        ) : isRoadDepartment(complaint.department || complaint.responsibleDepartment || 'Road Maintenance') ? (
          <View style={styles.actionContainer}>
            {/* If Pending Verification -> Go to Inspection Screen */}
            {(complaint.status === 'Pending Field Verification' || complaint.status === 'Submitted') && (
              <TouchableOpacity
                style={styles.primaryActionBtn}
                onPress={() => router.push({ pathname: '/officer/inspection-screen', params: { id: complaint.id } })}
              >
                <Ionicons name="shield-checkmark" size={18} color={AppColors.white} />
                <Text style={styles.primaryActionText}>Perform Field Inspection</Text>
              </TouchableOpacity>
            )}

            {/* If Verified -> Assign to Authority */}
            {complaint.status === 'Verified' && (
              <TouchableOpacity
                style={[styles.primaryActionBtn, { backgroundColor: '#4F46E5' }]}
                onPress={() => setShowAssignModal(true)}
              >
                <Ionicons name="business-outline" size={18} color={AppColors.white} />
                <Text style={styles.primaryActionText}>Assign to Maintenance Authority</Text>
              </TouchableOpacity>
            )}

            {/* If Assigned -> Start Repair */}
            {(complaint.status === 'Assigned' || complaint.status === 'Accepted') && (
              <TouchableOpacity
                style={[styles.primaryActionBtn, { backgroundColor: '#D97706' }]}
                onPress={() => {
                  setProgressActionType('In Progress');
                  setProgressRemarks('Road repair crew deployed with materials on-site.');
                  setShowProgressModal(true);
                }}
              >
                <Ionicons name="construct-outline" size={18} color={AppColors.white} />
                <Text style={styles.primaryActionText}>Start Repair Work</Text>
              </TouchableOpacity>
            )}

            {/* If In Progress -> Mark Resolved */}
            {complaint.status === 'In Progress' && (
              <TouchableOpacity
                style={[styles.primaryActionBtn, { backgroundColor: AppColors.success }]}
                onPress={() => {
                  setProgressActionType('Resolved');
                  setProgressRemarks('Repair completed, area cleaned and restored.');
                  setShowProgressModal(true);
                }}
              >
                <Ionicons name="checkmark-done-circle-outline" size={18} color={AppColors.white} />
                <Text style={styles.primaryActionText}>Mark Defect as Resolved</Text>
              </TouchableOpacity>
            )}
          </View>
        ) : (
          <View style={styles.referenceBanner}>
            <Ionicons name="information-circle" size={20} color="#0369A1" />
            <Text style={styles.referenceBannerText}>
              This complaint is routed to the {complaint.department || complaint.responsibleDepartment} Department for reference and inter-departmental analytics. Lifecycle actions are managed by the respective department.
            </Text>
          </View>
        )}
      </ScrollView>

      {/* Authority Assignment Modal */}
      <Modal visible={showAssignModal} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <View style={styles.boxHeader}>
              <Ionicons name="business" size={22} color={AppColors.primary} />
              <Text style={styles.modalTitle}>Route to Maintenance Authority</Text>
            </View>

            <Text style={styles.modalSub}>
              Complaint #{complaint.complaintId} • {complaint.region}
            </Text>

            <ScrollView style={{ maxHeight: 200 }}>
              {AUTHORITY_OPTIONS.map(authOpt => (
                <TouchableOpacity
                  key={authOpt}
                  style={[
                    styles.authRow,
                    selectedAuthority === authOpt && styles.authRowActive,
                  ]}
                  onPress={() => setSelectedAuthority(authOpt)}
                >
                  <Ionicons
                    name={selectedAuthority === authOpt ? 'radio-button-on' : 'radio-button-off'}
                    size={16}
                    color={selectedAuthority === authOpt ? AppColors.primary : AppColors.textSecondary}
                  />
                  <Text style={[styles.authText, selectedAuthority === authOpt && styles.authTextActive]}>
                    {authOpt}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>

            <TextInput
              style={[styles.modalInput, { marginTop: 12 }]}
              placeholder="Admin routing instructions..."
              value={adminRemarks}
              onChangeText={setAdminRemarks}
            />

            <View style={styles.modalBtnRow}>
              <TouchableOpacity
                style={styles.modalCancelBtn}
                onPress={() => setShowAssignModal(false)}
                disabled={assigning}
              >
                <Text style={styles.modalCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.modalSubmitBtn}
                onPress={handleAssignAuthority}
                disabled={assigning}
              >
                {assigning ? (
                  <ActivityIndicator color={AppColors.white} />
                ) : (
                  <Text style={styles.modalSubmitText}>Confirm Assignment</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Progress / Resolve Modal */}
      <Modal visible={showProgressModal} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <View style={styles.boxHeader}>
              <Ionicons
                name={progressActionType === 'In Progress' ? 'construct' : 'checkmark-done-circle'}
                size={22}
                color={progressActionType === 'In Progress' ? '#D97706' : AppColors.success}
              />
              <Text style={styles.modalTitle}>
                {progressActionType === 'In Progress' ? 'Start Repair Work' : 'Mark Defect as Resolved'}
              </Text>
            </View>

            <TextInput
              style={[styles.modalInput, { minHeight: 70, marginTop: 12 }]}
              placeholder="Execution remarks..."
              value={progressRemarks}
              onChangeText={setProgressRemarks}
              multiline
            />

            <View style={styles.modalBtnRow}>
              <TouchableOpacity
                style={styles.modalCancelBtn}
                onPress={() => setShowProgressModal(false)}
                disabled={updatingProgress}
              >
                <Text style={styles.modalCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.modalSubmitBtn,
                  progressActionType === 'In Progress' ? { backgroundColor: '#D97706' } : { backgroundColor: AppColors.success },
                ]}
                onPress={handleUpdateProgress}
                disabled={updatingProgress}
              >
                {updatingProgress ? (
                  <ActivityIndicator color={AppColors.white} />
                ) : (
                  <Text style={styles.modalSubmitText}>Confirm</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Reassign Department Modal */}
      <Modal visible={showDeptModal} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeaderRow}>
              <View>
                <Text style={styles.modalTitle}>Reassign Department</Text>
                <Text style={styles.modalSub}>Select target municipal department for this issue</Text>
              </View>
              <TouchableOpacity
                onPress={() => setShowDeptModal(false)}
                style={styles.modalCloseBtn}
                accessible
                accessibilityLabel="Close department modal"
              >
                <Ionicons name="close" size={22} color={AppColors.textPrimary} />
              </TouchableOpacity>
            </View>

            <ScrollView style={{ maxHeight: 200, marginBottom: 12 }}>
              {AVAILABLE_DEPARTMENTS.map(d => {
                const isSelected = selectedDeptCode === d.code;
                return (
                  <TouchableOpacity
                    key={d.code}
                    style={[styles.deptSelectItem, isSelected && styles.deptSelectItemActive]}
                    onPress={() => setSelectedDeptCode(d.code)}
                    activeOpacity={0.7}
                    accessible
                    accessibilityRole="radio"
                    accessibilityState={{ selected: isSelected }}
                    accessibilityLabel={d.name}
                  >
                    <View style={styles.deptSelectLeft}>
                      <Ionicons
                        name={
                          d.code === 'ROAD' ? 'construct-outline' :
                          d.code === 'PWD' ? 'business-outline' :
                          d.code === 'SAFETY' ? 'shield-outline' :
                          d.code === 'LIGHTING' ? 'bulb-outline' :
                          d.code === 'TWAD' ? 'water-outline' : 'trash-outline'
                        }
                        size={20}
                        color={isSelected ? AppColors.primary : AppColors.textSecondary}
                      />
                      <View>
                        <Text style={[styles.deptSelectName, isSelected && styles.deptSelectNameActive]}>
                          {d.name}
                        </Text>
                        <Text style={styles.deptSelectLabel}>{d.label}</Text>
                      </View>
                    </View>
                    <View style={[styles.radioCircle, isSelected && styles.radioCircleSelected]}>
                      {isSelected && <View style={styles.radioDot} />}
                    </View>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>

            <View style={{ marginBottom: 16 }}>
              <Text style={styles.inputLabel}>Reason / Remarks (Optional)</Text>
              <TextInput
                style={styles.modalTextInput}
                placeholder="Why is this department being updated?"
                value={deptRemarks}
                onChangeText={setDeptRemarks}
                multiline
                numberOfLines={3}
                placeholderTextColor={AppColors.placeholder}
              />
            </View>

            <View style={styles.modalBtnRow}>
              <TouchableOpacity
                style={styles.modalCancelBtn}
                onPress={() => setShowDeptModal(false)}
                disabled={updatingDept}
              >
                <Text style={styles.modalCancelText}>Cancel</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.modalSubmitBtn, updatingDept && styles.disabledBtn]}
                onPress={handleConfirmDeptChange}
                disabled={updatingDept}
              >
                {updatingDept ? (
                  <ActivityIndicator color={AppColors.white} />
                ) : (
                  <Text style={styles.modalSubmitText}>Update Department</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Field Verification: Action A - Confirm Existing Department Modal */}
      <Modal visible={showConfirmDeptModal} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeaderRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.modalTitle}>Confirm Existing Department</Text>
                <Text style={styles.modalSub}>
                  Confirm that this issue belongs to {complaint.department || complaint.responsibleDepartment}
                </Text>
              </View>
              <TouchableOpacity
                onPress={() => setShowConfirmDeptModal(false)}
                style={styles.modalCloseBtn}
                accessible
                accessibilityLabel="Close confirmation modal"
              >
                <Ionicons name="close" size={22} color={AppColors.textPrimary} />
              </TouchableOpacity>
            </View>

            <View style={styles.verificationConfirmSummaryBox}>
              <View style={styles.summaryItemRow}>
                <Text style={styles.summaryItemLabel}>Department:</Text>
                <Text style={styles.summaryItemValue}>{complaint.department || complaint.responsibleDepartment}</Text>
              </View>
              <View style={styles.summaryItemRow}>
                <Text style={styles.summaryItemLabel}>Issue Type:</Text>
                <Text style={styles.summaryItemValue}>{complaint.issueType}</Text>
              </View>
              <View style={styles.summaryItemRow}>
                <Text style={styles.summaryItemLabel}>Priority:</Text>
                <Text style={styles.summaryItemValue}>{complaint.priority || complaint.severity || 'LOW'}</Text>
              </View>
            </View>

            <View style={{ marginBottom: 16 }}>
              <Text style={styles.inputLabel}>Field Inspection Notes / Remarks (Optional)</Text>
              <TextInput
                style={styles.modalTextInput}
                placeholder="e.g. Verified on-site. Road defect belongs to municipal road wing."
                value={verifyRemarks}
                onChangeText={setVerifyRemarks}
                multiline
                numberOfLines={3}
                placeholderTextColor={AppColors.placeholder}
              />
            </View>

            <View style={styles.modalBtnRow}>
              <TouchableOpacity
                style={styles.modalCancelBtn}
                onPress={() => setShowConfirmDeptModal(false)}
                disabled={confirmingDept}
              >
                <Text style={styles.modalCancelText}>Cancel</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.modalSubmitBtn, { backgroundColor: '#047857' }, confirmingDept && styles.disabledBtn]}
                onPress={handleConfirmExistingDept}
                disabled={confirmingDept}
              >
                {confirmingDept ? (
                  <ActivityIndicator color={AppColors.white} />
                ) : (
                  <Text style={styles.modalSubmitText}>Confirm &amp; Verify</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Field Verification: Action B - Another Department Involved / Transfer Modal */}
      <Modal visible={showTransferDeptModal} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeaderRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.modalTitle}>Another Department Involved</Text>
                <Text style={styles.modalSub}>
                  Select the appropriate department to re-route this complaint
                </Text>
              </View>
              <TouchableOpacity
                onPress={() => setShowTransferDeptModal(false)}
                style={styles.modalCloseBtn}
                accessible
                accessibilityLabel="Close transfer modal"
              >
                <Ionicons name="close" size={22} color={AppColors.textPrimary} />
              </TouchableOpacity>
            </View>

            <View style={styles.transferCurrentDeptBox}>
              <Text style={styles.transferCurrentLabel}>Current Department:</Text>
              <Text style={styles.transferCurrentValue}>{complaint.department || complaint.responsibleDepartment}</Text>
            </View>

            <Text style={[styles.inputLabel, { marginTop: 8, marginBottom: 6 }]}>Select New Department:</Text>
            <ScrollView style={{ maxHeight: 180, marginBottom: 12 }}>
              {AVAILABLE_DEPARTMENTS.map(d => {
                const isSelected = transferDeptCode === d.code;
                const isCurrent = (complaint.departmentCode || 'ROAD') === d.code;
                return (
                  <TouchableOpacity
                    key={d.code}
                    style={[
                      styles.deptSelectItem,
                      isSelected && styles.deptSelectItemActive,
                      isCurrent && { opacity: 0.5 }
                    ]}
                    onPress={() => setTransferDeptCode(d.code)}
                    activeOpacity={0.7}
                    accessible
                    accessibilityRole="radio"
                    accessibilityState={{ selected: isSelected }}
                    accessibilityLabel={d.name}
                  >
                    <View style={styles.deptSelectLeft}>
                      <Ionicons
                        name={
                          d.code === 'ROAD' ? 'construct-outline' :
                          d.code === 'PWD' ? 'business-outline' :
                          d.code === 'SAFETY' ? 'shield-outline' :
                          d.code === 'LIGHTING' ? 'bulb-outline' :
                          d.code === 'DRAIN' ? 'water-outline' :
                          d.code === 'SEWER' ? 'funnel-outline' :
                          d.code === 'PARKS' ? 'leaf-outline' :
                          d.code === 'TREES' ? 'flower-outline' :
                          d.code === 'BUILDING' ? 'business' : 'trash-outline'
                        }
                        size={20}
                        color={isSelected ? AppColors.primary : AppColors.textSecondary}
                      />
                      <View style={{ flex: 1 }}>
                        <Text style={[styles.deptSelectName, isSelected && styles.deptSelectNameActive]}>
                          {d.name} {isCurrent ? '(Current)' : ''}
                        </Text>
                        <Text style={styles.deptSelectLabel}>{d.label}</Text>
                      </View>
                    </View>
                    <View style={[styles.radioCircle, isSelected && styles.radioCircleSelected]}>
                      {isSelected && <View style={styles.radioDot} />}
                    </View>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>

            <View style={{ marginBottom: 16 }}>
              <Text style={styles.inputLabel}>Reason for Re-routing / Transfer *</Text>
              <TextInput
                style={styles.modalTextInput}
                placeholder="e.g. Issue is caused by blocked drainage near the road."
                value={transferRemarks}
                onChangeText={setTransferRemarks}
                multiline
                numberOfLines={3}
                placeholderTextColor={AppColors.placeholder}
              />
            </View>

            <View style={styles.modalBtnRow}>
              <TouchableOpacity
                style={styles.modalCancelBtn}
                onPress={() => setShowTransferDeptModal(false)}
                disabled={transferringDept}
              >
                <Text style={styles.modalCancelText}>Cancel</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.modalSubmitBtn, { backgroundColor: '#0284C7' }, (!transferRemarks.trim() || transferringDept) && styles.disabledBtn]}
                onPress={handleTransferDept}
                disabled={!transferRemarks.trim() || transferringDept}
              >
                {transferringDept ? (
                  <ActivityIndicator color={AppColors.white} />
                ) : (
                  <Text style={styles.modalSubmitText}>Transfer Complaint</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: AppColors.background },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: AppColors.surface,
    borderBottomWidth: 1,
    borderBottomColor: AppColors.border,
  },
  headerTitle: { fontSize: 16, fontWeight: '800', color: AppColors.textPrimary },
  headerSub: { fontSize: 11, color: AppColors.textSecondary },
  scroll: { padding: 16, paddingBottom: 40 },
  image: {
    width: '100%',
    height: 200,
    borderRadius: 14,
    marginBottom: 14,
  },
  card: {
    backgroundColor: AppColors.surface,
    borderRadius: 14,
    padding: 14,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: AppColors.border,
  },
  statusRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 8,
  },
  issueHeading: {
    fontSize: 17,
    fontWeight: '800',
    color: AppColors.textPrimary,
    textTransform: 'capitalize',
  },
  subInfo: {
    fontSize: 11,
    color: AppColors.textSecondary,
    marginTop: 2,
  },
  subInfoDept: {
    fontSize: 11,
    color: AppColors.primary,
    fontWeight: '600',
    marginTop: 1,
  },
  descHighlightBox: {
    backgroundColor: '#F8FAFC',
    borderRadius: 10,
    padding: 12,
    marginVertical: 10,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  descHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 4,
  },
  descHeaderLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: AppColors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.3,
  },
  descText: {
    fontSize: 13,
    color: AppColors.textPrimary,
    lineHeight: 18,
  },
  desc: {
    fontSize: 13,
    color: AppColors.textPrimary,
    lineHeight: 18,
    marginBottom: 10,
  },
  metaRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    gap: 8,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: AppColors.border,
  },
  metaItem: { flex: 1, minWidth: 90 },
  metaLabel: { fontSize: 10, color: AppColors.textSecondary, textTransform: 'uppercase' },
  metaVal: { fontSize: 13, fontWeight: '700', color: AppColors.textPrimary, marginTop: 1 },
  boxHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: AppColors.border,
    paddingBottom: 4,
  },
  boxTitle: { fontSize: 12, fontWeight: '800', color: AppColors.primary },
  grid2: { flexDirection: 'row', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' },
  authoritySubText: { fontSize: 11, color: '#0D9488', fontWeight: '600', marginTop: 1 },
  multiDeptBanner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 6,
    backgroundColor: '#FFFBEB',
    padding: 8,
    borderRadius: 6,
    marginTop: 8,
    borderWidth: 1,
    borderColor: '#FDE68A',
  },
  multiDeptTitle: { fontSize: 10, fontWeight: '700', color: '#92400E' },
  multiDeptVal: { fontSize: 11, fontWeight: '600', color: '#B45309' },
  multiDeptReason: { fontSize: 10, color: '#78350F', marginTop: 2 },
  notesText: { fontSize: 12, fontStyle: 'italic', color: AppColors.textPrimary, marginTop: 2 },
  signedBy: { fontSize: 10, color: AppColors.textSecondary, marginTop: 2, textAlign: 'right' },
  pendingCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    backgroundColor: '#FFFBEB',
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#FDE68A',
    marginBottom: 12,
  },
  pendingText: { fontSize: 12, color: '#B45309', flex: 1, lineHeight: 17 },
  cardTitle: { fontSize: 13, fontWeight: '800', color: AppColors.textPrimary, marginBottom: 10 },
  cardSectionTitle: { fontSize: 14, fontWeight: '800', color: AppColors.textPrimary },
  historyRow: {
    flexDirection: 'row',
    gap: 8,
    paddingVertical: 6,
    borderBottomWidth: 1,
    borderBottomColor: AppColors.border,
  },
  historyDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: AppColors.primary, marginTop: 5 },
  historyStatus: { fontSize: 12, fontWeight: '700', color: AppColors.textPrimary },
  historyRemarks: { fontSize: 11, color: AppColors.textSecondary, marginTop: 1 },
  historyBy: { fontSize: 9, color: AppColors.placeholder, marginTop: 1 },
  actionContainer: { marginTop: 8 },
  primaryActionBtn: {
    backgroundColor: AppColors.primary,
    borderRadius: 12,
    paddingVertical: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    ...Platform.select({
      web: {
        boxShadow: '0px 3px 6px rgba(15, 118, 110, 0.25)',
      },
      default: {
        shadowColor: AppColors.primary,
        shadowOffset: { width: 0, height: 3 },
        shadowOpacity: 0.25,
        shadowRadius: 6,
        elevation: 3,
      },
    }),
  },
  primaryActionText: { color: AppColors.white, fontSize: 14, fontWeight: '700' },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  errorText: { fontSize: 16, color: AppColors.error, marginTop: 12 },
  backBtn: {
    marginTop: 16,
    paddingHorizontal: 20,
    paddingVertical: 10,
    backgroundColor: AppColors.primary,
    borderRadius: 8,
  },
  backBtnText: { color: AppColors.white, fontWeight: '700' },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  modalCard: {
    backgroundColor: AppColors.surface,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 20,
    paddingBottom: 36,
  },
  modalTitle: { fontSize: 16, fontWeight: '800', color: AppColors.textPrimary },
  modalSub: { fontSize: 12, color: AppColors.primary, fontWeight: '600', marginBottom: 12 },
  modalHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 10,
  },
  modalCloseBtn: {
    padding: 4,
  },
  authRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: AppColors.border,
  },
  authRowActive: { backgroundColor: '#EEF2FF' },
  authText: { fontSize: 12, color: AppColors.textPrimary, flex: 1 },
  authTextActive: { fontWeight: '700', color: '#4F46E5' },
  modalInput: {
    backgroundColor: AppColors.background,
    borderRadius: 10,
    padding: 10,
    borderWidth: 1,
    borderColor: AppColors.border,
    fontSize: 13,
    color: AppColors.textPrimary,
    marginBottom: 14,
  },
  modalBtnRow: { flexDirection: 'row', gap: 10 },
  modalCancelBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: AppColors.border,
    alignItems: 'center',
  },
  modalCancelText: { color: AppColors.textSecondary, fontWeight: '700' },
  modalSubmitBtn: {
    flex: 1,
    backgroundColor: AppColors.primary,
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalSubmitText: { color: AppColors.white, fontWeight: '700' },
  inputLabel: { fontSize: 13, fontWeight: '700', color: AppColors.textPrimary, marginBottom: 8 },
  modalTextInput: {
    backgroundColor: AppColors.background,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: AppColors.border,
    padding: 12,
    fontSize: 13,
    color: AppColors.textPrimary,
    minHeight: 80,
    textAlignVertical: 'top',
  },
  disabledBtn: { opacity: 0.5 },
  cardHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 12,
  },
  changeDeptBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#EFF6FF',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#BFDBFE',
  },
  changeDeptBtnText: {
    fontSize: 12,
    fontWeight: '700',
    color: AppColors.primary,
  },
  deptStatusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 10,
  },
  deptBadgeLarge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    maxWidth: '100%',
    flexShrink: 1,
  },
  deptBadgeLargeMoved: {
    backgroundColor: '#F0F9FF',
    borderWidth: 1,
    borderColor: '#BAE6FD',
  },
  deptBadgeLargeDirect: {
    backgroundColor: '#F3F4F6',
    borderWidth: 1,
    borderColor: AppColors.border,
  },
  deptBadgeLargeText: {
    fontSize: 13,
    fontWeight: '700',
    color: AppColors.textPrimary,
    flexShrink: 1,
  },
  deptBadgeLargeTextMoved: {
    color: '#0369A1',
  },
  routingTag: {
    backgroundColor: '#EFF6FF',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    maxWidth: '100%',
  },
  routingTagText: {
    fontSize: 11,
    fontWeight: '600',
    color: AppColors.primary,
    flexShrink: 1,
  },
  divider: {
    height: 1,
    backgroundColor: AppColors.border,
    marginVertical: 10,
  },
  deptDetailItem: {
    marginBottom: 8,
  },
  infoLabel: {
    fontSize: 11,
    color: AppColors.textSecondary,
    textTransform: 'uppercase',
  },
  infoValue: {
    fontSize: 13,
    fontWeight: '600',
    color: AppColors.textPrimary,
    marginTop: 2,
  },
  deptExplanationBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    backgroundColor: '#F0F9FF',
    padding: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#BAE6FD',
    marginBottom: 10,
  },
  deptExplanationText: {
    flex: 1,
    fontSize: 12,
    color: '#0C4A6E',
    lineHeight: 16,
  },
  remarksBox: {
    backgroundColor: '#F8FAFC',
    borderRadius: 8,
    padding: 10,
    borderWidth: 1,
    borderColor: AppColors.border,
    marginBottom: 8,
  },
  remarksLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: AppColors.textSecondary,
  },
  remarksText: {
    fontSize: 12,
    color: AppColors.textPrimary,
    marginTop: 2,
  },
  infoSubtext: {
    fontSize: 10,
    color: AppColors.placeholder,
    marginTop: 4,
  },
  deptSelectItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 12,
    backgroundColor: AppColors.background,
    borderRadius: 10,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: AppColors.border,
  },
  deptSelectItemActive: {
    backgroundColor: '#EFF6FF',
    borderColor: AppColors.primary,
  },
  deptSelectLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flex: 1,
  },
  deptSelectName: {
    fontSize: 14,
    fontWeight: '700',
    color: AppColors.textPrimary,
  },
  deptSelectNameActive: {
    color: AppColors.primary,
  },
  deptSelectLabel: {
    fontSize: 11,
    color: AppColors.textSecondary,
    marginTop: 1,
  },
  radioCircle: {
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 2,
    borderColor: AppColors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioCircleSelected: {
    borderColor: AppColors.primary,
  },
  radioDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: AppColors.primary,
  },
  referenceBanner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    backgroundColor: '#F0F9FF',
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#BAE6FD',
    marginTop: 10,
  },
  referenceBannerText: {
    flex: 1,
    fontSize: 13,
    color: '#0369A1',
    lineHeight: 18,
    fontWeight: '500',
  },
  aiAccuracyRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: 8,
    marginTop: 8,
    marginBottom: 8,
  },
  aiAccuracyBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#ECFDF5',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#A7F3D0',
  },
  aiAccuracyBadgeText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#065F46',
  },
  keywordChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#F0F9FF',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#BAE6FD',
  },
  keywordChipText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#0369A1',
  },
  fieldVerificationCard: {
    borderColor: '#99F6E4',
    borderWidth: 1.5,
  },
  verifiedSuccessBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: '#ECFDF5',
    padding: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#A7F3D0',
    marginVertical: 10,
  },
  verifiedSuccessTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#065F46',
  },
  verifiedSuccessSub: {
    fontSize: 11,
    color: '#047857',
    marginTop: 2,
  },
  transferredBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: '#F0F9FF',
    padding: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#BAE6FD',
    marginVertical: 10,
  },
  transferredTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#0369A1',
  },
  transferredSub: {
    fontSize: 11,
    color: '#0284C7',
    marginTop: 2,
  },
  pendingVerifyBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: '#FFFBEB',
    padding: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#FDE68A',
    marginVertical: 10,
  },
  pendingVerifyTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#92400E',
  },
  pendingVerifySub: {
    fontSize: 11,
    color: '#B45309',
    marginTop: 2,
  },
  verificationNotesBox: {
    backgroundColor: '#F8FAFC',
    borderRadius: 8,
    padding: 10,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    marginTop: 10,
  },
  verificationBtnGroup: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 14,
  },
  verifyConfirmBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: '#047857',
    paddingVertical: 12,
    paddingHorizontal: 8,
    borderRadius: 10,
  },
  verifyConfirmBtnText: {
    fontSize: 12,
    fontWeight: '700',
    color: AppColors.white,
  },
  verifyTransferBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: '#F0F9FF',
    paddingVertical: 12,
    paddingHorizontal: 8,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#BAE6FD',
  },
  verifyTransferBtnText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#0369A1',
  },
  detailedInspectionLinkBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    marginTop: 8,
  },
  detailedInspectionLinkText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#0D9488',
  },
  inspectorDetailInnerBox: {
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#E2E8F0',
  },
  innerSectionTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: AppColors.textSecondary,
    textTransform: 'uppercase',
    marginBottom: 8,
    letterSpacing: 0.3,
  },
  verificationConfirmSummaryBox: {
    backgroundColor: '#F0FDF4',
    padding: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#BBF7D0',
    marginBottom: 14,
    gap: 6,
  },
  summaryItemRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  summaryItemLabel: {
    fontSize: 12,
    color: '#065F46',
    fontWeight: '600',
  },
  summaryItemValue: {
    fontSize: 13,
    color: '#047857',
    fontWeight: '800',
  },
  transferCurrentDeptBox: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#F1F5F9',
    padding: 10,
    borderRadius: 8,
    marginBottom: 8,
  },
  transferCurrentLabel: {
    fontSize: 12,
    color: AppColors.textSecondary,
    fontWeight: '600',
  },
  transferCurrentValue: {
    fontSize: 12,
    color: AppColors.textPrimary,
    fontWeight: '700',
  },
  mismatchAlertBanner: {
    backgroundColor: '#FEF2F2',
    borderColor: '#FCA5A5',
    borderWidth: 1.5,
    borderRadius: 12,
    padding: 14,
    marginBottom: 14,
  },
  mismatchAlertHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 6,
  },
  mismatchAlertTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#DC2626',
  },
  mismatchAlertText: {
    fontSize: 13,
    color: '#7F1D1D',
    lineHeight: 18,
    marginBottom: 6,
  },
  mismatchAlertReason: {
    fontSize: 12,
    color: '#991B1B',
    fontStyle: 'italic',
    marginBottom: 8,
  },
  mismatchAlertBadge: {
    alignSelf: 'flex-start',
    backgroundColor: '#FEE2E2',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#FECACA',
  },
  mismatchAlertBadgeText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#B91C1C',
    letterSpacing: 0.5,
  },
  inactiveWorkflowBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: '#F3F4F6',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 12,
    padding: 14,
    marginVertical: 12,
  },
  inactiveWorkflowText: {
    flex: 1,
    fontSize: 13,
    fontWeight: '600',
    color: '#6B7280',
    lineHeight: 18,
  },
});
