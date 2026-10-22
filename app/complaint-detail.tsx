import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import StatusBadge from '@/components/StatusBadge';
import PracticalBudgetBreakdownCard from '@/components/PracticalBudgetBreakdownCard';
import CivicImage from '@/components/CivicImage';
import GradientCard from '@/components/GradientCard';
import { AppColors } from '@/constants/colors';
import { useAppTheme } from '@/context/ThemeContext';
import { auth } from '@/firebaseConfig';
import {
  subscribeToComplaint,
  deleteComplaintByCitizen,
  type Complaint,
  type StatusHistoryItem,
} from '@/services/complaintService';
import { formatResolutionDate } from '@/services/resolutionDuration';
import { getResponsibleOfficerName } from '@/services/officerService';
import { formatDisplayIssueName } from '@/services/predictionContract';

type DetailTab = 'details' | 'status' | 'budget' | 'department';

export default function ComplaintDetailScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { colors, isDark } = useAppTheme();

  const [activeTab, setActiveTab] = useState<DetailTab>('details');
  const [complaint, setComplaint] = useState<Complaint | null>(null);
  const [assignedOfficerName, setAssignedOfficerName] = useState<string>('Awaiting Assignment');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (complaint?.department || complaint?.departmentCode) {
      getResponsibleOfficerName(complaint.department, complaint.departmentCode)
        .then(name => {
          if (name) setAssignedOfficerName(name);
        })
        .catch(() => {
          setAssignedOfficerName('Awaiting Assignment');
        });
    }
  }, [complaint?.department, complaint?.departmentCode]);

  useEffect(() => {
    if (!id) return;
    let isMounted = true;
    const unsub = subscribeToComplaint(
      id,
      data => {
        if (!isMounted) return;
        setComplaint(data);
        setLoading(false);
      },
      () => {
        if (!isMounted) return;
        setLoading(false);
      }
    );
    return () => {
      isMounted = false;
      unsub();
    };
  }, [id]);

  if (loading) {
    return (
      <SafeAreaView style={[styles.centered, { backgroundColor: colors.background }]}>
        <ActivityIndicator size="large" color={AppColors.primary} />
      </SafeAreaView>
    );
  }

  if (!complaint) {
    return (
      <SafeAreaView style={[styles.centered, { backgroundColor: colors.background }]}>
        <Ionicons name="alert-circle-outline" size={48} color={AppColors.error} />
        <Text style={[styles.errorText, { color: colors.textPrimary }]}>Complaint not found.</Text>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Text style={styles.backBtnText}>Go Back</Text>
        </TouchableOpacity>
      </SafeAreaView>
    );
  }

  const isOwner = !!(auth.currentUser && complaint && auth.currentUser.uid === complaint.citizenId);

  const handleDeleteComplaint = () => {
    if (!complaint || !auth.currentUser) return;
    Alert.alert(
      'Delete Complaint?',
      'Are you sure you want to delete this complaint? Deletion will remove it from active complaint views across all dashboards.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteComplaintByCitizen(complaint.id, auth.currentUser!.uid);
              Alert.alert('Complaint Deleted', 'Your complaint has been successfully removed.');
              router.back();
            } catch (err: any) {
              Alert.alert('Deletion Failed', err?.message || 'Could not delete complaint.');
            }
          },
        },
      ]
    );
  };

  const formattedCreatedDate = complaint.createdAt.toLocaleString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  });

  const canonicalIssueName = formatDisplayIssueName(complaint.displayIssueName || complaint.issueType);
  const severityVal = (complaint.severity || complaint.priority || 'LOW').toUpperCase();
  const departmentName = complaint.department || complaint.responsibleDepartment || 'Road Maintenance';

  const hasBudgetInfo =
    (typeof complaint.estimatedBudget === 'number' && complaint.estimatedBudget > 0) ||
    (typeof complaint.inspectionDetails?.estimatedBudget === 'number' && complaint.inspectionDetails.estimatedBudget > 0);

  const budgetAmount = complaint.estimatedBudget || complaint.inspectionDetails?.estimatedBudget || 0;

  const hasDepartmentInfo = !!(
    (complaint.department && complaint.department.trim() !== '') ||
    (complaint.responsibleDepartment && complaint.responsibleDepartment.trim() !== '') ||
    (complaint.departmentCode && complaint.departmentCode.trim() !== '')
  );

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]}>
      {/* 1. Header Bar */}
      <View style={[styles.header, { backgroundColor: isDark ? colors.background : colors.surface, borderBottomColor: colors.border }]}>
        <TouchableOpacity
          onPress={() => router.back()}
          accessibilityRole="button"
          accessibilityLabel="Back"
          style={styles.backIconBtn}
        >
          <Ionicons name="arrow-back" size={24} color={colors.textOnDark} />
        </TouchableOpacity>
        <View style={styles.headerTitleWrap}>
          <Text style={[styles.headerTitle, { color: colors.textOnDark }]} numberOfLines={1}>
            {complaint.complaintId}
          </Text>
          <Text style={[styles.headerSub, { color: colors.textOnDarkSecondary }]} numberOfLines={1}>
            {complaint.region} • Coimbatore
          </Text>
        </View>
        {isOwner ? (
          <TouchableOpacity
            onPress={handleDeleteComplaint}
            style={styles.deleteHeaderBtn}
            accessibilityRole="button"
            accessibilityLabel="Delete Complaint"
          >
            <Ionicons name="trash-outline" size={22} color="#DC2626" />
          </TouchableOpacity>
        ) : (
          <View style={{ width: 40 }} />
        )}
      </View>

      {/* 2. Four Tab Navigation Bar in Exact Requested Order */}
      <View style={[styles.tabBar, { backgroundColor: isDark ? colors.background : colors.surface, borderBottomColor: colors.border }]}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tabScrollContent}>
          {/* Tab 1: Details (default) */}
          <TouchableOpacity
            style={[
              styles.tabBtn,
              activeTab === 'details' && [styles.activeTabBtn, { borderBottomColor: isDark ? '#B0E0E6' : colors.primary }]
            ]}
            onPress={() => setActiveTab('details')}
            accessibilityRole="tab"
            accessibilityState={{ selected: activeTab === 'details' }}
          >
            <Ionicons
              name={activeTab === 'details' ? 'document-text' : 'document-text-outline'}
              size={18}
              color={activeTab === 'details' ? (isDark ? '#B0E0E6' : colors.primary) : (isDark ? '#A2B7C4' : colors.textSecondary)}
            />
            <Text
              style={[
                styles.tabBtnText,
                { color: activeTab === 'details' ? (isDark ? '#B0E0E6' : colors.primary) : (isDark ? '#A2B7C4' : colors.textSecondary) },
                activeTab === 'details' && styles.activeTabBtnText
              ]}
            >
              Details
            </Text>
          </TouchableOpacity>

          {/* Tab 2: Status */}
          <TouchableOpacity
            style={[
              styles.tabBtn,
              activeTab === 'status' && [styles.activeTabBtn, { borderBottomColor: isDark ? '#B0E0E6' : colors.primary }]
            ]}
            onPress={() => setActiveTab('status')}
            accessibilityRole="tab"
            accessibilityState={{ selected: activeTab === 'status' }}
          >
            <Ionicons
              name={activeTab === 'status' ? 'time' : 'time-outline'}
              size={18}
              color={activeTab === 'status' ? (isDark ? '#B0E0E6' : colors.primary) : (isDark ? '#A2B7C4' : colors.textSecondary)}
            />
            <Text
              style={[
                styles.tabBtnText,
                { color: activeTab === 'status' ? (isDark ? '#B0E0E6' : colors.primary) : (isDark ? '#A2B7C4' : colors.textSecondary) },
                activeTab === 'status' && styles.activeTabBtnText
              ]}
            >
              Status
            </Text>
          </TouchableOpacity>

          {/* Tab 3: Budget */}
          <TouchableOpacity
            style={[
              styles.tabBtn,
              activeTab === 'budget' && [styles.activeTabBtn, { borderBottomColor: isDark ? '#B0E0E6' : colors.primary }]
            ]}
            onPress={() => setActiveTab('budget')}
            accessibilityRole="tab"
            accessibilityState={{ selected: activeTab === 'budget' }}
          >
            <Ionicons
              name={activeTab === 'budget' ? 'cash' : 'cash-outline'}
              size={18}
              color={activeTab === 'budget' ? (isDark ? '#B0E0E6' : colors.primary) : (isDark ? '#A2B7C4' : colors.textSecondary)}
            />
            <Text
              style={[
                styles.tabBtnText,
                { color: activeTab === 'budget' ? (isDark ? '#B0E0E6' : colors.primary) : (isDark ? '#A2B7C4' : colors.textSecondary) },
                activeTab === 'budget' && styles.activeTabBtnText
              ]}
            >
              Budget
            </Text>
          </TouchableOpacity>

          {/* Tab 4: Department Details */}
          <TouchableOpacity
            style={[
              styles.tabBtn,
              activeTab === 'department' && [styles.activeTabBtn, { borderBottomColor: isDark ? '#B0E0E6' : colors.primary }]
            ]}
            onPress={() => setActiveTab('department')}
            accessibilityRole="tab"
            accessibilityState={{ selected: activeTab === 'department' }}
          >
            <Ionicons
              name={activeTab === 'department' ? 'business' : 'business-outline'}
              size={18}
              color={activeTab === 'department' ? (isDark ? '#B0E0E6' : colors.primary) : (isDark ? '#A2B7C4' : colors.textSecondary)}
            />
            <Text
              style={[
                styles.tabBtnText,
                { color: activeTab === 'department' ? (isDark ? '#B0E0E6' : colors.primary) : (isDark ? '#A2B7C4' : colors.textSecondary) },
                activeTab === 'department' && styles.activeTabBtnText
              ]}
            >
              Department Details
            </Text>
          </TouchableOpacity>
        </ScrollView>
      </View>

      {/* 3. Main Scrollable Tab Content Container */}
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        {/* ========================================================================= */}
        {/* TAB 1: DETAILS (Selected by Default)                                      */}
        {/* ========================================================================= */}
        {activeTab === 'details' && (
          <View style={styles.tabContentContainer}>
            {/* Uploaded Image */}
            {complaint.imageUri ? (
              <View style={[styles.imageCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                <CivicImage
                  uri={complaint.imageUri}
                  issueType={complaint.issueType}
                  style={styles.image}
                  resizeMode="cover"
                />
              </View>
            ) : null}

            {/* Title & Status Card */}
            <GradientCard style={styles.card}>
              <View style={styles.cardHeaderRow}>
                <View style={{ flex: 1, paddingRight: 8 }}>
                  <Text style={[styles.issueHeading, { color: colors.textPrimary }]}>
                    {canonicalIssueName}
                  </Text>
                  <Text style={[styles.reportedDateText, { color: colors.textSecondary }]}>
                    Reported: {formattedCreatedDate}
                  </Text>
                </View>
                <StatusBadge status={complaint.status} inspectionStatus={complaint.inspectionStatus} size="md" />
              </View>
            </GradientCard>

            {/* Structured Complaint Details Card */}
            <GradientCard style={styles.card}>
              <Text style={[styles.cardTitle, { color: colors.textPrimary }]}>Complaint Overview</Text>

              <View style={[styles.row, { borderBottomColor: isDark ? 'rgba(23, 32, 42, 0.12)' : colors.border }]}>
                <Text style={[styles.rowLabel, { color: colors.textSecondary }]}>Complaint ID</Text>
                <Text style={[styles.rowValueHighlight, { color: AppColors.primary }]} selectable>
                  {complaint.complaintId}
                </Text>
              </View>

              <View style={[styles.row, { borderBottomColor: isDark ? 'rgba(23, 32, 42, 0.12)' : colors.border }]}>
                <Text style={[styles.rowLabel, { color: colors.textSecondary }]}>Issue Name</Text>
                <Text style={[styles.rowValue, { color: colors.textPrimary }]}>{canonicalIssueName}</Text>
              </View>

              <View style={[styles.row, { borderBottomColor: isDark ? 'rgba(23, 32, 42, 0.12)' : colors.border }]}>
                <Text style={[styles.rowLabel, { color: colors.textSecondary }]}>Severity / Priority</Text>
                <View style={[styles.priorityPill, { backgroundColor: isDark ? 'rgba(255, 255, 255, 0.85)' : '#F1F5F9' }]}>
                  <Text
                    style={[
                      styles.priorityPillText,
                      severityVal === 'HIGH' ? { color: AppColors.error } :
                      severityVal === 'MEDIUM' ? { color: '#C2410C' } : { color: AppColors.success }
                    ]}
                  >
                    {severityVal}
                  </Text>
                </View>
              </View>

              <View style={[styles.row, { borderBottomColor: isDark ? 'rgba(23, 32, 42, 0.12)' : colors.border }]}>
                <Text style={[styles.rowLabel, { color: colors.textSecondary }]}>Confidence Score</Text>
                <View style={{ alignItems: 'flex-end' }}>
                  <Text style={[styles.rowValue, { color: '#047857', fontWeight: '800' }]}>
                    {complaint.confidence ?? 0}%
                  </Text>
                  <Text style={{ fontSize: 10, color: colors.textSecondary }}>
                    (Description Heuristic)
                  </Text>
                </View>
              </View>

              <View style={[styles.row, { borderBottomColor: isDark ? 'rgba(23, 32, 42, 0.12)' : colors.border }]}>
                <Text style={[styles.rowLabel, { color: colors.textSecondary }]}>Assigned Department</Text>
                <Text style={[styles.rowValue, { color: colors.textPrimary }]}>{departmentName}</Text>
              </View>

              <View style={styles.row}>
                <Text style={[styles.rowLabel, { color: colors.textSecondary }]}>Current Status</Text>
                <Text style={[styles.rowValue, { color: AppColors.primary, fontWeight: '700' }]}>
                  {complaint.status}
                </Text>
              </View>
            </GradientCard>

            {/* Submitted Description Card */}
            <GradientCard style={styles.card}>
              <View style={styles.cardHeaderFlex}>
                <Ionicons name="chatbox-ellipses-outline" size={18} color={AppColors.primary} />
                <Text style={[styles.cardTitle, { color: colors.textPrimary }]}>Submitted Description</Text>
              </View>
              <Text style={[styles.descriptionText, { color: colors.textPrimary }]}>
                {complaint.description && complaint.description.trim()
                  ? complaint.description
                  : 'No detailed description provided.'}
              </Text>
              {complaint.priorityReason ? (
                <View style={[styles.noticeBox, { backgroundColor: isDark ? 'rgba(255, 255, 255, 0.75)' : '#F1F5F9', borderColor: isDark ? 'rgba(23, 32, 42, 0.15)' : colors.border }]}>
                  <Text style={{ fontSize: 12, color: colors.textSecondary, lineHeight: 17 }}>
                    <Text style={{ fontWeight: '700', color: colors.textPrimary }}>Severity Note: </Text>
                    {complaint.priorityReason}
                  </Text>
                </View>
              ) : null}
            </GradientCard>

            {/* Location & GPS Details Card */}
            <GradientCard style={styles.card}>
              <View style={styles.cardHeaderFlex}>
                <Ionicons name="location-outline" size={18} color={AppColors.primary} />
                <Text style={[styles.cardTitle, { color: colors.textPrimary }]}>Location &amp; Coordinates</Text>
              </View>
              <View style={[styles.row, { borderBottomColor: isDark ? 'rgba(23, 32, 42, 0.12)' : colors.border }]}>
                <Text style={[styles.rowLabel, { color: colors.textSecondary }]}>Region / Ward</Text>
                <Text style={[styles.rowValue, { color: colors.textPrimary }]}>{complaint.region}</Text>
              </View>
              <View style={[styles.row, { borderBottomColor: isDark ? 'rgba(23, 32, 42, 0.12)' : colors.border }]}>
                <Text style={[styles.rowLabel, { color: colors.textSecondary }]}>Road / Area</Text>
                <Text style={[styles.rowValue, { color: colors.textPrimary }]}>
                  {complaint.roadName || complaint.locationAddress || 'Coimbatore Sector'}
                </Text>
              </View>
              <View style={styles.row}>
                <Text style={[styles.rowLabel, { color: colors.textSecondary }]}>GPS Coordinates</Text>
                <Text style={[styles.rowValue, { color: colors.textPrimary, fontVariant: ['tabular-nums'] }]}>
                  {complaint.latitude.toFixed(5)}, {complaint.longitude.toFixed(5)}
                </Text>
              </View>
            </GradientCard>
          </View>
        )}

        {/* ========================================================================= */}
        {/* TAB 2: STATUS                                                             */}
        {/* ========================================================================= */}
        {activeTab === 'status' && (
          <View style={styles.tabContentContainer}>
            {/* Current Status Banner */}
            <GradientCard style={styles.card}>
              <View style={styles.cardHeaderRow}>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.cardTitle, { color: colors.textPrimary, marginBottom: 2 }]}>
                    Current Complaint Status
                  </Text>
                  <Text style={{ fontSize: 12, color: colors.textSecondary }}>
                    Real-time lifecycle tracking
                  </Text>
                </View>
                <StatusBadge status={complaint.status} inspectionStatus={complaint.inspectionStatus} size="md" />
              </View>

              <View style={[styles.metaGrid, { backgroundColor: isDark ? 'rgba(255, 255, 255, 0.75)' : '#F8FAFC', borderColor: isDark ? 'rgba(23, 32, 42, 0.15)' : colors.border }]}>
                <View style={styles.metaCol}>
                  <Text style={[styles.metaLabel, { color: colors.textSecondary }]}>Est. Resolution</Text>
                  <Text style={[styles.metaVal, { color: colors.textPrimary }]}>
                    {complaint.estimatedResolutionDuration || '3 Days'}
                  </Text>
                </View>
                <View style={[styles.metaCol, { borderLeftWidth: 1, borderLeftColor: isDark ? 'rgba(23, 32, 42, 0.15)' : colors.border, paddingLeft: 12 }]}>
                  <Text style={[styles.metaLabel, { color: colors.textSecondary }]}>Expected Date</Text>
                  <Text style={[styles.metaVal, { color: colors.textPrimary }]}>
                    {complaint.expectedResolutionDate ? formatResolutionDate(complaint.expectedResolutionDate) : 'Pending Schedule'}
                  </Text>
                </View>
              </View>
            </GradientCard>

            {/* Status Timeline / History */}
            <GradientCard style={styles.card}>
              <View style={styles.cardHeaderFlex}>
                <Ionicons name="list-outline" size={18} color={AppColors.primary} />
                <Text style={[styles.cardTitle, { color: colors.textPrimary }]}>Status Timeline</Text>
              </View>

              {complaint.statusHistory && complaint.statusHistory.length > 0 ? (
                <View style={styles.timelineList}>
                  {complaint.statusHistory.map((item: StatusHistoryItem, idx: number) => {
                    const itemDate = item.timestamp instanceof Date ? item.timestamp : new Date(item.timestamp);
                    const formattedItemTime = itemDate.toLocaleString('en-IN', {
                      day: '2-digit',
                      month: 'short',
                      year: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit',
                      hour12: true,
                    });
                    const isLast = idx === (complaint.statusHistory?.length ?? 0) - 1;

                    return (
                      <View key={item.id || `hist-${idx}`} style={styles.timelineItemRow}>
                        <View style={styles.timelineIndicatorCol}>
                          <View style={[styles.timelineDot, { backgroundColor: isLast ? AppColors.primary : '#94A3B8' }]}>
                            <Ionicons name="checkmark" size={10} color="#FFFFFF" />
                          </View>
                          {!isLast ? <View style={[styles.timelineLine, { backgroundColor: isDark ? '#94A3B8' : colors.border }]} /> : null}
                        </View>
                        <View style={styles.timelineContentCol}>
                          <Text style={[styles.timelineStatusTitle, { color: colors.textPrimary }]}>
                            {item.newStatus}
                          </Text>
                          <Text style={[styles.timelineDateText, { color: colors.textSecondary }]}>
                            {formattedItemTime}
                          </Text>
                          {item.updatedByName ? (
                            <Text style={[styles.timelineActorText, { color: colors.textSecondary }]}>
                              Updated by: <Text style={{ color: colors.textPrimary, fontWeight: '600' }}>{item.updatedByName}</Text>
                            </Text>
                          ) : null}
                          {item.remarks ? (
                            <Text style={[styles.timelineRemarksText, { color: colors.textPrimary }]}>
                              &ldquo;{item.remarks}&rdquo;
                            </Text>
                          ) : null}
                        </View>
                      </View>
                    );
                  })}
                </View>
              ) : (
                <View style={[styles.noticeBox, { backgroundColor: isDark ? 'rgba(255, 255, 255, 0.75)' : '#F1F5F9', borderColor: isDark ? 'rgba(23, 32, 42, 0.15)' : colors.border }]}>
                  <Text style={[styles.noticeBoxText, { color: colors.textSecondary }]}>
                    Complaint submitted. Awaiting initial field inspector verification.
                  </Text>
                </View>
              )}
            </GradientCard>

            {/* Field Inspector Verification Details */}
            {(complaint.inspectionDetails || complaint.fieldVerifiedAt) && (
              <GradientCard style={styles.card}>
                <View style={styles.cardHeaderFlex}>
                  <Ionicons name="shield-checkmark-outline" size={18} color="#059669" />
                  <Text style={[styles.cardTitle, { color: colors.textPrimary }]}>Field Inspector Verification</Text>
                </View>

                <View style={[styles.row, { borderBottomColor: isDark ? 'rgba(23, 32, 42, 0.12)' : colors.border }]}>
                  <Text style={[styles.rowLabel, { color: colors.textSecondary }]}>Verified Issue</Text>
                  <Text style={[styles.rowValue, { color: colors.textPrimary }]}>
                    {formatDisplayIssueName(complaint.inspectionDetails?.verifiedIssue || complaint.issueType)}
                  </Text>
                </View>

                <View style={[styles.row, { borderBottomColor: isDark ? 'rgba(23, 32, 42, 0.12)' : colors.border }]}>
                  <Text style={[styles.rowLabel, { color: colors.textSecondary }]}>Inspector</Text>
                  <Text style={[styles.rowValue, { color: colors.textPrimary }]}>
                    {complaint.inspectionDetails?.inspectedByName || complaint.fieldVerifiedBy || 'Field Inspector'}
                  </Text>
                </View>

                {complaint.fieldVerifiedAt || complaint.inspectionDetails?.inspectedAt ? (
                  <View style={[styles.row, { borderBottomColor: isDark ? 'rgba(23, 32, 42, 0.12)' : colors.border }]}>
                    <Text style={[styles.rowLabel, { color: colors.textSecondary }]}>Inspection Date</Text>
                    <Text style={[styles.rowValue, { color: colors.textPrimary }]}>
                      {(complaint.fieldVerifiedAt || complaint.inspectionDetails?.inspectedAt)?.toLocaleDateString('en-IN', {
                        day: '2-digit',
                        month: 'short',
                        year: 'numeric',
                      })}
                    </Text>
                  </View>
                ) : null}

                {complaint.inspectorRemarks || complaint.inspectionDetails?.inspectorRemarks ? (
                  <View style={{ marginTop: 10 }}>
                    <Text style={[styles.rowLabel, { color: colors.textSecondary, marginBottom: 4 }]}>Inspector Remarks:</Text>
                    <Text style={[styles.descriptionText, { color: colors.textPrimary }]}>
                      {complaint.inspectorRemarks || complaint.inspectionDetails?.inspectorRemarks}
                    </Text>
                  </View>
                ) : null}

                {complaint.inspectionEvidenceUrl ? (
                  <View style={{ marginTop: 12 }}>
                    <Text style={[styles.rowLabel, { color: colors.textSecondary, marginBottom: 6 }]}>Inspection Evidence Photo:</Text>
                    <CivicImage uri={complaint.inspectionEvidenceUrl} style={styles.evidenceImage} resizeMode="cover" />
                  </View>
                ) : null}
              </GradientCard>
            )}

            {/* Resolution Details Card */}
            {complaint.resolutionDetails && (
              <GradientCard style={styles.card}>
                <View style={styles.cardHeaderFlex}>
                  <Ionicons name="checkmark-done-circle-outline" size={20} color={AppColors.success} />
                  <Text style={[styles.cardTitle, { color: colors.textPrimary }]}>Repair Resolution Progress</Text>
                </View>

                <View style={[styles.row, { borderBottomColor: isDark ? 'rgba(23, 32, 42, 0.12)' : colors.border }]}>
                  <Text style={[styles.rowLabel, { color: colors.textSecondary }]}>Resolved By</Text>
                  <Text style={[styles.rowValue, { color: colors.textPrimary }]}>
                    {complaint.resolutionDetails.resolvedByName || 'Maintenance Division'}
                  </Text>
                </View>

                {complaint.resolutionDetails.contractorName ? (
                  <View style={[styles.row, { borderBottomColor: isDark ? 'rgba(23, 32, 42, 0.12)' : colors.border }]}>
                    <Text style={[styles.rowLabel, { color: colors.textSecondary }]}>Contractor / Wing</Text>
                    <Text style={[styles.rowValue, { color: colors.textPrimary }]}>
                      {complaint.resolutionDetails.contractorName}
                    </Text>
                  </View>
                ) : null}

                {complaint.resolutionDetails.resolutionRemarks ? (
                  <View style={{ marginTop: 10 }}>
                    <Text style={[styles.rowLabel, { color: colors.textSecondary, marginBottom: 4 }]}>Resolution Remarks:</Text>
                    <Text style={[styles.descriptionText, { color: colors.textPrimary }]}>
                      {complaint.resolutionDetails.resolutionRemarks}
                    </Text>
                  </View>
                ) : null}

                {complaint.resolutionDetails.afterRepairImageUri ? (
                  <View style={{ marginTop: 12 }}>
                    <Text style={[styles.rowLabel, { color: colors.textSecondary, marginBottom: 6 }]}>After-Repair Proof:</Text>
                    <CivicImage uri={complaint.resolutionDetails.afterRepairImageUri} style={styles.evidenceImage} resizeMode="cover" />
                  </View>
                ) : null}
              </GradientCard>
            )}
          </View>
        )}

        {/* ========================================================================= */}
        {/* TAB 3: BUDGET                                                             */}
        {/* ========================================================================= */}
        {activeTab === 'budget' && (
          <View style={styles.tabContentContainer}>
            {hasBudgetInfo ? (
              <>
                {/* Total Estimated Budget Banner */}
                <GradientCard style={styles.budgetHeroCard}>
                  <Text style={[styles.budgetHeroLabel, { color: isDark ? '#065F46' : '#065F46' }]}>Estimated Repair Budget</Text>
                  <Text style={[styles.budgetHeroAmount, { color: '#047857' }]}>
                    ₹{budgetAmount.toLocaleString('en-IN')}
                  </Text>
                  <Text style={[styles.budgetHeroSub, { color: colors.textSecondary }]}>
                    {complaint.estimatedBudgetDesc || complaint.inspectionDetails?.estimatedBudgetDesc || 'Assessed based on municipal standard schedule of rates'}
                  </Text>
                </GradientCard>

                {/* Timeline and Cost Parameters */}
                <GradientCard style={styles.card}>
                  <Text style={[styles.cardTitle, { color: colors.textPrimary }]}>Cost &amp; Schedule Parameters</Text>
                  <View style={[styles.row, { borderBottomColor: isDark ? 'rgba(23, 32, 42, 0.12)' : colors.border }]}>
                    <Text style={[styles.rowLabel, { color: colors.textSecondary }]}>Estimated Duration</Text>
                    <Text style={[styles.rowValue, { color: colors.textPrimary }]}>
                      {complaint.estimatedResolutionDuration || '3 Days'}
                    </Text>
                  </View>
                  <View style={[styles.row, { borderBottomColor: isDark ? 'rgba(23, 32, 42, 0.12)' : colors.border }]}>
                    <Text style={[styles.rowLabel, { color: colors.textSecondary }]}>Expected Completion</Text>
                    <Text style={[styles.rowValue, { color: colors.textPrimary }]}>
                      {complaint.expectedResolutionDate ? formatResolutionDate(complaint.expectedResolutionDate) : 'Scheduled after inspection'}
                    </Text>
                  </View>
                  <View style={styles.row}>
                    <Text style={[styles.rowLabel, { color: colors.textSecondary }]}>Approval Status</Text>
                    <View style={styles.approvedPill}>
                      <Ionicons name="checkmark-circle" size={13} color="#059669" />
                      <Text style={styles.approvedPillText}>Sanctioned</Text>
                    </View>
                  </View>
                </GradientCard>

                {/* Itemized Budget Breakdown Card */}
                {(complaint.budgetBreakdown || complaint.inspectionDetails?.budgetBreakdown) ? (
                  <PracticalBudgetBreakdownCard
                    budgetBreakdown={complaint.budgetBreakdown || complaint.inspectionDetails?.budgetBreakdown}
                    severity={complaint.severity || 'MEDIUM'}
                    issueType={complaint.issueType}
                    estimatedBudget={complaint.estimatedBudget || complaint.inspectionDetails?.estimatedBudget}
                  />
                ) : null}
              </>
            ) : (
              /* When Budget is Not Yet Available */
              <GradientCard style={[styles.card, styles.emptyBudgetCard]}>
                <View style={[styles.emptyBudgetIconWrap, { backgroundColor: isDark ? 'rgba(255, 255, 255, 0.9)' : '#CCFBF1' }]}>
                  <Ionicons name="calculator-outline" size={44} color="#0D9488" />
                </View>
                <Text style={[styles.emptyBudgetTitle, { color: colors.textPrimary }]}>
                  Budget estimate not available yet.
                </Text>
                <Text style={[styles.emptyBudgetMsg, { color: colors.textSecondary }]}>
                  The repair budget, itemized materials, and labor costs will be calculated and approved following the physical on-site inspection by the Field Inspector.
                </Text>
                <View style={[styles.emptyBudgetStatusBadge, { backgroundColor: isDark ? 'rgba(255, 255, 255, 0.75)' : '#F1F5F9', borderColor: isDark ? 'rgba(23, 32, 42, 0.15)' : colors.border }]}>
                  <Ionicons name="time-outline" size={14} color={isDark ? AppColors.primary : AppColors.primary} />
                  <Text style={[styles.emptyBudgetStatusText, { color: colors.textPrimary }]}>
                    Status: Pending Field Inspection Assessment
                  </Text>
                </View>
              </GradientCard>
            )}
          </View>
        )}

        {/* ========================================================================= */}
        {/* TAB 4: DEPARTMENT DETAILS                                                 */}
        {/* ========================================================================= */}
        {activeTab === 'department' && (
          <View style={styles.tabContentContainer}>
            {!hasDepartmentInfo ? (
              /* When Department is Not Yet Available */
              <GradientCard style={[styles.card, styles.emptyBudgetCard]}>
                <View style={[styles.emptyBudgetIconWrap, { backgroundColor: isDark ? 'rgba(255, 255, 255, 0.9)' : '#E0F2FE' }]}>
                  <Ionicons name="business-outline" size={44} color={AppColors.primary} />
                </View>
                <Text style={[styles.emptyBudgetTitle, { color: colors.textPrimary }]}>
                  Department details not available yet.
                </Text>
                <Text style={[styles.emptyBudgetMsg, { color: colors.textSecondary }]}>
                  The designated department, jurisdictional authority, and responsible municipal officers will be assigned once the complaint is verified and routed.
                </Text>
                <View style={[styles.emptyBudgetStatusBadge, { backgroundColor: isDark ? 'rgba(255, 255, 255, 0.75)' : '#F1F5F9', borderColor: isDark ? 'rgba(23, 32, 42, 0.15)' : colors.border }]}>
                  <Ionicons name="time-outline" size={14} color={AppColors.primary} />
                  <Text style={[styles.emptyBudgetStatusText, { color: colors.textPrimary }]}>
                    Status: Pending Department Routing
                  </Text>
                </View>
              </GradientCard>
            ) : (
              <>
                {/* Assigned Department Info */}
                <GradientCard style={styles.card}>
                  <View style={styles.cardHeaderFlex}>
                    <Ionicons name="business-outline" size={18} color={AppColors.primary} />
                    <Text style={[styles.cardTitle, { color: colors.textPrimary }]}>Assigned Department</Text>
                  </View>

                  <View style={[styles.row, { borderBottomColor: isDark ? 'rgba(23, 32, 42, 0.12)' : colors.border }]}>
                    <Text style={[styles.rowLabel, { color: colors.textSecondary }]}>Department</Text>
                    <Text style={[styles.rowValueHighlight, { color: AppColors.primary }]}>
                      {departmentName}
                    </Text>
                  </View>

                  <View style={[styles.row, { borderBottomColor: isDark ? 'rgba(23, 32, 42, 0.12)' : colors.border }]}>
                    <Text style={[styles.rowLabel, { color: colors.textSecondary }]}>Department Code</Text>
                    <Text style={[styles.rowValue, { color: colors.textPrimary }]}>
                      {complaint.departmentCode || 'ROAD'}
                    </Text>
                  </View>

                  <View style={[styles.row, { borderBottomColor: isDark ? 'rgba(23, 32, 42, 0.12)' : colors.border }]}>
                    <Text style={[styles.rowLabel, { color: colors.textSecondary }]}>Jurisdiction</Text>
                    <Text style={[styles.rowValue, { color: colors.textPrimary }]}>
                      Coimbatore City Municipal Corporation (CCMC)
                    </Text>
                  </View>

                  <View style={styles.row}>
                    <Text style={[styles.rowLabel, { color: colors.textSecondary }]}>Routing Status</Text>
                    <Text style={[styles.rowValue, { color: colors.textPrimary }]}>
                      {complaint.routingStatus || 'Direct'}
                    </Text>
                  </View>
                </GradientCard>

                {/* Assigned Officer Details */}
                <GradientCard style={styles.card}>
                  <View style={styles.cardHeaderFlex}>
                    <Ionicons name="person-circle-outline" size={18} color={AppColors.primary} />
                    <Text style={[styles.cardTitle, { color: colors.textPrimary }]}>Assigned Municipal Officer</Text>
                  </View>

                  <View style={[styles.row, { borderBottomColor: isDark ? 'rgba(23, 32, 42, 0.12)' : colors.border }]}>
                    <Text style={[styles.rowLabel, { color: colors.textSecondary }]}>Officer Name</Text>
                    <Text style={[styles.rowValue, { color: colors.textPrimary, fontWeight: '700' }]}>
                      {assignedOfficerName || complaint.assignedOfficerName || (complaint as any).officerName || 'Awaiting Assignment'}
                    </Text>
                  </View>

                  <View style={[styles.row, { borderBottomColor: isDark ? 'rgba(23, 32, 42, 0.12)' : colors.border }]}>
                    <Text style={[styles.rowLabel, { color: colors.textSecondary }]}>Role / Designation</Text>
                    <Text style={[styles.rowValue, { color: colors.textPrimary }]}>
                      Assistant Executive Engineer (AEE)
                    </Text>
                  </View>

                  <View style={styles.row}>
                    <Text style={[styles.rowLabel, { color: colors.textSecondary }]}>Assignment State</Text>
                    <Text style={[styles.rowValue, { color: AppColors.primary, fontWeight: '600' }]}>
                      {complaint.assignedAt ? 'Officially Assigned' : 'Queued for Assignment'}
                    </Text>
                  </View>
                </GradientCard>

                {/* Field Inspector Details */}
                <GradientCard style={styles.card}>
                  <View style={styles.cardHeaderFlex}>
                    <Ionicons name="shield-outline" size={18} color="#0D9488" />
                    <Text style={[styles.cardTitle, { color: colors.textPrimary }]}>Field Inspector</Text>
                  </View>

                  <View style={[styles.row, { borderBottomColor: isDark ? 'rgba(23, 32, 42, 0.12)' : colors.border }]}>
                    <Text style={[styles.rowLabel, { color: colors.textSecondary }]}>Designated Inspector</Text>
                    <Text style={[styles.rowValue, { color: colors.textPrimary, fontWeight: '700' }]}>
                      {complaint.inspectionDetails?.inspectedByName || complaint.fieldVerifiedBy || complaint.assignedInspectorName || 'Awaiting Field Inspector Assignment'}
                    </Text>
                  </View>

                  <View style={styles.row}>
                    <Text style={[styles.rowLabel, { color: colors.textSecondary }]}>Inspection Wing</Text>
                    <Text style={[styles.rowValue, { color: colors.textPrimary }]}>
                      CCMC Field Inspection &amp; Rapid Audit Division
                    </Text>
                  </View>
                </GradientCard>

                {/* Multi-Department Involvement (if applicable) */}
                {(complaint.isOtherDeptInvolved || (complaint.involvedDepartments && complaint.involvedDepartments.length > 0)) && (
                  <GradientCard style={styles.card}>
                    <View style={styles.cardHeaderFlex}>
                      <Ionicons name="git-network-outline" size={18} color="#B45309" />
                      <Text style={[styles.cardTitle, { color: '#B45309' }]}>Joint Department Involvement</Text>
                    </View>
                    <Text style={{ fontSize: 13, color: colors.textPrimary, lineHeight: 18, marginTop: 4 }}>
                      This complaint involves secondary coordination with:{' '}
                      <Text style={{ fontWeight: '700' }}>{complaint.involvedDepartments?.join(', ')}</Text>.
                    </Text>
                    {complaint.otherDeptReason ? (
                      <Text style={{ fontSize: 12, color: colors.textSecondary, marginTop: 4 }}>
                        Coordination note: {complaint.otherDeptReason}
                      </Text>
                    ) : null}
                  </GradientCard>
                )}

                {/* Official Contact & Grievance Helpline */}
                <GradientCard style={styles.card}>
                  <View style={styles.cardHeaderFlex}>
                    <Ionicons name="call-outline" size={18} color={AppColors.primary} />
                    <Text style={[styles.cardTitle, { color: colors.textPrimary }]}>Official Department Helpline</Text>
                  </View>

                  <View style={[styles.row, { borderBottomColor: isDark ? 'rgba(23, 32, 42, 0.12)' : colors.border }]}>
                    <Text style={[styles.rowLabel, { color: colors.textSecondary }]}>Toll-Free Helpline</Text>
                    <Text style={[styles.rowValue, { color: AppColors.primary, fontWeight: '700' }]}>
                      1800-425-4321
                    </Text>
                  </View>

                  <View style={[styles.row, { borderBottomColor: isDark ? 'rgba(23, 32, 42, 0.12)' : colors.border }]}>
                    <Text style={[styles.rowLabel, { color: colors.textSecondary }]}>Control Room</Text>
                    <Text style={[styles.rowValue, { color: colors.textPrimary }]}>
                      0422-2302323
                    </Text>
                  </View>

                  <View style={styles.row}>
                    <Text style={[styles.rowLabel, { color: colors.textSecondary }]}>Operating Hours</Text>
                    <Text style={[styles.rowValue, { color: colors.textSecondary }]}>
                      Mon - Sat: 9:00 AM - 6:00 PM
                    </Text>
                  </View>
                </GradientCard>
              </>
            )}
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
  },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
  },
  errorText: {
    fontSize: 16,
    marginTop: 12,
    fontWeight: '600',
  },
  backBtn: {
    marginTop: 16,
    paddingHorizontal: 20,
    paddingVertical: 10,
    backgroundColor: AppColors.primary,
    borderRadius: 8,
  },
  backBtnText: {
    color: '#FFFFFF',
    fontWeight: '700',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
  },
  backIconBtn: {
    padding: 4,
    marginRight: 8,
  },
  headerTitleWrap: {
    flex: 1,
  },
  headerTitle: {
    fontSize: 17,
    fontWeight: '800',
    letterSpacing: 0.3,
  },
  headerSub: {
    fontSize: 12,
    marginTop: 1,
  },
  deleteHeaderBtn: {
    padding: 6,
  },
  tabBar: {
    borderBottomWidth: 1,
  },
  tabScrollContent: {
    flexDirection: 'row',
    paddingHorizontal: 12,
  },
  tabBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 14,
    marginRight: 6,
    borderBottomWidth: 3,
    borderBottomColor: 'transparent',
    gap: 6,
  },
  activeTabBtn: {
    // borderBottomColor set dynamically
  },
  tabBtnText: {
    fontSize: 13,
    fontWeight: '600',
  },
  activeTabBtnText: {
    fontWeight: '800',
  },
  scroll: {
    paddingBottom: 40,
  },
  tabContentContainer: {
    padding: 16,
    gap: 12,
  },
  imageCard: {
    borderRadius: 14,
    overflow: 'hidden',
    borderWidth: 1,
  },
  image: {
    width: '100%',
    height: 220,
  },
  evidenceImage: {
    width: '100%',
    height: 180,
    borderRadius: 10,
    marginTop: 4,
  },
  card: {
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 3,
    elevation: 1,
  },
  cardHeaderRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
  },
  cardHeaderFlex: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 12,
  },
  cardTitle: {
    fontSize: 15,
    fontWeight: '800',
    letterSpacing: 0.2,
  },
  issueHeading: {
    fontSize: 18,
    fontWeight: '800',
    lineHeight: 24,
    marginBottom: 4,
  },
  reportedDateText: {
    fontSize: 12,
    marginTop: 2,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  rowLabel: {
    fontSize: 13,
    fontWeight: '500',
    flex: 1,
  },
  rowValue: {
    fontSize: 13,
    fontWeight: '600',
    textAlign: 'right',
    flex: 1.5,
  },
  rowValueHighlight: {
    fontSize: 13,
    fontWeight: '800',
    textAlign: 'right',
    flex: 1.5,
  },
  priorityPill: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
    backgroundColor: '#F1F5F9',
  },
  priorityPillText: {
    fontSize: 12,
    fontWeight: '800',
  },
  descriptionText: {
    fontSize: 14,
    lineHeight: 20,
    marginTop: 4,
  },
  noticeBox: {
    borderRadius: 8,
    padding: 10,
    marginTop: 10,
    borderWidth: 1,
  },
  noticeBoxText: {
    fontSize: 12,
    lineHeight: 17,
  },
  metaGrid: {
    flexDirection: 'row',
    borderRadius: 10,
    padding: 12,
    marginTop: 14,
    borderWidth: 1,
  },
  metaCol: {
    flex: 1,
  },
  metaLabel: {
    fontSize: 11,
    fontWeight: '500',
    marginBottom: 3,
  },
  metaVal: {
    fontSize: 13,
    fontWeight: '700',
  },
  timelineList: {
    marginTop: 6,
  },
  timelineItemRow: {
    flexDirection: 'row',
    minHeight: 64,
  },
  timelineIndicatorCol: {
    width: 24,
    alignItems: 'center',
  },
  timelineDot: {
    width: 18,
    height: 18,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1,
  },
  timelineLine: {
    width: 2,
    flex: 1,
    marginVertical: 2,
  },
  timelineContentCol: {
    flex: 1,
    paddingLeft: 12,
    paddingBottom: 16,
  },
  timelineStatusTitle: {
    fontSize: 14,
    fontWeight: '800',
  },
  timelineDateText: {
    fontSize: 11,
    marginTop: 2,
  },
  timelineActorText: {
    fontSize: 11,
    marginTop: 2,
  },
  timelineRemarksText: {
    fontSize: 12,
    lineHeight: 16,
    marginTop: 4,
    fontStyle: 'italic',
  },
  budgetHeroCard: {
    borderRadius: 14,
    padding: 20,
    alignItems: 'center',
    borderWidth: 1.5,
  },
  budgetHeroLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: '#065F46',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  budgetHeroAmount: {
    fontSize: 32,
    fontWeight: '900',
    color: '#047857',
    marginVertical: 4,
  },
  budgetHeroSub: {
    fontSize: 12,
    color: '#065F46',
    textAlign: 'center',
    marginTop: 4,
  },
  approvedPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#ECFDF5',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  approvedPillText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#059669',
  },
  emptyBudgetCard: {
    alignItems: 'center',
    paddingVertical: 36,
    paddingHorizontal: 20,
  },
  emptyBudgetIconWrap: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#CCFBF1',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  emptyBudgetTitle: {
    fontSize: 17,
    fontWeight: '800',
    textAlign: 'center',
    marginBottom: 8,
  },
  emptyBudgetMsg: {
    fontSize: 13,
    lineHeight: 19,
    textAlign: 'center',
    maxWidth: 320,
    marginBottom: 16,
  },
  emptyBudgetStatusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
  },
  emptyBudgetStatusText: {
    fontSize: 12,
    fontWeight: '600',
  },
});
