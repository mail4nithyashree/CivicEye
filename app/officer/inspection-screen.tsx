import {
  ALL_COIMBATORE_REGIONS,
  autoSplitBudget,
  getResolutionTimeRecommendation,
  getRoadsByRegion,
  getStandardEstimatedBudget,
  SECONDARY_DEPARTMENTS,
  type CoimbatoreRegion,
  type RoadRecord,
} from '@/constants/coimbatoreRoads';
import PracticalBudgetBreakdownCard from '@/components/PracticalBudgetBreakdownCard';
import ImageEditorModal from '@/components/ImageEditorModal';
import CivicImage from '@/components/CivicImage';
import { AppColors } from '@/constants/colors';
import { auth } from '@/firebaseConfig';
import {
  rejectComplaintByInspector,
  submitFieldVerification,
  subscribeToComplaint,
  uploadComplaintImage,
  requestClarificationByInspector,
  closeComplaintByInspector,
  type Complaint,
} from '@/services/complaintService';
import { type DetectedIssueType } from '@/services/detectionConfig';
import { formatDisplayIssueName } from '@/services/predictionContract';
import { createNotification } from '@/services/notificationService';
import { subscribeToOfficerProfile, type Officer } from '@/services/officerService';
import { useAppTheme } from '@/context/ThemeContext';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { useLocalSearchParams, useRootNavigationState, useRouter } from 'expo-router';
import { onAuthStateChanged, type User } from 'firebase/auth';
import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  Linking,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

const REJECTION_PRESETS = [
  'No road damage or defect found at specified location',
  'Duplicate complaint (Already recorded in maintenance schedule)',
  'Damage is on private property (Outside municipal road maintenance)',
  'Normal road texture / Minor surface wear within safe threshold',
  'Temporary utility/construction work in progress with permit',
  'Uploaded image is fake, unrelated, or does not match location',
  'Other (Specify custom reason)',
];

const CLOSURE_OUTCOMES = [
  'No Major Repair Required',
  'Minor Issue Resolved on Site',
  'Routine Pavement Wear (Monitored)',
  'Addressed in Ongoing Project',
  'Duplicate / Administrative Closure',
];

function PriorityBadge({ priority }: { priority: string }) {
  const cfg: Record<string, { bg: string; text: string }> = {
    HIGH:   { bg: '#FEF2F2', text: AppColors.error },
    MEDIUM: { bg: '#FFF7ED', text: '#C2410C' },
    LOW:    { bg: '#F0FDF4', text: AppColors.success },
  };
  const c = cfg[priority?.toUpperCase()] ?? cfg['LOW'];
  return (
    <View style={[priorityStyles.badge, { backgroundColor: c.bg }]}>
      <Text style={[priorityStyles.text, { color: c.text }]}>{(priority || 'LOW').toUpperCase()}</Text>
    </View>
  );
}

const priorityStyles = StyleSheet.create({
  badge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  text: {
    fontSize: 11,
    fontWeight: '800',
  },
});

const ISSUE_OPTIONS: { key: DetectedIssueType; label: string }[] = [
  { key: 'pothole', label: 'Pothole' },
  { key: 'road divider damage', label: 'Road Divider / Median Damage' },
  { key: 'street light fault', label: 'Street Light Fault / Damaged Pole' },
  { key: 'manhole defect', label: 'Damaged / Open Manhole Chamber' },
  { key: 'waterlogging', label: 'Waterlogging / Drainage Choke' },
  { key: 'cracking', label: 'Cracking (Linear/Transverse)' },
  { key: 'alligator cracking', label: 'Alligator Cracking (Base Failure)' },
  { key: 'debris / road blockage', label: 'Debris / Road Obstruction' },
  { key: 'missing signage', label: 'Missing / Damaged Traffic Signage' },
  { key: 'no_major_issue', label: 'No Major Issue' },
];

const SEVERITY_OPTIONS: ('LOW' | 'MEDIUM' | 'HIGH')[] = ['LOW', 'MEDIUM', 'HIGH'];

export default function InspectionScreen() {
  const router = useRouter();
  const { colors, isDark } = useAppTheme();
  const rootNavigationState = useRootNavigationState();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [user, setUser] = useState<User | null>(auth.currentUser);
  const [officer, setOfficer] = useState<Officer | null>(null);
  const [complaint, setComplaint] = useState<Complaint | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [submittingStatusText, setSubmittingStatusText] = useState('');

  // Decision State: genuine vs clarification vs no_repair vs fake
  type InspectionDecision = 'genuine' | 'clarification' | 'no_repair' | 'fake';
  const [decision, setDecision] = useState<InspectionDecision>('genuine');

  // Clarification states
  const [clarificationQuestion, setClarificationQuestion] = useState('');

  // No repair / Closure states
  const [closureOutcome, setClosureOutcome] = useState('No Major Repair Required');
  const [closureReason, setClosureReason] = useState('');

  // Field Verification Form States
  const [verifiedIssue, setVerifiedIssue] = useState<DetectedIssueType>('pothole');
  const [severity, setSeverity] = useState<'LOW' | 'MEDIUM' | 'HIGH'>('MEDIUM');
  const [resolutionDays, setResolutionDays] = useState<number>(3);
  const [estimatedBudget, setEstimatedBudget] = useState<string>('25000');
  const [selectedRegion, setSelectedRegion] = useState<CoimbatoreRegion>('Gandhipuram');
  const [selectedRoad, setSelectedRoad] = useState<RoadRecord | null>(null);
  const [customRoadName, setCustomRoadName] = useState('');
  const [customMaintenanceAuthority, setCustomMaintenanceAuthority] = useState('Coimbatore City Municipal Corporation (CCMC)');
  const [inspectorRemarks, setInspectorRemarks] = useState('');

  // Evidence photo
  const [evidenceUri, setEvidenceUri] = useState<string | null>(null);
  const [rawPickedUri, setRawPickedUri] = useState<string | null>(null);
  const [editorVisible, setEditorVisible] = useState(false);

  // Multi-department involvement
  const [isOtherDeptInvolved, setIsOtherDeptInvolved] = useState(false);
  const [selectedDepts, setSelectedDepts] = useState<string[]>([]);
  const [otherDeptReason, setOtherDeptReason] = useState('');

  // Rejection Modal State
  const [showRejectModal, setShowRejectModal] = useState(false);
  const [selectedPresetReason, setSelectedPresetReason] = useState(REJECTION_PRESETS[0]);
  const [customRejectReason, setCustomRejectReason] = useState('');

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

  // 2. Profile Guard
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
            name: email.split('@')[0] || 'Field Inspector',
            role: 'field_inspector',
            department: 'Road Maintenance',
            active: true,
          });
          return;
        }
        if (profile.role === 'citizen') {
          setTimeout(() => {
            if (isMounted) router.replace('/(tabs)');
          }, 0);
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
          name: email.split('@')[0] || 'Field Inspector',
          role: 'field_inspector',
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
        if (data) {
          setComplaint(data);
          const initialIssue = (data.issueType as DetectedIssueType) || 'pothole';
          if (initialIssue) {
            setVerifiedIssue(initialIssue);
          }
          const initialSev = (data.priority?.toUpperCase() as any) || 'MEDIUM';
          const validatedSev: 'LOW' | 'MEDIUM' | 'HIGH' = ['LOW', 'MEDIUM', 'HIGH'].includes(initialSev) ? initialSev : 'MEDIUM';
          setSeverity(validatedSev);
          const rec = getResolutionTimeRecommendation(validatedSev);
          setResolutionDays(rec.suggestedDays);

          if (data.inspectionDetails?.estimatedBudget) {
            setEstimatedBudget(String(data.inspectionDetails.estimatedBudget));
          } else if (data.estimatedBudget) {
            setEstimatedBudget(String(data.estimatedBudget));
          } else {
            const std = getStandardEstimatedBudget(initialIssue, validatedSev);
            setEstimatedBudget(String(std.budget));
          }
          const reg = (data.region as CoimbatoreRegion) || 'Gandhipuram';
          setSelectedRegion(reg);
          const roads = getRoadsByRegion(reg);
          if (roads.length > 0) {
            setSelectedRoad(roads[0]);
            setCustomRoadName(roads[0].roadName);
            setCustomMaintenanceAuthority(roads[0].maintainedBy);
          }
          if (data.inspectorRemarks) {
            setInspectorRemarks(data.inspectorRemarks);
          }
          if (data.inspectionEvidenceUrl) {
            setEvidenceUri(data.inspectionEvidenceUrl);
          }
          if (data.status === 'Rejected' || data.inspectionStatus === 'INVALID') {
            setDecision('fake');
          } else {
            setDecision('genuine');
          }
        }
        setLoading(false);
      },
      err => {
        console.error('Error loading complaint in inspection-screen:', err);
        setLoading(false);
      }
    );
    return unsub;
  }, [id]);

  // Adjust recommended resolution time and budget when severity changes
  const handleSeverityChange = (newSev: 'LOW' | 'MEDIUM' | 'HIGH') => {
    setSeverity(newSev);
    const rec = getResolutionTimeRecommendation(newSev);
    setResolutionDays(rec.suggestedDays);
    const std = getStandardEstimatedBudget(verifiedIssue, newSev);
    setEstimatedBudget(String(std.budget));
  };

  // Adjust budget when issue type changes
  const handleIssueChange = (newIssue: DetectedIssueType) => {
    setVerifiedIssue(newIssue);
    const std = getStandardEstimatedBudget(newIssue, severity);
    setEstimatedBudget(String(std.budget));
  };

  const handleRegionChange = (newRegion: CoimbatoreRegion) => {
    setSelectedRegion(newRegion);
    const roads = getRoadsByRegion(newRegion);
    if (roads.length > 0) {
      setSelectedRoad(roads[0]);
      setCustomRoadName(roads[0].roadName);
      setCustomMaintenanceAuthority(roads[0].maintainedBy);
    }
  };

  const handleToggleSecondaryDept = (deptName: string) => {
    if (selectedDepts.includes(deptName)) {
      setSelectedDepts(selectedDepts.filter(d => d !== deptName));
    } else {
      setSelectedDepts([...selectedDepts, deptName]);
    }
  };

  // Maps navigation
  const handleOpenInMaps = () => {
    if (!complaint) return;
    const { latitude, longitude } = complaint;
    const scheme = Platform.select({ ios: 'maps:0,0?q=', android: 'geo:0,0?q=' });
    const latLng = `${latitude},${longitude}`;
    const label = `CivicEye Complaint #${complaint.complaintId}`;
    const url = Platform.select({
      ios: `${scheme}${label}@${latLng}`,
      android: `${scheme}${latLng}(${label})`,
      default: `https://www.google.com/maps/search/?api=1&query=${latitude},${longitude}`,
    });

    Linking.openURL(url!).catch(() => {
      Linking.openURL(`https://www.google.com/maps/search/?api=1&query=${latitude},${longitude}`);
    });
  };

  // Image capture / picker with CivicEye in-app editor & DONE button
  const handleCapturePhoto = async () => {
    try {
      const { status } = await ImagePicker.requestCameraPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Camera Permission Required', 'Please enable camera permissions in your settings to take inspection photos.');
        return;
      }
      const result = await ImagePicker.launchCameraAsync({
        quality: 0.9,
        allowsEditing: false, // In-app CivicEye Image Editor with "DONE" action is used
      });
      if (!result.canceled && result.assets?.[0]?.uri) {
        setRawPickedUri(result.assets[0].uri);
        setEditorVisible(true);
      }
    } catch (error) {
      console.error('Error capturing evidence photo:', error);
      Alert.alert('Camera Error', 'Could not open camera. Please try again or select from gallery.');
    }
  };

  const handlePickPhoto = async () => {
    try {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Gallery Permission Required', 'Please enable photo library access to choose evidence photos.');
        return;
      }
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        quality: 0.9,
        allowsEditing: false, // In-app CivicEye Image Editor with "DONE" action is used
      });
      if (!result.canceled && result.assets?.[0]?.uri) {
        setRawPickedUri(result.assets[0].uri);
        setEditorVisible(true);
      }
    } catch (error) {
      console.error('Error picking evidence photo:', error);
      Alert.alert('Photo Error', 'Could not select photo. Please try again.');
    }
  };

  // Submit Verification Handler
  const handleConfirmVerification = async () => {
    if (!complaint || !user || !officer) return;

    if (decision === 'fake') {
      setShowRejectModal(true);
      return;
    }

    if (!inspectorRemarks.trim()) {
      Alert.alert('Remarks Required', 'Please enter your on-site physical inspection observations.');
      return;
    }

    const budgetNum = parseFloat(estimatedBudget) || 0;
    const finalRoadName = selectedRoad?.roadName || customRoadName || 'Coimbatore Sector Road';
    const finalAuthority = selectedRoad?.maintainedBy || customMaintenanceAuthority || 'Coimbatore City Municipal Corporation (CCMC)';
    const finalDept = selectedRoad?.department || 'Roads & Infrastructure Department';

    Alert.alert(
      'Confirm Field Verification',
      `Verify defect as ${verifiedIssue.toUpperCase()} (${severity} Severity)?\n\n• Road: ${finalRoadName}\n• Maintained by: ${finalAuthority}\n• Est. Resolution: ${resolutionDays} Days\n• Est. Budget: ₹${budgetNum.toLocaleString('en-IN')}`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Confirm & Submit',
          onPress: async () => {
            setSubmitting(true);
            setSubmittingStatusText('Uploading evidence & updating Firestore...');
            try {
              let uploadedEvidenceUrl: string | undefined = undefined;
              if (evidenceUri && !evidenceUri.startsWith('http')) {
                try {
                  uploadedEvidenceUrl = await uploadComplaintImage(evidenceUri);
                } catch (uploadErr) {
                  console.warn('Evidence photo upload failed:', uploadErr);
                }
              } else if (evidenceUri && evidenceUri.startsWith('http')) {
                uploadedEvidenceUrl = evidenceUri;
              }

              const practicalBudget = autoSplitBudget(budgetNum, verifiedIssue, severity);

              await submitFieldVerification(complaint.id, {
                inspectorId: user.uid,
                inspectorName: officer.name,
                verifiedIssue,
                severity,
                estimatedResolutionDays: resolutionDays,
                estimatedBudget: budgetNum,
                budgetBreakdown: practicalBudget,
                roadId: selectedRoad?.roadId,
                roadName: finalRoadName,
                roadType: selectedRoad?.roadType || 'Major Arterial',
                region: selectedRegion,
                maintenanceAuthority: finalAuthority,
                departmentName: finalDept,
                officerName: selectedRoad?.officer,
                officerContact: selectedRoad?.contact,
                isOtherDeptInvolved,
                involvedDepartments: isOtherDeptInvolved ? selectedDepts : [],
                otherDeptReason: isOtherDeptInvolved ? otherDeptReason : undefined,
                inspectorRemarks: inspectorRemarks.trim(),
                evidenceUrl: uploadedEvidenceUrl,
              });

              // Notification broadcasts (wrapped safely)
              try {
                // Notification to Admin
                await createNotification({
                  recipientRole: 'admin',
                  complaintId: complaint.id,
                  title: 'Field Verification Completed',
                  message: `Inspector ${officer.name} verified #${complaint.complaintId} in ${selectedRegion} (${verifiedIssue.toUpperCase()}). Est: ${resolutionDays} days, ₹${budgetNum.toLocaleString('en-IN')}. Authority: ${finalAuthority}`,
                  type: 'field_verified',
                });

                // Notification to Citizen
                await createNotification({
                  userId: complaint.citizenId,
                  recipientRole: 'citizen',
                  complaintId: complaint.id,
                  title: 'Complaint Verified & Approved by Field Inspector',
                  message: `Field Inspector ${officer.name} verified your complaint #${complaint.complaintId}. Estimated Budget: ₹${budgetNum.toLocaleString('en-IN')}. Observation: "${inspectorRemarks.trim()}". Forwarded to ${finalAuthority} for repair execution.`,
                  type: 'field_verified',
                });

                // Alert to Secondary / Other Department if involved & Notify Citizen
                if (isOtherDeptInvolved && selectedDepts.length > 0) {
                  for (const deptName of selectedDepts) {
                    await createNotification({
                      userId: complaint.citizenId,
                      recipientRole: 'citizen',
                      complaintId: complaint.id,
                      title: 'Other Department Involvement',
                      message: `There is involvement of the ${deptName} Department in your reported issue.`,
                      type: 'multi_dept_alert',
                    });
                  }

                  await createNotification({
                    recipientRole: 'authority',
                    complaintId: complaint.id,
                    title: 'Multi-Department Involvement Alert',
                    message: `Road defect #${complaint.complaintId} in ${selectedRegion} on ${finalRoadName} requires coordination with: ${selectedDepts.join(', ')}. Reason: ${otherDeptReason || 'Road pavement restoration after utility work'}`,
                    type: 'multi_dept_alert',
                  });
                }
              } catch (notifErr) {
                console.warn('[inspectionScreen] Notification broadcast error (handled gracefully):', notifErr);
              }

              Alert.alert('Verification Submitted', 'Complaint verified and forwarded to Main Officer & Authority queue.', [
                { text: 'OK', onPress: () => router.back() },
              ]);
            } catch (error) {
              console.error('Error submitting verification:', error);
              Alert.alert('Verification Error', 'Failed to submit verification. Please try again.');
            } finally {
              setSubmitting(false);
              setSubmittingStatusText('');
            }
          },
        },
      ]
    );
  };

  // Rejection Handler
  const handleRejectComplaint = async () => {
    if (!complaint || !user || !officer) return;

    let reason = selectedPresetReason;
    if (selectedPresetReason.startsWith('Other') && customRejectReason.trim()) {
      reason = customRejectReason.trim();
    }

    setSubmitting(true);
    setSubmittingStatusText('Submitting rejection to Firestore...');
    try {
      let uploadedEvidenceUrl: string | undefined = undefined;
      if (evidenceUri && !evidenceUri.startsWith('http')) {
        try {
          uploadedEvidenceUrl = await uploadComplaintImage(evidenceUri);
        } catch (uploadErr) {
          console.warn('Evidence photo upload failed:', uploadErr);
        }
      } else if (evidenceUri && evidenceUri.startsWith('http')) {
        uploadedEvidenceUrl = evidenceUri;
      }

      await rejectComplaintByInspector(
        complaint.id,
        user.uid,
        officer.name,
        reason,
        inspectorRemarks.trim(),
        uploadedEvidenceUrl
      );

      // Notify citizen safely
      try {
        await createNotification({
          userId: complaint.citizenId,
          recipientRole: 'citizen',
          complaintId: complaint.id,
          title: 'Complaint Rejected by Field Inspector',
          message: `Your complaint #${complaint.complaintId} was reviewed on-site by Field Inspector ${officer.name} and rejected as not genuine. Clarification: "${reason}".${inspectorRemarks.trim() ? ` Observation: "${inspectorRemarks.trim()}"` : ''}`,
          type: 'complaint_rejected',
        });
      } catch (notifErr) {
        console.warn('[inspectionScreen] Rejection notification broadcast error:', notifErr);
      }

      setShowRejectModal(false);
      Alert.alert('Complaint Rejected', 'Complaint marked as Rejected and closed.', [
        { text: 'OK', onPress: () => router.back() },
      ]);
    } catch (error) {
      console.error('Error rejecting complaint:', error);
      Alert.alert('Rejection Error', 'Failed to reject complaint.');
    } finally {
      setSubmitting(false);
      setSubmittingStatusText('');
    }
  };

  // Clarification Request Handler
  const handleRequestClarification = async () => {
    if (!complaint || !user || !officer) return;
    if (!clarificationQuestion.trim()) {
      Alert.alert('Required', 'Please enter a clear clarification question for the citizen.');
      return;
    }
    setSubmitting(true);
    setSubmittingStatusText('Dispatching clarification request...');
    try {
      await requestClarificationByInspector(
        complaint.id,
        user.uid,
        officer.name,
        clarificationQuestion.trim(),
        inspectorRemarks.trim() || undefined
      );
      Alert.alert('Clarification Dispatched', 'Clarification requested. The citizen has been notified via in-app alert and email.', [
        { text: 'OK', onPress: () => router.back() },
      ]);
    } catch (err: any) {
      Alert.alert('Clarification Error', err?.message || 'Failed to dispatch clarification request.');
    } finally {
      setSubmitting(false);
      setSubmittingStatusText('');
    }
  };

  // Minor / No Repair Closure Handler
  const handleCloseNoRepair = async () => {
    if (!complaint || !user || !officer) return;
    const finalReason = closureReason.trim() || inspectorRemarks.trim();
    if (!finalReason) {
      Alert.alert('Required', 'Please record your on-site inspection findings or reason for closing without major repair.');
      return;
    }
    setSubmitting(true);
    setSubmittingStatusText('Closing complaint in records...');
    try {
      await closeComplaintByInspector(
        complaint.id,
        user.uid,
        officer.name,
        finalReason,
        closureOutcome,
        inspectorRemarks.trim() || undefined
      );
      Alert.alert('Complaint Closed', `Complaint has been officially closed: [${closureOutcome}]. Citizen has been notified.`, [
        { text: 'OK', onPress: () => router.back() },
      ]);
    } catch (err: any) {
      Alert.alert('Closure Error', err?.message || 'Failed to close complaint.');
    } finally {
      setSubmitting(false);
      setSubmittingStatusText('');
    }
  };

  if (loading || !officer) {
    return (
      <SafeAreaView style={[styles.centered, { backgroundColor: colors.background }]}>
        <ActivityIndicator size="large" color={colors.buttonPrimary} />
        <Text style={[styles.loadingText, { color: colors.textOnDarkSecondary }]}>Loading Inspection Details…</Text>
      </SafeAreaView>
    );
  }

  if (!complaint) {
    return (
      <SafeAreaView style={[styles.centered, { backgroundColor: colors.background }]}>
        <Ionicons name="alert-circle-outline" size={48} color={AppColors.error} />
        <Text style={[styles.errorText, { color: colors.textOnDark }]}>Complaint not found.</Text>
        <TouchableOpacity onPress={() => router.back()} style={[styles.backBtn, { backgroundColor: colors.buttonPrimary }]}>
          <Text style={styles.backBtnText}>Return</Text>
        </TouchableOpacity>
      </SafeAreaView>
    );
  }

  // Guard: If complaint rejected due to Dissimilar/Invalid Image, block inspection
  if (
    complaint.status === 'Invalid Issue image, raise the complaint with the appropriate image!' ||
    complaint.status === 'Dissimilar Image to the Issue' ||
    complaint.rejectionType === 'IMAGE_MISMATCH' ||
    complaint.rejectionType === 'INVALID_IMAGE' ||
    complaint.inspectionStatus === 'INVALID'
  ) {
    return (
      <SafeAreaView style={[styles.centered, { backgroundColor: colors.background }]}>
        <View style={styles.accessDeniedIconBox}>
          <Ionicons name="ban" size={48} color={AppColors.error} />
        </View>
        <Text style={styles.accessDeniedTitle}>Complaint Inactive</Text>
        <Text style={[styles.accessDeniedText, { color: colors.textOnDarkSecondary }]}>
          This complaint was rejected: Invalid Issue image, raise the complaint with the appropriate image! It is inactive and cannot undergo field inspection.
        </Text>
        <TouchableOpacity onPress={() => router.back()} style={[styles.backButton, { backgroundColor: colors.buttonPrimary }]}>
          <Text style={styles.backButtonText}>Return to Dashboard</Text>
        </TouchableOpacity>
      </SafeAreaView>
    );
  }

  // Guard: If field inspector, must be assigned to them
  if (
    officer.role === 'field_inspector' &&
    complaint.assignedInspectorId &&
    complaint.assignedInspectorId !== user?.uid
  ) {
    return (
      <SafeAreaView style={[styles.centered, { backgroundColor: colors.background }]}>
        <View style={styles.accessDeniedIconBox}>
          <Ionicons name="lock-closed" size={48} color={AppColors.error} />
        </View>
        <Text style={styles.accessDeniedTitle}>Access Denied</Text>
        <Text style={[styles.accessDeniedText, { color: colors.textOnDarkSecondary }]}>
          This complaint is assigned to {complaint.assignedInspectorName || 'another inspector'}. You can only inspect complaints assigned to you.
        </Text>
        <TouchableOpacity onPress={() => router.back()} style={[styles.backButton, { backgroundColor: colors.buttonPrimary }]}>
          <Text style={styles.backButtonText}>Return to My Dashboard</Text>
        </TouchableOpacity>
      </SafeAreaView>
    );
  }

  const roadsInRegion = getRoadsByRegion(selectedRegion);
  const priority = (complaint.priority || complaint.severity || 'MEDIUM').toUpperCase();

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]}>
      {/* Header */}
      <View style={[styles.header, { backgroundColor: colors.background, borderBottomColor: colors.border }]}>
        <TouchableOpacity onPress={() => router.back()} accessibilityRole="button" accessibilityLabel="Back">
          <Ionicons name="arrow-back" size={24} color={colors.textOnDark} />
        </TouchableOpacity>
        <View style={{ alignItems: 'center' }}>
          <Text style={[styles.headerTitle, { color: colors.textOnDark }]}>Field Inspector Verification</Text>
          <Text style={[styles.headerSub, { color: colors.textOnDarkSecondary }]}>{complaint.complaintId} • {complaint.region || selectedRegion}</Text>
        </View>
        <View style={{ width: 24 }} />
      </View>

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        {/* On-Site Verification Protocol Banner */}
        <View style={[styles.instructionBanner, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Ionicons name="shield-checkmark-outline" size={22} color={colors.buttonPrimary} />
          <View style={{ flex: 1 }}>
            <Text style={[styles.instructionBannerTitle, { color: colors.buttonPrimary }]}>On-Site Verification Protocol</Text>
            <Text style={[styles.instructionBannerText, { color: colors.textPrimary }]}>
              Inspect the road surface and physical condition. Record whether this issue is genuine or invalid.
            </Text>
          </View>
        </View>

        {/* Uploaded Image Preview */}
        <View style={styles.imageCard}>
          <CivicImage
            uri={complaint.imageUri}
            issueType={complaint.issueType}
            style={styles.image}
            resizeMode="cover"
          />
          <View style={styles.imageOverlayBadge}>
            <Text style={styles.imageOverlayText}>Citizen Photo</Text>
          </View>
        </View>

        {/* AI Initial vs Physical Inspector Header */}
        <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <View style={styles.cardHeaderRow}>
            <Text style={[styles.issueType, { color: colors.textPrimary }]}>{complaint.displayIssueName || formatDisplayIssueName(complaint.issueType)}</Text>
            <View style={styles.badgeRow}>
              <PriorityBadge priority={priority} />
              <Text style={styles.confidenceBadge}>
                {Math.round(complaint.confidence > 0 && complaint.confidence <= 1 ? complaint.confidence * 100 : (complaint.confidence || 0))}% AI
              </Text>
            </View>
          </View>
          {complaint.priorityReason ? (
            <View style={{ marginVertical: 6, padding: 6, backgroundColor: colors.surfaceElevated, borderRadius: 6, borderWidth: 1, borderColor: colors.borderLight }}>
              <Text style={{ fontSize: 11, color: colors.textSecondary, fontWeight: '600' }}>
                Priority Reason: <Text style={{ color: colors.textPrimary, fontWeight: '500' }}>{complaint.priorityReason}</Text>
              </Text>
            </View>
          ) : null}
          <Text style={[styles.deptText, { color: colors.buttonPrimary }]}>Department: {complaint.department || complaint.responsibleDepartment || 'Road Maintenance'}</Text>
          <Text style={[styles.description, { color: colors.textPrimary }]}>{complaint.description || 'No description provided by citizen.'}</Text>
          <View style={styles.citizenMetaRow}>
            <Ionicons name="location-outline" size={14} color={colors.textSecondary} />
            <Text style={[styles.citizenMetaText, { color: colors.textSecondary }]}>GPS: {complaint.latitude?.toFixed(5)}, {complaint.longitude?.toFixed(5)}</Text>
          </View>
        </View>

        {/* Department Info Card */}
        <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <View style={styles.cardHeaderRow}>
            <View style={{ flex: 1 }}>
              <Text style={[styles.cardSectionTitle, { color: colors.textPrimary }]}>Assigned Department</Text>
              <Text style={[styles.deptCurrentName, { color: colors.textPrimary }]}>{complaint.department || complaint.responsibleDepartment || 'Road Maintenance'}</Text>
            </View>
          </View>

          <View style={styles.routingInfoRow}>
            <View style={[
              styles.routingStatusBadge,
              complaint.routingStatus === 'Moved' ? styles.routingStatusBadgeMoved : styles.routingStatusBadgeDirect
            ]}>
              <Text style={[
                styles.routingStatusBadgeText,
                complaint.routingStatus === 'Moved' ? styles.routingStatusBadgeTextMoved : {}
              ]}>
                {complaint.routingStatus === 'Moved' ? 'Moved to Department' : 'Direct Routing'}
              </Text>
            </View>
            {complaint.originalDepartment && complaint.originalDepartment !== complaint.department ? (
              <Text style={styles.routingFromText}>From: {complaint.originalDepartment}</Text>
            ) : null}
          </View>

          {complaint.departmentExplanation ? (
            <View style={styles.deptExplanationBox}>
              <Ionicons name="information-circle-outline" size={16} color="#0369A1" />
              <Text style={styles.deptExplanationText}>
                {complaint.departmentExplanation}
              </Text>
            </View>
          ) : null}
        </View>

        {/* Location & Maps Navigation */}
        <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <View style={styles.locationInfoRow}>
            <View style={[styles.locationIconBox, { backgroundColor: colors.surfaceElevated }]}>
              <Ionicons name="navigate" size={22} color={colors.buttonPrimary} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.locationLabel, { color: colors.textSecondary }]}>Location Coordinates</Text>
              <Text style={[styles.locationCoordinates, { color: colors.textPrimary }]}>
                {complaint.latitude?.toFixed(6)}, {complaint.longitude?.toFixed(6)}
              </Text>
            </View>
          </View>

          <TouchableOpacity
            style={[styles.openMapBtn, { backgroundColor: colors.buttonPrimary }]}
            onPress={handleOpenInMaps}
            accessible
            accessibilityRole="button"
            accessibilityLabel="Open complaint location in Google Maps"
          >
            <Ionicons name="map-outline" size={18} color={AppColors.white} />
            <Text style={styles.openMapBtnText}>Open Location in Maps</Text>
            <Ionicons name="open-outline" size={16} color={AppColors.white} />
          </TouchableOpacity>
        </View>

        {/* Physical Condition Decision */}
        <View style={styles.sectionTitleRow}>
          <Ionicons name="checkbox-outline" size={18} color={colors.buttonPrimary} />
          <Text style={[styles.sectionHeaderTitle, { color: colors.textOnDark }]}>Actual Physical Condition *</Text>
        </View>

        <View style={styles.decisionRow}>
          <TouchableOpacity
            style={[
              styles.decisionCard,
              { backgroundColor: colors.card, borderColor: colors.border },
              decision === 'genuine' && styles.decisionCardGenuineSelected,
            ]}
            onPress={() => setDecision('genuine')}
            activeOpacity={0.8}
            accessible
            accessibilityRole="radio"
            accessibilityState={{ selected: decision === 'genuine' }}
          >
            <View
              style={[
                styles.decisionIconCircle,
                decision === 'genuine' && styles.decisionIconCircleGenuine,
              ]}
            >
              <Ionicons
                name="checkmark-circle"
                size={22}
                color={decision === 'genuine' ? AppColors.white : AppColors.success}
              />
            </View>
            <Text
              style={[
                styles.decisionTitle,
                { color: colors.textPrimary },
                decision === 'genuine' && styles.decisionTitleGenuine,
              ]}
            >
              Verify Issue
            </Text>
            <Text style={[styles.decisionSubtitle, { color: colors.textSecondary }]}>
              Verified for repair
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[
              styles.decisionCard,
              { backgroundColor: colors.card, borderColor: colors.border },
              decision === 'clarification' && styles.decisionCardClarifySelected,
            ]}
            onPress={() => setDecision('clarification')}
            activeOpacity={0.8}
            accessible
            accessibilityRole="radio"
            accessibilityState={{ selected: decision === 'clarification' }}
          >
            <View
              style={[
                styles.decisionIconCircle,
                decision === 'clarification' && styles.decisionIconCircleClarify,
              ]}
            >
              <Ionicons
                name="help-circle"
                size={22}
                color={decision === 'clarification' ? AppColors.white : '#D97706'}
              />
            </View>
            <Text
              style={[
                styles.decisionTitle,
                { color: colors.textPrimary },
                decision === 'clarification' && styles.decisionTitleClarify,
              ]}
            >
              Clarify
            </Text>
            <Text style={[styles.decisionSubtitle, { color: colors.textSecondary }]}>
              Ask citizen details
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[
              styles.decisionCard,
              { backgroundColor: colors.card, borderColor: colors.border },
              decision === 'no_repair' && styles.decisionCardNoRepairSelected,
            ]}
            onPress={() => setDecision('no_repair')}
            activeOpacity={0.8}
            accessible
            accessibilityRole="radio"
            accessibilityState={{ selected: decision === 'no_repair' }}
          >
            <View
              style={[
                styles.decisionIconCircle,
                decision === 'no_repair' && styles.decisionIconCircleNoRepair,
              ]}
            >
              <Ionicons
                name="shield-checkmark"
                size={22}
                color={decision === 'no_repair' ? AppColors.white : '#2563EB'}
              />
            </View>
            <Text
              style={[
                styles.decisionTitle,
                { color: colors.textPrimary },
                decision === 'no_repair' && styles.decisionTitleNoRepair,
              ]}
            >
              No Repair
            </Text>
            <Text style={[styles.decisionSubtitle, { color: colors.textSecondary }]}>
              Minor / Close
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[
              styles.decisionCard,
              { backgroundColor: colors.card, borderColor: colors.border },
              decision === 'fake' && styles.decisionCardFakeSelected,
            ]}
            onPress={() => setDecision('fake')}
            activeOpacity={0.8}
            accessible
            accessibilityRole="radio"
            accessibilityState={{ selected: decision === 'fake' }}
          >
            <View
              style={[
                styles.decisionIconCircle,
                decision === 'fake' && styles.decisionIconCircleFake,
              ]}
            >
              <Ionicons
                name="close-circle"
                size={22}
                color={decision === 'fake' ? AppColors.white : AppColors.error}
              />
            </View>
            <Text
              style={[
                styles.decisionTitle,
                { color: colors.textPrimary },
                decision === 'fake' && styles.decisionTitleFake,
              ]}
            >
              Fake / Invalid
            </Text>
            <Text style={[styles.decisionSubtitle, { color: colors.textSecondary }]}>
              Reject report
            </Text>
          </TouchableOpacity>
        </View>

        {decision === 'clarification' ? (
          <View style={[styles.card, { backgroundColor: colors.card, borderColor: '#F59E0B', borderWidth: 1.5 }]}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 }}>
              <Ionicons name="help-circle" size={20} color="#D97706" />
              <Text style={[styles.cardSectionTitle, { color: colors.textPrimary, marginBottom: 0 }]}>
                Clarification Request for Citizen *
              </Text>
            </View>
            <Text style={[styles.fieldSub, { color: colors.textSecondary }]}>
              Specify the exact clarification needed from the citizen (e.g., landmark, defect location, access details):
            </Text>
            <TextInput
              style={[styles.textInput, { minHeight: 70, backgroundColor: colors.surfaceElevated, color: colors.textPrimary, borderColor: colors.border, marginTop: 8 }]}
              placeholder="e.g. Please clarify exact landmark near bus stop or whether pothole is on left service lane..."
              placeholderTextColor={colors.textSecondary}
              multiline
              value={clarificationQuestion}
              onChangeText={setClarificationQuestion}
            />
          </View>
        ) : null}

        {decision === 'no_repair' ? (
          <View style={[styles.card, { backgroundColor: colors.card, borderColor: '#2563EB', borderWidth: 1.5 }]}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 }}>
              <Ionicons name="shield-checkmark" size={20} color="#2563EB" />
              <Text style={[styles.cardSectionTitle, { color: colors.textPrimary, marginBottom: 0 }]}>
                Minor / No Major Repair Required Findings *
              </Text>
            </View>
            <Text style={[styles.fieldSub, { color: colors.textSecondary }]}>
              Select the field assessment outcome justifying closure without major repair assignment:
            </Text>

            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginVertical: 10 }}>
              {CLOSURE_OUTCOMES.map(outcome => (
                <TouchableOpacity
                  key={outcome}
                  style={[
                    styles.optionChip,
                    { backgroundColor: colors.surfaceElevated, borderColor: colors.border },
                    closureOutcome === outcome && { backgroundColor: '#2563EB', borderColor: '#2563EB' },
                  ]}
                  onPress={() => setClosureOutcome(outcome)}
                >
                  <Text
                    style={[
                      styles.optionChipText,
                      { color: colors.textPrimary },
                      closureOutcome === outcome && { color: AppColors.white, fontWeight: '700' },
                    ]}
                  >
                    {outcome}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={[styles.fieldSub, { color: colors.textSecondary, marginTop: 6 }]}>
              Closure Reason & Field Inspection Findings *:
            </Text>
            <TextInput
              style={[styles.textInput, { minHeight: 70, backgroundColor: colors.surfaceElevated, color: colors.textPrimary, borderColor: colors.border, marginTop: 8 }]}
              placeholder="Explain on-site findings: e.g. Surface wear is within standard tolerance; no structural cavity found. Routine monitoring scheduled."
              placeholderTextColor={colors.textSecondary}
              multiline
              value={closureReason}
              onChangeText={setClosureReason}
            />
          </View>
        ) : null}

        {decision === 'genuine' ? (
          <>
            {/* FORM SECTION 1: VERIFIED ISSUE TYPE */}
            <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <Text style={[styles.cardSectionTitle, { color: colors.textPrimary }]}>1. Physical Issue Verification</Text>
              <Text style={[styles.fieldSub, { color: colors.textSecondary }]}>
                Inspect the road surface on-site and confirm or correct the actual defect:
              </Text>

              <View style={styles.optionGrid}>
                {ISSUE_OPTIONS.map(opt => (
                  <TouchableOpacity
                    key={opt.key}
                    style={[
                      styles.optionChip,
                      { backgroundColor: colors.surfaceElevated, borderColor: colors.border },
                      verifiedIssue === opt.key && { backgroundColor: colors.buttonPrimary, borderColor: colors.buttonPrimary },
                    ]}
                    onPress={() => handleIssueChange(opt.key)}
                    accessible
                    accessibilityRole="radio"
                    accessibilityState={{ selected: verifiedIssue === opt.key }}
                  >
                    <Ionicons
                      name={verifiedIssue === opt.key ? 'checkmark-circle' : 'ellipse-outline'}
                      size={16}
                      color={verifiedIssue === opt.key ? '#FFFFFF' : colors.textSecondary}
                    />
                    <Text
                      style={[
                        styles.optionChipText,
                        { color: verifiedIssue === opt.key ? '#FFFFFF' : colors.textPrimary },
                      ]}
                    >
                      {opt.label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            {/* FORM SECTION 2: SEVERITY & RESOLUTION TIME ESTIMATION */}
            <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <Text style={[styles.cardSectionTitle, { color: colors.textPrimary }]}>2. Severity & Resolution Time Estimation</Text>
              <Text style={[styles.fieldSub, { color: colors.textSecondary }]}>
                Resolution time must be 1 to 7 days based on road defect severity:
              </Text>

              {/* Severity Selector */}
              <View style={styles.sevRow}>
                {SEVERITY_OPTIONS.map(sev => (
                  <TouchableOpacity
                    key={sev}
                    style={[
                      styles.sevChip,
                      { backgroundColor: colors.surfaceElevated, borderColor: colors.border },
                      severity === sev && (sev === 'HIGH' ? styles.sevHigh : sev === 'MEDIUM' ? styles.sevMed : styles.sevLow),
                    ]}
                    onPress={() => handleSeverityChange(sev)}
                    accessible
                    accessibilityRole="button"
                    accessibilityLabel={`Severity ${sev}`}
                  >
                    <Text
                      style={[
                        styles.sevChipText,
                        { color: severity === sev ? '#FFFFFF' : colors.textPrimary },
                      ]}
                    >
                      {sev}
                    </Text>
                    <Text
                      style={[
                        styles.sevSubText,
                        { color: severity === sev ? 'rgba(255,255,255,0.9)' : colors.textSecondary },
                      ]}
                    >
                      {sev === 'LOW' ? '1–2 Days' : sev === 'MEDIUM' ? '3–4 Days' : '5–7 Days'}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              {/* Resolution Days Selector (1 to 7 Days) */}
              <Text style={[styles.fieldLabel, { color: colors.textPrimary, marginTop: 14 }]}>Estimated Resolution Duration (Days: 1–7):</Text>
              <View style={styles.daysRow}>
                {[1, 2, 3, 4, 5, 6, 7].map(d => (
                  <TouchableOpacity
                    key={d}
                    style={[
                      styles.dayChip,
                      { backgroundColor: colors.surfaceElevated, borderColor: colors.border },
                      resolutionDays === d && { backgroundColor: colors.buttonPrimary, borderColor: colors.buttonPrimary },
                    ]}
                    onPress={() => setResolutionDays(d)}
                    accessible
                    accessibilityRole="button"
                    accessibilityLabel={`${d} Days`}
                  >
                    <Text
                      style={[
                        styles.dayChipText,
                        { color: resolutionDays === d ? '#FFFFFF' : colors.textPrimary },
                      ]}
                    >
                      {d}d
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              {/* Manual Estimated Budget (INR) */}
              <Text style={[styles.fieldLabel, { color: colors.textPrimary, marginTop: 14 }]}>Manual Budget Estimation (INR ₹) *:</Text>
              <Text style={[styles.fieldSub, { color: colors.textSecondary }]}>
                Enter the repair budget estimated manually based on physical on-site measurements and defect severity:
              </Text>
              <View style={[styles.budgetInputRow, { backgroundColor: colors.inputBg, borderColor: colors.inputBorder }]}>
                <Text style={[styles.currencySymbol, { color: colors.buttonPrimary }]}>₹</Text>
                <TextInput
                  style={[styles.budgetInput, { color: colors.inputText }]}
                  keyboardType="numeric"
                  value={estimatedBudget}
                  onChangeText={setEstimatedBudget}
                  placeholder="e.g. 25000"
                  placeholderTextColor={colors.inputPlaceholder}
                />
              </View>

              {/* Quick Preset Amount Buttons */}
              <View style={styles.quickBudgetRow}>
                {[10000, 25000, 50000, 75000, 100000].map(amt => (
                  <TouchableOpacity
                    key={amt}
                    style={[
                      styles.quickBudgetChip,
                      { backgroundColor: colors.surfaceElevated, borderColor: colors.border },
                      parseFloat(estimatedBudget) === amt && { backgroundColor: colors.buttonPrimary, borderColor: colors.buttonPrimary },
                    ]}
                    onPress={() => setEstimatedBudget(String(amt))}
                    accessible
                    accessibilityRole="button"
                    accessibilityLabel={`Set ₹${amt.toLocaleString('en-IN')}`}
                  >
                    <Text
                      style={[
                        styles.quickBudgetText,
                        { color: parseFloat(estimatedBudget) === amt ? '#FFFFFF' : colors.textPrimary },
                      ]}
                    >
                      ₹{(amt / 1000).toFixed(0)}k
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              <View style={{ marginTop: 12 }}>
                <PracticalBudgetBreakdownCard
                  budgetBreakdown={autoSplitBudget(parseFloat(estimatedBudget) || 25000, verifiedIssue, severity)}
                  issueType={verifiedIssue}
                  severity={severity}
                  estimatedBudget={parseFloat(estimatedBudget) || 25000}
                  title="Live 4-Pillar Budget Auto-Split (Materials 45%, Labour 30%, Machinery 15%, Overhead 10%)"
                  showBoqToggle={true}
                  initiallyExpanded={true}
                />
              </View>
            </View>

            {/* FORM SECTION 3: ROAD IDENTIFICATION & MAINTENANCE AUTHORITY */}
            <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <Text style={[styles.cardSectionTitle, { color: colors.textPrimary }]}>3. Road & Responsible Maintenance Authority</Text>
              <Text style={[styles.fieldSub, { color: colors.textSecondary }]}>
                Identify the specific road segment and confirming department:
              </Text>

              {/* Coimbatore 4 Regions */}
              <Text style={[styles.fieldLabel, { color: colors.textPrimary }]}>Coimbatore Region:</Text>
              <View style={styles.regionSelectRow}>
                {ALL_COIMBATORE_REGIONS.map(reg => (
                  <TouchableOpacity
                    key={reg}
                    style={[
                      styles.regSelectChip,
                      { backgroundColor: colors.surfaceElevated, borderColor: colors.border },
                      selectedRegion === reg && { backgroundColor: colors.buttonPrimary, borderColor: colors.buttonPrimary },
                    ]}
                    onPress={() => handleRegionChange(reg)}
                  >
                    <Text
                      style={[
                        styles.regSelectText,
                        { color: selectedRegion === reg ? '#FFFFFF' : colors.textPrimary },
                      ]}
                    >
                      {reg}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              {/* Road Catalog Selector */}
              <Text style={[styles.fieldLabel, { color: colors.textPrimary, marginTop: 12 }]}>Identified Road in {selectedRegion}:</Text>
              {roadsInRegion.map(road => (
                <TouchableOpacity
                  key={road.roadId}
                  style={[
                    styles.roadCard,
                    { backgroundColor: colors.surfaceElevated, borderColor: colors.border },
                    selectedRoad?.roadId === road.roadId && { borderColor: colors.buttonPrimary, borderWidth: 1.5 },
                  ]}
                  onPress={() => {
                    setSelectedRoad(road);
                    setCustomRoadName(road.roadName);
                    setCustomMaintenanceAuthority(road.maintainedBy);
                  }}
                >
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.roadNameTitle, { color: colors.textPrimary }]}>{road.roadName}</Text>
                    <Text style={[styles.roadTypeBadge, { color: colors.buttonPrimary }]}>{road.roadType}</Text>
                    <Text style={[styles.roadAuthoritySub, { color: colors.textSecondary }]}>Maintained by: {road.maintainedBy}</Text>
                  </View>
                  {selectedRoad?.roadId === road.roadId && (
                    <Ionicons name="checkmark-circle" size={20} color={colors.buttonPrimary} />
                  )}
                </TouchableOpacity>
              ))}

              {/* Custom Road Name */}
              <Text style={[styles.fieldLabel, { color: colors.textPrimary, marginTop: 12 }]}>Road Name / Street:</Text>
              <TextInput
                style={[styles.textInput, { backgroundColor: colors.inputBg, borderColor: colors.inputBorder, color: colors.inputText }]}
                value={customRoadName}
                onChangeText={setCustomRoadName}
                placeholder="e.g. Avinashi Road, Peelamedu"
                placeholderTextColor={colors.inputPlaceholder}
              />

              <Text style={[styles.fieldLabel, { color: colors.textPrimary, marginTop: 10 }]}>Maintenance Authority / Department:</Text>
              <TextInput
                style={[styles.textInput, { backgroundColor: colors.inputBg, borderColor: colors.inputBorder, color: colors.inputText }]}
                value={customMaintenanceAuthority}
                onChangeText={setCustomMaintenanceAuthority}
                placeholder="e.g. State Highways Department (C&M) / CCMC"
                placeholderTextColor={colors.inputPlaceholder}
              />
            </View>

            {/* FORM SECTION 4: MULTI-DEPARTMENT INVOLVEMENT */}
            <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <View style={styles.toggleRow}>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.cardSectionTitle, { color: colors.textPrimary }]}>4. Secondary Department Involvement</Text>
                  <Text style={[styles.fieldSub, { color: colors.textSecondary }]}>
                    Is another department (water line, electricity, UGD) involved in the defect?
                  </Text>
                </View>
                <Switch
                  value={isOtherDeptInvolved}
                  onValueChange={setIsOtherDeptInvolved}
                  trackColor={{ false: colors.border, true: colors.buttonPrimary }}
                />
              </View>

              {isOtherDeptInvolved && (
                <View style={[styles.multiDeptContainer, { borderTopColor: colors.border }]}>
                  <Text style={[styles.fieldLabel, { color: colors.textPrimary }]}>Select Involved Secondary Departments:</Text>
                  {SECONDARY_DEPARTMENTS.map(dept => {
                    const isSelected = selectedDepts.includes(dept.departmentName);
                    return (
                      <TouchableOpacity
                        key={dept.departmentId}
                        style={[
                          styles.secDeptCard,
                          { backgroundColor: colors.surfaceElevated, borderColor: colors.border },
                          isSelected && { borderColor: colors.buttonPrimary, borderWidth: 1.5 },
                        ]}
                        onPress={() => handleToggleSecondaryDept(dept.departmentName)}
                      >
                        <Ionicons
                          name={isSelected ? 'checkbox' : 'square-outline'}
                          size={18}
                          color={isSelected ? colors.buttonPrimary : colors.textSecondary}
                        />
                        <View style={{ flex: 1 }}>
                          <Text style={[styles.secDeptName, { color: colors.textPrimary }]}>{dept.departmentName}</Text>
                          <Text style={[styles.secDeptDesc, { color: colors.textSecondary }]}>{dept.domain}</Text>
                        </View>
                      </TouchableOpacity>
                    );
                  })}

                  <Text style={[styles.fieldLabel, { color: colors.textPrimary, marginTop: 10 }]}>Involvement Reason & Notes:</Text>
                  <TextInput
                    style={[styles.textInput, { backgroundColor: colors.inputBg, borderColor: colors.inputBorder, color: colors.inputText }]}
                    placeholder="e.g. Pipeline burst under road asphalt requiring TWAD repair before repaving"
                    placeholderTextColor={colors.inputPlaceholder}
                    value={otherDeptReason}
                    onChangeText={setOtherDeptReason}
                    multiline
                  />
                </View>
              )}
            </View>
          </>
        ) : null}

        {/* Section: Inspection Remarks */}
        <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Text style={[styles.cardSectionTitle, { color: colors.textPrimary }]}>{decision === 'genuine' ? '5. Inspector Observations & Physical Remarks *' : 'Rejection Observation Notes *'}</Text>
          <TextInput
            style={[styles.textInput, { minHeight: 80, backgroundColor: colors.inputBg, borderColor: colors.inputBorder, color: colors.inputText }]}
            placeholder={decision === 'genuine' ? "Enter on-site physical inspection notes (sub-base condition, traffic impact, materials required)..." : "Explain why this report is considered invalid or fake..."}
            placeholderTextColor={colors.inputPlaceholder}
            value={inspectorRemarks}
            onChangeText={setInspectorRemarks}
            multiline
            numberOfLines={4}
          />
        </View>

        {/* Section: Evidence Photo */}
        <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Text style={[styles.cardSectionTitle, { color: colors.textPrimary }]}>On-Site Evidence Photo (Optional)</Text>
          <Text style={[styles.fieldSub, { color: colors.textSecondary }]}>Attach a photo captured directly on site as verification proof:</Text>

          {evidenceUri ? (
            <View style={[styles.evidencePreviewContainer, { borderColor: colors.border }]}>
              <Image source={{ uri: evidenceUri }} style={styles.evidenceImage} resizeMode="cover" />
              <TouchableOpacity
                style={styles.removeEvidenceBtn}
                onPress={() => setEvidenceUri(null)}
                accessible
                accessibilityLabel="Remove evidence photo"
              >
                <Ionicons name="trash-outline" size={16} color={AppColors.white} />
                <Text style={styles.removeEvidenceBtnText}>Remove Photo</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <View style={styles.photoActionRow}>
              <TouchableOpacity
                style={[styles.photoActionBtn, { backgroundColor: colors.surfaceElevated, borderColor: colors.border }]}
                onPress={handleCapturePhoto}
                disabled={submitting}
              >
                <Ionicons name="camera" size={20} color={colors.buttonPrimary} />
                <Text style={[styles.photoActionBtnText, { color: colors.buttonPrimary }]}>Take Photo</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.photoActionBtn, { backgroundColor: colors.surfaceElevated, borderColor: colors.border }]}
                onPress={handlePickPhoto}
                disabled={submitting}
              >
                <Ionicons name="images-outline" size={20} color={colors.buttonPrimary} />
                <Text style={[styles.photoActionBtnText, { color: colors.buttonPrimary }]}>Choose Gallery</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>

        {/* Action Buttons: Confirm Valid vs Clarify vs No Repair vs Reject */}
        <View style={styles.actionBtnRow}>
          {decision === 'genuine' ? (
            <TouchableOpacity
              style={[styles.verifySubmitBtn, { backgroundColor: colors.buttonPrimary }, submitting && styles.btnDisabled]}
              onPress={handleConfirmVerification}
              disabled={submitting}
              accessible
              accessibilityRole="button"
              accessibilityLabel="Submit Physical Verification"
            >
              {submitting ? (
                <View style={styles.submittingRow}>
                  <ActivityIndicator color={AppColors.white} />
                  <Text style={styles.verifySubmitBtnText}>
                    {submittingStatusText || 'Submitting...'}
                  </Text>
                </View>
              ) : (
                <View style={styles.submitBtnContent}>
                  <Ionicons name="shield-checkmark" size={18} color={AppColors.white} />
                  <Text style={styles.verifySubmitBtnText}>Submit Field Verification</Text>
                </View>
              )}
            </TouchableOpacity>
          ) : decision === 'clarification' ? (
            <TouchableOpacity
              style={[styles.verifySubmitBtn, { backgroundColor: '#D97706' }, submitting && styles.btnDisabled]}
              onPress={handleRequestClarification}
              disabled={submitting}
              accessible
              accessibilityRole="button"
              accessibilityLabel="Dispatch Clarification Request"
            >
              {submitting ? (
                <View style={styles.submittingRow}>
                  <ActivityIndicator color={AppColors.white} />
                  <Text style={styles.verifySubmitBtnText}>
                    {submittingStatusText || 'Dispatching...'}
                  </Text>
                </View>
              ) : (
                <View style={styles.submitBtnContent}>
                  <Ionicons name="help-circle" size={18} color={AppColors.white} />
                  <Text style={styles.verifySubmitBtnText}>Dispatch Clarification Request</Text>
                </View>
              )}
            </TouchableOpacity>
          ) : decision === 'no_repair' ? (
            <TouchableOpacity
              style={[styles.verifySubmitBtn, { backgroundColor: '#2563EB' }, submitting && styles.btnDisabled]}
              onPress={handleCloseNoRepair}
              disabled={submitting}
              accessible
              accessibilityRole="button"
              accessibilityLabel="Close Complaint (No Repair Needed)"
            >
              {submitting ? (
                <View style={styles.submittingRow}>
                  <ActivityIndicator color={AppColors.white} />
                  <Text style={styles.verifySubmitBtnText}>
                    {submittingStatusText || 'Closing...'}
                  </Text>
                </View>
              ) : (
                <View style={styles.submitBtnContent}>
                  <Ionicons name="checkmark-done-circle" size={18} color={AppColors.white} />
                  <Text style={styles.verifySubmitBtnText}>Close Complaint (No Repair Needed)</Text>
                </View>
              )}
            </TouchableOpacity>
          ) : (
            <TouchableOpacity
              style={[styles.modalRejectConfirmBtn, submitting && styles.btnDisabled]}
              onPress={() => setShowRejectModal(true)}
              disabled={submitting}
              accessible
              accessibilityRole="button"
              accessibilityLabel="Reject Complaint as Invalid"
            >
              <Ionicons name="close-circle-outline" size={18} color={AppColors.white} />
              <Text style={styles.modalRejectConfirmText}>Specify Rejection Reason & Reject</Text>
            </TouchableOpacity>
          )}
        </View>
      </ScrollView>

      {/* Reject Reason Modal */}
      <Modal visible={showRejectModal} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { backgroundColor: colors.card }]}>
            <View style={styles.modalHeader}>
              <Ionicons name="alert-circle" size={24} color={AppColors.error} />
              <Text style={styles.modalTitle}>Reject Complaint (Invalid / Fake)</Text>
            </View>

            <Text style={[styles.modalDesc, { color: colors.textSecondary }]}>
              Select the verified reason for rejecting this road complaint:
            </Text>

            <ScrollView style={{ maxHeight: 220 }}>
              {REJECTION_PRESETS.map(preset => (
                <TouchableOpacity
                  key={preset}
                  style={[
                    styles.presetRow,
                    { borderBottomColor: colors.borderLight },
                    selectedPresetReason === preset && { backgroundColor: isDark ? 'rgba(239, 68, 68, 0.2)' : '#FEF2F2' },
                  ]}
                  onPress={() => setSelectedPresetReason(preset)}
                >
                  <Ionicons
                    name={selectedPresetReason === preset ? 'radio-button-on' : 'radio-button-off'}
                    size={16}
                    color={selectedPresetReason === preset ? AppColors.error : colors.textSecondary}
                  />
                  <Text
                    style={[
                      styles.presetText,
                      { color: colors.textPrimary },
                      selectedPresetReason === preset && styles.presetTextActive,
                    ]}
                  >
                    {preset}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>

            {selectedPresetReason.startsWith('Other') && (
              <TextInput
                style={[styles.textInput, { marginTop: 10, backgroundColor: colors.inputBg, borderColor: colors.inputBorder, color: colors.inputText }]}
                placeholder="Specific rejection reason..."
                placeholderTextColor={colors.inputPlaceholder}
                value={customRejectReason}
                onChangeText={setCustomRejectReason}
              />
            )}

            <View style={styles.modalBtnRow}>
              <TouchableOpacity
                style={[styles.modalCancelBtn, { backgroundColor: colors.surfaceElevated, borderColor: colors.border }]}
                onPress={() => setShowRejectModal(false)}
                disabled={submitting}
              >
                <Text style={[styles.modalCancelText, { color: colors.textPrimary }]}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalRejectConfirmBtn, submitting && styles.btnDisabled]}
                onPress={handleRejectComplaint}
                disabled={submitting}
              >
                {submitting ? (
                  <ActivityIndicator color={AppColors.white} />
                ) : (
                  <Text style={styles.modalRejectConfirmText}>Confirm Rejection</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* In-app CivicEye Image Editor with "DONE" upload action */}
      <ImageEditorModal
        visible={editorVisible}
        imageUri={rawPickedUri}
        onDone={(editedUri) => {
          setEvidenceUri(editedUri);
          setEditorVisible(false);
          setRawPickedUri(null);
        }}
        onCancel={() => {
          setEditorVisible(false);
          setRawPickedUri(null);
        }}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: AppColors.background },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: AppColors.background,
    padding: 24,
  },
  loadingText: {
    marginTop: 12,
    fontSize: 15,
    color: AppColors.textSecondary,
    fontWeight: '600',
  },
  errorText: {
    fontSize: 16,
    color: AppColors.error,
    fontWeight: '700',
    marginTop: 12,
    marginBottom: 16,
    textAlign: 'center',
  },
  accessDeniedIconBox: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#FEE2E2',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  accessDeniedTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: AppColors.error,
    marginBottom: 8,
  },
  accessDeniedText: {
    fontSize: 14,
    color: AppColors.textSecondary,
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 20,
    paddingHorizontal: 20,
  },
  backButton: {
    paddingVertical: 12,
    paddingHorizontal: 24,
    backgroundColor: AppColors.primary,
    borderRadius: 10,
  },
  backButtonText: {
    color: AppColors.white,
    fontWeight: '800',
    fontSize: 14,
  },
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
  headerSub: { fontSize: 11, color: AppColors.textSecondary, marginTop: 1 },
  scroll: { padding: 16, paddingBottom: 50 },
  instructionBanner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    backgroundColor: '#EFF6FF',
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#BFDBFE',
    marginBottom: 16,
  },
  instructionBannerTitle: {
    fontSize: 13,
    fontWeight: '800',
    color: AppColors.primary,
    marginBottom: 2,
  },
  instructionBannerText: {
    fontSize: 12,
    color: AppColors.textPrimary,
    lineHeight: 16,
  },
  sectionTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 8,
    marginBottom: 8,
  },
  sectionHeaderTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: AppColors.textPrimary,
  },
  imageCard: {
    borderRadius: 14,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: AppColors.border,
    marginBottom: 14,
    backgroundColor: '#000',
  },
  image: { width: '100%', height: 200 },
  imageOverlayBadge: {
    position: 'absolute',
    bottom: 10,
    left: 10,
    backgroundColor: 'rgba(0, 0, 0, 0.65)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  imageOverlayText: { color: AppColors.white, fontSize: 11, fontWeight: '700' },
  card: {
    backgroundColor: AppColors.surface,
    borderRadius: 14,
    padding: 14,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: AppColors.border,
  },
  cardHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
    flexWrap: 'wrap',
    gap: 6,
  },
  issueType: {
    fontSize: 17,
    fontWeight: '800',
    color: AppColors.textPrimary,
    textTransform: 'capitalize',
    flexShrink: 1,
    minWidth: 140,
  },
  badgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flexWrap: 'wrap',
  },
  confidenceBadge: {
    fontSize: 11,
    fontWeight: '700',
    color: AppColors.primary,
    backgroundColor: '#EFF6FF',
    paddingHorizontal: 6,
    paddingVertical: 3,
    borderRadius: 6,
  },
  deptText: {
    fontSize: 12,
    color: AppColors.textSecondary,
    fontWeight: '600',
    marginBottom: 6,
  },
  description: {
    fontSize: 13,
    color: AppColors.textPrimary,
    lineHeight: 18,
    marginBottom: 8,
  },
  citizenMetaRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4, flexWrap: 'wrap' },
  citizenMetaText: { fontSize: 11, color: AppColors.textSecondary, flexShrink: 1 },
  cardSectionTitle: {
    fontSize: 13,
    fontWeight: '800',
    color: AppColors.textPrimary,
    marginBottom: 4,
  },
  deptCurrentName: { fontSize: 14, fontWeight: '700', color: AppColors.textPrimary, marginTop: 2 },
  reassignDeptBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: AppColors.surface,
    borderWidth: 1,
    borderColor: AppColors.primary,
  },
  reassignDeptBtnText: { fontSize: 12, fontWeight: '700', color: AppColors.primary },
  routingInfoRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 8, flexWrap: 'wrap' },
  routingStatusBadge: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6 },
  routingStatusBadgeDirect: { backgroundColor: '#EFF6FF' },
  routingStatusBadgeMoved: { backgroundColor: '#F3E8FF' },
  routingStatusBadgeText: { fontSize: 11, fontWeight: '700', color: AppColors.primary },
  routingStatusBadgeTextMoved: { color: '#7E22CE' },
  routingFromText: { fontSize: 11, color: AppColors.textSecondary, fontStyle: 'italic' },
  deptExplanationBox: {
    flexDirection: 'row',
    gap: 6,
    alignItems: 'flex-start',
    backgroundColor: '#F0F9FF',
    borderRadius: 8,
    padding: 8,
    marginTop: 8,
    borderWidth: 1,
    borderColor: '#BAE6FD',
  },
  deptExplanationText: { fontSize: 12, color: '#0369A1', flex: 1, lineHeight: 17 },
  locationInfoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 12,
    flexWrap: 'wrap',
  },
  locationIconBox: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#EFF6FF',
    justifyContent: 'center',
    alignItems: 'center',
  },
  locationLabel: { fontSize: 11, color: AppColors.textSecondary, fontWeight: '600' },
  locationCoordinates: { fontSize: 14, fontWeight: '800', color: AppColors.textPrimary },
  openMapBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: AppColors.primary,
    borderRadius: 10,
    paddingVertical: 10,
  },
  openMapBtnText: {
    color: AppColors.white,
    fontSize: 13,
    fontWeight: '700',
  },
  decisionRow: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 14,
    flexWrap: 'wrap',
  },
  decisionCard: {
    flex: 1,
    minWidth: 120,
    backgroundColor: AppColors.surface,
    borderRadius: 14,
    padding: 12,
    borderWidth: 2,
    borderColor: AppColors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  decisionCardGenuineSelected: {
    borderColor: AppColors.success,
    backgroundColor: '#F0FDF4',
  },
  decisionCardClarifySelected: {
    borderColor: '#D97706',
    backgroundColor: '#FFFBEB',
  },
  decisionCardNoRepairSelected: {
    borderColor: '#2563EB',
    backgroundColor: '#EFF6FF',
  },
  decisionCardFakeSelected: {
    borderColor: AppColors.error,
    backgroundColor: '#FEF2F2',
  },
  decisionIconCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#F3F4F6',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 6,
  },
  decisionIconCircleGenuine: {
    backgroundColor: AppColors.success,
  },
  decisionIconCircleClarify: {
    backgroundColor: '#D97706',
  },
  decisionIconCircleNoRepair: {
    backgroundColor: '#2563EB',
  },
  decisionIconCircleFake: {
    backgroundColor: AppColors.error,
  },
  decisionTitle: {
    fontSize: 12,
    fontWeight: '800',
    color: AppColors.textPrimary,
    marginBottom: 2,
    textAlign: 'center',
  },
  decisionTitleGenuine: {
    color: AppColors.success,
  },
  decisionTitleClarify: {
    color: '#D97706',
  },
  decisionTitleNoRepair: {
    color: '#2563EB',
  },
  decisionTitleFake: {
    color: AppColors.error,
  },
  decisionSubtitle: {
    fontSize: 11,
    color: AppColors.textSecondary,
    textAlign: 'center',
    lineHeight: 14,
  },
  fieldSub: {
    fontSize: 11,
    color: AppColors.textSecondary,
    marginBottom: 10,
  },
  fieldLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: AppColors.textPrimary,
    marginBottom: 6,
  },
  optionGrid: {
    gap: 8,
  },
  optionChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: AppColors.background,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: AppColors.border,
  },
  optionChipActive: {
    backgroundColor: AppColors.primary,
    borderColor: AppColors.primary,
  },
  optionChipText: {
    fontSize: 13,
    fontWeight: '600',
    color: AppColors.textPrimary,
  },
  optionChipTextActive: {
    color: AppColors.white,
    fontWeight: '700',
  },
  sevRow: {
    flexDirection: 'row',
    gap: 10,
    flexWrap: 'wrap',
  },
  sevChip: {
    flex: 1,
    minWidth: 80,
    paddingVertical: 10,
    alignItems: 'center',
    borderRadius: 10,
    backgroundColor: AppColors.background,
    borderWidth: 1.5,
    borderColor: AppColors.border,
  },
  sevLow: { backgroundColor: AppColors.success, borderColor: AppColors.success },
  sevMed: { backgroundColor: '#C2410C', borderColor: '#C2410C' },
  sevHigh: { backgroundColor: AppColors.error, borderColor: AppColors.error },
  sevChipText: {
    fontSize: 13,
    fontWeight: '800',
    color: AppColors.textPrimary,
  },
  sevSubText: {
    fontSize: 10,
    color: AppColors.textSecondary,
    marginTop: 2,
  },
  sevChipTextActive: {
    color: AppColors.white,
  },
  daysRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 6,
    flexWrap: 'wrap',
  },
  dayChip: {
    flex: 1,
    minWidth: 42,
    paddingVertical: 8,
    alignItems: 'center',
    borderRadius: 8,
    backgroundColor: AppColors.background,
    borderWidth: 1,
    borderColor: AppColors.border,
  },
  dayChipActive: {
    backgroundColor: AppColors.primary,
    borderColor: AppColors.primary,
  },
  dayChipText: {
    fontSize: 12,
    fontWeight: '700',
    color: AppColors.textPrimary,
  },
  dayChipTextActive: {
    color: AppColors.white,
  },
  budgetInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: AppColors.background,
    borderRadius: 10,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: AppColors.border,
  },
  currencySymbol: {
    fontSize: 16,
    fontWeight: '700',
    color: AppColors.primary,
    marginRight: 6,
  },
  budgetInput: {
    flex: 1,
    paddingVertical: 10,
    fontSize: 14,
    fontWeight: '700',
    color: AppColors.textPrimary,
  },
  quickBudgetRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 8,
    flexWrap: 'wrap',
  },
  quickBudgetChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: '#F1F5F9',
    borderWidth: 1,
    borderColor: '#CBD5E1',
  },
  quickBudgetChipActive: {
    backgroundColor: '#CCFBF1',
    borderColor: '#0D9488',
  },
  quickBudgetText: {
    fontSize: 12,
    fontWeight: '700',
    color: AppColors.textSecondary,
  },
  quickBudgetTextActive: {
    color: '#0F766E',
    fontWeight: '800',
  },
  regionSelectRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginBottom: 6,
  },
  regSelectChip: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: AppColors.background,
    borderWidth: 1,
    borderColor: AppColors.border,
  },
  regSelectChipActive: {
    backgroundColor: AppColors.primary,
    borderColor: AppColors.primary,
  },
  regSelectText: {
    fontSize: 11,
    fontWeight: '700',
    color: AppColors.textPrimary,
  },
  regSelectTextActive: {
    color: AppColors.white,
  },
  roadCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: AppColors.background,
    borderRadius: 10,
    padding: 10,
    marginBottom: 6,
    borderWidth: 1,
    borderColor: AppColors.border,
    gap: 8,
  },
  roadCardActive: {
    borderColor: AppColors.primary,
    backgroundColor: '#EFF6FF',
  },
  roadNameTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: AppColors.textPrimary,
  },
  roadTypeBadge: {
    fontSize: 10,
    color: AppColors.primary,
    marginTop: 1,
  },
  roadAuthoritySub: {
    fontSize: 10,
    color: AppColors.textSecondary,
    marginTop: 2,
  },
  textInput: {
    backgroundColor: AppColors.background,
    borderRadius: 10,
    padding: 10,
    borderWidth: 1,
    borderColor: AppColors.border,
    fontSize: 13,
    color: AppColors.textPrimary,
  },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    gap: 8,
  },
  multiDeptContainer: {
    marginTop: 12,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: AppColors.border,
  },
  secDeptCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: AppColors.background,
    padding: 10,
    borderRadius: 8,
    marginBottom: 6,
    borderWidth: 1,
    borderColor: AppColors.border,
    flexWrap: 'wrap',
  },
  secDeptCardActive: {
    backgroundColor: '#FFFBEB',
    borderColor: '#FDE68A',
  },
  secDeptName: {
    fontSize: 12,
    fontWeight: '700',
    color: AppColors.textPrimary,
  },
  secDeptDesc: {
    fontSize: 10,
    color: AppColors.textSecondary,
    marginTop: 1,
  },
  evidencePreviewContainer: {
    borderRadius: 10,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: AppColors.border,
    backgroundColor: '#000',
  },
  evidenceImage: { width: '100%', height: 160 },
  removeEvidenceBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: AppColors.error,
    paddingVertical: 8,
  },
  removeEvidenceBtnText: { color: AppColors.white, fontSize: 12, fontWeight: '700' },
  photoActionRow: {
    flexDirection: 'row',
    gap: 12,
    flexWrap: 'wrap',
  },
  photoActionBtn: {
    flex: 1,
    minWidth: 130,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: '#EFF6FF',
    borderRadius: 10,
    paddingVertical: 12,
    borderWidth: 1,
    borderColor: '#BFDBFE',
  },
  photoActionBtnText: {
    fontSize: 13,
    fontWeight: '700',
    color: AppColors.primary,
  },
  actionBtnRow: {
    gap: 10,
    marginTop: 6,
  },
  verifySubmitBtn: {
    backgroundColor: AppColors.primary,
    borderRadius: 12,
    paddingVertical: 15,
    alignItems: 'center',
    justifyContent: 'center',
  },
  submitBtnContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  submittingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  verifySubmitBtnText: {
    color: AppColors.white,
    fontSize: 15,
    fontWeight: '700',
  },
  btnDisabled: {
    opacity: 0.6,
  },
  backBtn: {
    marginTop: 16,
    paddingHorizontal: 20,
    paddingVertical: 10,
    backgroundColor: AppColors.primary,
    borderRadius: 8,
  },
  backBtnText: {
    color: AppColors.white,
    fontWeight: '700',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: AppColors.surface,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 20,
    paddingBottom: 36,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 6,
  },
  modalTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: AppColors.error,
  },
  modalTitleText: {
    fontSize: 16,
    fontWeight: '800',
    color: AppColors.textPrimary,
  },
  modalCloseBtn: {
    padding: 4,
  },
  modalDesc: {
    fontSize: 12,
    color: AppColors.textSecondary,
    marginBottom: 12,
  },
  presetRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: AppColors.border,
  },
  presetRowActive: {
    backgroundColor: '#FEF2F2',
  },
  presetText: {
    fontSize: 12,
    color: AppColors.textPrimary,
    flex: 1,
  },
  presetTextActive: {
    fontWeight: '700',
    color: AppColors.error,
  },
  modalBtnRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 16,
  },
  modalCancelBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: AppColors.border,
    alignItems: 'center',
  },
  modalCancelText: {
    color: AppColors.textSecondary,
    fontWeight: '700',
  },
  modalRejectConfirmBtn: {
    flex: 1,
    backgroundColor: AppColors.error,
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 6,
  },
  modalRejectConfirmText: {
    color: AppColors.white,
    fontWeight: '700',
    fontSize: 13,
  },
  deptSelectItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: AppColors.border,
    marginBottom: 8,
    backgroundColor: AppColors.background,
  },
  deptSelectItemActive: {
    borderColor: AppColors.primary,
    backgroundColor: '#EFF6FF',
  },
  deptSelectLeft: { flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 },
  deptSelectName: { fontSize: 13, fontWeight: '700', color: AppColors.textPrimary },
  deptSelectNameActive: { color: AppColors.primary },
  deptSelectLabel: { fontSize: 11, color: AppColors.textSecondary, marginTop: 1 },
  radioCircle: {
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 2,
    borderColor: AppColors.border,
    justifyContent: 'center',
    alignItems: 'center',
  },
  radioCircleDeptSelected: { borderColor: AppColors.primary },
  radioDotDept: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: AppColors.primary,
  },
  modalConfirmDeptBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 10,
    backgroundColor: AppColors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalConfirmDeptBtnText: { fontSize: 13, fontWeight: '700', color: AppColors.white },
  budgetDescSub: {
    fontSize: 11,
    color: '#0D9488',
    marginTop: 6,
    fontWeight: '600',
    lineHeight: 15,
  },
});
