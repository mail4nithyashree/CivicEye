import React from 'react';
import { AppColors } from '@/constants/colors';
import { getStandardEstimatedBudget } from '@/constants/coimbatoreRoads';
import type { Complaint } from '@/services/complaintService';
import { isRoadDepartment } from '@/services/departmentMapping';
import { Ionicons } from '@expo/vector-icons';
import { Platform, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import StatusBadge from './StatusBadge';
import CivicImage from './CivicImage';

interface Props {
  complaint: Complaint;
  onPress?: () => void;
}

function PriorityBadge({ priority }: { priority: string }) {
  const cfg: Record<string, { bg: string; text: string }> = {
    HIGH:   { bg: '#FEF2F2', text: AppColors.error },
    MEDIUM: { bg: '#FFF7ED', text: '#C2410C' },
    LOW:    { bg: '#F0FDF4', text: AppColors.success },
    NONE:   { bg: '#F3F4F6', text: AppColors.textSecondary },
  };
  const c = cfg[priority.toUpperCase()] ?? cfg['LOW'];
  return (
    <View style={[priorityStyles.badge, { backgroundColor: c.bg }]}>
      <Text style={[priorityStyles.text, { color: c.text }]}>{priority.toUpperCase()}</Text>
    </View>
  );
}

const priorityStyles = StyleSheet.create({
  badge: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 8, alignSelf: 'flex-start' },
  text: { fontSize: 10, fontWeight: '700' },
});

function ComplaintCardComponent({ complaint, onPress }: Props) {
  const date = complaint.createdAt instanceof Date
    ? complaint.createdAt.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
    : 'N/A';

  const isMismatchedRejection =
    complaint.status === 'Invalid Issue image, raise the complaint with the appropriate image!' ||
    complaint.status === 'Dissimilar Image to the Issue' ||
    complaint.inspectionStatus === 'INVALID' ||
    complaint.rejectionType === 'IMAGE_MISMATCH' ||
    complaint.rejectionType === 'INVALID_IMAGE' ||
    complaint.status === 'Rejected';

  const priority = complaint.inspectionDetails?.severity || complaint.priority || complaint.severity || 'LOW';
  const issue = isMismatchedRejection
    ? 'Invalid Issue image, raise the complaint with the appropriate image!'
    : (complaint.inspectionDetails?.verifiedIssue || complaint.issueType || 'Road Issue');

  const isRoad = isRoadDepartment(complaint.department || complaint.responsibleDepartment);
  const isMoved = !isRoad || !!complaint.routingStatus?.startsWith('Moved');

  return (
    <TouchableOpacity
      style={[
        styles.card,
        isMismatchedRejection && styles.inactiveCard,
      ]}
      onPress={onPress}
      activeOpacity={0.7}
      accessible
      accessibilityRole="button"
      accessibilityLabel={`Complaint ${complaint.complaintId}, ${issue}, status ${complaint.status}`}
    >
      {/* Complaint image */}
      <View style={isMismatchedRejection ? styles.inactiveImageWrap : undefined}>
        <CivicImage
          uri={complaint.imageUri}
          issueType={complaint.issueType}
          isInvalid={isMismatchedRejection}
          invalidMessage="Invalid Image, give valid Issue Image!"
          style={[styles.image, isMismatchedRejection && styles.inactiveImage]}
          resizeMode="cover"
        />
        {isMismatchedRejection && (
          <View style={styles.imageInactiveOverlay}>
            <Ionicons name="ban" size={20} color="#FFFFFF" />
            <Text style={styles.imageInactiveOverlayText}>Invalid Image, give valid Issue Image!</Text>
          </View>
        )}
      </View>

      <View style={styles.body}>
        {/* Top row: ID + Region + status badge */}
        <View style={styles.topRow}>
          <View style={styles.idRegionCol}>
            <Text style={[styles.id, isMismatchedRejection && styles.inactiveText]}>{complaint.complaintId}</Text>
            {complaint.region ? (
              <View style={[styles.regionBadge, isMismatchedRejection && styles.inactiveRegionBadge]}>
                <Ionicons name="location-sharp" size={10} color={isMismatchedRejection ? AppColors.textSecondary : AppColors.primary} />
                <Text style={[styles.regionText, isMismatchedRejection && styles.inactiveRegionText]}>{complaint.region}</Text>
              </View>
            ) : null}
          </View>
          <StatusBadge status={complaint.status} inspectionStatus={complaint.inspectionStatus} />
        </View>

        {/* Issue type */}
        <Text style={[styles.issue, isMismatchedRejection && styles.inactiveIssue]}>{issue}</Text>

        {/* Inactive Rejection Alert Banner */}
        {isMismatchedRejection && (
          <View style={styles.inactiveRejectionBanner}>
            <Ionicons name="alert-circle" size={14} color="#DC2626" />
            <Text style={styles.inactiveRejectionBannerText}>
              Invalid Issue image, raise the complaint with the appropriate image!
            </Text>
          </View>
        )}

        {/* Citizen Description Preview - High Visibility */}
        {complaint.description ? (
          <View style={[styles.descPreviewBox, isMismatchedRejection && styles.inactiveDescPreviewBox]}>
            <Ionicons name="chatbox-ellipses-outline" size={12} color={isMismatchedRejection ? AppColors.textSecondary : AppColors.primary} style={{ marginTop: 2 }} />
            <Text style={[styles.descPreviewText, isMismatchedRejection && styles.inactiveDescText]} numberOfLines={2}>
              {complaint.description}
            </Text>
          </View>
        ) : null}

        {/* Department & Routing Tag (only if not mismatched rejection) */}
        {!isMismatchedRejection && (
          <View style={styles.deptBadgeRow}>
            <View style={[styles.deptBadge, isMoved ? styles.deptBadgeMoved : styles.deptBadgeDirect]}>
              <Ionicons
                name={isMoved ? "swap-horizontal" : "business-outline"}
                size={12}
                color={isMoved ? "#0369A1" : AppColors.textSecondary}
              />
              <Text
                style={[
                  styles.deptBadgeText,
                  isMoved ? styles.deptBadgeTextMoved : styles.deptBadgeTextDirect
                ]}
                numberOfLines={1}
              >
                {complaint.department || complaint.responsibleDepartment || 'Road Maintenance'}
                {isMoved ? ` • ${complaint.routingStatus || 'Moved'}` : ''}
              </Text>
            </View>
          </View>
        )}

        {/* Confidence + Priority row (only if active/genuine) */}
        {!isMismatchedRejection && (
          <View style={styles.metaRow}>
            <View style={styles.metaItem}>
              <Text style={styles.metaLabel}>AI Confidence</Text>
              <Text style={styles.metaValue}>{complaint.confidence}%</Text>
            </View>
            <View style={styles.metaItem}>
              <Text style={styles.metaLabel}>Severity</Text>
              <PriorityBadge priority={priority} />
            </View>
          </View>
        )}

        {/* Budget & Resolution Duration Chips */}
        {!isMismatchedRejection && (() => {
          const budgetNum = complaint.inspectionDetails?.estimatedBudget ?? complaint.estimatedBudget ?? (complaint.issueType ? getStandardEstimatedBudget(complaint.issueType, complaint.priority || complaint.severity).budget : 0);
          const durationStr = complaint.estimatedResolutionDuration || (complaint.inspectionDetails?.estimatedResolutionDays ? `${complaint.inspectionDetails.estimatedResolutionDays} Days` : complaint.estimatedResolutionDays ? `${complaint.estimatedResolutionDays} Days` : undefined);
          return (
            <View style={styles.inspectionRow}>
              {budgetNum > 0 && (
                <View style={styles.budgetChip}>
                  <Ionicons name="cash-outline" size={12} color="#0D9488" />
                  <Text style={styles.budgetText}>₹{budgetNum.toLocaleString('en-IN')}{complaint.inspectionDetails ? '' : ' Est.'}</Text>
                </View>
              )}
              {durationStr && (
                <View style={styles.durationChip}>
                  <Ionicons name="time-outline" size={12} color="#4F46E5" />
                  <Text style={styles.durationText}>{durationStr} Est.</Text>
                </View>
              )}
            </View>
          );
        })()}

        {/* Assigned Officer / Maintenance Authority */}
        {!isMismatchedRejection && (complaint.assignedOfficerName || complaint.assignedOfficer) ? (
          <View style={styles.authorityRow}>
            <Ionicons name="person-outline" size={13} color={AppColors.primary} />
            <Text style={styles.authorityText} numberOfLines={1}>
              Officer: {complaint.assignedOfficerName || complaint.assignedOfficer}
            </Text>
          </View>
        ) : null}

        {/* Road & Maintenance Authority */}
        {!isMismatchedRejection && (complaint.maintenanceAuthority || complaint.inspectionDetails?.maintenanceAuthority) ? (
          <View style={styles.authorityRow}>
            <Ionicons name="business-outline" size={13} color={AppColors.primary} />
            <Text style={styles.authorityText} numberOfLines={1}>
              {complaint.inspectionDetails?.maintenanceAuthority || complaint.maintenanceAuthority}
            </Text>
          </View>
        ) : null}

        {/* Multi-Department Involvement Alert Tag */}
        {!isMismatchedRejection && (complaint.isOtherDeptInvolved || (complaint as any).otherDepartmentInvolvement) && complaint.involvedDepartments?.length ? (
          <View style={styles.multiDeptTag}>
            <Ionicons name="git-network-outline" size={12} color="#B45309" />
            <Text style={styles.multiDeptText} numberOfLines={1}>
              Secondary Dept: {complaint.involvedDepartments.join(', ')}
            </Text>
          </View>
        ) : null}

        {/* Rejection indicator if rejected */}
        {complaint.status === 'Rejected' && complaint.rejectionReason ? (
          <View style={styles.rejectionSnippet}>
            <Ionicons name="alert-circle-outline" size={13} color={AppColors.error} />
            <Text style={styles.rejectionSnippetText} numberOfLines={1}>
              Reason: {complaint.rejectionReason}
            </Text>
          </View>
        ) : null}

        {/* Date + location */}
        <View style={styles.bottomRow}>
          <View style={styles.bottomItem}>
            <Ionicons name="calendar-outline" size={12} color={AppColors.textSecondary} />
            <Text style={styles.meta}>{date}</Text>
          </View>
          <View style={[styles.bottomItem, { flex: 1, justifyContent: 'flex-end' }]}>
            <Ionicons
              name={complaint.locationSource === 'map' ? 'map-outline' : 'location-outline'}
              size={12}
              color={complaint.locationSource === 'map' ? AppColors.primary : AppColors.textSecondary}
            />
            <Text style={styles.meta} numberOfLines={1}>
              {complaint.locationAddress || `${complaint.latitude.toFixed(4)}, ${complaint.longitude.toFixed(4)}`}
            </Text>
          </View>
        </View>
      </View>

      <Ionicons name="chevron-forward" size={18} color={AppColors.placeholder} style={styles.chevron} />
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: AppColors.surface,
    borderRadius: 16,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: AppColors.border,
    ...Platform.select({
      web: {
        boxShadow: '0px 2px 6px rgba(0, 0, 0, 0.05)',
      },
      default: {
        shadowColor: '#000',
        shadowOpacity: 0.05,
        shadowRadius: 6,
        shadowOffset: { width: 0, height: 2 },
        elevation: 2,
      },
    }),
    overflow: 'hidden',
  },
  image: {
    width: '100%',
    height: 160,
  },
  imagePlaceholder: {
    width: '100%',
    height: 120,
    backgroundColor: AppColors.background,
    alignItems: 'center',
    justifyContent: 'center',
  },
  body: { padding: 14 },
  topRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 6,
    gap: 8,
  },
  idRegionCol: {
    flexDirection: 'column',
    gap: 2,
    flex: 1,
    flexShrink: 1,
  },
  id: { fontSize: 13, fontWeight: '800', color: AppColors.primary, letterSpacing: 0.2 },
  regionBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: '#EFF6FF',
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: 4,
    marginTop: 2,
    alignSelf: 'flex-start',
    maxWidth: '100%',
  },
  regionText: {
    fontSize: 10,
    fontWeight: '700',
    color: AppColors.primary,
  },
  issue: { fontSize: 16, fontWeight: '700', color: AppColors.textPrimary, marginBottom: 6, textTransform: 'capitalize' },
  descPreviewBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 6,
    backgroundColor: '#F8FAFC',
    borderRadius: 8,
    padding: 8,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  descPreviewText: {
    fontSize: 12,
    color: AppColors.textPrimary,
    lineHeight: 16,
    flex: 1,
  },
  deptBadgeRow: { marginBottom: 8 },
  deptBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    alignSelf: 'flex-start',
    maxWidth: '100%',
    flexShrink: 1,
  },
  deptBadgeMoved: {
    backgroundColor: '#F0F9FF',
    borderWidth: 1,
    borderColor: '#BAE6FD',
  },
  deptBadgeDirect: {
    backgroundColor: '#F3F4F6',
  },
  deptBadgeText: {
    fontSize: 11,
    fontWeight: '600',
    flexShrink: 1,
  },
  deptBadgeTextMoved: {
    color: '#0369A1',
    fontWeight: '700',
  },
  deptBadgeTextDirect: {
    color: AppColors.textSecondary,
  },
  metaRow: { flexDirection: 'row', gap: 16, marginBottom: 8, flexWrap: 'wrap' },
  metaItem: { gap: 2 },
  metaLabel: { fontSize: 11, color: AppColors.textSecondary },
  metaValue: { fontSize: 13, fontWeight: '700', color: AppColors.textPrimary },
  inspectionRow: { flexDirection: 'row', gap: 8, marginBottom: 8, flexWrap: 'wrap' },
  budgetChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#F0FDFA',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#CCFBF1',
    flexShrink: 1,
  },
  budgetText: { fontSize: 11, fontWeight: '700', color: '#0D9488' },
  durationChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#EEF2FF',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#E0E7FF',
    flexShrink: 1,
  },
  durationText: { fontSize: 11, fontWeight: '600', color: '#4F46E5' },
  authorityRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#F8FAFC',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    maxWidth: '100%',
  },
  authorityText: {
    fontSize: 11,
    fontWeight: '600',
    color: AppColors.textPrimary,
    flex: 1,
  },
  multiDeptTag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#FFFBEB',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#FDE68A',
    maxWidth: '100%',
  },
  multiDeptText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#92400E',
    flex: 1,
  },
  rejectionSnippet: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: '#FEF2F2',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    marginBottom: 8,
    maxWidth: '100%',
  },
  rejectionSnippetText: { fontSize: 11, color: AppColors.error, fontWeight: '500', flex: 1 },
  bottomRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    marginTop: 4,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: AppColors.background,
  },
  bottomItem: { flexDirection: 'row', alignItems: 'center', gap: 4, flexShrink: 1 },
  meta: { fontSize: 11, color: AppColors.textSecondary, fontWeight: '500' },
  chevron: { position: 'absolute', right: 14, top: 180 },

  // Inactive card styles for Dissimilar Image to the Issue
  inactiveCard: {
    backgroundColor: '#F8FAFC',
    borderColor: '#CBD5E1',
    borderStyle: 'solid',
    opacity: 0.85,
  },
  inactiveImageWrap: {
    position: 'relative',
    overflow: 'hidden',
  },
  inactiveImage: {
    opacity: 0.55,
  },
  imageInactiveOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(15, 23, 42, 0.45)',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  },
  imageInactiveOverlayText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  inactiveText: {
    color: '#64748B',
  },
  inactiveRegionBadge: {
    backgroundColor: '#F1F5F9',
    borderColor: '#E2E8F0',
  },
  inactiveRegionText: {
    color: '#64748B',
  },
  inactiveIssue: {
    color: '#334155',
  },
  inactiveRejectionBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#FEF2F2',
    borderWidth: 1,
    borderColor: '#FECACA',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
    marginBottom: 8,
  },
  inactiveRejectionBannerText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#DC2626',
    flex: 1,
  },
  inactiveDescPreviewBox: {
    backgroundColor: '#F1F5F9',
    borderColor: '#E2E8F0',
  },
  inactiveDescText: {
    color: '#64748B',
  },
});

export default React.memo(ComplaintCardComponent);
