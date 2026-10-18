import ComplaintCard from '@/components/ComplaintCard';
import { ALL_COIMBATORE_REGIONS } from '@/constants/coimbatoreRoads';
import { AppColors } from '@/constants/colors';
import { auth } from '@/firebaseConfig';
import { subscribeToAllComplaints, type Complaint } from '@/services/complaintService';
import { subscribeToOfficerProfile, type Officer } from '@/services/officerService';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRootNavigationState, useRouter } from 'expo-router';
import { onAuthStateChanged, type User } from 'firebase/auth';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

type FilterType = 'all' | 'pending' | 'verified' | 'assigned' | 'inprogress' | 'resolved' | 'rejected';

export default function ComplaintManagementScreen() {
  const router = useRouter();
  const rootNavigationState = useRootNavigationState();
  const { filter: filterParam } = useLocalSearchParams<{ filter?: string }>();
  const [user, setUser] = useState<User | null>(auth.currentUser);
  const [officer, setOfficer] = useState<Officer | null>(null);
  const [complaints, setComplaints] = useState<Complaint[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeFilter, setActiveFilter] = useState<FilterType>(
    (filterParam as FilterType) || 'all'
  );
  const [selectedRegion, setSelectedRegion] = useState<string>('All');
  const [searchText, setSearchText] = useState('');

  // 1. Auth check
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

  // 2. Profile check
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

  // 3. Complaints subscription
  useEffect(() => {
    if (!user) return;
    const unsub = subscribeToAllComplaints(
      data => {
        setComplaints(data);
        setLoading(false);
      },
      err => {
        console.error('Error loading complaints:', err);
        setLoading(false);
      }
    );
    return unsub;
  }, [user]);

  // Dynamic filter counts
  const filterCounts = useMemo(() => {
    const isMismatch = (c: Complaint) =>
      c.status === 'Invalid Issue image, raise the complaint with the appropriate image!' ||
      c.status === 'Dissimilar Image to the Issue' ||
      c.rejectionType === 'IMAGE_MISMATCH' ||
      c.rejectionType === 'INVALID_IMAGE' ||
      c.inspectionStatus === 'INVALID';
    return {
      all: complaints.filter(c => !isMismatch(c) && c.status !== 'Rejected' && c.status !== 'Failed').length,
      pending: complaints.filter(c => (c.status === 'Pending Field Verification' || c.status === 'Submitted') && !isMismatch(c)).length,
      verified: complaints.filter(c => c.status === 'Verified' && !isMismatch(c)).length,
      assigned: complaints.filter(c => (c.status === 'Assigned' || c.status === 'Accepted') && !isMismatch(c)).length,
      inprogress: complaints.filter(c => c.status === 'In Progress' && !isMismatch(c)).length,
      resolved: complaints.filter(c => (c.status === 'Resolved' || c.status === 'Citizen Verification' || c.status === 'Closed') && !isMismatch(c)).length,
      rejected: complaints.filter(c => c.status === 'Rejected' || c.status === 'Failed' || isMismatch(c)).length,
    };
  }, [complaints]);

  // Filter and search logic
  const filteredComplaints = useMemo(() => {
    const isMismatch = (c: Complaint) =>
      c.status === 'Invalid Issue image, raise the complaint with the appropriate image!' ||
      c.status === 'Dissimilar Image to the Issue' ||
      c.rejectionType === 'IMAGE_MISMATCH' ||
      c.rejectionType === 'INVALID_IMAGE' ||
      c.inspectionStatus === 'INVALID';

    return complaints.filter(c => {
      if (selectedRegion !== 'All' && c.region !== selectedRegion) return false;

      if (activeFilter === 'rejected') {
        if (c.status !== 'Rejected' && c.status !== 'Failed' && !isMismatch(c)) return false;
      } else {
        if (isMismatch(c) || c.status === 'Rejected' || c.status === 'Failed') return false;

        switch (activeFilter) {
          case 'pending':
            if (c.status !== 'Pending Field Verification' && c.status !== 'Submitted') return false;
            break;
          case 'verified':
            if (c.status !== 'Verified') return false;
            break;
          case 'assigned':
            if (c.status !== 'Assigned' && c.status !== 'Accepted') return false;
            break;
          case 'inprogress':
            if (c.status !== 'In Progress') return false;
            break;
          case 'resolved':
            if (c.status !== 'Resolved' && c.status !== 'Citizen Verification' && c.status !== 'Closed') return false;
            break;
          case 'all':
          default:
            break;
        }
      }

      if (searchText.trim()) {
        const q = searchText.toLowerCase().trim();
        const idMatch = c.complaintId.toLowerCase().includes(q);
        const issueMatch = c.issueType.toLowerCase().includes(q);
        const descMatch = c.description.toLowerCase().includes(q);
        const emailMatch = c.citizenEmail.toLowerCase().includes(q);
        const roadMatch = c.roadName?.toLowerCase().includes(q);
        const deptMatch = (c.department && c.department.toLowerCase().includes(q)) || (c.responsibleDepartment && c.responsibleDepartment.toLowerCase().includes(q));
        const routingMatch = c.routingStatus && c.routingStatus.toLowerCase().includes(q);
        const origDeptMatch = c.originalDepartment && c.originalDepartment.toLowerCase().includes(q);
        const inspMatch = c.assignedInspectorName && c.assignedInspectorName.toLowerCase().includes(q);
        const rejectMatch = c.rejectionReason && c.rejectionReason.toLowerCase().includes(q);
        if (!idMatch && !issueMatch && !descMatch && !emailMatch && !roadMatch && !deptMatch && !routingMatch && !origDeptMatch && !inspMatch && !rejectMatch) return false;
      }

      return true;
    });
  }, [complaints, activeFilter, selectedRegion, searchText]);

  const filterTabs: { label: string; value: FilterType }[] = [
    { label: 'All', value: 'all' },
    { label: 'Pending Insp', value: 'pending' },
    { label: 'Verified', value: 'verified' },
    { label: 'Assigned', value: 'assigned' },
    { label: 'In Progress', value: 'inprogress' },
    { label: 'Resolved / Closed', value: 'resolved' },
    { label: 'Rejected / Failed', value: 'rejected' },
  ];

  const handleCardPress = useCallback((id: string) => {
    router.push({
      pathname: '/officer/complaint-details',
      params: { id },
    });
  }, [router]);

  const keyExtractor = useCallback((item: Complaint) => item.id, []);

  const renderItem = useCallback(({ item }: { item: Complaint }) => (
    <ComplaintCard
      complaint={item}
      onPress={() => handleCardPress(item.id)}
    />
  ), [handleCardPress]);

  if (loading || !officer) {
    return (
      <SafeAreaView style={styles.centered}>
        <ActivityIndicator size="large" color={AppColors.primary} />
        <Text style={styles.loadingText}>Loading Complaints Queue…</Text>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => router.back()}
          style={styles.backBtn}
          accessibilityRole="button"
          accessibilityLabel="Back to Dashboard"
        >
          <Ionicons name="arrow-back" size={24} color={AppColors.textPrimary} />
        </TouchableOpacity>
        <View style={styles.headerTitleContainer}>
          <Text style={styles.headerTitle}>Road Defect Management</Text>
          <Text style={styles.headerSubtitle}>Coimbatore Administration</Text>
        </View>
        <View style={{ width: 40 }} />
      </View>

      {/* Search Input */}
      <View style={styles.searchContainer}>
        <Ionicons name="search" size={18} color={AppColors.placeholder} style={styles.searchIcon} />
        <TextInput
          style={styles.searchInput}
          placeholder="Search by ID, road, defect, or email…"
          value={searchText}
          onChangeText={setSearchText}
          placeholderTextColor={AppColors.placeholder}
          returnKeyType="search"
          autoCapitalize="none"
        />
        {searchText.length > 0 && (
          <TouchableOpacity
            onPress={() => setSearchText('')}
            style={styles.clearBtn}
            accessible
            accessibilityLabel="Clear search input"
          >
            <Ionicons name="close-circle" size={18} color={AppColors.placeholder} />
          </TouchableOpacity>
        )}
      </View>

      {/* Region Filter Chips */}
      <View style={styles.regionFilterRow}>
        <FlatList
          horizontal
          showsHorizontalScrollIndicator={false}
          data={['All', ...ALL_COIMBATORE_REGIONS]}
          keyExtractor={item => item}
          contentContainerStyle={{ paddingHorizontal: 16, gap: 6 }}
          renderItem={({ item }) => (
            <TouchableOpacity
              style={[
                styles.regionFilterChip,
                selectedRegion === item && styles.regionFilterChipActive,
              ]}
              onPress={() => setSelectedRegion(item)}
            >
              <Text
                style={[
                  styles.regionFilterText,
                  selectedRegion === item && styles.regionFilterTextActive,
                ]}
              >
                {item === 'All' ? 'All 4 Regions' : item}
              </Text>
            </TouchableOpacity>
          )}
        />
      </View>

      {/* Filter Tabs Horizontal Scroll */}
      <View style={styles.filterContainer}>
        <FlatList
          data={filterTabs}
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.filterList}
          keyExtractor={item => item.value}
          renderItem={({ item }) => {
            const isActive = activeFilter === item.value;
            const count = filterCounts[item.value] || 0;
            return (
              <TouchableOpacity
                style={[styles.filterTab, isActive && styles.filterTabActive]}
                onPress={() => setActiveFilter(item.value)}
                activeOpacity={0.7}
              >
                <Text style={[styles.filterTabText, isActive && styles.filterTabTextActive]}>
                  {item.label}
                </Text>
                <View style={[styles.filterCountBadge, isActive && styles.filterCountBadgeActive]}>
                  <Text style={[styles.filterCountText, isActive && styles.filterCountTextActive]}>
                    {count}
                  </Text>
                </View>
              </TouchableOpacity>
            );
          }}
        />
      </View>

      {/* Results Header Count */}
      <View style={styles.resultsInfoRow}>
        <Text style={styles.resultsInfoText}>
          Showing {filteredComplaints.length} of {complaints.length} road complaint{complaints.length !== 1 ? 's' : ''}
        </Text>
      </View>

      {/* Complaints List */}
      {filteredComplaints.length === 0 ? (
        <View style={styles.emptyState}>
          <Ionicons name="document-text-outline" size={54} color={AppColors.placeholder} />
          <Text style={styles.emptyTitle}>No Complaints Found</Text>
          <Text style={styles.emptySubtitle}>
            {searchText
              ? `No complaints match "${searchText}".`
              : 'There are no complaints under this filter status.'}
          </Text>
        </View>
      ) : (
        <FlatList
          data={filteredComplaints}
          keyExtractor={keyExtractor}
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
          initialNumToRender={6}
          maxToRenderPerBatch={8}
          windowSize={5}
          removeClippedSubviews={Platform.OS !== 'web'}
          renderItem={renderItem}
        />
      )}
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
    fontSize: 14,
    color: AppColors.textSecondary,
    fontWeight: '500',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
    backgroundColor: AppColors.surface,
    borderBottomWidth: 1,
    borderBottomColor: AppColors.border,
    gap: 8,
  },
  backBtn: { padding: 6 },
  headerTitleContainer: { flex: 1, alignItems: 'center' },
  headerTitle: { fontSize: 17, fontWeight: '800', color: AppColors.textPrimary, textAlign: 'center' },
  headerSubtitle: { fontSize: 11, color: AppColors.textSecondary, fontWeight: '500', textAlign: 'center' },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 16,
    marginTop: 12,
    marginBottom: 8,
    paddingHorizontal: 12,
    backgroundColor: AppColors.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: AppColors.border,
  },
  searchIcon: { marginRight: 8 },
  searchInput: {
    flex: 1,
    paddingVertical: 10,
    fontSize: 13,
    color: AppColors.textPrimary,
  },
  clearBtn: { padding: 4 },
  regionFilterRow: { marginBottom: 6 },
  regionFilterChip: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 16,
    backgroundColor: AppColors.surface,
    borderWidth: 1,
    borderColor: AppColors.border,
  },
  regionFilterChipActive: {
    backgroundColor: AppColors.primary,
    borderColor: AppColors.primary,
  },
  regionFilterText: {
    fontSize: 11,
    fontWeight: '700',
    color: AppColors.textSecondary,
  },
  regionFilterTextActive: {
    color: AppColors.white,
  },
  filterContainer: { marginBottom: 6 },
  filterList: { paddingHorizontal: 16, gap: 6, paddingVertical: 2 },
  filterTab: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 18,
    backgroundColor: AppColors.surface,
    borderWidth: 1,
    borderColor: AppColors.border,
  },
  filterTabActive: {
    backgroundColor: '#0D9488',
    borderColor: '#0D9488',
  },
  filterTabText: {
    fontSize: 11,
    fontWeight: '600',
    color: AppColors.textSecondary,
  },
  filterTabTextActive: {
    color: AppColors.white,
    fontWeight: '700',
  },
  filterCountBadge: {
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: 8,
    backgroundColor: AppColors.background,
  },
  filterCountBadgeActive: {
    backgroundColor: 'rgba(255, 255, 255, 0.25)',
  },
  filterCountText: {
    fontSize: 10,
    fontWeight: '700',
    color: AppColors.textSecondary,
  },
  filterCountTextActive: {
    color: AppColors.white,
  },
  resultsInfoRow: {
    paddingHorizontal: 18,
    paddingVertical: 2,
    marginBottom: 4,
  },
  resultsInfoText: {
    fontSize: 11,
    color: AppColors.textSecondary,
    fontWeight: '500',
  },
  list: { paddingHorizontal: 16, paddingBottom: 32 },
  emptyState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
  },
  emptyTitle: {
    fontSize: 17,
    fontWeight: '800',
    color: AppColors.textPrimary,
    marginTop: 14,
  },
  emptySubtitle: {
    fontSize: 12,
    color: AppColors.textSecondary,
    marginTop: 4,
    textAlign: 'center',
    lineHeight: 17,
  },
});
