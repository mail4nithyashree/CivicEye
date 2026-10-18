import StatusBadge from '@/components/StatusBadge';
import PracticalBudgetBreakdownCard from '@/components/PracticalBudgetBreakdownCard';
import CivicImage from '@/components/CivicImage';
import { getStandardEstimatedBudget } from '@/constants/coimbatoreRoads';
import { AppColors } from '@/constants/colors';
import {
  subscribeToComplaint,
  type Complaint,
  type ComplaintStatus,
} from '@/services/complaintService';
import { isRoadDepartment } from '@/services/departmentMapping';
import { formatResolutionDate } from '@/services/resolutionDuration';
import { getResponsibleOfficerName } from '@/services/officerService';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

const TIMELINE_STEPS: { key: ComplaintStatus; label: string; desc: string; icon: keyof typeof Ionicons.glyphMap }[] = [
  {
    key: 'Submitted',
    label: 'Complaint Raised',
    desc: 'Citizen registered complaint with AI defect analysis.',
    icon: 'document-text-outline',
  },
  {
    key: 'Pending Field Verification',
    label: 'Field Verification',
    desc: 'Queued for on-site physical inspection by Field Inspector.',
    icon: 'shield-outline',
  },
  {
    key: 'Verified',
    label: 'Verified & Estimated',
    desc: 'Inspector verified defect, severity, 1–7d estimate, budget & road authority.',
    icon: 'checkmark-circle-outline',
  },
  {
    key: 'Assigned',
    label: 'Authority Assigned',
    desc: 'Officially routed complaint to responsible maintenance department.',
    icon: 'business-outline',
  },
  {
    key: 'In Progress',
    label: 'Repair In Progress',
    desc: 'Maintenance crew and equipment deployed on-site.',
    icon: 'construct-outline',
  },
  {
    key: 'Resolved',
    label: 'Work Resolved',
    desc: 'Repair work completed and resolved by authority.',
    icon: 'checkmark-done-circle',
  },
];

function getTimelineIndex(status: ComplaintStatus): number {
  switch (status) {
    case 'Submitted':
      return 0;
    case 'Pending Field Verification':
    case 'Under Review':
      return 1;
    case 'Verified':
      return 2;
    case 'Assigned':
    case 'Accepted':
      return 3;
    case 'In Progress':
      return 4;
    case 'Resolved':
    case 'Closed':
      return 5;
    case 'Rejected':
    case 'Reopened':
      return 1;
    default:
      return 0;
  }
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.detailRow}>
      <Text style={styles.detailLabel}>{label}</Text>
      <Text style={styles.detailValue}>{value}</Text>
    </View>
  );
}

export default function ComplaintDetailScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
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

  const isMismatchedRejection =
    complaint.status === 'Invalid Issue image, raise the complaint with the appropriate image!' ||
    complaint.status === 'Dissimilar Image to the Issue' ||
    complaint.inspectionStatus === 'INVALID' ||
    complaint.rejectionType === 'IMAGE_MISMATCH' ||
    complaint.rejectionType === 'INVALID_IMAGE';

  const isRoad = isRoadDepartment(complaint.department || complaint.responsibleDepartment) &&
    !complaint.routingStatus?.startsWith('Moved') &&
    !isMismatchedRejection;
  const currentTimelineIndex = getTimelineIndex(complaint.status);
  const isRejected = complaint.status === 'Rejected';
  const isReopened = complaint.status === 'Reopened';
  const isResolved = complaint.status === 'Resolved' || complaint.status === 'Closed';
  const isMoved = !isRoad && !isMismatchedRejection && (!!complaint.routingStatus?.startsWith('Moved') || complaint.department !== 'Road Maintenance');

  const dateStr = complaint.createdAt.toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });

  return (
    <SafeAreaView style={styles.safe}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} accessibilityRole="button" accessibilityLabel="Back">
          <Ionicons name="arrow-back" size={24} color={AppColors.textPrimary} />
        </TouchableOpacity>
        <View style={styles.headerTitleWrap}>
          <Text style={styles.headerTitle}>{complaint.complaintId}</Text>
          <Text style={styles.headerSub}>{complaint.region} • Coimbatore</Text>
        </View>
        <View style={{ width: 24 }} />
      </View>

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        {/* Main Defect Image */}
        <CivicImage
          uri={complaint.imageUri}
          issueType={complaint.issueType}
          isInvalid={isMismatchedRejection}
          invalidMessage="Invalid Image, give valid Issue Image!"
          style={styles.image}
          resizeMode="cover"
        />

        {/* Status Header Card */}
        <View style={styles.statusCard}>
          <View style={styles.statusRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.issueHeading}>
                {isMismatchedRejection ? 'Invalid Image, give valid Issue Image!' : complaint.issueType}
              </Text>
              <Text style={styles.dateText}>Reported on {dateStr}</Text>
            </View>
            <StatusBadge status={complaint.status} inspectionStatus={complaint.inspectionStatus} size="md" />
          </View>

          {/* AI Model Detection Confidence & Extracted Keyword Badge (only for genuine issues) */}
          {!isMismatchedRejection && typeof complaint.confidence === 'number' && complaint.confidence > 0 && (
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

          <Text style={styles.description}>{complaint.description}</Text>

          {/* Location details */}
          <View style={styles.locationChip}>
            <Ionicons name="location-outline" size={14} color={AppColors.primary} />
            <Text style={styles.locationText}>
              {complaint.region} • GPS: {complaint.latitude.toFixed(5)}, {complaint.longitude.toFixed(5)}
            </Text>
          </View>
        </View>

        {/* Mismatched Rejection Banner */}
        {isMismatchedRejection && (
          <View style={styles.mismatchBanner}>
            <Ionicons name="ban" size={24} color="#DC2626" />
            <View style={{ flex: 1 }}>
              <Text style={styles.mismatchTitle}>Complaint Inactive: Invalid Image</Text>
              <Text style={styles.mismatchText}>
                {complaint.rejectionReason || 'Invalid Image, give valid Issue Image!'}
              </Text>
              <View style={styles.mismatchNoticeBox}>
                <Ionicons name="information-circle-outline" size={14} color="#64748B" />
                <Text style={styles.mismatchNoticeText}>
                  This complaint is saved in your history as an inactive record. It is excluded from officer queues and action pipelines.
                </Text>
              </View>
            </View>
          </View>
        )}

        {/* Department Involvement Notice if Secondary Department Involved */}
        {(complaint.isOtherDeptInvolved || (complaint as any).otherDepartmentInvolvement) && complaint.involvedDepartments && complaint.involvedDepartments.length > 0 && (
          <View style={styles.multiDeptBanner}>
            <Ionicons name="git-network-outline" size={22} color="#92400E" />
            <View style={{ flex: 1 }}>
              <Text style={styles.multiDeptBannerTitle}>Department Involvement Notice</Text>
              <Text style={styles.multiDeptBannerText}>
                There is involvement of the {complaint.involvedDepartments.join(', ')} Department in your reported issue.
              </Text>
            </View>
          </View>
        )}

        {/* Department Routing Notice if Moved / Non-Road */}
        {isMoved && (
          <View style={styles.routingBannerCard}>
            <View style={styles.routingBannerHeader}>
              <Ionicons name="swap-horizontal" size={22} color="#0369A1" />
              <View style={{ flex: 1 }}>
                <Text style={styles.routingBannerTitle}>
                  Department: {complaint.department || complaint.responsibleDepartment}
                </Text>
                <Text style={styles.routingBannerMessage}>
                  {complaint.routingMessage ||
                    `Your complaint has been moved to the ${complaint.department || complaint.responsibleDepartment} Department.`}
                </Text>
              </View>
            </View>
            <View style={styles.routingMetaRow}>
              <View style={styles.routingBadge}>
                <Text style={styles.routingBadgeText}>
                  Routing Status: {complaint.routingStatus || `Moved to ${complaint.department || complaint.responsibleDepartment}`}
                </Text>
              </View>
              {complaint.originalDepartment && complaint.originalDepartment !== complaint.department ? (
                <Text style={styles.routingOriginalText}>
                  From: {complaint.originalDepartment}
                </Text>
              ) : null}
            </View>
          </View>
        )}

        {/* RESOLUTION DETAILS CARD (When Resolved) */}
        {isResolved && (
          <View style={styles.resolutionCard}>
            <View style={styles.resolutionHeader}>
              <Ionicons name="checkmark-circle" size={24} color={AppColors.success} />
              <View style={{ flex: 1 }}>
                <Text style={styles.resolutionTitle}>Complaint Resolved</Text>
                <Text style={styles.resolutionSub}>
                  This issue has been successfully repaired and resolved by the department.
                </Text>
              </View>
            </View>

            <View style={styles.resolutionInfoBox}>
              <View style={styles.resolutionMetaRow}>
                <Text style={styles.resolutionMetaLabel}>Status:</Text>
                <View style={styles.resolvedStatusChip}>
                  <Ionicons name="checkmark" size={12} color="#047857" />
                  <Text style={styles.resolvedStatusChipText}>Resolved</Text>
                </View>
              </View>

              {complaint.resolutionDetails?.resolvedByName || complaint.assignedOfficerName ? (
                <View style={styles.resolutionMetaRow}>
                  <Text style={styles.resolutionMetaLabel}>Resolved By:</Text>
                  <Text style={styles.resolutionMetaValue}>
                    {complaint.resolutionDetails?.resolvedByName || complaint.assignedOfficerName || 'Maintenance Division'}
                  </Text>
                </View>
              ) : null}

              {complaint.resolutionDetails?.resolvedAt && (
                <View style={styles.resolutionMetaRow}>
                  <Text style={styles.resolutionMetaLabel}>Resolved Date:</Text>
                  <Text style={styles.resolutionMetaValue}>
                    {complaint.resolutionDetails.resolvedAt instanceof Date
                      ? complaint.resolutionDetails.resolvedAt.toLocaleDateString('en-IN', {
                          day: '2-digit',
                          month: 'short',
                          year: 'numeric',
                        })
                      : 'Completed'}
                  </Text>
                </View>
              )}

              {complaint.resolutionDetails?.contractorName ? (
                <View style={styles.resolutionMetaRow}>
                  <Text style={styles.resolutionMetaLabel}>Contractor / Wing:</Text>
                  <Text style={styles.resolutionMetaValue}>
                    {complaint.resolutionDetails.contractorName}
                  </Text>
                </View>
              ) : null}

              {complaint.resolutionDetails?.resolutionRemarks ? (
                <View style={styles.resolutionRemarksWrap}>
                  <Text style={styles.resolutionMetaLabel}>Resolution Remarks:</Text>
                  <Text style={styles.resolutionRemarksText}>
                    {complaint.resolutionDetails.resolutionRemarks}
                  </Text>
                </View>
              ) : null}

              {complaint.resolutionDetails?.afterRepairImageUri ? (
                <View style={styles.afterRepairWrap}>
                  <Text style={styles.resolutionMetaLabel}>Repair Evidence Photo:</Text>
                  <CivicImage
                    uri={complaint.resolutionDetails.afterRepairImageUri}
                    style={styles.afterRepairImage}
                    resizeMode="cover"
                  />
                </View>
              ) : null}
            </View>
          </View>
        )}

        {/* Rejection Alert Card if Rejected */}
        {isRejected && (
          <View style={styles.rejectedBanner}>
            <Ionicons name="alert-circle" size={22} color={AppColors.error} />
            <View style={{ flex: 1 }}>
              <Text style={styles.rejectedTitle}>Complaint Rejected during Inspection</Text>
              <Text style={styles.rejectedText}>
                {complaint.rejectionReason || 'Defect not found on-site or marked as invalid during field verification.'}
              </Text>
              {complaint.inspectorRemarks ? (
                <Text style={[styles.rejectedText, { marginTop: 4, fontStyle: 'italic' }]}>
                  Remarks: &ldquo;{complaint.inspectorRemarks}&rdquo;
                </Text>
              ) : null}
            </View>
          </View>
        )}

        {/* Reopen Banner if Reopened */}
        {isReopened && (
          <View style={styles.reopenedBanner}>
            <Ionicons name="refresh-circle" size={22} color="#E11D48" />
            <View style={{ flex: 1 }}>
              <Text style={styles.reopenedTitle}>Complaint Reopened for Administrative Review</Text>
              <Text style={styles.reopenedText}>
                Complaint under administrative review for re-inspection.
              </Text>
            </View>
          </View>
        )}

        {/* Citizen Description & Landmark - High Visibility */}
        {complaint.description ? (
          <View style={styles.descCard}>
            <View style={styles.descCardHeader}>
              <Ionicons name="chatbox-ellipses" size={18} color={AppColors.primary} />
              <Text style={styles.descCardTitle}>Citizen Description &amp; Landmark</Text>
            </View>
            <Text style={styles.descCardBody}>
              {complaint.description}
            </Text>
          </View>
        ) : null}

        {/* Complaint Information Overview */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Complaint Information</Text>
          <DetailRow label="Complaint ID" value={`#${complaint.complaintId}`} />
          <DetailRow label="Issue Type" value={complaint.issueType} />
          <DetailRow label="Priority" value={(complaint.priority || complaint.severity || 'LOW').toUpperCase()} />
          <DetailRow label="Department" value={complaint.department || complaint.responsibleDepartment} />
          <DetailRow
            label="Assigned Officer"
            value={complaint.assignedOfficerName || complaint.assignedOfficer || assignedOfficerName || 'Awaiting Assignment'}
          />
          <DetailRow
            label="Estimated Resolution"
            value={complaint.estimatedResolutionDuration || (complaint.estimatedResolutionDays ? `${complaint.estimatedResolutionDays} Days` : '3 Days')}
          />
          <DetailRow
            label="Expected Resolution Date"
            value={complaint.expectedResolutionDate ? formatResolutionDate(complaint.expectedResolutionDate) : 'Pending Verification'}
          />
          {complaint.fieldVerificationStatus ? (
            <DetailRow
              label="Field Verification"
              value={
                complaint.fieldVerificationStatus === 'department_confirmed'
                  ? 'Verified (Existing Dept Confirmed)'
                  : complaint.fieldVerificationStatus === 'transferred'
                  ? `Transferred to ${complaint.department}`
                  : complaint.fieldVerificationStatus === 'verified'
                  ? 'Verified'
                  : 'Pending Verification'
              }
            />
          ) : null}
          {complaint.fieldVerificationRemarks ? (
            <DetailRow label="Verification Remarks" value={complaint.fieldVerificationRemarks} />
          ) : null}
          <DetailRow
            label="Routing Status"
            value={complaint.routingStatus || (complaint.department !== 'Road Maintenance' ? 'Moved' : 'Direct')}
          />
          {complaint.originalDepartment && complaint.originalDepartment !== complaint.department ? (
            <DetailRow label="Original Department" value={complaint.originalDepartment} />
          ) : null}
          {complaint.departmentSource ? (
            <DetailRow
              label="Department Source"
              value={
                complaint.departmentSource === 'description'
                  ? 'Identified from Description'
                  : complaint.departmentSource === 'field_inspector'
                  ? 'Field Inspector Reassignment'
                  : complaint.departmentSource === 'officer'
                  ? 'Officer Reassignment'
                  : 'AI Model'
              }
            />
          ) : null}
          <DetailRow
            label="Location Coordinates"
            value={`${complaint.latitude.toFixed(6)}, ${complaint.longitude.toFixed(6)}`}
          />
          <DetailRow label="Region" value={complaint.region || 'Gandhipuram'} />
        </View>

        {/* Dual Analysis Comparison: AI Initial Detection vs Field Inspector Verified (Only for Road Maintenance) */}
        {isRoad ? (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Defect &amp; Verification Details</Text>

            {/* AI Initial Box */}
            <View style={styles.aiBox}>
              <View style={styles.subHeaderRow}>
                <Ionicons name="hardware-chip-outline" size={16} color={AppColors.primary} />
                <Text style={styles.subHeader}>1. AI Initial Prediction (Preliminary)</Text>
              </View>
              <View style={styles.grid2}>
                <View>
                  <Text style={styles.gridLabel}>AI Defect Class</Text>
                  <Text style={styles.gridVal}>{complaint.issueType.toUpperCase()}</Text>
                </View>
                <View>
                  <Text style={styles.gridLabel}>Confidence</Text>
                  <Text style={styles.gridVal}>{complaint.confidence}%</Text>
                </View>
              </View>
              <View style={[styles.grid2, { marginTop: 8 }]}>
                <View>
                  <Text style={styles.gridLabel}>Priority / Severity</Text>
                  <Text style={styles.gridVal}>{complaint.priority || complaint.severity || 'MEDIUM'}</Text>
                </View>
                <View>
                  <Text style={styles.gridLabel}>Budget Estimation</Text>
                  <Text style={[styles.gridVal, { color: '#0D9488' }]}>
                    {complaint.inspectionDetails?.estimatedBudget || complaint.estimatedBudget
                      ? `₹${(complaint.inspectionDetails?.estimatedBudget || complaint.estimatedBudget || 0).toLocaleString('en-IN')} (Field Verified)`
                      : 'Pending Field Inspection'}
                  </Text>
                </View>
              </View>
            </View>

            {/* Field Inspector Verified Box */}
            {complaint.inspectionDetails ? (
              <View style={styles.inspectorBox}>
                <View style={styles.subHeaderRow}>
                  <Ionicons name="shield-checkmark" size={16} color="#0D9488" />
                  <Text style={[styles.subHeader, { color: '#0D9488' }]}>
                    2. Field Inspector On-Site Verification (Approved)
                  </Text>
                </View>

                <View style={styles.grid2}>
                  <View>
                    <Text style={styles.gridLabel}>Verified Issue</Text>
                    <Text style={[styles.gridVal, { color: '#0D9488' }]}>
                      {complaint.inspectionDetails.verifiedIssue.toUpperCase()}
                    </Text>
                  </View>
                  <View>
                    <Text style={styles.gridLabel}>Severity</Text>
                    <Text style={[styles.gridVal, { color: '#C2410C' }]}>
                      {complaint.inspectionDetails.severity}
                    </Text>
                  </View>
                </View>

                <View style={[styles.grid2, { marginTop: 8 }]}>
                  <View>
                    <Text style={styles.gridLabel}>Est. Resolution Time</Text>
                    <Text style={styles.gridVal}>
                      {complaint.inspectionDetails.estimatedResolutionDays} Days (Max 7d)
                    </Text>
                  </View>
                  <View>
                    <Text style={styles.gridLabel}>Manually Estimated Budget</Text>
                    <Text style={[styles.gridVal, { color: '#0F766E', fontWeight: '800' }]}>
                      ₹{complaint.inspectionDetails.estimatedBudget.toLocaleString('en-IN')}
                    </Text>
                  </View>
                </View>

                <View style={{ marginTop: 10 }}>
                  <PracticalBudgetBreakdownCard
                    budgetBreakdown={complaint.inspectionDetails.budgetBreakdown || complaint.budgetBreakdown}
                    issueType={complaint.inspectionDetails.verifiedIssue}
                    severity={complaint.inspectionDetails.severity}
                    estimatedBudget={complaint.inspectionDetails.estimatedBudget}
                    estimatedBudgetDesc={complaint.inspectionDetails.budgetBreakdown?.description}
                    title="Inspector Verified Budget & Resource Allocation"
                    showBoqToggle={true}
                    initiallyExpanded={false}
                  />
                </View>

                <View style={styles.roadDetailRow}>
                  <Text style={styles.gridLabel}>Identified Road / Sector:</Text>
                  <Text style={styles.roadNameText}>{complaint.inspectionDetails.roadName}</Text>
                </View>

                <View style={styles.roadDetailRow}>
                  <Text style={styles.gridLabel}>Routed Maintenance Authority:</Text>
                  <Text style={styles.authorityText}>
                    {complaint.inspectionDetails.maintenanceAuthority}
                  </Text>
                </View>

                {complaint.inspectionDetails.isOtherDeptInvolved && complaint.inspectionDetails.involvedDepartments?.length ? (
                  <View style={styles.multiDeptBox}>
                    <Ionicons name="git-network-outline" size={14} color="#B45309" />
                    <View style={{ flex: 1 }}>
                      <Text style={styles.multiDeptTitle}>Secondary Department Involved:</Text>
                      <Text style={styles.multiDeptVal}>
                        {complaint.inspectionDetails.involvedDepartments.join(', ')}
                      </Text>
                    </View>
                  </View>
                ) : null}

                {complaint.inspectionDetails.inspectorRemarks ? (
                  <View style={styles.remarksWrap}>
                    <Text style={styles.gridLabel}>Inspector On-Site Observations:</Text>
                    <Text style={styles.remarksText}>
                      &ldquo;{complaint.inspectionDetails.inspectorRemarks}&rdquo;
                    </Text>
                  </View>
                ) : null}

                {(complaint.inspectionEvidenceUrl || (complaint as any).inspectionDetails?.inspectionEvidenceUrl) ? (
                  <View style={{ marginTop: 10 }}>
                    <Text style={styles.gridLabel}>Field Inspector Observation Photo:</Text>
                    <CivicImage
                      uri={complaint.inspectionEvidenceUrl || (complaint as any).inspectionDetails?.inspectionEvidenceUrl}
                      style={{ width: '100%', height: 160, borderRadius: 10, marginTop: 6 }}
                      resizeMode="cover"
                    />
                  </View>
                ) : null}
              </View>
            ) : (
              <View style={styles.pendingInspectorNotice}>
                <Ionicons name="hourglass-outline" size={18} color="#B45309" />
                <Text style={styles.pendingInspectorText}>
                  Awaiting Field Inspector on-site verification to confirm defect, manually estimate repair budget in ₹, and route to executing authority.
                </Text>
              </View>
            )}
          </View>
        ) : (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Department Processing Details</Text>
            <View style={styles.aiBox}>
              <View style={styles.subHeaderRow}>
                <Ionicons name="business-outline" size={16} color={AppColors.primary} />
                <Text style={styles.subHeader}>Routed Department Management</Text>
              </View>
              <Text style={{ fontSize: 13, color: AppColors.textSecondary, marginTop: 6, lineHeight: 18 }}>
                {complaint.routingMessage || `This complaint is routed to ${complaint.department || complaint.responsibleDepartment} for departmental action and is managed outside the Road Maintenance lifecycle.`}
              </Text>
              <View style={[styles.grid2, { marginTop: 12 }]}>
                <View>
                  <Text style={styles.gridLabel}>Routed Department</Text>
                  <Text style={styles.gridVal}>{complaint.department || complaint.responsibleDepartment}</Text>
                </View>
                <View>
                  <Text style={styles.gridLabel}>Routing Status</Text>
                  <Text style={[styles.gridVal, { color: '#0284C7' }]}>{complaint.routingStatus || 'Moved'}</Text>
                </View>
              </View>
            </View>
          </View>
        )}

        {/* Lifecycle Interactive Timeline (Only for Road Maintenance) */}
        {isRoad && (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Complaint Lifecycle Tracker</Text>
            <View style={styles.timeline}>
              {TIMELINE_STEPS.map((step, idx) => {
                const isPast = idx < currentTimelineIndex;
                const isCurrent = idx === currentTimelineIndex;
                const isLast = idx === TIMELINE_STEPS.length - 1;

                return (
                  <View key={step.key} style={styles.timelineItem}>
                    <View style={styles.timelineLeft}>
                      <View
                        style={[
                          styles.timelineDot,
                          isPast && styles.timelineDotDone,
                          isCurrent && styles.timelineDotCurrent,
                        ]}
                      >
                        <Ionicons
                          name={isPast ? 'checkmark' : step.icon}
                          size={12}
                          color={isPast || isCurrent ? AppColors.white : AppColors.placeholder}
                        />
                      </View>
                      {!isLast && (
                        <View
                          style={[
                            styles.timelineLine,
                            isPast && styles.timelineLineDone,
                          ]}
                        />
                      )}
                    </View>
                    <View style={styles.timelineContent}>
                      <Text
                        style={[
                          styles.timelineTitle,
                          (isPast || isCurrent) && styles.timelineTitleActive,
                        ]}
                      >
                        {step.label}
                      </Text>
                      <Text style={styles.timelineDesc}>{step.desc}</Text>
                    </View>
                  </View>
                );
              })}
            </View>
          </View>
        )}

        {/* Complete Audit History */}
        {complaint.statusHistory && complaint.statusHistory.length > 0 && (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Status Audit Log</Text>
            {complaint.statusHistory.map((item, idx) => (
              <View key={item.id || idx} style={styles.historyRow}>
                <View style={styles.historyBullet} />
                <View style={{ flex: 1 }}>
                  <View style={styles.historyTop}>
                    <Text style={styles.historyStatus}>{item.newStatus}</Text>
                    <Text style={styles.historyDate}>
                      {item.timestamp instanceof Date ? item.timestamp.toLocaleDateString('en-IN') : 'Recent'}
                    </Text>
                  </View>
                  {item.remarks ? <Text style={styles.historyRemarks}>{item.remarks}</Text> : null}
                  <Text style={styles.historyBy}>Updated by: {item.updatedByName}</Text>
                </View>
              </View>
            ))}
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: AppColors.background },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 18,
    paddingVertical: 12,
    backgroundColor: AppColors.surface,
    borderBottomWidth: 1,
    borderBottomColor: AppColors.border,
  },
  headerTitleWrap: { alignItems: 'center' },
  headerTitle: { fontSize: 16, fontWeight: '800', color: AppColors.textPrimary },
  headerSub: { fontSize: 11, color: AppColors.textSecondary },
  scroll: { padding: 18, paddingBottom: 40 },
  image: {
    width: '100%',
    height: 220,
    borderRadius: 16,
    marginBottom: 16,
  },
  statusCard: {
    backgroundColor: AppColors.surface,
    borderRadius: 16,
    padding: 16,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: AppColors.border,
  },
  statusRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 10,
  },
  issueHeading: {
    fontSize: 18,
    fontWeight: '800',
    color: AppColors.textPrimary,
    textTransform: 'capitalize',
  },
  dateText: {
    fontSize: 12,
    color: AppColors.textSecondary,
    marginTop: 2,
  },
  description: {
    fontSize: 14,
    color: AppColors.textPrimary,
    lineHeight: 20,
    marginBottom: 12,
  },
  locationChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#EFF6FF',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
  },
  locationText: {
    fontSize: 11,
    fontWeight: '600',
    color: AppColors.primary,
  },
  routingBannerCard: {
    backgroundColor: '#F0F9FF',
    borderRadius: 16,
    padding: 16,
    marginBottom: 14,
    borderWidth: 1.5,
    borderColor: '#BAE6FD',
  },
  routingBannerHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    marginBottom: 8,
  },
  routingBannerTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: '#0369A1',
    marginBottom: 3,
  },
  routingBannerMessage: {
    fontSize: 13,
    color: '#0C4A6E',
    lineHeight: 18,
  },
  routingMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#E0F2FE',
  },
  routingBadge: {
    backgroundColor: '#E0F2FE',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  routingBadgeText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#0284C7',
  },
  routingOriginalText: {
    fontSize: 12,
    color: AppColors.textSecondary,
    fontWeight: '500',
  },
  multiDeptBanner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    backgroundColor: '#FFFBEB',
    padding: 14,
    borderRadius: 12,
    marginBottom: 14,
    borderWidth: 1.5,
    borderColor: '#FDE68A',
  },
  multiDeptBannerTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: '#92400E',
  },
  multiDeptBannerText: {
    fontSize: 12,
    color: '#B45309',
    marginTop: 2,
    lineHeight: 17,
  },
  resolutionCard: {
    backgroundColor: '#F0FDF4',
    borderRadius: 16,
    padding: 16,
    marginBottom: 14,
    borderWidth: 1.5,
    borderColor: '#BBF7D0',
  },
  resolutionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 12,
  },
  resolutionTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#15803D',
  },
  resolutionSub: {
    fontSize: 12,
    color: '#166534',
    marginTop: 2,
    lineHeight: 16,
  },
  resolutionInfoBox: {
    backgroundColor: '#FFFFFF',
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#DCFCE7',
    gap: 8,
  },
  resolutionMetaRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 3,
  },
  resolutionMetaLabel: {
    fontSize: 12,
    color: AppColors.textSecondary,
    fontWeight: '600',
  },
  resolutionMetaValue: {
    fontSize: 13,
    fontWeight: '700',
    color: AppColors.textPrimary,
  },
  resolvedStatusChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#ECFDF5',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#6EE7B7',
  },
  resolvedStatusChipText: {
    fontSize: 12,
    fontWeight: '800',
    color: '#047857',
  },
  resolutionRemarksWrap: {
    marginTop: 4,
    paddingTop: 6,
    borderTopWidth: 1,
    borderTopColor: '#F3F4F6',
  },
  resolutionRemarksText: {
    fontSize: 13,
    color: AppColors.textPrimary,
    lineHeight: 18,
    marginTop: 3,
  },
  afterRepairWrap: {
    marginTop: 8,
  },
  afterRepairImage: {
    width: '100%',
    height: 160,
    borderRadius: 10,
    marginTop: 6,
  },
  rejectedBanner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    backgroundColor: '#FEF2F2',
    padding: 14,
    borderRadius: 12,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: '#FECACA',
  },
  rejectedTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: AppColors.error,
  },
  rejectedText: {
    fontSize: 12,
    color: '#991B1B',
    marginTop: 2,
  },
  reopenedBanner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    backgroundColor: '#FFF1F2',
    padding: 14,
    borderRadius: 12,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: '#FECDD3',
  },
  reopenedTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#E11D48',
  },
  reopenedText: {
    fontSize: 12,
    color: '#9F1239',
    marginTop: 2,
  },
  descCard: {
    backgroundColor: AppColors.surface,
    borderRadius: 14,
    padding: 16,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: AppColors.border,
    ...Platform.select({
      web: {
        boxShadow: '0px 2px 4px rgba(0, 0, 0, 0.04)',
      },
      default: {
        shadowColor: '#000',
        shadowOpacity: 0.04,
        shadowRadius: 4,
        shadowOffset: { width: 0, height: 2 },
        elevation: 1,
      },
    }),
  },
  descCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 8,
  },
  descCardTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: AppColors.textPrimary,
    textTransform: 'uppercase',
    letterSpacing: 0.3,
  },
  descCardBody: {
    fontSize: 14,
    color: AppColors.textPrimary,
    lineHeight: 20,
  },
  card: {
    backgroundColor: AppColors.surface,
    borderRadius: 16,
    padding: 16,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: AppColors.border,
  },
  cardTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: AppColors.textPrimary,
    marginBottom: 12,
  },
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 7,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: AppColors.border,
  },
  detailLabel: {
    fontSize: 12,
    color: AppColors.textSecondary,
    fontWeight: '500',
    flexShrink: 1,
  },
  detailValue: {
    fontSize: 13,
    fontWeight: '700',
    color: AppColors.textPrimary,
    maxWidth: '65%',
    textAlign: 'right',
    flexShrink: 1,
  },
  aiBox: {
    backgroundColor: '#F8FAFC',
    borderRadius: 10,
    padding: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    marginBottom: 12,
  },
  inspectorBox: {
    backgroundColor: '#F0FDFA',
    borderRadius: 10,
    padding: 12,
    borderWidth: 1,
    borderColor: '#CCFBF1',
  },
  subHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(0,0,0,0.06)',
    paddingBottom: 4,
  },
  subHeader: {
    fontSize: 12,
    fontWeight: '800',
    color: AppColors.primary,
  },
  grid2: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 8,
    flexWrap: 'wrap',
  },
  gridLabel: {
    fontSize: 11,
    color: AppColors.textSecondary,
  },
  gridVal: {
    fontSize: 13,
    fontWeight: '700',
    color: AppColors.textPrimary,
    marginTop: 1,
  },
  roadDetailRow: {
    marginTop: 6,
  },
  roadNameText: {
    fontSize: 13,
    fontWeight: '700',
    color: AppColors.textPrimary,
  },
  authorityText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#0D9488',
  },
  multiDeptBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#FFFBEB',
    padding: 8,
    borderRadius: 6,
    marginTop: 8,
    borderWidth: 1,
    borderColor: '#FDE68A',
  },
  multiDeptTitle: {
    fontSize: 11,
    fontWeight: '700',
    color: '#92400E',
  },
  multiDeptVal: {
    fontSize: 12,
    fontWeight: '600',
    color: '#B45309',
    marginTop: 1,
  },
  remarksWrap: {
    marginTop: 8,
    backgroundColor: '#CCFBF1',
    padding: 8,
    borderRadius: 6,
  },
  remarksText: {
    fontSize: 12,
    color: '#0F766E',
    fontStyle: 'italic',
    marginTop: 2,
  },
  pendingInspectorNotice: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    backgroundColor: '#FFFBEB',
    padding: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#FDE68A',
  },
  pendingInspectorText: {
    fontSize: 12,
    color: '#92400E',
    lineHeight: 16,
    flex: 1,
  },
  timeline: {
    paddingVertical: 4,
  },
  timelineItem: {
    flexDirection: 'row',
    minHeight: 52,
  },
  timelineLeft: {
    width: 24,
    alignItems: 'center',
  },
  timelineDot: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: AppColors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  timelineDotDone: {
    backgroundColor: AppColors.success,
  },
  timelineDotCurrent: {
    backgroundColor: AppColors.primary,
  },
  timelineLine: {
    width: 2,
    flex: 1,
    backgroundColor: AppColors.border,
    marginVertical: 2,
  },
  timelineLineDone: {
    backgroundColor: AppColors.success,
  },
  timelineContent: {
    flex: 1,
    marginLeft: 12,
    paddingBottom: 14,
  },
  timelineTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: AppColors.placeholder,
  },
  timelineTitleActive: {
    color: AppColors.textPrimary,
    fontWeight: '700',
  },
  timelineDesc: {
    fontSize: 11,
    color: AppColors.textSecondary,
    marginTop: 2,
  },
  historyRow: {
    flexDirection: 'row',
    gap: 10,
    paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: AppColors.border,
  },
  historyBullet: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: AppColors.primary,
    marginTop: 5,
  },
  historyTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  historyStatus: {
    fontSize: 13,
    fontWeight: '700',
    color: AppColors.textPrimary,
  },
  historyDate: {
    fontSize: 11,
    color: AppColors.textSecondary,
  },
  historyRemarks: {
    fontSize: 12,
    color: AppColors.textPrimary,
    marginTop: 2,
  },
  historyBy: {
    fontSize: 10,
    color: AppColors.textSecondary,
    marginTop: 2,
  },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  errorText: {
    fontSize: 16,
    color: AppColors.error,
    marginTop: 12,
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
  mismatchBanner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    backgroundColor: '#FEF2F2',
    padding: 16,
    borderRadius: 14,
    marginBottom: 16,
    borderWidth: 1.5,
    borderColor: '#FECACA',
  },
  mismatchTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: '#DC2626',
    marginBottom: 4,
  },
  mismatchText: {
    fontSize: 13,
    color: '#7F1D1D',
    lineHeight: 18,
  },
  mismatchNoticeBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 6,
    backgroundColor: '#F8FAFC',
    padding: 10,
    borderRadius: 8,
    marginTop: 10,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  mismatchNoticeText: {
    fontSize: 11,
    color: '#475569',
    lineHeight: 15,
    flex: 1,
  },
});
