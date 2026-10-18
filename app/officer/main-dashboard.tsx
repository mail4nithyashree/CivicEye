import ComplaintCard from '@/components/ComplaintCard';
import { ALL_COIMBATORE_REGIONS, type CoimbatoreRegion } from '@/constants/coimbatoreRoads';
import { AppColors } from '@/constants/colors';
import { auth } from '@/firebaseConfig';
import {
  assignToAuthority,
  markComplaintResolved,
  subscribeToAllComplaints,
  updateAuthorityProgress,
  type Complaint,
} from '@/services/complaintService';
import { isRoadDepartment } from '@/services/departmentMapping';
import { createNotification } from '@/services/notificationService';
import { subscribeToOfficerProfile, type Officer } from '@/services/officerService';
import { Ionicons } from '@expo/vector-icons';
import { useRootNavigationState, useRouter } from 'expo-router';
import { onAuthStateChanged, signOut, type User } from 'firebase/auth';
import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Modal,
  Platform,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

type FilterTab =
  | 'all'
  | 'pending_verification'
  | 'verified'
  | 'assigned'
  | 'in_progress'
  | 'resolved'
  | 'closed'
  | 'rejected'
  | 'multi_dept';

const AUTHORITY_OPTIONS = [
  'Coimbatore City Municipal Corporation (CCMC) - North Zone',
  'Coimbatore City Municipal Corporation (CCMC) - East Zone',
  'Coimbatore City Municipal Corporation (CCMC) - Central Zone',
  'Tamil Nadu State Highways Department (C&M) - Coimbatore Division',
  'Highways & Minor Ports Department - Avinashi Road Elevated Wing',
  'National Highways Authority of India (NHAI) - Coimbatore Wing',
];

export default function MainOfficerDashboard() {
  const router = useRouter();
  const rootNavigationState = useRootNavigationState();

  const [user, setUser] = useState<User | null>(auth.currentUser);
  const [officer, setOfficer] = useState<Officer | null>(null);
  const [authChecking, setAuthChecking] = useState(true);

  const [complaints, setComplaints] = useState<Complaint[]>([]);
  const [loadingComplaints, setLoadingComplaints] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Filters
  const [searchQuery, setSearchQuery] = useState('');
  const [activeFilter, setActiveFilter] = useState<FilterTab>('all');
  const [regionFilter, setRegionFilter] = useState<'all' | CoimbatoreRegion>('all');
  const [issueFilter, setIssueFilter] = useState<'all' | 'pothole' | 'cracking' | 'alligator cracking'>('all');

  // Authority Assignment Modal
  const [showAssignModal, setShowAssignModal] = useState(false);
  const [selectedComplaint, setSelectedComplaint] = useState<Complaint | null>(null);
  const [selectedAuthority, setSelectedAuthority] = useState(AUTHORITY_OPTIONS[0]);
  const [adminAssignmentRemarks, setAdminAssignmentRemarks] = useState('');
  const [assigning, setAssigning] = useState(false);

  // Status Action Modal (In Progress / Resolve)
  const [showStatusModal, setShowStatusModal] = useState(false);
  const [statusActionComplaint, setStatusActionComplaint] = useState<Complaint | null>(null);
  const [statusActionType, setStatusActionType] = useState<'In Progress' | 'Resolved' | null>(null);
  const [actionRemarks, setActionRemarks] = useState('');
  const [updatingStatus, setUpdatingStatus] = useState(false);

  // 1. Auth Listener
  useEffect(() => {
    if (!rootNavigationState?.key) return;
    let isMounted = true;
    const unsub = onAuthStateChanged(auth, u => {
      if (!isMounted) return;
      setUser(u);
      if (!u) {
        setAuthChecking(false);
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
        setAuthChecking(false);
        if (!profile) {
          const email = user.email || '';
          setOfficer({
            id: user.uid,
            email,
            name: email.split('@')[0] || 'Main Officer',
            role: 'main_officer',
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
        setAuthChecking(false);
        const email = user.email || '';
        setOfficer({
          id: user.uid,
          email,
          name: email.split('@')[0] || 'Main Officer',
          role: 'main_officer',
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

  // 3. Realtime Complaints Listener
  useEffect(() => {
    if (!user) return;
    const unsub = subscribeToAllComplaints(
      data => {
        setComplaints(data);
        setLoadingComplaints(false);
        setRefreshing(false);
      },
      err => {
        console.error('Complaints fetch error:', err);
        setLoadingComplaints(false);
        setRefreshing(false);
      }
    );
    return unsub;
  }, [user]);

  const onRefresh = () => {
    setRefreshing(true);
    setTimeout(() => setRefreshing(false), 800);
  };

  // Analytics
  const analytics = useMemo(() => {
    const total = complaints.length;
    let pendingVerification = 0;
    let verified = 0;
    let assigned = 0;
    let inProgress = 0;
    let resolved = 0;
    let closed = 0;
    let rejected = 0;
    let multiDept = 0;

    const regionCounts: Record<CoimbatoreRegion, number> = {
      Maniyakarampalayam: 0,
      Ganapathy: 0,
      Gandhipuram: 0,
      Peelamedu: 0,
    };

    const issueCounts: Record<string, number> = {
      pothole: 0,
      cracking: 0,
      'alligator cracking': 0,
    };

    complaints.forEach(c => {
      const st = c.status;
      const isMismatch =
        st === 'Invalid Issue image, raise the complaint with the appropriate image!' ||
        st === 'Dissimilar Image to the Issue' ||
        c.rejectionType === 'IMAGE_MISMATCH' ||
        c.rejectionType === 'INVALID_IMAGE' ||
        c.inspectionStatus === 'INVALID';
      if (st === 'Rejected' || isMismatch) {
        rejected++;
      } else if (st === 'Submitted' || st === 'Pending Field Verification') {
        pendingVerification++;
      } else if (st === 'Verified') {
        verified++;
      } else if (st === 'Assigned' || st === 'Accepted') {
        assigned++;
      } else if (st === 'In Progress') {
        inProgress++;
      } else if (st === 'Resolved' || st === 'Citizen Verification') {
        resolved++;
      } else if (st === 'Closed') {
        closed++;
      }

      if (c.isOtherDeptInvolved && !isMismatch && st !== 'Rejected') multiDept++;

      if (c.region && regionCounts[c.region] !== undefined) {
        regionCounts[c.region]++;
      }

      const issueKey = (c.inspectionDetails?.verifiedIssue || c.issueType || '').toLowerCase();
      if (issueCounts[issueKey] !== undefined) {
        issueCounts[issueKey]++;
      }
    });

    return {
      total,
      pendingVerification,
      verified,
      assigned,
      inProgress,
      resolved,
      closed,
      rejected,
      multiDept,
      regionCounts,
      issueCounts,
    };
  }, [complaints]);

  // Filtered complaints
  const filteredComplaints = useMemo(() => {
    return complaints.filter(c => {
      const isMismatch =
        c.status === 'Invalid Issue image, raise the complaint with the appropriate image!' ||
        c.status === 'Dissimilar Image to the Issue' ||
        c.rejectionType === 'IMAGE_MISMATCH' ||
        c.rejectionType === 'INVALID_IMAGE' ||
        c.inspectionStatus === 'INVALID';

      // Tab filter
      if (activeFilter === 'rejected') {
        if (c.status !== 'Rejected' && !isMismatch) return false;
      } else {
        // Exclude all rejected/mismatched complaints from all active queues & 'all' active tab
        if (isMismatch || c.status === 'Rejected') return false;

        if (activeFilter === 'pending_verification' && c.status !== 'Pending Field Verification' && c.status !== 'Submitted') return false;
        if (activeFilter === 'verified' && c.status !== 'Verified') return false;
        if (activeFilter === 'assigned' && c.status !== 'Assigned' && c.status !== 'Accepted') return false;
        if (activeFilter === 'in_progress' && c.status !== 'In Progress') return false;
        if (activeFilter === 'resolved' && c.status !== 'Resolved' && c.status !== 'Citizen Verification') return false;
        if (activeFilter === 'closed' && c.status !== 'Closed') return false;
        if (activeFilter === 'multi_dept' && !c.isOtherDeptInvolved) return false;
      }

      // Region filter
      if (regionFilter !== 'all' && c.region !== regionFilter) return false;

      // Issue filter
      if (issueFilter !== 'all') {
        const issue = (c.inspectionDetails?.verifiedIssue || c.issueType || '').toLowerCase();
        if (issue !== issueFilter) return false;
      }

      // Search query
      if (searchQuery.trim()) {
        const query = searchQuery.toLowerCase().trim();
        const idMatch = c.complaintId?.toLowerCase().includes(query);
        const issueMatch = c.issueType?.toLowerCase().includes(query);
        const statusMatch = c.status?.toLowerCase().includes(query);
        const roadMatch = c.roadName?.toLowerCase().includes(query);
        const citizenMatch = c.citizenEmail?.toLowerCase().includes(query);
        const authMatch = c.maintenanceAuthority?.toLowerCase().includes(query);
        const inspectorMatch = c.assignedInspectorName?.toLowerCase().includes(query);
        const deptMatch =
          c.department?.toLowerCase().includes(query) ||
          c.responsibleDepartment?.toLowerCase().includes(query) ||
          c.departmentCode?.toLowerCase().includes(query) ||
          c.routingStatus?.toLowerCase().includes(query) ||
          c.originalDepartment?.toLowerCase().includes(query) ||
          c.description?.toLowerCase().includes(query);

        if (!idMatch && !issueMatch && !statusMatch && !roadMatch && !citizenMatch && !authMatch && !inspectorMatch && !deptMatch) {
          return false;
        }
      }

      return true;
    });
  }, [complaints, activeFilter, regionFilter, issueFilter, searchQuery]);

  // Handle Authority Assignment
  const handleAssignAuthority = async () => {
    if (!selectedComplaint || !user || !officer) return;
    if (
      selectedComplaint.status === 'Invalid Issue image, raise the complaint with the appropriate image!' ||
      selectedComplaint.status === 'Dissimilar Image to the Issue' ||
      selectedComplaint.rejectionType === 'IMAGE_MISMATCH' ||
      selectedComplaint.rejectionType === 'INVALID_IMAGE' ||
      selectedComplaint.inspectionStatus === 'INVALID'
    ) {
      Alert.alert('Action Blocked', 'Cannot assign authority to a rejected invalid complaint.');
      return;
    }
    setAssigning(true);
    try {
      await assignToAuthority(selectedComplaint.id, {
        assignedAuthority: selectedAuthority,
        adminId: user.uid,
        adminName: officer.name,
        adminRemarks: adminAssignmentRemarks.trim() || undefined,
      });

      // Notification to Authority
      await createNotification({
        recipientRole: 'authority',
        complaintId: selectedComplaint.id,
        title: 'Road Defect Assigned to Division',
        message: `Complaint #${selectedComplaint.complaintId} in ${selectedComplaint.region} assigned to ${selectedAuthority}. Please accept and schedule work.`,
        type: 'authority_assigned',
      });

      // Notification to Citizen
      await createNotification({
        userId: selectedComplaint.citizenId,
        recipientRole: 'citizen',
        complaintId: selectedComplaint.id,
        title: 'Complaint Assigned to Authority',
        message: `Your complaint #${selectedComplaint.complaintId} has been officially assigned to ${selectedAuthority}. Work will commence as per estimation.`,
        type: 'authority_assigned',
      });

      setShowAssignModal(false);
      setSelectedComplaint(null);
      Alert.alert('Assignment Complete', `Complaint #${selectedComplaint.complaintId} assigned to ${selectedAuthority}.`);
    } catch (error) {
      console.error('Assignment error:', error);
      Alert.alert('Assignment Error', 'Failed to assign complaint.');
    } finally {
      setAssigning(false);
    }
  };

  // Handle Status Update (In Progress / Resolved)
  const handleUpdateStatus = async () => {
    if (!statusActionComplaint || !user || !officer || !statusActionType) return;
    if (
      statusActionComplaint.status === 'Invalid Issue image, raise the complaint with the appropriate image!' ||
      statusActionComplaint.status === 'Dissimilar Image to the Issue' ||
      statusActionComplaint.rejectionType === 'IMAGE_MISMATCH' ||
      statusActionComplaint.rejectionType === 'INVALID_IMAGE' ||
      statusActionComplaint.inspectionStatus === 'INVALID'
    ) {
      Alert.alert('Action Blocked', 'Cannot update status on a rejected invalid complaint.');
      return;
    }
    setUpdatingStatus(true);
    try {
      if (statusActionType === 'In Progress') {
        await updateAuthorityProgress(
          statusActionComplaint.id,
          'In Progress',
          user.uid,
          officer.name,
          actionRemarks.trim() || 'Maintenance crew deployed on-site.'
        );

        await createNotification({
          userId: statusActionComplaint.citizenId,
          recipientRole: 'citizen',
          complaintId: statusActionComplaint.id,
          title: 'Road Repair In Progress',
          message: `Repair work is now in progress on ${statusActionComplaint.roadName || 'the road'} in ${statusActionComplaint.region}.`,
          type: 'work_in_progress',
        });
      } else if (statusActionType === 'Resolved') {
        await markComplaintResolved(statusActionComplaint.id, {
          resolvedBy: user.uid,
          resolvedByName: officer.name,
          resolutionRemarks: actionRemarks.trim() || 'Road pavement restored, asphalt compacted and road open to traffic.',
        });

        await createNotification({
          userId: statusActionComplaint.citizenId,
          recipientRole: 'citizen',
          complaintId: statusActionComplaint.id,
          title: 'Road Defect Resolved - Please Verify',
          message: `The maintenance authority completed repairs on #${statusActionComplaint.complaintId}. Please inspect and confirm resolution.`,
          type: 'work_resolved',
        });
      }

      setShowStatusModal(false);
      setStatusActionComplaint(null);
      Alert.alert('Status Updated', `Complaint status transitioned to ${statusActionType}.`);
    } catch (error) {
      console.error('Status update error:', error);
      Alert.alert('Update Error', 'Failed to update status.');
    } finally {
      setUpdatingStatus(false);
    }
  };

  const performLogout = async () => {
    try {
      setOfficer(null);
      await signOut(auth);
      router.replace('/login');
    } catch (e) {
      console.error('Logout error:', e);
      router.replace('/login');
    }
  };

  const handleLogout = () => {
    if (Platform.OS === 'web') {
      if (typeof window !== 'undefined' && window.confirm('Are you sure you want to log out of Officer Portal?')) {
        performLogout();
      }
      return;
    }

    Alert.alert(
      'Confirm Logout',
      'Are you sure you want to log out of Officer Portal?',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Logout', style: 'destructive', onPress: performLogout },
      ]
    );
  };

  if (authChecking || loadingComplaints) {
    return (
      <SafeAreaView style={styles.centered}>
        <ActivityIndicator size="large" color={AppColors.primary} />
        <Text style={styles.loadingText}>Loading Coimbatore Road Management Dashboard…</Text>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe}>
      {/* Top Bar */}
      <View style={styles.topBar}>
        <View style={styles.brandGroup}>
          <View style={styles.brandIcon}>
            <Ionicons name="shield-checkmark" size={20} color={AppColors.white} />
          </View>
          <View>
            <Text style={styles.portalTitle}>CivicEye Coimbatore</Text>
            <Text style={styles.officerName}>
              {officer?.name} • {officer?.role === 'main_officer' ? 'Administrator' : 'Field Inspector'}
            </Text>
          </View>
        </View>

        <View style={styles.topActions}>
          <TouchableOpacity
            style={styles.profileBtn}
            onPress={() => router.push('/officer/profile')}
            accessible
            accessibilityRole="button"
            accessibilityLabel="Officer Profile"
          >
            <Ionicons name="person-circle-outline" size={26} color={AppColors.primary} />
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.logoutBtn}
            onPress={handleLogout}
            accessible
            accessibilityRole="button"
            accessibilityLabel="Logout"
          >
            <Ionicons name="log-out-outline" size={22} color={AppColors.error} />
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={AppColors.primary} />}
      >
        {/* Banner: Coimbatore 4-Region Scope */}
        <View style={styles.scopeBanner}>
          <Ionicons name="map" size={18} color="#1D4ED8" />
          <Text style={styles.scopeBannerText}>
            Target Coverage: Maniyakarampalayam • Ganapathy • Gandhipuram • Peelamedu
          </Text>
        </View>

        {/* Analytics Grid */}
        <View style={styles.analyticsGrid}>
          <View style={[styles.statBox, { borderLeftColor: AppColors.primary }]}>
            <Text style={styles.statNum}>{analytics.total}</Text>
            <Text style={styles.statLabel}>Total Raised</Text>
          </View>
          <View style={[styles.statBox, { borderLeftColor: '#B45309' }]}>
            <Text style={[styles.statNum, { color: '#B45309' }]}>{analytics.pendingVerification}</Text>
            <Text style={styles.statLabel}>Pending Insp.</Text>
          </View>
          <View style={[styles.statBox, { borderLeftColor: '#0D9488' }]}>
            <Text style={[styles.statNum, { color: '#0D9488' }]}>{analytics.verified}</Text>
            <Text style={styles.statLabel}>Verified (Ready)</Text>
          </View>
          <View style={[styles.statBox, { borderLeftColor: '#4F46E5' }]}>
            <Text style={[styles.statNum, { color: '#4F46E5' }]}>{analytics.assigned}</Text>
            <Text style={styles.statLabel}>Assigned</Text>
          </View>
          <View style={[styles.statBox, { borderLeftColor: '#D97706' }]}>
            <Text style={[styles.statNum, { color: '#D97706' }]}>{analytics.inProgress}</Text>
            <Text style={styles.statLabel}>In Progress</Text>
          </View>
          <View style={[styles.statBox, { borderLeftColor: AppColors.success }]}>
            <Text style={[styles.statNum, { color: AppColors.success }]}>{analytics.resolved + analytics.closed}</Text>
            <Text style={styles.statLabel}>Resolved / Closed</Text>
          </View>
        </View>

        {/* Region Breakdown Cards */}
        <Text style={styles.sectionHeader}>Coimbatore 4-Region Breakdown</Text>
        <View style={styles.regionBreakdownRow}>
          {ALL_COIMBATORE_REGIONS.map(reg => (
            <TouchableOpacity
              key={reg}
              style={[
                styles.regionStatCard,
                regionFilter === reg && styles.regionStatCardActive,
              ]}
              onPress={() => setRegionFilter(regionFilter === reg ? 'all' : reg)}
            >
              <Text style={[styles.regionStatNum, regionFilter === reg && styles.regionStatTextActive]}>
                {analytics.regionCounts[reg]}
              </Text>
              <Text style={[styles.regionStatName, regionFilter === reg && styles.regionStatTextActive]} numberOfLines={1}>
                {reg}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Issue Type Breakdown Cards */}
        <Text style={styles.sectionHeader}>Issue Type Distribution</Text>
        <View style={styles.issueBreakdownRow}>
          <TouchableOpacity
            style={[styles.issueStatCard, issueFilter === 'pothole' && styles.issueStatCardActive]}
            onPress={() => setIssueFilter(issueFilter === 'pothole' ? 'all' : 'pothole')}
          >
            <Text style={styles.issueStatNum}>{analytics.issueCounts['pothole']}</Text>
            <Text style={styles.issueStatName}>Potholes</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.issueStatCard, issueFilter === 'cracking' && styles.issueStatCardActive]}
            onPress={() => setIssueFilter(issueFilter === 'cracking' ? 'all' : 'cracking')}
          >
            <Text style={styles.issueStatNum}>{analytics.issueCounts['cracking']}</Text>
            <Text style={styles.issueStatName}>Cracking</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.issueStatCard, issueFilter === 'alligator cracking' && styles.issueStatCardActive]}
            onPress={() => setIssueFilter(issueFilter === 'alligator cracking' ? 'all' : 'alligator cracking')}
          >
            <Text style={styles.issueStatNum}>{analytics.issueCounts['alligator cracking']}</Text>
            <Text style={styles.issueStatName}>Alligator Crack</Text>
          </TouchableOpacity>
        </View>

        {/* Search & Filter Bar */}
        <View style={styles.searchBar}>
          <Ionicons name="search" size={18} color={AppColors.placeholder} />
          <TextInput
            style={styles.searchInput}
            placeholder="Search by ID, Road, Defect, or Authority…"
            placeholderTextColor={AppColors.placeholder}
            value={searchQuery}
            onChangeText={setSearchQuery}
          />
          {searchQuery.trim() ? (
            <TouchableOpacity onPress={() => setSearchQuery('')}>
              <Ionicons name="close-circle" size={16} color={AppColors.placeholder} />
            </TouchableOpacity>
          ) : null}
        </View>

        {/* Tab Filters */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.tabsScroll}>
          <TouchableOpacity
            style={[styles.tabChip, activeFilter === 'all' && styles.tabChipActive]}
            onPress={() => setActiveFilter('all')}
          >
            <Text style={[styles.tabChipText, activeFilter === 'all' && styles.tabChipTextActive]}>
              All ({analytics.total})
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.tabChip, activeFilter === 'pending_verification' && styles.tabChipActive]}
            onPress={() => setActiveFilter('pending_verification')}
          >
            <Text style={[styles.tabChipText, activeFilter === 'pending_verification' && styles.tabChipTextActive]}>
              Pending Insp ({analytics.pendingVerification})
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.tabChip, activeFilter === 'verified' && styles.tabChipActive]}
            onPress={() => setActiveFilter('verified')}
          >
            <Text style={[styles.tabChipText, activeFilter === 'verified' && styles.tabChipTextActive]}>
              Verified ({analytics.verified})
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.tabChip, activeFilter === 'assigned' && styles.tabChipActive]}
            onPress={() => setActiveFilter('assigned')}
          >
            <Text style={[styles.tabChipText, activeFilter === 'assigned' && styles.tabChipTextActive]}>
              Assigned ({analytics.assigned})
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.tabChip, activeFilter === 'in_progress' && styles.tabChipActive]}
            onPress={() => setActiveFilter('in_progress')}
          >
            <Text style={[styles.tabChipText, activeFilter === 'in_progress' && styles.tabChipTextActive]}>
              In Progress ({analytics.inProgress})
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.tabChip, activeFilter === 'resolved' && styles.tabChipActive]}
            onPress={() => setActiveFilter('resolved')}
          >
            <Text style={[styles.tabChipText, activeFilter === 'resolved' && styles.tabChipTextActive]}>
              Resolved ({analytics.resolved})
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.tabChip, activeFilter === 'multi_dept' && styles.tabChipActive]}
            onPress={() => setActiveFilter('multi_dept')}
          >
            <Text style={[styles.tabChipText, activeFilter === 'multi_dept' && styles.tabChipTextActive]}>
              Multi-Dept ({analytics.multiDept})
            </Text>
          </TouchableOpacity>
        </ScrollView>

        {/* Complaint Cards List */}
        <View style={styles.complaintList}>
          {filteredComplaints.length === 0 ? (
            <View style={styles.emptyWrap}>
              <Ionicons name="document-text-outline" size={48} color={AppColors.placeholder} />
              <Text style={styles.emptyTitle}>No Complaints Found</Text>
              <Text style={styles.emptySub}>No complaints match the selected filter or region.</Text>
            </View>
          ) : (
            filteredComplaints.map(c => (
              <View key={c.id} style={styles.cardContainer}>
                <ComplaintCard
                  complaint={c}
                  onPress={() => router.push({ pathname: '/officer/complaint-details', params: { id: c.id } })}
                />

                {/* Quick Action Buttons for Admin / Officer */}
                <View style={styles.quickActionRow}>
                  {/* Road Maintenance Lifecycle Actions */}
                  {isRoadDepartment(c.department || c.responsibleDepartment || 'Road Maintenance') && (
                    <>
                      {/* If Pending Verification -> Inspect */}
                      {(c.status === 'Pending Field Verification' || c.status === 'Submitted') && (
                        <TouchableOpacity
                          style={styles.actionInspectBtn}
                          onPress={() => router.push({ pathname: '/officer/inspection-screen', params: { id: c.id } })}
                        >
                          <Ionicons name="shield-outline" size={14} color={AppColors.white} />
                          <Text style={styles.actionBtnText}>Perform Field Inspection</Text>
                        </TouchableOpacity>
                      )}

                      {/* If Verified -> Assign Authority */}
                      {c.status === 'Verified' && (
                        <TouchableOpacity
                          style={styles.actionAssignBtn}
                          onPress={() => {
                            setSelectedComplaint(c);
                            if (c.inspectionDetails?.maintenanceAuthority) {
                              setSelectedAuthority(c.inspectionDetails.maintenanceAuthority);
                            }
                            setShowAssignModal(true);
                          }}
                        >
                          <Ionicons name="business-outline" size={14} color={AppColors.white} />
                          <Text style={styles.actionBtnText}>Assign Authority</Text>
                        </TouchableOpacity>
                      )}

                      {/* If Assigned -> Start Work */}
                      {(c.status === 'Assigned' || c.status === 'Accepted') && (
                        <TouchableOpacity
                          style={styles.actionProgressBtn}
                          onPress={() => {
                            setStatusActionComplaint(c);
                            setStatusActionType('In Progress');
                            setActionRemarks('Road maintenance work started on-site.');
                            setShowStatusModal(true);
                          }}
                        >
                          <Ionicons name="construct-outline" size={14} color={AppColors.white} />
                          <Text style={styles.actionBtnText}>Start Repair Work</Text>
                        </TouchableOpacity>
                      )}

                      {/* If In Progress -> Mark Resolved */}
                      {c.status === 'In Progress' && (
                        <TouchableOpacity
                          style={styles.actionResolveBtn}
                          onPress={() => {
                            setStatusActionComplaint(c);
                            setStatusActionType('Resolved');
                            setActionRemarks('Road pavement fully restored and open to traffic.');
                            setShowStatusModal(true);
                          }}
                        >
                          <Ionicons name="checkmark-done-outline" size={14} color={AppColors.white} />
                          <Text style={styles.actionBtnText}>Mark Resolved</Text>
                        </TouchableOpacity>
                      )}
                    </>
                  )}

                  {/* View Details */}
                  <TouchableOpacity
                    style={styles.actionDetailsBtn}
                    onPress={() => router.push({ pathname: '/officer/complaint-details', params: { id: c.id } })}
                  >
                    <Ionicons name="open-outline" size={14} color={AppColors.primary} />
                    <Text style={styles.actionDetailsText}>
                      {!isRoadDepartment(c.department || c.responsibleDepartment || 'Road Maintenance') ? 'View Reference' : 'Details'}
                    </Text>
                  </TouchableOpacity>
                </View>
              </View>
            ))
          )}
        </View>
      </ScrollView>

      {/* Assign Authority Modal */}
      <Modal visible={showAssignModal} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <Ionicons name="business-outline" size={22} color={AppColors.primary} />
              <Text style={styles.modalTitle}>Assign Road Maintenance Authority</Text>
            </View>

            <Text style={styles.modalSub}>
              Complaint {selectedComplaint?.complaintId} • {selectedComplaint?.region}
            </Text>

            <Text style={styles.modalLabel}>Select Responsible Department / Authority:</Text>
            <ScrollView style={{ maxHeight: 200 }}>
              {AUTHORITY_OPTIONS.map(authOpt => (
                <TouchableOpacity
                  key={authOpt}
                  style={[
                    styles.authOptionRow,
                    selectedAuthority === authOpt && styles.authOptionRowActive,
                  ]}
                  onPress={() => setSelectedAuthority(authOpt)}
                >
                  <Ionicons
                    name={selectedAuthority === authOpt ? 'radio-button-on' : 'radio-button-off'}
                    size={16}
                    color={selectedAuthority === authOpt ? AppColors.primary : AppColors.textSecondary}
                  />
                  <Text
                    style={[
                      styles.authOptionText,
                      selectedAuthority === authOpt && styles.authOptionTextActive,
                    ]}
                  >
                    {authOpt}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>

            <Text style={[styles.modalLabel, { marginTop: 12 }]}>Admin Instructions / Remarks:</Text>
            <TextInput
              style={styles.modalInput}
              placeholder="e.g. Schedule asphalt repair within 3 days as estimated by Field Inspector"
              placeholderTextColor={AppColors.placeholder}
              value={adminAssignmentRemarks}
              onChangeText={setAdminAssignmentRemarks}
              multiline
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

      {/* Status Update Modal (In Progress / Resolved) */}
      <Modal visible={showStatusModal} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <Ionicons
                name={statusActionType === 'In Progress' ? 'construct-outline' : 'checkmark-done-circle-outline'}
                size={22}
                color={statusActionType === 'In Progress' ? '#D97706' : AppColors.success}
              />
              <Text style={styles.modalTitle}>
                {statusActionType === 'In Progress' ? 'Start Repair Work' : 'Mark Road Defect as Resolved'}
              </Text>
            </View>

            <Text style={styles.modalSub}>
              Complaint {statusActionComplaint?.complaintId} • {statusActionComplaint?.region}
            </Text>

            <Text style={styles.modalLabel}>Execution Remarks & Details:</Text>
            <TextInput
              style={styles.modalInput}
              placeholder="Enter work execution details..."
              placeholderTextColor={AppColors.placeholder}
              value={actionRemarks}
              onChangeText={setActionRemarks}
              multiline
            />

            <View style={styles.modalBtnRow}>
              <TouchableOpacity
                style={styles.modalCancelBtn}
                onPress={() => setShowStatusModal(false)}
                disabled={updatingStatus}
              >
                <Text style={styles.modalCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.modalSubmitBtn,
                  statusActionType === 'In Progress' ? { backgroundColor: '#D97706' } : { backgroundColor: AppColors.success },
                ]}
                onPress={handleUpdateStatus}
                disabled={updatingStatus}
              >
                {updatingStatus ? (
                  <ActivityIndicator color={AppColors.white} />
                ) : (
                  <Text style={styles.modalSubmitText}>
                    {statusActionType === 'In Progress' ? 'Set In Progress' : 'Mark Resolved'}
                  </Text>
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
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: AppColors.surface,
    borderBottomWidth: 1,
    borderBottomColor: AppColors.border,
  },
  brandGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  brandIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: AppColors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  portalTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: AppColors.textPrimary,
  },
  officerName: {
    fontSize: 11,
    color: AppColors.textSecondary,
  },
  topActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  profileBtn: { padding: 4 },
  logoutBtn: { padding: 4 },
  scroll: { padding: 14, paddingBottom: 40 },
  scopeBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#EFF6FF',
    padding: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#BFDBFE',
    marginBottom: 12,
  },
  scopeBannerText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#1D4ED8',
    flex: 1,
  },
  analyticsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 14,
  },
  statBox: {
    flexBasis: '31%',
    flexGrow: 1,
    backgroundColor: AppColors.surface,
    borderRadius: 10,
    padding: 10,
    borderWidth: 1,
    borderColor: AppColors.border,
    borderLeftWidth: 4,
  },
  statNum: {
    fontSize: 18,
    fontWeight: '800',
    color: AppColors.textPrimary,
  },
  statLabel: {
    fontSize: 10,
    fontWeight: '600',
    color: AppColors.textSecondary,
    marginTop: 2,
  },
  sectionHeader: {
    fontSize: 13,
    fontWeight: '800',
    color: AppColors.textPrimary,
    marginBottom: 6,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  regionBreakdownRow: {
    flexDirection: 'row',
    gap: 6,
    marginBottom: 14,
  },
  regionStatCard: {
    flex: 1,
    backgroundColor: AppColors.surface,
    borderRadius: 8,
    padding: 8,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: AppColors.border,
  },
  regionStatCardActive: {
    backgroundColor: AppColors.primary,
    borderColor: AppColors.primary,
  },
  regionStatNum: {
    fontSize: 14,
    fontWeight: '800',
    color: AppColors.textPrimary,
  },
  regionStatName: {
    fontSize: 9,
    fontWeight: '600',
    color: AppColors.textSecondary,
    marginTop: 2,
  },
  regionStatTextActive: {
    color: AppColors.white,
  },
  issueBreakdownRow: {
    flexDirection: 'row',
    gap: 6,
    marginBottom: 14,
  },
  issueStatCard: {
    flex: 1,
    backgroundColor: AppColors.surface,
    borderRadius: 8,
    padding: 8,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: AppColors.border,
  },
  issueStatCardActive: {
    backgroundColor: '#0D9488',
    borderColor: '#0D9488',
  },
  issueStatNum: {
    fontSize: 14,
    fontWeight: '800',
    color: AppColors.textPrimary,
  },
  issueStatName: {
    fontSize: 10,
    fontWeight: '600',
    color: AppColors.textSecondary,
    marginTop: 2,
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: AppColors.surface,
    borderRadius: 10,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: AppColors.border,
    gap: 8,
    marginBottom: 10,
    height: 42,
  },
  searchInput: {
    flex: 1,
    fontSize: 13,
    color: AppColors.textPrimary,
  },
  tabsScroll: {
    marginBottom: 12,
  },
  tabChip: {
    backgroundColor: AppColors.surface,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: AppColors.border,
    marginRight: 6,
  },
  tabChipActive: {
    backgroundColor: AppColors.primary,
    borderColor: AppColors.primary,
  },
  tabChipText: {
    fontSize: 11,
    fontWeight: '700',
    color: AppColors.textSecondary,
  },
  tabChipTextActive: {
    color: AppColors.white,
  },
  complaintList: {
    gap: 12,
  },
  cardContainer: {
    marginBottom: 4,
  },
  quickActionRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: -8,
    marginBottom: 12,
    paddingHorizontal: 4,
    flexWrap: 'wrap',
  },
  actionInspectBtn: {
    flex: 1,
    minWidth: 140,
    backgroundColor: '#0D9488',
    borderRadius: 8,
    paddingVertical: 9,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
  },
  actionAssignBtn: {
    flex: 1,
    minWidth: 130,
    backgroundColor: '#4F46E5',
    borderRadius: 8,
    paddingVertical: 9,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
  },
  actionProgressBtn: {
    flex: 1,
    minWidth: 130,
    backgroundColor: '#D97706',
    borderRadius: 8,
    paddingVertical: 9,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
  },
  actionResolveBtn: {
    flex: 1,
    minWidth: 130,
    backgroundColor: AppColors.success,
    borderRadius: 8,
    paddingVertical: 9,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
  },
  actionDetailsBtn: {
    backgroundColor: AppColors.surface,
    borderWidth: 1,
    borderColor: AppColors.primary,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 9,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    minWidth: 76,
  },
  actionBtnText: {
    fontSize: 11,
    fontWeight: '700',
    color: AppColors.white,
  },
  actionDetailsText: {
    fontSize: 11,
    fontWeight: '700',
    color: AppColors.primary,
  },
  emptyWrap: {
    alignItems: 'center',
    padding: 30,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: AppColors.textPrimary,
    marginTop: 10,
  },
  emptySub: {
    fontSize: 12,
    color: AppColors.textSecondary,
    marginTop: 4,
    textAlign: 'center',
  },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  loadingText: {
    marginTop: 12,
    fontSize: 13,
    color: AppColors.textSecondary,
  },
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
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 4,
  },
  modalTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: AppColors.textPrimary,
  },
  modalSub: {
    fontSize: 12,
    color: AppColors.primary,
    fontWeight: '600',
    marginBottom: 12,
  },
  modalLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: AppColors.textPrimary,
    marginBottom: 6,
  },
  authOptionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: AppColors.border,
  },
  authOptionRowActive: {
    backgroundColor: '#EEF2FF',
  },
  authOptionText: {
    fontSize: 12,
    color: AppColors.textPrimary,
    flex: 1,
  },
  authOptionTextActive: {
    fontWeight: '700',
    color: '#4F46E5',
  },
  modalInput: {
    backgroundColor: AppColors.background,
    borderRadius: 10,
    padding: 10,
    borderWidth: 1,
    borderColor: AppColors.border,
    minHeight: 60,
    fontSize: 13,
    color: AppColors.textPrimary,
    marginBottom: 14,
  },
  modalBtnRow: {
    flexDirection: 'row',
    gap: 10,
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
  modalSubmitBtn: {
    flex: 1,
    backgroundColor: AppColors.primary,
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: 'center',
  },
  modalSubmitText: {
    color: AppColors.white,
    fontWeight: '700',
  },
});
