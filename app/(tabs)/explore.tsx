import ComplaintCard from '@/components/ComplaintCard';
import { ALL_COIMBATORE_REGIONS, getStandardEstimatedBudget } from '@/constants/coimbatoreRoads';
import { AppColors } from '@/constants/colors';
import { useAppTheme } from '@/context/ThemeContext';
import { subscribeToAllComplaints, isInvalidImageComplaint, type Complaint } from '@/services/complaintService';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React, { useCallback, useEffect, useState } from 'react';
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

const CATEGORY_FILTERS = [
  'All',
  'pothole',
  'cracking',
  'alligator cracking',
  'road divider damage',
  'street light fault',
  'manhole defect',
  'waterlogging',
  'Public Route Issue',
  'debris / road blockage',
  'missing signage',
] as const;
const STATUS_FILTERS = ['All', 'Verified', 'Assigned', 'In Progress', 'Resolved', 'Closed'] as const;

export default function ExploreScreen() {
  const router = useRouter();
  const { colors, isDark } = useAppTheme();
  const [complaints, setComplaints] = useState<Complaint[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const [selectedRegion, setSelectedRegion] = useState<string>('All');
  const [selectedCategory, setSelectedCategory] = useState<string>('All');
  const [selectedStatus, setSelectedStatus] = useState<string>('All');

  useEffect(() => {
    const unsub = subscribeToAllComplaints(
      data => {
        setComplaints(data);
        setLoading(false);
        setRefreshing(false);
      },
      err => {
        console.warn('[ExploreScreen] Subscription error:', err);
        setLoading(false);
        setRefreshing(false);
      }
    );
    return unsub;
  }, []);

  const handleCardPress = useCallback((id: string) => {
    router.push({ pathname: '/complaint-detail', params: { id } });
  }, [router]);

  const keyExtractor = useCallback((item: Complaint) => item.id, []);

  const renderItem = useCallback(({ item }: { item: Complaint }) => (
    <ComplaintCard
      complaint={item}
      onPress={() => handleCardPress(item.id)}
    />
  ), [handleCardPress]);

  // Filter complaints
  const validComplaints = complaints.filter(c => !isInvalidImageComplaint(c));
  const filtered = validComplaints.filter(c => {
    const matchesRegion = selectedRegion === 'All' || c.region === selectedRegion;
    const issue = (c.inspectionDetails?.verifiedIssue || c.issueType || '').toLowerCase();
    const matchesCat = selectedCategory === 'All' || issue.includes(selectedCategory.toLowerCase()) || selectedCategory.toLowerCase().includes(issue);
    const matchesStatus =
      selectedStatus === 'All' ||
      c.status === selectedStatus ||
      (selectedStatus === 'Resolved' && (c.status === 'Resolved' || c.status === 'Citizen Verification'));
    return matchesRegion && matchesCat && matchesStatus;
  });

  // Calculate city-wide metrics
  const totalBudget = validComplaints.reduce(
    (sum, c) => sum + (c.inspectionDetails?.estimatedBudget || c.estimatedBudget || (c.issueType ? getStandardEstimatedBudget(c.issueType, c.priority || c.severity).budget : 0)),
    0
  );
  const totalInspected = validComplaints.filter(c => !!c.inspectionDetails).length;
  const totalInProgress = validComplaints.filter(c => c.status === 'In Progress').length;
  const totalResolved = validComplaints.filter(c => c.status === 'Resolved' || c.status === 'Closed').length;

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]}>
      <FlatList
        data={filtered}
        keyExtractor={keyExtractor}
        renderItem={renderItem}
        initialNumToRender={6}
        maxToRenderPerBatch={8}
        windowSize={5}
        removeClippedSubviews={Platform.OS !== 'web'}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => setRefreshing(true)}
            tintColor={colors.primary}
          />
        }
        ListHeaderComponent={
          <View style={styles.headerContainer}>
            {/* Top Brand Header */}
            <View style={styles.brandRow}>
              <View style={{ flex: 1 }}>
                <Text style={[styles.title, { color: colors.textOnDark }]}>Civic Transparency Hub</Text>
                <Text style={[styles.subtitle, { color: colors.textOnDarkSecondary }]}>Coimbatore Road Maintenance & Sanctioned Budgets</Text>
              </View>
              <View style={[styles.iconCircle, isDark && { backgroundColor: colors.surfaceElevated }]}>
                <Ionicons name="map-outline" size={24} color={isDark ? colors.buttonPrimary : AppColors.primary} />
              </View>
            </View>

            {/* City-Wide Impact & Budget Metrics Banner */}
            <View style={[styles.statsCard, isDark && { backgroundColor: colors.card, borderColor: colors.borderLight }]}>
              <View style={styles.statsHeader}>
                <Ionicons name="shield-checkmark" size={16} color={isDark ? colors.buttonPrimary : '#0D9488'} />
                <Text style={[styles.statsHeaderText, isDark && { color: colors.textPrimary }]}>Coimbatore Infrastructure Allocation</Text>
              </View>

              <View style={styles.statsGrid}>
                <View style={styles.statItem}>
                  <Text style={[styles.statLabel, isDark && { color: colors.textSecondary }]}>Sanctioned Budget</Text>
                  <Text style={[styles.statValueGreen, isDark && { color: colors.textPrimary }]}>₹{totalBudget.toLocaleString('en-IN')}</Text>
                </View>
                <View style={[styles.statDivider, isDark && { backgroundColor: colors.borderLight }]} />
                <View style={styles.statItem}>
                  <Text style={[styles.statLabel, isDark && { color: colors.textSecondary }]}>Field Verified</Text>
                  <Text style={[styles.statValue, isDark && { color: colors.textPrimary }]}>{totalInspected}</Text>
                </View>
                <View style={[styles.statDivider, isDark && { backgroundColor: colors.borderLight }]} />
                <View style={styles.statItem}>
                  <Text style={[styles.statLabel, isDark && { color: colors.textSecondary }]}>In Progress</Text>
                  <Text style={[styles.statValueBlue, isDark && { color: colors.textPrimary }]}>{totalInProgress}</Text>
                </View>
                <View style={[styles.statDivider, isDark && { backgroundColor: colors.borderLight }]} />
                <View style={styles.statItem}>
                  <Text style={[styles.statLabel, isDark && { color: colors.textSecondary }]}>Resolved</Text>
                  <Text style={[styles.statValueTeal, isDark && { color: colors.textPrimary }]}>{totalResolved}</Text>
                </View>
              </View>
            </View>

            {/* Coimbatore 4-Region Filter */}
            <View style={styles.filterSection}>
              <Text style={[styles.filterSectionTitle, { color: colors.textOnDark }]}>Coimbatore Region</Text>
              <FlatList
                horizontal
                showsHorizontalScrollIndicator={false}
                data={['All', ...ALL_COIMBATORE_REGIONS]}
                keyExtractor={item => item}
                contentContainerStyle={{ gap: 8 }}
                renderItem={({ item }) => {
                  const active = selectedRegion === item;
                  return (
                    <TouchableOpacity
                      style={[
                        styles.regionChip,
                        isDark && { backgroundColor: colors.card, borderColor: colors.borderLight },
                        active && (isDark ? { backgroundColor: colors.buttonPrimary, borderColor: colors.buttonPrimary } : styles.regionChipActive)
                      ]}
                      onPress={() => setSelectedRegion(item)}
                    >
                      <Text style={[
                        styles.regionChipText,
                        isDark && { color: colors.textPrimary },
                        active && [styles.regionChipTextActive, isDark && { color: colors.white }]
                      ]}>
                        {item === 'All' ? 'All 4 Regions' : item}
                      </Text>
                    </TouchableOpacity>
                  );
                }}
              />
            </View>

            {/* Category Filter Pills */}
            <View style={styles.filterSection}>
              <Text style={[styles.filterSectionTitle, { color: colors.textOnDark }]}>Filter by Road Defect</Text>
              <FlatList
                horizontal
                showsHorizontalScrollIndicator={false}
                data={CATEGORY_FILTERS}
                keyExtractor={item => item}
                contentContainerStyle={{ gap: 8 }}
                renderItem={({ item }) => {
                  const active = selectedCategory === item;
                  return (
                    <TouchableOpacity
                      style={[
                        styles.filterChip,
                        isDark && { backgroundColor: colors.card, borderColor: colors.borderLight },
                        active && (isDark ? { backgroundColor: colors.buttonPrimary, borderColor: colors.buttonPrimary } : styles.filterChipActive)
                      ]}
                      onPress={() => setSelectedCategory(item)}
                    >
                      <Text style={[
                        styles.filterChipText,
                        isDark && { color: colors.textPrimary },
                        active && [styles.filterChipTextActive, isDark && { color: colors.white }]
                      ]}>
                        {item === 'All' ? 'All Defects' : item.charAt(0).toUpperCase() + item.slice(1)}
                      </Text>
                    </TouchableOpacity>
                  );
                }}
              />
            </View>

            {/* Status Filter Pills */}
            <View style={styles.filterSection}>
              <Text style={[styles.filterSectionTitle, { color: colors.textOnDark }]}>Filter by Status</Text>
              <FlatList
                horizontal
                showsHorizontalScrollIndicator={false}
                data={STATUS_FILTERS}
                keyExtractor={item => item}
                contentContainerStyle={{ gap: 8 }}
                renderItem={({ item }) => {
                  const active = selectedStatus === item;
                  return (
                    <TouchableOpacity
                      style={[
                        styles.statusChip,
                        isDark && { backgroundColor: colors.card, borderColor: colors.borderLight },
                        active && (isDark ? { backgroundColor: colors.buttonPrimary, borderColor: colors.buttonPrimary } : styles.statusChipActive)
                      ]}
                      onPress={() => setSelectedStatus(item)}
                    >
                      <Text style={[
                        styles.statusChipText,
                        isDark && { color: colors.textPrimary },
                        active && [styles.statusChipTextActive, isDark && { color: colors.white }]
                      ]}>
                        {item === 'All' ? 'All Statuses' : item}
                      </Text>
                    </TouchableOpacity>
                  );
                }}
              />
            </View>

            <View style={styles.resultsHeader}>
              <Text style={[styles.resultsCount, { color: colors.textOnDarkSecondary }]}>
                Showing {filtered.length} {filtered.length === 1 ? 'road issue' : 'road issues'} in Coimbatore
              </Text>
            </View>
          </View>
        }
        ListEmptyComponent={
          loading ? (
            <View style={styles.emptyContainer}>
              <ActivityIndicator size="large" color={colors.primary} />
              <Text style={[styles.emptyText, { color: colors.textOnDarkSecondary }]}>Loading community road records…</Text>
            </View>
          ) : (
            <View style={styles.emptyContainer}>
              <Ionicons name="checkmark-circle-outline" size={48} color={colors.disabled} />
              <Text style={[styles.emptyTitle, { color: colors.textOnDark }]}>No matching reports found</Text>
              <Text style={[styles.emptyText, { color: colors.textOnDarkSecondary }]}>No road defects in this category or region.</Text>
            </View>
          )
        }
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: AppColors.background },
  listContent: { padding: 16, paddingBottom: 40 },
  headerContainer: { marginBottom: 12 },
  brandRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14, flexWrap: 'wrap', gap: 8 },
  title: { fontSize: 22, fontWeight: '800', color: AppColors.textPrimary },
  subtitle: { fontSize: 13, color: AppColors.textSecondary, marginTop: 2 },
  iconCircle: { width: 44, height: 44, borderRadius: 22, backgroundColor: '#EFF6FF', alignItems: 'center', justifyContent: 'center' },
  statsCard: {
    backgroundColor: '#FFF',
    borderRadius: 14,
    padding: 14,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#E2E8F0',
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
  statsHeader: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 10, flexWrap: 'wrap' },
  statsHeaderText: { fontSize: 12, fontWeight: '700', color: '#0D9488' },
  statsGrid: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 6 },
  statItem: { flex: 1, minWidth: 70, alignItems: 'center' },
  statDivider: { width: 1, height: 28, backgroundColor: '#E2E8F0' },
  statLabel: { fontSize: 10, color: AppColors.textSecondary, marginBottom: 2, textAlign: 'center' },
  statValue: { fontSize: 15, fontWeight: '800', color: AppColors.textPrimary },
  statValueGreen: { fontSize: 15, fontWeight: '800', color: '#0D9488' },
  statValueBlue: { fontSize: 15, fontWeight: '800', color: '#2563EB' },
  statValueTeal: { fontSize: 15, fontWeight: '800', color: AppColors.success },
  filterSection: { marginBottom: 12 },
  filterSectionTitle: { fontSize: 12, fontWeight: '700', color: AppColors.textSecondary, marginBottom: 6 },
  regionChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    backgroundColor: '#EFF6FF',
    borderWidth: 1,
    borderColor: '#BFDBFE',
  },
  regionChipActive: { backgroundColor: AppColors.primary, borderColor: AppColors.primary },
  regionChipText: { fontSize: 12, fontWeight: '600', color: AppColors.primary },
  regionChipTextActive: { color: '#FFF', fontWeight: '700' },
  filterChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    backgroundColor: '#F1F5F9',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  filterChipActive: { backgroundColor: '#0D9488', borderColor: '#0D9488' },
  filterChipText: { fontSize: 12, fontWeight: '600', color: AppColors.textSecondary },
  filterChipTextActive: { color: '#FFF', fontWeight: '700' },
  statusChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#CBD5E1',
  },
  statusChipActive: { backgroundColor: '#4F46E5', borderColor: '#4F46E5' },
  statusChipText: { fontSize: 12, fontWeight: '600', color: AppColors.textSecondary },
  statusChipTextActive: { color: '#FFF', fontWeight: '700' },
  resultsHeader: { marginTop: 4, marginBottom: 8 },
  resultsCount: { fontSize: 13, fontWeight: '600', color: AppColors.textSecondary },
  emptyContainer: { alignItems: 'center', justifyContent: 'center', padding: 40 },
  emptyTitle: { fontSize: 16, fontWeight: '700', color: AppColors.textPrimary, marginTop: 12 },
  emptyText: { fontSize: 13, color: AppColors.textSecondary, textAlign: 'center', marginTop: 4, lineHeight: 18 },
});
