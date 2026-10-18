import { AppColors } from '@/constants/colors';
import { auth, db } from '@/firebaseConfig';
import { subscribeToUserComplaints, type Complaint } from '@/services/complaintService';
import {
  getLocallyReadNotificationIds,
  markAllNotificationsAsRead,
  markNotificationAsRead,
  subscribeToCitizenNotifications,
  type CivicNotification,
} from '@/services/notificationService';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { onAuthStateChanged, type User } from 'firebase/auth';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Platform,
  RefreshControl,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

export interface DisplayNotification {
  id: string;
  complaintId?: string;
  complaintDocId?: string;
  title: string;
  message: string;
  type: CivicNotification['type'] | string;
  isRead: boolean;
  date: Date;
  region?: string;
}

export default function NotificationsScreen() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(auth.currentUser);
  const [firestoreNotifs, setFirestoreNotifs] = useState<CivicNotification[]>([]);
  const [userComplaints, setUserComplaints] = useState<Complaint[]>([]);
  const [localReadIds, setLocalReadIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [filterType, setFilterType] = useState<'all' | 'unread' | 'inspections' | 'resolutions'>('all');

  // 1. Auth sync & load locally read IDs
  useEffect(() => {
    getLocallyReadNotificationIds().then(ids => {
      setLocalReadIds(new Set(ids));
    }).catch(() => {});

    const unsub = onAuthStateChanged(auth, u => setUser(u));
    return unsub;
  }, []);

  // 2. Real-time Firestore Notifications listener
  useEffect(() => {
    if (!user) return;
    setLoading(true);

    const unsubNotifs = subscribeToCitizenNotifications(
      user.uid,
      data => {
        setFirestoreNotifs(data);
        setLoading(false);
        setRefreshing(false);
      },
      () => {
        setLoading(false);
        setRefreshing(false);
      },
      user.email || undefined
    );

    const unsubComplaints = subscribeToUserComplaints(
      user.uid,
      complaints => {
        setUserComplaints(complaints);
      },
      () => {}
    );

    return () => {
      if (typeof unsubNotifs === 'function') unsubNotifs();
      if (typeof unsubComplaints === 'function') unsubComplaints();
    };
  }, [user]);

  // Merge and deduplicate notifications from both Firestore notifications collection & complaint events
  const mergedNotifications = useMemo<DisplayNotification[]>(() => {
    const items: DisplayNotification[] = [];
    const seenKeys = new Set<string>();

    // A. Priority 1: Real-time recorded notifications from `notifications` collection
    firestoreNotifs.forEach(n => {
      const isRead = n.isRead || localReadIds.has(n.id);
      const notifKey = `${n.complaintId || n.id}_${n.type}`;
      seenKeys.add(notifKey);
      seenKeys.add(n.id);

      // Look up region if available
      const relatedComplaint = userComplaints.find(c => c.id === n.complaintId || c.complaintId === n.complaintId);

      items.push({
        id: n.id,
        complaintId: relatedComplaint?.complaintId || n.complaintId,
        complaintDocId: relatedComplaint?.id || n.complaintId,
        title: n.title,
        message: n.message,
        type: n.type,
        isRead,
        date: n.createdAt,
        region: relatedComplaint?.region,
      });
    });

    // B. Priority 2: Comprehensive complaint lifecycle events
    userComplaints.forEach(c => {
      const budgetNum = c.inspectionDetails?.estimatedBudget ?? c.estimatedBudget ?? 0;
      const budgetText = budgetNum > 0 ? ` Budget: ₹${budgetNum.toLocaleString('en-IN')}.` : '';

      // 1. Complaint Registered
      const regKey = `${c.id}_registered`;
      if (!seenKeys.has(regKey) && !seenKeys.has(`${c.id}_complaint_raised`)) {
        items.push({
          id: `synth_${c.id}_registered`,
          complaintId: c.complaintId,
          complaintDocId: c.id,
          title: 'Complaint Registered Successfully',
          message: `Your complaint #${c.complaintId} (${c.issueType || 'Road Defect'}) in ${c.region || 'Coimbatore'} has been registered with status: Submitted. Field Inspector assigned for verification.`,
          type: 'complaint_raised',
          isRead: localReadIds.has(`synth_${c.id}_registered`),
          date: c.createdAt || new Date(),
          region: c.region,
        });
      }

      // 2. Field Verified
      if (c.status === 'Verified' || c.inspectionStatus === 'VALID' || c.inspectionDetails?.isIssuePresent) {
        const verKey = `${c.id}_field_verified`;
        if (!seenKeys.has(verKey)) {
          const obs = c.inspectionDetails?.inspectorRemarks ? ` Observation: "${c.inspectionDetails.inspectorRemarks}".` : '';
          items.push({
            id: `synth_${c.id}_verified`,
            complaintId: c.complaintId,
            complaintDocId: c.id,
            title: 'Complaint Verified & Budget Estimated',
            message: `Field inspection verified defect as ${c.inspectionDetails?.verifiedIssue || c.issueType}.${budgetText}${obs} Forwarded for repair assignment.`,
            type: 'field_verified',
            isRead: localReadIds.has(`synth_${c.id}_verified`),
            date: c.inspectionDetails?.inspectedAt || c.updatedAt || c.createdAt || new Date(),
            region: c.region,
          });
        }
      }

      // 3. Multi-Department Involved
      if (c.isOtherDeptInvolved && c.involvedDepartments && c.involvedDepartments.length > 0) {
        const deptKey = `${c.id}_multi_dept`;
        if (!seenKeys.has(deptKey)) {
          items.push({
            id: `synth_${c.id}_dept`,
            complaintId: c.complaintId,
            complaintDocId: c.id,
            title: 'Department Coordination Notice',
            message: `Coordination required with ${c.involvedDepartments.join(', ')} Department for #${c.complaintId} in ${c.region}.`,
            type: 'multi_dept_alert',
            isRead: localReadIds.has(`synth_${c.id}_dept`),
            date: c.updatedAt || c.createdAt || new Date(),
            region: c.region,
          });
        }
      }

      // 4. Assigned to Maintenance Authority
      if (c.status === 'Assigned' || c.status === 'Accepted' || c.maintenanceAuthority) {
        const assignKey = `${c.id}_assigned`;
        if (!seenKeys.has(assignKey) && c.status !== 'Submitted' && c.status !== 'Pending Field Verification') {
          items.push({
            id: `synth_${c.id}_assigned`,
            complaintId: c.complaintId,
            complaintDocId: c.id,
            title: 'Assigned to Maintenance Authority',
            message: `Complaint #${c.complaintId} assigned to ${c.maintenanceAuthority || 'Road Maintenance Division'} for repair work.`,
            type: 'authority_assigned',
            isRead: localReadIds.has(`synth_${c.id}_assigned`),
            date: c.updatedAt || c.createdAt || new Date(),
            region: c.region,
          });
        }
      }

      // 5. Work In Progress
      if (c.status === 'In Progress') {
        const progKey = `${c.id}_progress`;
        if (!seenKeys.has(progKey)) {
          items.push({
            id: `synth_${c.id}_progress`,
            complaintId: c.complaintId,
            complaintDocId: c.id,
            title: 'Road Repair In Progress',
            message: `Maintenance crew is actively executing road repairs for complaint #${c.complaintId} on ${c.roadName || 'the road'} in ${c.region}.`,
            type: 'work_in_progress',
            isRead: localReadIds.has(`synth_${c.id}_progress`),
            date: c.updatedAt || c.createdAt || new Date(),
            region: c.region,
          });
        }
      }

      // 6. Resolved / Closed
      if (c.status === 'Resolved' || c.status === 'Closed' || c.status === 'Citizen Verification') {
        const resKey = `${c.id}_resolved`;
        if (!seenKeys.has(resKey)) {
          items.push({
            id: `synth_${c.id}_resolved`,
            complaintId: c.complaintId,
            complaintDocId: c.id,
            title: 'Road Repair Completed & Resolved',
            message: `Maintenance authority completed all repair work for #${c.complaintId} in ${c.region}. Road is restored and open for traffic.`,
            type: 'work_resolved',
            isRead: localReadIds.has(`synth_${c.id}_resolved`),
            date: c.updatedAt || c.createdAt || new Date(),
            region: c.region,
          });
        }
      }

      // 7. Rejected / Invalid
      if (
        c.status === 'Rejected' ||
        c.status === 'Invalid Issue image, raise the complaint with the appropriate image!' ||
        c.status === 'Dissimilar Image to the Issue' ||
        c.rejectionType === 'IMAGE_MISMATCH' ||
        c.inspectionStatus === 'INVALID'
      ) {
        const rejKey = `${c.id}_rejected`;
        if (!seenKeys.has(rejKey)) {
          items.push({
            id: `synth_${c.id}_rejected`,
            complaintId: c.complaintId,
            complaintDocId: c.id,
            title: 'Complaint Rejected / Inactive',
            message: `Complaint #${c.complaintId} was rejected during inspection: ${c.rejectionReason || 'Invalid image or non-road defect'}. Please resubmit with appropriate road photo.`,
            type: 'complaint_rejected',
            isRead: localReadIds.has(`synth_${c.id}_rejected`),
            date: c.updatedAt || c.createdAt || new Date(),
            region: c.region,
          });
        }
      }
    });

    return items.sort((a, b) => b.date.getTime() - a.date.getTime());
  }, [firestoreNotifs, userComplaints, localReadIds]);

  // Filtered notifications
  const filteredList = useMemo(() => {
    return mergedNotifications.filter(item => {
      if (filterType === 'unread') return !item.isRead;
      if (filterType === 'inspections') return item.type === 'field_verified' || item.type === 'field_verification_required' || item.type === 'complaint_rejected';
      if (filterType === 'resolutions') return item.type === 'work_resolved' || item.type === 'complaint_closed';
      return true;
    });
  }, [mergedNotifications, filterType]);

  const unreadCount = useMemo(() => {
    return mergedNotifications.filter(n => !n.isRead).length;
  }, [mergedNotifications]);

  const handleNotificationPress = useCallback(
    async (item: DisplayNotification) => {
      // Mark as read in local state & Firestore
      if (!item.isRead) {
        setLocalReadIds(prev => {
          const next = new Set(prev);
          next.add(item.id);
          return next;
        });
        markNotificationAsRead(item.id).catch(() => {});
      }

      // Navigate to complaint details if attached
      if (item.complaintDocId) {
        router.push({ pathname: '/complaint-detail', params: { id: item.complaintDocId } });
      }
    },
    [router]
  );

  const handleMarkAllRead = async () => {
    const allIds = mergedNotifications.map(n => n.id);
    setLocalReadIds(new Set(allIds));
    await markAllNotificationsAsRead(allIds);
  };

  const getNotifIconAndColor = (type: string) => {
    switch (type) {
      case 'work_resolved':
      case 'complaint_closed':
        return { icon: 'checkmark-circle' as const, color: '#0D9488', bg: '#CCFBF1' };
      case 'complaint_rejected':
        return { icon: 'close-circle' as const, color: AppColors.error, bg: '#FEE2E2' };
      case 'field_verified':
        return { icon: 'shield-checkmark' as const, color: '#2563EB', bg: '#DBEAFE' };
      case 'multi_dept_alert':
        return { icon: 'git-network-outline' as const, color: '#D97706', bg: '#FEF3C7' };
      case 'work_in_progress':
        return { icon: 'construct' as const, color: '#EA580C', bg: '#FFEDD5' };
      case 'complaint_raised':
      default:
        return { icon: 'notifications-outline' as const, color: AppColors.primary, bg: '#EFF6FF' };
    }
  };

  const renderItem = useCallback(
    ({ item }: { item: DisplayNotification }) => {
      const { icon, color, bg } = getNotifIconAndColor(item.type);

      return (
        <TouchableOpacity
          style={[styles.notifCard, !item.isRead && styles.notifCardUnread]}
          onPress={() => handleNotificationPress(item)}
          accessible
          accessibilityRole="button"
          accessibilityLabel={item.title}
        >
          <View style={[styles.iconWrap, { backgroundColor: bg }]}>
            <Ionicons name={icon} size={22} color={color} />
          </View>

          <View style={styles.notifContent}>
            <View style={styles.topRow}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flex: 1 }}>
                {!item.isRead && <View style={styles.unreadDot} />}
                <Text style={[styles.notifTitle, !item.isRead && styles.notifTitleBold]} numberOfLines={1}>
                  {item.title}
                </Text>
              </View>
              <Text style={styles.notifDate}>
                {item.date.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })}
              </Text>
            </View>

            <Text style={styles.notifMessage} numberOfLines={3}>
              {item.message}
            </Text>

            <View style={styles.metaBadgeRow}>
              {item.region && (
                <View style={styles.regionBadge}>
                  <Ionicons name="location-outline" size={11} color="#0369A1" />
                  <Text style={styles.regionBadgeText}>{item.region}</Text>
                </View>
              )}
              {item.complaintId && (
                <View style={styles.complaintIdBadge}>
                  <Text style={styles.complaintIdBadgeText}>#{item.complaintId}</Text>
                </View>
              )}
            </View>
          </View>

          <Ionicons name="chevron-forward" size={16} color={AppColors.placeholder} />
        </TouchableOpacity>
      );
    },
    [handleNotificationPress]
  );

  return (
    <SafeAreaView style={styles.safe}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => router.back()}
          style={styles.backBtn}
          accessibilityRole="button"
          accessibilityLabel="Back"
        >
          <Ionicons name="arrow-back" size={24} color={AppColors.textPrimary} />
        </TouchableOpacity>

        <View style={styles.headerTitleWrap}>
          <Text style={styles.headerTitle}>In-App Alerts &amp; Notifications</Text>
          {unreadCount > 0 && (
            <View style={styles.headerUnreadBadge}>
              <Text style={styles.headerUnreadText}>{unreadCount} New</Text>
            </View>
          )}
        </View>

        {unreadCount > 0 ? (
          <TouchableOpacity onPress={handleMarkAllRead} style={styles.markAllBtn}>
            <Text style={styles.markAllText}>Read All</Text>
          </TouchableOpacity>
        ) : (
          <View style={{ width: 44 }} />
        )}
      </View>

      {/* Filter Tabs */}
      <View style={styles.filterRow}>
        <TouchableOpacity
          style={[styles.filterChip, filterType === 'all' && styles.filterChipActive]}
          onPress={() => setFilterType('all')}
        >
          <Text style={[styles.filterChipText, filterType === 'all' && styles.filterChipTextActive]}>
            All ({mergedNotifications.length})
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.filterChip, filterType === 'unread' && styles.filterChipActive]}
          onPress={() => setFilterType('unread')}
        >
          <Text style={[styles.filterChipText, filterType === 'unread' && styles.filterChipTextActive]}>
            Unread ({unreadCount})
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.filterChip, filterType === 'inspections' && styles.filterChipActive]}
          onPress={() => setFilterType('inspections')}
        >
          <Text style={[styles.filterChipText, filterType === 'inspections' && styles.filterChipTextActive]}>
            Inspections
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.filterChip, filterType === 'resolutions' && styles.filterChipActive]}
          onPress={() => setFilterType('resolutions')}
        >
          <Text style={[styles.filterChipText, filterType === 'resolutions' && styles.filterChipTextActive]}>
            Resolutions
          </Text>
        </TouchableOpacity>
      </View>

      {/* Content */}
      {loading ? (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={AppColors.primary} />
          <Text style={styles.loadingText}>Syncing Road Notifications…</Text>
        </View>
      ) : filteredList.length === 0 ? (
        <View style={styles.centered}>
          <Ionicons name="notifications-off-outline" size={64} color={AppColors.placeholder} />
          <Text style={styles.emptyTitle}>
            {filterType === 'unread' ? 'No Unread Notifications' : 'No Notifications Yet'}
          </Text>
          <Text style={styles.emptySubtitle}>
            {filterType === 'unread'
              ? 'All alerts have been marked as read.'
              : 'You will receive real-time notifications when your complaints are registered, inspected by a Field Inspector, allocated budget, and resolved.'}
          </Text>
        </View>
      ) : (
        <FlatList
          data={filteredList}
          renderItem={renderItem}
          keyExtractor={item => item.id}
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => setRefreshing(true)}
              tintColor={AppColors.primary}
            />
          }
          initialNumToRender={10}
          maxToRenderPerBatch={10}
          windowSize={5}
          removeClippedSubviews={Platform.OS !== 'web'}
        />
      )}
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
  backBtn: { padding: 4 },
  headerTitleWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flex: 1,
    marginLeft: 8,
  },
  headerTitle: { fontSize: 16, fontWeight: '800', color: AppColors.textPrimary },
  headerUnreadBadge: {
    backgroundColor: AppColors.primary,
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 10,
  },
  headerUnreadText: { fontSize: 10, fontWeight: '800', color: AppColors.white },
  markAllBtn: { paddingHorizontal: 8, paddingVertical: 4 },
  markAllText: { fontSize: 12, fontWeight: '700', color: AppColors.primary },
  filterRow: {
    flexDirection: 'row',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 10,
    backgroundColor: AppColors.surface,
    borderBottomWidth: 1,
    borderBottomColor: AppColors.border,
    flexWrap: 'wrap',
  },
  filterChip: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
    backgroundColor: '#F1F5F9',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  filterChipActive: {
    backgroundColor: '#EFF6FF',
    borderColor: AppColors.primary,
  },
  filterChipText: {
    fontSize: 12,
    fontWeight: '600',
    color: AppColors.textSecondary,
  },
  filterChipTextActive: {
    color: AppColors.primary,
    fontWeight: '800',
  },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  loadingText: { marginTop: 10, fontSize: 13, color: AppColors.textSecondary, fontWeight: '600' },
  emptyTitle: { fontSize: 17, fontWeight: '800', color: AppColors.textPrimary, marginTop: 16 },
  emptySubtitle: { fontSize: 13, color: AppColors.textSecondary, marginTop: 6, textAlign: 'center', lineHeight: 18 },
  list: { padding: 14, paddingBottom: 40 },
  notifCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: AppColors.surface,
    borderRadius: 14,
    padding: 14,
    marginBottom: 10,
    gap: 12,
    borderWidth: 1,
    borderColor: AppColors.border,
    ...Platform.select({
      web: {
        boxShadow: '0px 1px 4px rgba(0, 0, 0, 0.03)',
      },
      default: {
        shadowColor: '#000',
        shadowOpacity: 0.03,
        shadowRadius: 4,
        shadowOffset: { width: 0, height: 1 },
        elevation: 1,
      },
    }),
  },
  notifCardUnread: {
    backgroundColor: '#F8FAFC',
    borderColor: '#BAE6FD',
    borderWidth: 1.5,
  },
  iconWrap: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: 'center',
    justifyContent: 'center',
  },
  notifContent: { flex: 1 },
  topRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 3,
  },
  unreadDot: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
    backgroundColor: AppColors.primary,
  },
  notifTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: AppColors.textPrimary,
  },
  notifTitleBold: {
    fontWeight: '800',
    color: '#0F172A',
  },
  notifDate: { fontSize: 10, color: AppColors.textSecondary, flexShrink: 0 },
  notifMessage: { fontSize: 12, color: '#334155', lineHeight: 17, marginTop: 1 },
  metaBadgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 6,
    flexWrap: 'wrap',
  },
  regionBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: '#E0F2FE',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  regionBadgeText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#0369A1',
  },
  complaintIdBadge: {
    backgroundColor: '#F1F5F9',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  complaintIdBadgeText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#475569',
  },
});
