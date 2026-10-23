import type { ComplaintStatus, InspectionStatus } from '@/services/complaintService';
import { StyleSheet, Text, View } from 'react-native';

interface StatusBadgeProps {
  status: ComplaintStatus;
  inspectionStatus?: InspectionStatus;
  size?: 'sm' | 'md';
}

const STATUS_CONFIG: Record<
  ComplaintStatus,
  { bg: string; text: string; label: string; icon: string; borderColor: string }
> = {
  'Submitted': {
    bg: '#EFF6FF',
    text: '#1D4ED8',
    label: 'Complaint Raised',
    icon: '●',
    borderColor: '#BFDBFE',
  },
  'Under Review': {
    bg: '#FFFBEB',
    text: '#B45309',
    label: 'Under Review',
    icon: '⏳',
    borderColor: '#FDE68A',
  },
  'Pending Field Verification': {
    bg: '#FFFBEB',
    text: '#B45309',
    label: 'Pending Field Verification',
    icon: '⏳',
    borderColor: '#FDE68A',
  },
  'Verified': {
    bg: '#F0FDF4',
    text: '#15803D',
    label: 'Field Verified',
    icon: '✓',
    borderColor: '#BBF7D0',
  },
  'Assigned': {
    bg: '#EEF2FF',
    text: '#4F46E5',
    label: 'Authority Assigned',
    icon: '➜',
    borderColor: '#C7D2FE',
  },
  'Accepted': {
    bg: '#F0FDFA',
    text: '#0D9488',
    label: 'Authority Accepted',
    icon: '✓',
    borderColor: '#99F6E4',
  },
  'In Progress': {
    bg: '#FEF3C7',
    text: '#D97706',
    label: 'Work In Progress',
    icon: '↻',
    borderColor: '#FCD34D',
  },
  'Resolved': {
    bg: '#ECFDF5',
    text: '#047857',
    label: 'Resolved',
    icon: '✓',
    borderColor: '#6EE7B7',
  },
  'Citizen Verification': {
    bg: '#FAF5FF',
    text: '#7E22CE',
    label: 'Citizen Verification',
    icon: '★',
    borderColor: '#E9D5FF',
  },
  'Closed': {
    bg: '#F3F4F6',
    text: '#374151',
    label: 'Closed & Confirmed',
    icon: '✓',
    borderColor: '#D1D5DB',
  },
  'Rejected': {
    bg: '#FEF2F2',
    text: '#DC2626',
    label: 'Rejected',
    icon: '✕',
    borderColor: '#FECACA',
  },
  'Needs Clarification': {
    bg: '#FFFBEB',
    text: '#B45309',
    label: 'Needs Clarification',
    icon: '❓',
    borderColor: '#FDE68A',
  },
  'Dissimilar Image to the Issue': {
    bg: '#FEF2F2',
    text: '#DC2626',
    label: 'Dissimilar Image',
    icon: '✕',
    borderColor: '#FECACA',
  },
  'Invalid Issue image, raise the complaint with the appropriate image!': {
    bg: '#FEF2F2',
    text: '#DC2626',
    label: 'Invalid Issue Image',
    icon: '✕',
    borderColor: '#FECACA',
  },
  'Invalid Image, give valid Issue Image!': {
    bg: '#FEF2F2',
    text: '#DC2626',
    label: 'Invalid Image',
    icon: '✕',
    borderColor: '#FECACA',
  },
  'Failed': {
    bg: '#FEF2F2',
    text: '#991B1B',
    label: 'Failed / Invalid',
    icon: '⚠',
    borderColor: '#FECACA',
  },
  'Reopened': {
    bg: '#FFF1F2',
    text: '#E11D48',
    label: 'Reopened / Review',
    icon: '↺',
    borderColor: '#FECDD3',
  },
};

export default function StatusBadge({ status, inspectionStatus, size = 'sm' }: StatusBadgeProps) {
  let cfg = STATUS_CONFIG[status] || STATUS_CONFIG['Submitted'];

  if (status === 'Submitted' && inspectionStatus === 'VALID') {
    cfg = STATUS_CONFIG['Verified'];
  } else if (status === 'Submitted' && inspectionStatus === 'PENDING') {
    cfg = STATUS_CONFIG['Pending Field Verification'];
  }

  const isSmall = size === 'sm';

  return (
    <View
      style={[
        styles.badge,
        {
          backgroundColor: cfg.bg,
          borderColor: cfg.borderColor,
        },
        isSmall ? styles.badgeSm : styles.badgeMd,
      ]}
      accessibilityLabel={`Status: ${cfg.label}`}
    >
      <Text style={[styles.iconText, { color: cfg.text }, isSmall ? styles.iconSm : styles.iconMd]}>
        {cfg.icon}
      </Text>
      <Text style={[styles.text, { color: cfg.text }, isSmall ? styles.textSm : styles.textMd]}>
        {cfg.label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 20,
    borderWidth: 1,
    alignSelf: 'flex-start',
    gap: 5,
    maxWidth: '100%',
  },
  badgeSm: {
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  badgeMd: {
    paddingHorizontal: 12,
    paddingVertical: 5,
  },
  iconText: {
    fontWeight: '800',
  },
  iconSm: {
    fontSize: 10,
  },
  iconMd: {
    fontSize: 12,
  },
  text: {
    fontWeight: '700',
    letterSpacing: 0.2,
    flexShrink: 1,
  },
  textSm: {
    fontSize: 11,
  },
  textMd: {
    fontSize: 13,
  },
});
