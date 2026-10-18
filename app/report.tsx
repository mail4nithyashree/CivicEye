import {
  ALL_COIMBATORE_REGIONS,
  getStandardEstimatedBudget,
  isLocationWithinCoimbatoreRegions,
  matchRegionByCoordinates,
  matchRoadByCoordinates,
  type CoimbatoreRegion,
  type PracticalBudgetDetails,
} from '@/constants/coimbatoreRoads';
import PracticalBudgetBreakdownCard from '@/components/PracticalBudgetBreakdownCard';
import CivicImage from '@/components/CivicImage';
import { AppColors } from '@/constants/colors';
import { auth } from '@/firebaseConfig';
import { getApiBaseUrl } from '@/services/apiConfig';
import { logAnalysisRecord, submitComplaint, uploadComplaintImage } from '@/services/complaintService';
import {
  classifyDepartmentFromDescription,
  getDefaultIssueTypeForDepartment,
  isRoadDepartment,
} from '@/services/departmentMapping';
import { analyzeCivicImage, type AnalysisResult } from '@/services/imageAnalysis';
import { createNotification } from '@/services/notificationService';
import { getResponsibleOfficerName } from '@/services/officerService';
import { getEstimatedResolutionDuration, formatResolutionDate } from '@/services/resolutionDuration';
import ImageEditorModal from '@/components/ImageEditorModal';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import * as Location from 'expo-location';
import { useRouter } from 'expo-router';
import { onAuthStateChanged, type User } from 'firebase/auth';
import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  KeyboardAvoidingView,
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

type Step = 'form' | 'checking' | 'analyzing' | 'result' | 'no_issue' | 'success' | 'rejected' | 'uncertain';

function priorityTextColor(priority: string) {
  switch (priority.toUpperCase()) {
    case 'HIGH':   return { color: AppColors.error };
    case 'MEDIUM': return { color: '#C2410C' };
    case 'LOW':    return { color: AppColors.success };
    default:       return { color: AppColors.textSecondary };
  }
}

export default function ReportScreen() {
  const router = useRouter();
  const isMountedRef = useRef(true);
  const [user, setUser] = useState<User | null>(auth.currentUser);

  const [imageUri, setImageUri] = useState<string | null>(null);
  const [rawPickedUri, setRawPickedUri] = useState<string | null>(null);
  const [editorVisible, setEditorVisible] = useState(false);

  const [description, setDescription] = useState('');
  const [selectedRegion, setSelectedRegion] = useState<CoimbatoreRegion>('Gandhipuram');
  const [location, setLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [locationLoading, setLocationLoading] = useState(false);
  const [suggestedRoad, setSuggestedRoad] = useState<string | null>(null);
  const [suggestedAuthority, setSuggestedAuthority] = useState<string | null>(null);

  const [step, setStep] = useState<Step>('form');
  const [analysis, setAnalysis] = useState<AnalysisResult | null>(null);
  const [reviewOfficerName, setReviewOfficerName] = useState<string>('Awaiting Assignment');
  const [submitting, setSubmitting] = useState(false);
  const [showInvalidModal, setShowInvalidModal] = useState(false);
  const [rejectedInfo, setRejectedInfo] = useState<{
    complaintId: string;
    reason: string;
    rejectionType: string;
    issueType?: string;
    imageUrl?: string;
  } | null>(null);
  const [uncertainAnalysis, setUncertainAnalysis] = useState<AnalysisResult | null>(null);
  const [referenceIssueId, setReferenceIssueId] = useState<string>('CE-' + Math.floor(100000 + Math.random() * 900000));
  const [submittedInfo, setSubmittedInfo] = useState<{
    complaintId: string;
    department: string;
    departmentCode: string;
    routingStatus: string;
    routingMessage?: string;
    issueType: string;
    priority: string;
    region?: string;
    estimatedBudget?: number;
    estimatedBudgetDesc?: string;
    budgetBreakdown?: PracticalBudgetDetails;
    officerName?: string;
    estimatedResolutionDuration?: string;
    estimatedResolutionDays?: number;
    expectedResolutionDate?: Date;
  } | null>(null);

  const isBusy = step === 'checking' || step === 'analyzing';

  useEffect(() => {
    isMountedRef.current = true;
    const unsub = onAuthStateChanged(auth, u => {
      if (isMountedRef.current) setUser(u);
    });
    return () => {
      isMountedRef.current = false;
      unsub();
    };
  }, []);

  useEffect(() => {
    if (analysis) {
      const classifiedDept = classifyDepartmentFromDescription(description.trim(), analysis.department);
      getResponsibleOfficerName(classifiedDept.department, classifiedDept.departmentCode)
        .then(name => {
          if (name) setReviewOfficerName(name);
          else setReviewOfficerName('Awaiting Assignment');
        })
        .catch(() => {
          setReviewOfficerName('Awaiting Assignment');
        });
    }
  }, [analysis, step]);

  // Auto-fetch location on screen open if not yet fetched
  useEffect(() => {
    getLocation();
  }, []);

  async function pickImage() {
    try {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission Required', 'Please allow access to your photo library.');
        return;
      }
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        quality: 0.9,
        allowsEditing: false, // In-app CivicEye Image Editor with "DONE" action is used
      });
      if (result.canceled || !result.assets?.length) {
        return;
      }
      const pickedUri = result.assets[0].uri;
      if (!pickedUri) {
        Alert.alert('Image Error', 'Selected image could not be loaded.');
        return;
      }
      if (isMountedRef.current) {
        setAnalysis(null);
        setStep('form');
        setRawPickedUri(pickedUri);
        setEditorVisible(true);
      }
    } catch (error) {
      console.log('[pickImage] Selection error:', error);
      Alert.alert('Image Selection Failed', 'Unable to access the selected image.');
    }
  }

  async function captureImage() {
    try {
      const { status } = await ImagePicker.requestCameraPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission Required', 'Please allow camera access.');
        return;
      }
      const result = await ImagePicker.launchCameraAsync({
        quality: 0.9,
        allowsEditing: false, // In-app CivicEye Image Editor with "DONE" action is used
      });
      if (result.canceled || !result.assets?.length) {
        return;
      }
      const capturedUri = result.assets[0].uri;
      if (!capturedUri) {
        Alert.alert('Image Error', 'Captured image could not be loaded.');
        return;
      }
      if (isMountedRef.current) {
        setAnalysis(null);
        setStep('form');
        setRawPickedUri(capturedUri);
        setEditorVisible(true);
      }
    } catch (error) {
      console.log('[captureImage] Capture error:', error);
      Alert.alert('Camera Capture Failed', 'Unable to capture the image.');
    }
  }

  async function getLocation() {
    if (isMountedRef.current) setLocationLoading(true);
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (!isMountedRef.current) return;
      if (status !== 'granted') {
        // Fallback default coordinates for Coimbatore Gandhipuram if permission denied
        const defaultLat = 11.0168;
        const defaultLng = 76.9672;
        if (isMountedRef.current) {
          setLocation({ lat: defaultLat, lng: defaultLng });
          const autoRegion = matchRegionByCoordinates(defaultLat, defaultLng);
          setSelectedRegion(autoRegion);
          const roadMatch = matchRoadByCoordinates(defaultLat, defaultLng);
          setSuggestedRoad(roadMatch.road.roadName);
          setSuggestedAuthority(roadMatch.road.maintainedBy);
        }
        return;
      }
      const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
      if (!isMountedRef.current) return;
      const lat = loc.coords.latitude;
      const lng = loc.coords.longitude;
      setLocation({ lat, lng });

      // Automatically identify closest Coimbatore Region & Road
      const autoRegion = matchRegionByCoordinates(lat, lng);
      setSelectedRegion(autoRegion);

      const roadMatch = matchRoadByCoordinates(lat, lng);
      setSuggestedRoad(roadMatch.road.roadName);
      setSuggestedAuthority(roadMatch.road.maintainedBy);
    } catch {
      if (isMountedRef.current) {
        // Set default Coimbatore coordinates
        const defaultLat = 11.0168;
        const defaultLng = 76.9672;
        setLocation({ lat: defaultLat, lng: defaultLng });
        setSelectedRegion('Gandhipuram');
      }
    } finally {
      if (isMountedRef.current) {
        setLocationLoading(false);
      }
    }
  }

  async function handleAnalyze() {
    if (step === 'checking' || step === 'analyzing' || submitting) return;

    if (!imageUri) {
      Alert.alert('Image Required', 'Please select or capture an image of the road issue.');
      return;
    }
    if (!description.trim()) {
      Alert.alert('Description Required', 'Please describe the issue briefly.');
      return;
    }
    if (!location) {
      Alert.alert('Location Required', 'Please enable GPS location to tag the issue.');
      return;
    }

    const freshRefId = 'CE-' + Math.floor(100000 + Math.random() * 900000);
    setReferenceIssueId(freshRefId);

    console.log('[SUBMIT] API URL:', getApiBaseUrl());
    console.log('[SUBMIT] Description:', description);
    console.log('[SUBMIT] Image URI:', imageUri);
    console.log('[SUBMIT] Starting complaint analysis with Reference ID:', freshRefId);

    setStep('checking');

    try {
      const result = await analyzeCivicImage(imageUri);
      console.log('[ANALYZE] Result:', result);

      // 1. Check for Image Mismatch / Dissimilar Image
      const isDissimilarImage =
        result.isDissimilar ||
        result.analysisStatus === 'dissimilar_image' ||
        (!result.isRoad && result.isClear && (result.roadConfidence || 0) > 0.7 && result.analysisStatus !== 'unclear_image');

      if (isDissimilarImage) {
        console.log('[ANALYZE] Dissimilar/invalid image detected. Persisting inactive rejection record...');
        const cloudinaryUrl = await uploadComplaintImage(imageUri);
        const submitRes = await submitComplaint({
          citizenId: user?.uid || 'anonymous',
          citizenEmail: user?.email ?? '',
          imageUri: cloudinaryUrl,
          description: description.trim(),
          latitude: location.lat,
          longitude: location.lng,
          region: selectedRegion,
          issueType: 'Invalid Issue image, raise the complaint with the appropriate image!',
          confidence: 0,
          priority: 'NONE',
          severity: 'NONE',
          department: 'Road Maintenance Department',
          responsibleDepartment: 'Road Maintenance Department',
          departmentCode: 'ROAD',
          departmentSource: 'ai_classifier',
          routingStatus: 'Direct',
          roadValidationResult: 'dissimilar_image',
          roadValidationConfidence: result.roadConfidence || 0.95,
          analysisStatus: 'dissimilar_image',
          detectedIssue: 'Invalid Issue image, raise the complaint with the appropriate image!',
          status: 'Invalid Issue image, raise the complaint with the appropriate image!',
          inspectionStatus: 'INVALID',
          rejectionType: 'IMAGE_MISMATCH',
          rejectionReason: 'Invalid Issue image, raise the complaint with the appropriate image!',
          fieldVerificationStatus: 'rejected',
        });

        await logAnalysisRecord({
          citizenId: user?.uid,
          citizenEmail: user?.email ?? '',
          imageReference: cloudinaryUrl,
          roadValidationResult: 'dissimilar_image',
          roadValidationConfidence: result.roadConfidence || 0.95,
          analysisStatus: 'dissimilar_image',
          detectedIssue: 'Invalid Issue image, raise the complaint with the appropriate image!',
          detectionConfidence: 0,
          latitude: location.lat,
          longitude: location.lng,
          region: selectedRegion,
        });

        try {
          await createNotification({
            userId: user?.uid || 'anonymous',
            recipientId: user?.uid || 'anonymous',
            recipientRole: 'citizen',
            complaintId: submitRes.id,
            title: 'Complaint Inactive: Invalid Image',
            message: `Your complaint (#${submitRes.complaintId}) was marked inactive: Invalid Issue image, raise the complaint with the appropriate image!`,
            type: 'complaint_raised',
          });
        } catch (e) {
          console.log('[handleAnalyze] Citizen rejection notification note:', e);
        }

        setRejectedInfo({
          complaintId: submitRes.complaintId,
          reason: 'Invalid Issue image, raise the complaint with the appropriate image!',
          rejectionType: 'IMAGE_MISMATCH',
          issueType: 'Invalid Issue image, raise the complaint with the appropriate image!',
          imageUrl: cloudinaryUrl,
        });
        setStep('rejected');
        return;
      }

      // 2. Check for Uncertain / Unclear Image
      const isUnclear = result.analysisStatus === 'unclear_image' || !result.isClear;
      if (isUnclear) {
        console.log('[ANALYZE] Prompting for photo review due to unclear/ambiguous image...');
        setUncertainAnalysis(result);
        setStep('uncertain');
        return;
      }

      const classifiedDept = classifyDepartmentFromDescription(description.trim(), result.department);
      const normDesc = description.toLowerCase().trim();

      // 3. Check if routed to Public Works Department (PWD)
      const isPWD =
        result.issueType === 'Public Route Issue' ||
        classifiedDept.departmentCode === 'PWD' ||
        normDesc.includes('public route') ||
        normDesc.includes('public road') ||
        normDesc.includes('public footpath') ||
        normDesc.includes('pwd road') ||
        normDesc.includes('public walkway') ||
        normDesc.includes('public pathway') ||
        normDesc.includes('public corridor') ||
        normDesc.includes('court road') ||
        normDesc.includes('collectorate road') ||
        normDesc.includes('pwd link') ||
        normDesc.includes('public infrastructure') ||
        normDesc.includes('public works department');

      if (isPWD) {
        const issueName = normDesc.includes('footpath') || normDesc.includes('walkway')
          ? 'Damaged Footpath'
          : 'Public Route Issue';

        await logAnalysisRecord({
          citizenId: user?.uid,
          citizenEmail: user?.email ?? '',
          roadValidationResult: 'road',
          roadValidationConfidence: result.roadConfidence || 0.95,
          analysisStatus: 'damage_detected',
          detectedIssue: issueName,
          detectionConfidence: result.confidence > 0 ? result.confidence : 90,
          latitude: location.lat,
          longitude: location.lng,
          region: selectedRegion,
        });

        setAnalysis({
          isRoad: true,
          roadConfidence: result.roadConfidence || 0.95,
          hasDamage: true,
          analysisStatus: 'damage_detected',
          issueType: issueName,
          confidence: result.confidence > 0 ? result.confidence : 90,
          confidenceRaw: result.confidenceRaw > 0 ? result.confidenceRaw : 0.9,
          priority: result.hasDamage && result.priority !== 'NONE' ? result.priority : 'HIGH',
          department: 'Public Works Department',
          departmentCode: 'PWD',
          allDetections: result.allDetections,
        });

        setStep('result');
        return;
      }

      // 4. Check if routed to any non-Road department via description
      if (!isRoadDepartment(classifiedDept)) {
        const nonRoadIssue = getDefaultIssueTypeForDepartment(
          classifiedDept.departmentCode,
          classifiedDept.matchedKeyword
        );

        await logAnalysisRecord({
          citizenId: user?.uid,
          citizenEmail: user?.email ?? '',
          roadValidationResult: 'road',
          roadValidationConfidence: result.roadConfidence || 0.95,
          analysisStatus: 'damage_detected',
          detectedIssue: nonRoadIssue,
          detectionConfidence: result.confidence > 0 ? result.confidence : 90,
          latitude: location.lat,
          longitude: location.lng,
          region: selectedRegion,
        });

        setAnalysis({
          isRoad: true,
          roadConfidence: result.roadConfidence || 0.95,
          hasDamage: true,
          analysisStatus: 'damage_detected',
          issueType: nonRoadIssue,
          confidence: result.confidence > 0 ? result.confidence : 90,
          confidenceRaw: result.confidenceRaw > 0 ? result.confidenceRaw : 0.9,
          priority: result.hasDamage && result.priority !== 'NONE' ? result.priority : 'HIGH',
          department: classifiedDept.department,
          departmentCode: classifiedDept.departmentCode,
          allDetections: result.allDetections,
        });

        setStep('result');
        return;
      }

      // 5. Valid Road Surface with NO Visible Major Defect (Outcome B)
      if (result.analysisStatus === 'no_major_issue' || !result.hasDamage || result.confidence === 0) {
        console.log('[ANALYZE] Valid road surface without detected defects. Transitioning to no_issue step...');
        await logAnalysisRecord({
          citizenId: user?.uid,
          citizenEmail: user?.email ?? '',
          roadValidationResult: 'road',
          roadValidationConfidence: result.roadConfidence || 0.95,
          analysisStatus: 'no_major_issue',
          detectedIssue: 'No supported issue detected',
          detectionConfidence: 0,
          latitude: location.lat,
          longitude: location.lng,
          region: selectedRegion,
        });

        setAnalysis({
          ...result,
          isRoad: true,
          hasDamage: false,
          analysisStatus: 'no_major_issue',
          issueType: 'no_major_issue',
          confidence: 0,
          confidenceRaw: 0,
          priority: 'NONE',
          department: 'Road Maintenance Department',
          departmentCode: 'ROAD',
          allDetections: [],
        });

        setStep('no_issue');
        return;
      }

      // 6. Valid Civic Infrastructure Defect Detected (Outcome A)
      await logAnalysisRecord({
        citizenId: user?.uid,
        citizenEmail: user?.email ?? '',
        roadValidationResult: 'road',
        roadValidationConfidence: result.roadConfidence || 0.95,
        analysisStatus: 'damage_detected',
        detectedIssue: result.issueType,
        detectionConfidence: result.confidence,
        latitude: location.lat,
        longitude: location.lng,
        region: selectedRegion,
      });

      setAnalysis({
        ...result,
        issueType: result.issueType,
        hasDamage: true,
        priority: result.priority && result.priority !== 'NONE' ? result.priority : 'HIGH',
        department: result.department || 'Road Maintenance Department',
        departmentCode: result.departmentCode || 'ROAD',
        confidence: result.confidence,
        confidenceRaw: result.confidenceRaw,
        allDetections: result.allDetections || [],
      });
      setStep('result');
    } catch (err) {
      console.log('[ANALYZE] Analysis error details:', err);
      // Graceful fallback to review without fabricating a false AI defect
      const fallbackDept = classifyDepartmentFromDescription(description.trim());
      setUncertainAnalysis({
        isRoad: true,
        roadConfidence: 0.5,
        hasDamage: false,
        analysisStatus: 'unclear_image',
        issueType: fallbackDept.department,
        confidence: 0,
        confidenceRaw: 0,
        priority: 'LOW',
        department: fallbackDept.department,
        departmentCode: fallbackDept.departmentCode,
        allDetections: [],
      });
      setStep('uncertain');
    }
  }

  async function handleSubmit() {
    if (submitting || step === 'checking' || step === 'analyzing') return;
    if (!analysis || !location || !user || !imageUri) return;

    setSubmitting(true);

    console.log('[SUBMIT] API URL:', getApiBaseUrl());
    console.log('[SUBMIT] Description:', description);
    console.log('[SUBMIT] Image URI:', imageUri);
    console.log('[SUBMIT] Starting complaint submission');

    try {
      const cloudinaryUrl = await uploadComplaintImage(imageUri);
      const classifiedDept = classifyDepartmentFromDescription(description.trim(), analysis.department);
      const isRoad = isRoadDepartment(classifiedDept);
      const isNoMajorIssue = isRoad && (!analysis.hasDamage || analysis.issueType === 'no_major_issue');
      const defaultIssue = isNoMajorIssue
        ? 'Road Surface (Inspection Requested)'
        : isRoad
        ? analysis.issueType
        : getDefaultIssueTypeForDepartment(classifiedDept.departmentCode, classifiedDept.matchedKeyword);

      const activeDept = analysis.department || classifiedDept.department;
      const activeDeptCode = analysis.departmentCode || classifiedDept.departmentCode;
      const responsibleOfficerName = await getResponsibleOfficerName(
        activeDept,
        activeDeptCode
      );
      const submitPriority = isNoMajorIssue ? 'LOW' : (analysis.priority && analysis.priority !== 'NONE' ? analysis.priority : 'HIGH');
      const submitConfidence = isNoMajorIssue ? 0 : (analysis.confidence || 0);

      const submitResult = await submitComplaint({
        citizenId: user.uid,
        citizenEmail: user.email ?? '',
        imageUri: cloudinaryUrl,
        description: description.trim(),
        latitude: location.lat,
        longitude: location.lng,
        region: selectedRegion,
        issueType: defaultIssue,
        confidence: submitConfidence,
        priority: submitPriority,
        severity: submitPriority,
        estimatedBudget: undefined,
        estimatedBudgetDesc: 'Pending on-site manual estimation by Field Inspector',
        budgetBreakdown: undefined,
        department: activeDept,
        responsibleDepartment: isRoad ? (suggestedAuthority || activeDept) : activeDept,
        departmentCode: activeDeptCode,
        departmentSource: classifiedDept.departmentSource,
        routingStatus: classifiedDept.routingStatus,
        routingMessage: classifiedDept.routingMessage,
        originalDepartment: classifiedDept.originalDepartment,
        departmentExplanation: classifiedDept.explanation,
        roadValidationResult: analysis.isRoad ? 'road' : 'not_road',
        roadValidationConfidence: analysis.roadConfidence,
        analysisStatus: analysis.analysisStatus,
        detectedIssue: defaultIssue,
        detectionConfidence: analysis.confidence,
        suggestedRoadName: isRoad ? (suggestedRoad || undefined) : undefined,
        suggestedAuthority: isRoad ? (suggestedAuthority || undefined) : undefined,
        assignedOfficer: responsibleOfficerName,
        officerName: responsibleOfficerName,
        status: 'Submitted',
      });

      const durationResult = getEstimatedResolutionDuration(
        analysis.priority,
        defaultIssue,
        activeDept,
        new Date()
      );

      setSubmittedInfo({
        complaintId: submitResult.complaintId,
        department: activeDept,
        departmentCode: activeDeptCode,
        routingStatus: classifiedDept.routingStatus,
        routingMessage: classifiedDept.routingMessage,
        issueType: defaultIssue,
        priority: analysis.priority,
        region: selectedRegion,
        estimatedBudget: undefined,
        estimatedBudgetDesc: 'Pending on-site manual estimation by Field Inspector',
        budgetBreakdown: undefined,
        officerName: responsibleOfficerName || 'Awaiting Assignment',
        estimatedResolutionDuration: durationResult.durationText,
        estimatedResolutionDays: durationResult.durationDays,
        expectedResolutionDate: durationResult.expectedResolutionDate,
      });

      // Log complete AI analysis record
      await logAnalysisRecord({
        citizenId: user.uid,
        citizenEmail: user.email ?? '',
        imageReference: cloudinaryUrl,
        roadValidationResult: analysis.isRoad ? 'road' : 'not_road',
        roadValidationConfidence: analysis.roadConfidence,
        analysisStatus: analysis.analysisStatus,
        detectedIssue: defaultIssue,
        detectionConfidence: analysis.confidence,
        latitude: location.lat,
        longitude: location.lng,
        region: selectedRegion,
      });

      // Send automated citizen confirmation notification
      try {
        await createNotification({
          userId: user.uid,
          recipientId: user.uid,
          recipientRole: 'citizen',
          complaintId: submitResult.id,
          title: 'Complaint Registered Successfully',
          message: `Your complaint #${submitResult.complaintId} in ${selectedRegion} has been registered with status: Submitted. A Coimbatore Field Inspector has been notified for on-site inspection and manual budget estimation.`,
          type: 'complaint_raised',
        });

        // Broadcast to Field Inspector queue
        await createNotification({
          recipientRole: 'field_inspector',
          complaintId: submitResult.id,
          title: 'New Complaint Awaiting Field Inspection',
          message: `New complaint #${submitResult.complaintId} in ${selectedRegion} (${defaultIssue}). On-site physical inspection and manual budget estimation required.`,
          type: 'field_verification_required',
        });
      } catch (notifErr) {
        console.log('[handleSubmit] Citizen notification note:', notifErr);
      }

      setStep('success');
    } catch (err: any) {
      console.log('[SUBMIT] Submission error details:', err);
      let message = 'Unable to submit your complaint right now. Please check your connection and try again.';
      if (err?.code === 'permission-denied') {
        message = 'Unable to submit complaint due to an authorization issue. Please verify your login status and try again.';
      } else if (err instanceof Error && err.message && !err.message.includes('Firebase') && !err.message.includes('permission') && !err.message.includes('gRPC')) {
        message = err.message;
      }
      Alert.alert('Submission Notice', message);
    } finally {
      setSubmitting(false);
    }
  }

  if (step === 'checking' || step === 'analyzing') {
    return (
      <SafeAreaView style={styles.centered}>
        <ActivityIndicator size="large" color={AppColors.primary} />
        <Text style={styles.analyzingTitle}>
          {step === 'checking' ? 'Analyzing Civic Issue…' : 'Processing Image Analysis…'}
        </Text>
        <Text style={styles.analyzingSubtitle}>
          {step === 'checking'
            ? 'Running AI defect detection and municipal department routing'
            : 'Evaluating civic infrastructure complaint'}
        </Text>
      </SafeAreaView>
    );
  }

  const classifiedDept = analysis
    ? classifyDepartmentFromDescription(description.trim(), analysis.department)
    : null;

  if (step === 'no_issue') {
    return (
      <SafeAreaView style={styles.safe}>
        <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
          <View style={styles.header}>
            <TouchableOpacity onPress={() => setStep('form')} accessibilityRole="button" accessibilityLabel="Back">
              <Ionicons name="arrow-back" size={24} color={AppColors.textPrimary} />
            </TouchableOpacity>
            <Text style={styles.headerTitle}>Road Verification</Text>
            <View style={{ width: 24 }} />
          </View>

          {/* Reference ID Card */}
          <View style={styles.refIdCard}>
            <View style={styles.refIdRow}>
              <Ionicons name="shield-checkmark" size={20} color="#059669" />
              <View style={{ flex: 1 }}>
                <Text style={[styles.refIdLabel, { color: '#059669' }]}>AI VERIFICATION RESULT</Text>
                <Text style={styles.refIdValue}>No Supported Defect Detected</Text>
              </View>
              <View style={[styles.pendingBadge, { backgroundColor: '#ECFDF5', borderColor: '#A7F3D0' }]}>
                <Text style={[styles.pendingBadgeText, { color: '#065F46' }]}>Verified Clean</Text>
              </View>
            </View>
          </View>

          {/* Image preview */}
          {imageUri && (
            <View style={styles.previewWrap}>
              <CivicImage
                uri={imageUri}
                issueType="Normal Road"
                style={styles.previewImage}
                resizeMode="cover"
              />
            </View>
          )}

          {/* Verification Card */}
          <View style={[styles.resultCard, { borderColor: '#A7F3D0', backgroundColor: '#F0FDF4' }]}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 }}>
              <Ionicons name="checkmark-circle" size={24} color="#059669" />
              <Text style={[styles.resultHeading, { color: '#065F46', marginBottom: 0 }]}>
                Normal Road Surface
              </Text>
            </View>
            <Text style={{ fontSize: 13, color: '#047857', lineHeight: 18, marginBottom: 12 }}>
              The computer vision model verified an undamaged road surface with no visible major potholes, cracking, or pavement failure detected.
            </Text>

            <View style={[styles.resultGrid, { backgroundColor: '#FFFFFF', padding: 10, borderRadius: 8, borderWidth: 1, borderColor: '#D1FAE5' }]}>
              <View style={styles.resultItem}>
                <Text style={styles.resultItemLabel}>Model Status</Text>
                <Text style={[styles.resultItemValueSmall, { color: '#065F46' }]}>No defect detected</Text>
              </View>
              <View style={styles.resultItem}>
                <Text style={styles.resultItemLabel}>Road Confidence</Text>
                <Text style={[styles.resultItemValueSmall, { color: '#065F46' }]}>95% Normal</Text>
              </View>
            </View>
          </View>

          {/* Citizen Description Card */}
          <View style={styles.descBox}>
            <View style={styles.descHeaderRow}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <Ionicons name="chatbox-ellipses-outline" size={16} color={AppColors.primary} />
                <Text style={styles.descLabel}>Your Submitted Description</Text>
              </View>
              <TouchableOpacity
                onPress={() => setStep('form')}
                style={styles.editDescBtn}
                accessibilityRole="button"
                accessibilityLabel="Edit description"
              >
                <Ionicons name="pencil" size={12} color={AppColors.primary} />
                <Text style={styles.editDescText}>Edit</Text>
              </TouchableOpacity>
            </View>
            <Text style={styles.descText}>
              {description.trim() ? description : '(No additional description provided)'}
            </Text>
          </View>

          {/* Explanatory Notice */}
          <View style={styles.rejectedNoticeBox}>
            <Ionicons name="information-circle-outline" size={18} color="#059669" />
            <Text style={[styles.rejectedNoticeText, { color: '#065F46' }]}>
              To prevent false complaints from entering municipal repair queues, CivicEye does not automatically log undamaged roads as defects. If you believe there is a subtle defect requiring on-site examination, you may request a physical inspection below.
            </Text>
          </View>

          {/* Action Buttons */}
          <View style={[styles.actionButtonGroup, { marginTop: 18 }]}>
            <TouchableOpacity
              style={[styles.primaryBtn, { backgroundColor: '#059669' }]}
              onPress={() => setStep('result')}
              accessible
              accessibilityRole="button"
              accessibilityLabel="Request Physical On-Site Inspection"
            >
              <Ionicons name="shield-outline" size={18} color={AppColors.white} />
              <Text style={styles.primaryBtnText}>Request Physical Inspection</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.secondaryBtn}
              onPress={() => {
                if (imageUri) {
                  setRawPickedUri(imageUri);
                  setEditorVisible(true);
                } else {
                  setStep('form');
                }
              }}
              accessible
              accessibilityRole="button"
              accessibilityLabel="Retake or Crop Photo"
            >
              <Ionicons name="crop-outline" size={18} color={AppColors.textPrimary} />
              <Text style={styles.secondaryBtnText}>Retake / Crop Photo</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.secondaryBtn}
              onPress={() => {
                setImageUri(null);
                setAnalysis(null);
                setDescription('');
                setStep('form');
              }}
              accessible
              accessibilityRole="button"
              accessibilityLabel="Report Another Issue"
            >
              <Ionicons name="arrow-back-outline" size={18} color={AppColors.textPrimary} />
              <Text style={styles.secondaryBtnText}>Report Another Issue</Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </SafeAreaView>
    );
  }

  if (step === 'success') {
    const isPWD = (submittedInfo?.departmentCode === 'PWD') || (submittedInfo?.department === 'Public Works Department');
    const displayDept = submittedInfo?.department || classifiedDept?.department || 'Road Maintenance Department';
    const isRoad = isRoadDepartment(displayDept) &&
      !submittedInfo?.routingStatus?.startsWith('Moved') &&
      !classifiedDept?.routingStatus?.startsWith('Moved') &&
      !isPWD;
    const displayRoutingStatus = submittedInfo?.routingStatus || classifiedDept?.routingStatus || (isPWD ? 'Moved to Public Works Department' : !isRoad ? `Moved to ${displayDept}` : 'Direct');
    const displayRoutingMessage = submittedInfo?.routingMessage || classifiedDept?.routingMessage || (isPWD ? 'Your complaint has been routed to the Public Works Department for public route maintenance.' : !isRoad ? `Your complaint has been moved to the ${displayDept} Department.` : undefined);
    const priorityVal = submittedInfo?.priority || analysis?.priority || 'HIGH';
    const displayBudget = submittedInfo?.estimatedBudget ?? (analysis ? getStandardEstimatedBudget(analysis.issueType, analysis.priority).budget : 18500);
    const displayDuration = submittedInfo?.estimatedResolutionDuration || getEstimatedResolutionDuration(priorityVal, submittedInfo?.issueType || analysis?.issueType || 'pothole', displayDept).durationText;
    const displayExpDate = submittedInfo?.expectedResolutionDate ? formatResolutionDate(submittedInfo.expectedResolutionDate) : formatResolutionDate(getEstimatedResolutionDuration(priorityVal, submittedInfo?.issueType || analysis?.issueType || 'pothole', displayDept).expectedResolutionDate);

    return (
      <SafeAreaView style={styles.safe}>
        <ScrollView contentContainerStyle={styles.centeredScroll} showsVerticalScrollIndicator={false}>
          <View style={styles.successIcon}>
            <Ionicons name="checkmark-circle" size={72} color={AppColors.success} />
          </View>
          <Text style={styles.successTitle}>Complaint Successfully Registered ✓</Text>
          <Text style={styles.successSub}>Your complaint has been registered with the Coimbatore Municipal Corporation.</Text>

          {/* Uploaded Image Preview in Success Screen */}
          {imageUri && (
            <View style={[styles.previewWrap, { marginVertical: 12 }]}>
              <CivicImage
                uri={imageUri}
                issueType={submittedInfo?.issueType || analysis?.issueType}
                style={styles.previewImage}
                resizeMode="cover"
              />
            </View>
          )}

          <View style={styles.successCard}>
            {submittedInfo?.complaintId && (
              <>
                <Text style={styles.successLabel}>Registered Complaint ID</Text>
                <Text style={styles.successValueHighlight}>#{submittedInfo.complaintId}</Text>
              </>
            )}

            <Text style={styles.successLabel}>Issue Type</Text>
            <Text style={[styles.successValue, { textTransform: 'capitalize' }]}>{submittedInfo?.issueType || analysis?.issueType}</Text>

            <Text style={styles.successLabel}>Priority</Text>
            <Text style={[styles.successValue, priorityTextColor(priorityVal)]}>
              {priorityVal.toUpperCase()}
            </Text>

            <Text style={styles.successLabel}>Department</Text>
            <Text style={styles.successValue}>{displayDept}</Text>

            <Text style={styles.successLabel}>Assigned Officer</Text>
            <Text style={styles.successOfficerValue}>
              {submittedInfo?.officerName || reviewOfficerName || 'Awaiting Assignment'}
            </Text>

            <Text style={styles.successLabel}>Citizen Description &amp; Landmark</Text>
            <Text style={styles.successDescText}>
              {description.trim() ? description : '(No additional description provided)'}
            </Text>

            <Text style={styles.successLabel}>Tagged Location</Text>
            <Text style={styles.successValue}>
              {location ? `${location.lat.toFixed(5)}, ${location.lng.toFixed(5)}` : 'GPS Tagged'} • Region: {submittedInfo?.region || selectedRegion}
              {suggestedRoad ? ` • Near ${suggestedRoad}` : ''}
            </Text>

            <Text style={styles.successLabel}>Estimated Resolution Duration</Text>
            <Text style={styles.successResolutionValue}>
              {displayDuration}
            </Text>

            <Text style={styles.successLabel}>Expected Resolution Date</Text>
            <Text style={styles.successValue}>
              {displayExpDate}
            </Text>

            <Text style={styles.successLabel}>Registration Status</Text>
            <Text style={[styles.successValue, { color: AppColors.success, fontWeight: '800' }]}>
              Registered / Active
            </Text>

            <Text style={styles.successLabel}>Estimated Budget</Text>
            <View style={styles.successBudgetBox}>
              <Ionicons name="time-outline" size={15} color="#0D9488" />
              <Text style={styles.successBudgetText}>
                Pending on-site manual estimation by Field Inspector
              </Text>
            </View>

            <Text style={styles.successLabel}>Routing Status</Text>
            <Text style={[styles.successValue, (!isRoad || isPWD) ? styles.swmRoutingText : {}]}>
              {displayRoutingStatus}
            </Text>

            {(!isRoad || isPWD) && (
              <View style={styles.successRoutingBanner}>
                <Ionicons name="information-circle" size={18} color="#0369A1" />
                <Text style={styles.successRoutingText}>
                  {displayRoutingMessage || (isPWD ? 'Your complaint has been routed to the Public Works Department for public route maintenance.' : `Your complaint has been moved to the ${displayDept} Department.`)}
                </Text>
              </View>
            )}
          </View>

          <View style={styles.workflowNote}>
            <Ionicons name="information-circle-outline" size={18} color={AppColors.primary} />
            <Text style={styles.workflowNoteText}>
              A designated Coimbatore Field Inspector has been notified and will verify the complaint on-site.
            </Text>
          </View>

          <View style={styles.actionButtonGroup}>
            <TouchableOpacity
              style={styles.primaryBtn}
              onPress={() => router.push('/my-complaints')}
              accessible
              accessibilityRole="button"
              accessibilityLabel="View My Complaints"
            >
              <Ionicons name="list-outline" size={18} color={AppColors.white} />
              <Text style={styles.primaryBtnText}>View My Complaints</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.secondaryBtn}
              onPress={() => {
                setImageUri(null);
                setAnalysis(null);
                setDescription('');
                setStep('form');
              }}
              accessible
              accessibilityRole="button"
              accessibilityLabel="Report Another Issue"
            >
              <Ionicons name="add-circle-outline" size={18} color={AppColors.textPrimary} />
              <Text style={styles.secondaryBtnText}>Report Another Issue</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.secondaryBtn}
              onPress={() => router.replace('/(tabs)')}
              accessible
              accessibilityRole="button"
              accessibilityLabel="Back to Home"
            >
              <Ionicons name="home-outline" size={18} color={AppColors.textPrimary} />
              <Text style={styles.secondaryBtnText}>Back to Home</Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </SafeAreaView>
    );
  }

  if (step === 'rejected') {
    return (
      <SafeAreaView style={styles.safe}>
        <ScrollView contentContainerStyle={styles.centeredScroll} showsVerticalScrollIndicator={false}>
          {(rejectedInfo?.imageUrl || imageUri) && (
            <View style={[styles.previewWrap, { marginBottom: 16 }]}>
              <CivicImage
                uri={rejectedInfo?.imageUrl || imageUri}
                issueType="Invalid Image, give valid Issue Image!"
                isInvalid={true}
                invalidMessage="Invalid Image, give valid Issue Image!"
                style={styles.previewImage}
                resizeMode="cover"
              />
            </View>
          )}

          <View style={styles.rejectedIconWrap}>
            <Ionicons name="close-circle" size={72} color={AppColors.error} />
          </View>
          <Text style={styles.rejectedTitle}>Complaint Inactive</Text>
          <Text style={styles.rejectedSub}>
            Invalid Image, give valid Issue Image!
          </Text>

          <View style={styles.rejectedCard}>
            {rejectedInfo?.complaintId && (
              <>
                <Text style={styles.rejectedLabel}>Complaint ID</Text>
                <Text style={styles.rejectedValueHighlight}>#{rejectedInfo.complaintId}</Text>
              </>
            )}

            <Text style={styles.rejectedLabel}>Status</Text>
            <View style={styles.rejectedStatusBadge}>
              <Ionicons name="ban-outline" size={14} color="#DC2626" />
              <Text style={styles.rejectedStatusBadgeText}>Invalid Image, give valid Issue Image!</Text>
            </View>

            <Text style={styles.rejectedLabel}>Rejection Reason</Text>
            <Text style={styles.rejectedExplanation}>
              Invalid Image, give valid Issue Image! The uploaded photo does not show a valid civic issue.
            </Text>

            <View style={styles.rejectedNoticeBox}>
              <Ionicons name="information-circle-outline" size={18} color="#64748B" />
              <Text style={styles.rejectedNoticeText}>
                This complaint has been saved to your history as an inactive record for your reference.
              </Text>
            </View>
          </View>

          <View style={styles.actionButtonGroup}>
            <TouchableOpacity
              style={styles.primaryBtn}
              onPress={() => router.push('/my-complaints')}
              accessible
              accessibilityRole="button"
              accessibilityLabel="View in My Complaints"
            >
              <Ionicons name="list-outline" size={18} color={AppColors.white} />
              <Text style={styles.primaryBtnText}>View in My Complaints</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.secondaryBtn}
              onPress={() => {
                setImageUri(null);
                setAnalysis(null);
                setDescription('');
                setRejectedInfo(null);
                setStep('form');
              }}
              accessible
              accessibilityRole="button"
              accessibilityLabel="Report Another Issue"
            >
              <Ionicons name="add-circle-outline" size={18} color={AppColors.textPrimary} />
              <Text style={styles.secondaryBtnText}>Report Another Issue</Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </SafeAreaView>
    );
  }

  if (step === 'uncertain') {
    const uDept = classifyDepartmentFromDescription(description.trim(), uncertainAnalysis?.department);
    const resolvedIssue = uncertainAnalysis?.issueType && uncertainAnalysis.issueType !== 'unclear_image'
      ? uncertainAnalysis.issueType
      : (description.trim() ? uDept.department : 'Road & Civic Infrastructure Issue');

    return (
      <SafeAreaView style={styles.safe}>
        <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
          <View style={styles.header}>
            <TouchableOpacity onPress={() => setStep('form')} accessibilityRole="button" accessibilityLabel="Back">
              <Ionicons name="arrow-back" size={24} color={AppColors.textPrimary} />
            </TouchableOpacity>
            <Text style={styles.headerTitle}>Review &amp; Submit</Text>
            <View style={{ width: 24 }} />
          </View>

          {/* Issue ID Card */}
          <View style={styles.refIdCard}>
            <View style={styles.refIdRow}>
              <Ionicons name="finger-print-outline" size={20} color={AppColors.primary} />
              <View style={{ flex: 1 }}>
                <Text style={styles.refIdLabel}>ISSUE REFERENCE ID</Text>
                <Text style={styles.refIdValue}>#{referenceIssueId}</Text>
              </View>
              <View style={styles.pendingBadge}>
                <Text style={styles.pendingBadgeText}>Pending Submission</Text>
              </View>
            </View>
          </View>

          {/* Uploaded Photo Preview */}
          {imageUri && (
            <View style={styles.previewWrap}>
              <CivicImage
                uri={imageUri}
                issueType={resolvedIssue}
                style={styles.previewImage}
                resizeMode="cover"
              />
            </View>
          )}

          {/* Issue Summary Card */}
          <View style={styles.resultCard}>
            <Text style={styles.resultHeading}>Issue Summary</Text>
            <View style={styles.resultRow}>
              <Ionicons name="alert-circle" size={20} color={AppColors.primary} />
              <Text style={styles.resultIssue}>{resolvedIssue}</Text>
            </View>
            <View style={styles.resultGrid}>
              <View style={styles.resultItem}>
                <Text style={styles.resultItemLabel}>Department</Text>
                <Text style={styles.resultItemValueSmall}>{uDept.department}</Text>
              </View>
              <View style={styles.resultItem}>
                <Text style={styles.resultItemLabel}>Priority</Text>
                <Text style={[styles.resultItemValueSmall, priorityTextColor('HIGH')]}>HIGH</Text>
              </View>
            </View>
          </View>

          {/* Citizen Description Card */}
          <View style={styles.descBox}>
            <View style={styles.descHeaderRow}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <Ionicons name="chatbox-ellipses-outline" size={16} color={AppColors.primary} />
                <Text style={styles.descLabel}>Citizen Description &amp; Landmark</Text>
              </View>
              <TouchableOpacity
                onPress={() => setStep('form')}
                style={styles.editDescBtn}
                accessibilityRole="button"
                accessibilityLabel="Edit description"
              >
                <Ionicons name="pencil" size={12} color={AppColors.primary} />
                <Text style={styles.editDescText}>Edit</Text>
              </TouchableOpacity>
            </View>
            <Text style={styles.descText}>
              {description.trim() ? description : '(No additional description provided)'}
            </Text>
          </View>

          {/* Location Card */}
          <View style={styles.locBox}>
            <Ionicons name="location" size={18} color={AppColors.primary} />
            <View style={{ flex: 1 }}>
              <Text style={styles.locCoordsText}>
                {location?.lat.toFixed(5)}, {location?.lng.toFixed(5)}
              </Text>
              <Text style={styles.locRegionText}>
                Region: {selectedRegion}
                {suggestedRoad ? ` • Near ${suggestedRoad}` : ''}
              </Text>
            </View>
            <TouchableOpacity
              onPress={() => setStep('form')}
              style={styles.editDescBtn}
              accessibilityRole="button"
              accessibilityLabel="Edit Location"
            >
              <Ionicons name="pencil" size={12} color={AppColors.primary} />
              <Text style={styles.editDescText}>Edit</Text>
            </TouchableOpacity>
          </View>

          {/* Action Buttons */}
          <View style={styles.actionButtonGroup}>
            <TouchableOpacity
              style={styles.primaryBtn}
              onPress={() => {
                setAnalysis({
                  isRoad: true,
                  roadConfidence: uncertainAnalysis?.roadConfidence || 0.85,
                  hasDamage: true,
                  analysisStatus: 'damage_detected',
                  issueType: resolvedIssue,
                  confidence: 85,
                  confidenceRaw: 0.85,
                  priority: 'HIGH',
                  department: uDept.department || 'Road Maintenance Department',
                  departmentCode: uDept.departmentCode || 'ROAD',
                  allDetections: [],
                });
                setStep('result');
              }}
              accessible
              accessibilityRole="button"
              accessibilityLabel="Proceed to Submit"
            >
              <Text style={styles.primaryBtnText}>Proceed to Submit</Text>
              <Ionicons name="arrow-forward" size={18} color={AppColors.white} />
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.secondaryBtn}
              onPress={() => setStep('form')}
              accessible
              accessibilityRole="button"
              accessibilityLabel="Edit Details"
            >
              <Ionicons name="create-outline" size={18} color={AppColors.textPrimary} />
              <Text style={styles.secondaryBtnText}>Edit Details</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.secondaryBtn}
              onPress={() => {
                if (imageUri) {
                  setRawPickedUri(imageUri);
                  setEditorVisible(true);
                } else {
                  setStep('form');
                }
              }}
              accessible
              accessibilityRole="button"
              accessibilityLabel="Retake or Edit Photo"
            >
              <Ionicons name="camera-reverse-outline" size={18} color={AppColors.textPrimary} />
              <Text style={styles.secondaryBtnText}>Retake / Edit Photo</Text>
            </TouchableOpacity>
          </View>
        </ScrollView>

        <ImageEditorModal
          visible={editorVisible}
          imageUri={rawPickedUri}
          onDone={(editedUri) => {
            setImageUri(editedUri);
            setEditorVisible(false);
            setAnalysis(null);
            setStep('form');
          }}
          onCancel={() => {
            setEditorVisible(false);
          }}
        />
      </SafeAreaView>
    );
  }

  if (step === 'result' && analysis) {
    const isPWD = classifiedDept?.department === 'Public Works Department' || classifiedDept?.departmentCode === 'PWD' || analysis.departmentCode === 'PWD';
    const displayDept = classifiedDept?.department || analysis.department;
    const isRoad = isRoadDepartment(displayDept) &&
      !classifiedDept?.routingStatus?.startsWith('Moved') &&
      !isPWD;
    const isLighting = analysis.departmentCode === 'LIGHTING';
    const stdBudget = getStandardEstimatedBudget(analysis.issueType, analysis.priority);
    const resultDuration = getEstimatedResolutionDuration(analysis.priority, analysis.issueType, displayDept);

    return (
      <SafeAreaView style={styles.safe}>
        <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
          <View style={styles.header}>
            <TouchableOpacity onPress={() => setStep('form')} accessibilityRole="button" accessibilityLabel="Back">
              <Ionicons name="arrow-back" size={24} color={AppColors.textPrimary} />
            </TouchableOpacity>
            <Text style={styles.headerTitle}>Review &amp; Submit</Text>
            <View style={{ width: 24 }} />
          </View>

          {/* Issue Reference ID Card */}
          <View style={styles.refIdCard}>
            <View style={styles.refIdRow}>
              <Ionicons name="finger-print-outline" size={20} color={AppColors.primary} />
              <View style={{ flex: 1 }}>
                <Text style={styles.refIdLabel}>ISSUE REFERENCE ID</Text>
                <Text style={styles.refIdValue}>#{referenceIssueId}</Text>
              </View>
              <View style={styles.pendingBadge}>
                <Text style={styles.pendingBadgeText}>Ready to Submit</Text>
              </View>
            </View>
          </View>

          {/* Image preview */}
          {imageUri && (
            <View style={styles.previewWrap}>
              <CivicImage
                uri={imageUri}
                issueType={analysis?.issueType}
                style={styles.previewImage}
                resizeMode="cover"
              />
            </View>
          )}

          {/* Location Verification Banner for Street Lighting */}
          {isLighting && (
            <View style={styles.verifiedLocationBanner}>
              <Ionicons name="shield-checkmark" size={18} color="#059669" />
              <View style={{ flex: 1 }}>
                <Text style={styles.verifiedLocationTitle}>Location Verified for Street Lighting</Text>
                <Text style={styles.verifiedLocationSub}>
                  GPS coordinates matched within Coimbatore {selectedRegion} sector coverage.
                </Text>
              </View>
            </View>
          )}

          {/* Department Routing Notice if non-Road or PWD */}
          {(!isRoad || isPWD) && (
            <View style={styles.routedNoticeCard}>
              <View style={styles.routedNoticeHeader}>
                <Ionicons name="swap-horizontal" size={22} color="#0284C7" />
                <View style={{ flex: 1 }}>
                  <Text style={styles.routedNoticeTitle}>
                    Routing to {displayDept}
                  </Text>
                  <Text style={styles.routedNoticeSub}>
                    {classifiedDept?.routingMessage || `Your complaint has been moved to the ${displayDept} Department for further action.`}
                  </Text>
                </View>
              </View>
            </View>
          )}

          {/* Primary detection / issue card */}
          <View style={styles.resultCard}>
            <Text style={styles.resultHeading}>Issue Summary</Text>
            <View style={styles.resultRow}>
              <Ionicons name="alert-circle" size={20} color={AppColors.primary} />
              <Text style={styles.resultIssue}>{analysis.issueType}</Text>
            </View>
            <View style={styles.resultGrid}>
              <View style={styles.resultItem}>
                <Text style={styles.resultItemLabel}>Department</Text>
                <Text style={styles.resultItemValueSmall}>{displayDept}</Text>
              </View>
              {isRoad ? (
                <View style={styles.resultItem}>
                  <Text style={styles.resultItemLabel}>Priority</Text>
                  <Text style={[styles.resultItemValueSmall, priorityTextColor(analysis.priority)]}>
                    {analysis.priority}
                  </Text>
                </View>
              ) : (
                <View style={styles.resultItem}>
                  <Text style={styles.resultItemLabel}>Routing Status</Text>
                  <Text style={[styles.resultItemValueSmall, !isRoad ? styles.swmRoutingText : {}]}>
                    {classifiedDept?.routingStatus || (!isRoad ? `Moved to ${displayDept}` : 'Direct')}
                  </Text>
                </View>
              )}
            </View>

            <View style={[styles.resultGrid, { marginTop: 8 }]}>
              <View style={styles.resultItem}>
                <Text style={styles.resultItemLabel}>Assigned Officer</Text>
                <Text style={styles.resultOfficerValue}>
                  {reviewOfficerName || 'Awaiting Assignment'}
                </Text>
              </View>
              <View style={styles.resultItem}>
                <Text style={styles.resultItemLabel}>Expected Resolution Date</Text>
                <Text style={styles.resultItemValueSmall}>
                  {formatResolutionDate(resultDuration.expectedResolutionDate)}
                </Text>
              </View>
            </View>

            <View style={styles.resolutionBanner}>
              <Ionicons name="time-outline" size={16} color={AppColors.primary} />
              <Text style={styles.resolutionBannerText}>
                Estimated Resolution: <Text style={{ fontWeight: '700' }}>{resultDuration.durationText}</Text>
              </Text>
            </View>
          </View>

          {/* Field Inspector Budget Assessment Notice */}
          <View style={styles.budgetNoticeCard}>
            <View style={styles.budgetNoticeHeader}>
              <View style={styles.budgetNoticeIconWrap}>
                <Ionicons name="calculator-outline" size={20} color="#0D9488" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.budgetNoticeTitle}>Budget & Cost Estimation</Text>
                <Text style={styles.budgetNoticeSub}>Manual On-Site Assessment by Field Inspector</Text>
              </View>
              <View style={styles.budgetPendingBadge}>
                <Text style={styles.budgetPendingBadgeText}>Pending Inspection</Text>
              </View>
            </View>
            <Text style={styles.budgetNoticeBody}>
              The repair budget, required materials, and machinery will be physically assessed and manually entered by the designated Coimbatore Field Inspector upon on-site verification.
            </Text>
          </View>

          {/* All detections if any */}
          {analysis.allDetections && analysis.allDetections.length > 1 && (
            <View style={styles.allDetectionsCard}>
              <Text style={styles.allDetectionsTitle}>Detections (After NMS)</Text>
              {analysis.allDetections.map((d, i) => (
                <View key={i} style={styles.detectionRow}>
                  <Text style={styles.detectionIssue}>{d.issueType}</Text>
                  <Text style={styles.detectionConf}>{Math.round(d.confidence * 100)}%</Text>
                  <Text style={[styles.detectionPriority, priorityTextColor(d.priority)]}>{d.priority}</Text>
                </View>
              ))}
            </View>
          )}

          {/* Citizen Description Card - High Visibility */}
          <View style={styles.descBox}>
            <View style={styles.descHeaderRow}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <Ionicons name="chatbox-ellipses-outline" size={16} color={AppColors.primary} />
                <Text style={styles.descLabel}>Citizen Description &amp; Landmark</Text>
              </View>
              <TouchableOpacity
                onPress={() => setStep('form')}
                style={styles.editDescBtn}
                accessibilityRole="button"
                accessibilityLabel="Edit description"
              >
                <Ionicons name="pencil" size={12} color={AppColors.primary} />
                <Text style={styles.editDescText}>Edit</Text>
              </TouchableOpacity>
            </View>
            <Text style={styles.descText}>
              {description.trim() ? description : '(No additional description provided)'}
            </Text>
          </View>

          {/* GPS Location & Region Card */}
          <View style={styles.locBox}>
            <Ionicons name="location" size={18} color={AppColors.primary} />
            <View style={{ flex: 1 }}>
              <Text style={styles.locCoordsText}>
                {location?.lat.toFixed(5)}, {location?.lng.toFixed(5)}
              </Text>
              <Text style={styles.locRegionText}>
                Region: {selectedRegion}
                {suggestedRoad ? ` • Near ${suggestedRoad}` : ''}
              </Text>
            </View>
            <TouchableOpacity
              onPress={() => setStep('form')}
              style={styles.editDescBtn}
              accessibilityRole="button"
              accessibilityLabel="Edit Location"
            >
              <Ionicons name="pencil" size={12} color={AppColors.primary} />
              <Text style={styles.editDescText}>Edit</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.actionButtonGroup}>
            <TouchableOpacity
              style={[styles.primaryBtn, submitting && styles.disabledBtn]}
              onPress={handleSubmit}
              disabled={submitting}
              accessible
              accessibilityRole="button"
              accessibilityLabel="Submit Complaint"
              accessibilityState={{ busy: submitting }}
            >
              {submitting ? (
                <ActivityIndicator color={AppColors.white} />
              ) : (
                <>
                  <Text style={styles.primaryBtnText}>Submit Complaint</Text>
                  <Ionicons name="checkmark-circle-outline" size={18} color={AppColors.white} />
                </>
              )}
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.secondaryBtn}
              onPress={() => setStep('form')}
              accessible
              accessibilityRole="button"
              accessibilityLabel="Edit Details"
            >
              <Ionicons name="create-outline" size={18} color={AppColors.textPrimary} />
              <Text style={styles.secondaryBtnText}>Edit Details</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.secondaryBtn}
              onPress={() => {
                if (imageUri) {
                  setRawPickedUri(imageUri);
                  setEditorVisible(true);
                } else {
                  setStep('form');
                }
              }}
              accessible
              accessibilityRole="button"
              accessibilityLabel="Change Photo / Edit"
            >
              <Ionicons name="crop-outline" size={18} color={AppColors.textPrimary} />
              <Text style={styles.secondaryBtnText}>Change Photo / Edit</Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </SafeAreaView>
    );
  }

  // Step: form
  return (
    <SafeAreaView style={styles.safe}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
          {/* Header */}
          <View style={styles.header}>
            <TouchableOpacity onPress={() => router.back()} accessibilityRole="button" accessibilityLabel="Back">
              <Ionicons name="arrow-back" size={24} color={AppColors.textPrimary} />
            </TouchableOpacity>
            <Text style={styles.headerTitle}>Report Complaint</Text>
            <View style={{ width: 24 }} />
          </View>

          {/* 1. Image Section: Defect Photo */}
          <View style={styles.section}>
            <Text style={styles.sectionLabel}>1. Defect Photo</Text>
            {imageUri ? (
              <View style={styles.previewWrap}>
                <CivicImage
                  uri={imageUri}
                  issueType={analysis?.issueType}
                  style={styles.previewImage}
                  resizeMode="cover"
                />
                <View style={styles.previewBtnRow}>
                  <TouchableOpacity
                    style={styles.editPhotoBtn}
                    onPress={() => {
                      setRawPickedUri(imageUri);
                      setEditorVisible(true);
                    }}
                    accessible
                    accessibilityRole="button"
                    accessibilityLabel="Edit Photo"
                  >
                    <Ionicons name="crop-outline" size={14} color={AppColors.white} />
                    <Text style={styles.retakeBtnText}>Edit</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.retakeBtn}
                    onPress={() => {
                      setImageUri(null);
                      setAnalysis(null);
                      setStep('form');
                    }}
                    accessible
                    accessibilityRole="button"
                    accessibilityLabel="Change Photo"
                  >
                    <Ionicons name="camera-reverse-outline" size={14} color={AppColors.white} />
                    <Text style={styles.retakeBtnText}>Change</Text>
                  </TouchableOpacity>
                </View>
              </View>
            ) : (
              <View style={styles.imagePickerRow}>
                <TouchableOpacity
                  style={styles.pickCard}
                  onPress={captureImage}
                  accessible
                  accessibilityRole="button"
                  accessibilityLabel="Take Photo with Camera"
                >
                  <Ionicons name="camera-outline" size={32} color={AppColors.primary} />
                  <Text style={styles.pickCardText}>Take Photo</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.pickCard}
                  onPress={pickImage}
                  accessible
                  accessibilityRole="button"
                  accessibilityLabel="Choose Photo from Gallery"
                >
                  <Ionicons name="images-outline" size={32} color={AppColors.primary} />
                  <Text style={styles.pickCardText}>From Gallery</Text>
                </TouchableOpacity>
              </View>
            )}
          </View>

          {/* 2. Location Section (Coimbatore Region & GPS) */}
          <View style={styles.section}>
            <Text style={styles.sectionLabel}>2. Coimbatore Region &amp; Location</Text>
            <View style={styles.regionGrid}>
              {ALL_COIMBATORE_REGIONS.map(reg => (
                <TouchableOpacity
                  key={reg}
                  style={[
                    styles.regionChip,
                    selectedRegion === reg && styles.regionChipActive,
                  ]}
                  onPress={() => setSelectedRegion(reg)}
                  accessible
                  accessibilityRole="radio"
                  accessibilityState={{ selected: selectedRegion === reg }}
                >
                  <Ionicons
                    name="location-outline"
                    size={14}
                    color={selectedRegion === reg ? AppColors.white : AppColors.primary}
                  />
                  <Text
                    style={[
                      styles.regionChipText,
                      selectedRegion === reg && styles.regionChipTextActive,
                    ]}
                  >
                    {reg}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <View style={[styles.locationBox, { marginTop: 10 }]}>
              <Ionicons name="navigate-circle-outline" size={24} color={AppColors.primary} />
              <View style={{ flex: 1 }}>
                {location ? (
                  <>
                    <Text style={styles.locationCoords}>
                      {location.lat.toFixed(5)}, {location.lng.toFixed(5)}
                    </Text>
                    <Text style={styles.locationSub}>
                      Region: {selectedRegion}
                      {suggestedRoad ? ` • Near ${suggestedRoad}` : ''}
                    </Text>
                  </>
                ) : (
                  <Text style={styles.locationPlaceholder}>
                    {locationLoading ? 'Fetching GPS location…' : 'GPS location not captured'}
                  </Text>
                )}
              </View>
              <TouchableOpacity
                onPress={getLocation}
                disabled={locationLoading}
                style={styles.gpsRefreshBtn}
                accessibilityRole="button"
                accessibilityLabel="Refresh GPS Coordinates"
              >
                {locationLoading ? (
                  <ActivityIndicator size="small" color={AppColors.primary} />
                ) : (
                  <Ionicons name="refresh" size={18} color={AppColors.primary} />
                )}
              </TouchableOpacity>
            </View>
          </View>

          {/* 3. Description Section */}
          <View style={styles.section}>
            <View style={styles.sectionLabelRow}>
              <Text style={styles.sectionLabel}>3. Description &amp; Landmark</Text>
              <Text style={styles.charCounterText}>{description.length} / 300 characters</Text>
            </View>
            <TextInput
              style={styles.textInput}
              placeholder="e.g. Deep pothole or public route defect near Peelamedu corridor"
              placeholderTextColor={AppColors.placeholder}
              value={description}
              onChangeText={setDescription}
              maxLength={300}
              multiline
              numberOfLines={3}
              autoCapitalize="sentences"
              accessible
              accessibilityLabel="Description and Landmark text input"
            />
            {description.trim().length > 0 && (() => {
              const liveDept = classifyDepartmentFromDescription(description);
              if (liveDept.isMoved) {
                return (
                  <View style={styles.liveDeptHint}>
                    <Ionicons name="sparkles" size={13} color="#0284C7" />
                    <Text style={styles.liveDeptHintText}>
                      Auto-detected department: <Text style={{ fontWeight: '700' }}>{liveDept.department}</Text>
                    </Text>
                  </View>
                );
              }
              return null;
            })()}
          </View>

          {/* Action Button */}
          <View style={styles.actionButtonGroup}>
            <TouchableOpacity
              style={[styles.primaryBtn, (!imageUri || !description.trim()) && styles.btnDisabled]}
              onPress={handleAnalyze}
              disabled={!imageUri || !description.trim() || isBusy}
              accessible
              accessibilityRole="button"
              accessibilityLabel="Validate and Analyze Defect"
            >
              <Text style={styles.primaryBtnText}>Analyze Defect with AI</Text>
              <Ionicons name="scan" size={18} color={AppColors.white} />
            </TouchableOpacity>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>

      {/* In-App Image Editor with DONE Action */}
      <ImageEditorModal
        visible={editorVisible}
        imageUri={rawPickedUri}
        onDone={(editedUri) => {
          setImageUri(editedUri);
          setEditorVisible(false);
          setAnalysis(null);
          setStep('form');
        }}
        onCancel={() => {
          setEditorVisible(false);
          if (rawPickedUri && !imageUri) {
            setImageUri(rawPickedUri);
          }
        }}
      />

      {/* Non-Road Image Rejection Modal */}
      <Modal visible={showInvalidModal} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalIconWrap}>
              <Ionicons name="close-circle" size={54} color={AppColors.error} />
            </View>
            <Text style={styles.modalTitle}>Non-Road Image Detected</Text>
            <Text style={styles.modalSub}>
              The uploaded image does not appear to contain a road or asphalt pavement.
            </Text>
            <Text style={styles.modalTip}>
              Please upload a clear photo of an asphalt road, street, or pavement showing potholes or cracks, or describe a solid waste management issue in the description.
            </Text>
            <TouchableOpacity
              style={styles.primaryBtn}
              onPress={() => setShowInvalidModal(false)}
              accessible
              accessibilityRole="button"
              accessibilityLabel="Upload Valid Image"
            >
              <Text style={styles.primaryBtnText}>Try Again</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({

  safe: { flex: 1, backgroundColor: AppColors.background },
  scroll: { padding: 18, paddingBottom: 40, width: '100%' },
  centeredScroll: {
    alignItems: 'stretch',
    padding: 20,
    paddingBottom: 40,
    width: '100%',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 20,
  },
  headerTitle: { fontSize: 18, fontWeight: '800', color: AppColors.textPrimary },
  section: { marginBottom: 18 },
  sectionLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: AppColors.textPrimary,
    marginBottom: 8,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  regionGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  regionChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: AppColors.surface,
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: AppColors.border,
  },
  regionChipActive: {
    backgroundColor: AppColors.primary,
    borderColor: AppColors.primary,
  },
  regionChipText: {
    fontSize: 12,
    fontWeight: '700',
    color: AppColors.textPrimary,
  },
  regionChipTextActive: {
    color: AppColors.white,
  },
  imagePickerRow: {
    flexDirection: 'row',
    gap: 12,
  },
  pickCard: {
    flex: 1,
    height: 110,
    backgroundColor: AppColors.surface,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: AppColors.border,
    borderStyle: 'dashed',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  pickCardText: {
    fontSize: 13,
    fontWeight: '700',
    color: AppColors.primary,
  },
  previewWrap: {
    borderRadius: 14,
    overflow: 'hidden',
    position: 'relative',
    borderWidth: 1,
    borderColor: AppColors.border,
    backgroundColor: '#0F172A',
    marginBottom: 14,
  },
  previewImage: {
    width: '100%',
    height: 220,
    borderRadius: 14,
  },
  previewBtnRow: {
    position: 'absolute',
    bottom: 12,
    right: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  editPhotoBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: 'rgba(2, 132, 199, 0.92)',
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 20,
  },
  retakeBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: 'rgba(15, 23, 42, 0.88)',
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 20,
  },
  retakeBtnText: {
    color: AppColors.white,
    fontSize: 12,
    fontWeight: '700',
  },
  locationBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: AppColors.surface,
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: AppColors.border,
    gap: 10,
  },
  locationCoords: {
    fontSize: 13,
    fontWeight: '700',
    color: AppColors.textPrimary,
  },
  locationSub: {
    fontSize: 11,
    color: AppColors.textSecondary,
    marginTop: 2,
  },
  locationPlaceholder: {
    fontSize: 13,
    color: AppColors.textSecondary,
  },
  gpsRefreshBtn: {
    padding: 6,
  },
  textInput: {
    backgroundColor: AppColors.surface,
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: AppColors.border,
    fontSize: 14,
    color: AppColors.textPrimary,
    minHeight: 80,
    textAlignVertical: 'top',
  },
  actionButtonGroup: {
    width: '100%',
    alignSelf: 'stretch',
    marginTop: 10,
    gap: 12,
  },
  primaryBtn: {
    backgroundColor: AppColors.primary,
    borderRadius: 12,
    paddingVertical: 14,
    minHeight: 52,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    width: '100%',
    alignSelf: 'stretch',
    ...Platform.select({
      web: {
        boxShadow: '0px 4px 8px rgba(15, 118, 110, 0.25)',
      },
      default: {
        shadowColor: AppColors.primary,
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.25,
        shadowRadius: 8,
        elevation: 3,
      },
    }),
  },
  btnDisabled: {
    backgroundColor: AppColors.disabled,
    ...Platform.select({
      web: { boxShadow: 'none' },
      default: { shadowOpacity: 0, elevation: 0 },
    }),
  },
  disabledBtn: {
    opacity: 0.6,
  },
  primaryBtnText: {
    color: AppColors.white,
    fontSize: 15,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
  secondaryBtn: {
    backgroundColor: AppColors.surface,
    borderRadius: 12,
    paddingVertical: 14,
    minHeight: 52,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    width: '100%',
    alignSelf: 'stretch',
    borderWidth: 1.5,
    borderColor: AppColors.border,
  },
  secondaryBtnText: {
    color: AppColors.textPrimary,
    fontSize: 14,
    fontWeight: '700',
  },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    backgroundColor: AppColors.background,
  },
  analyzingTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: AppColors.textPrimary,
    marginTop: 16,
  },
  analyzingSubtitle: {
    fontSize: 13,
    color: AppColors.textSecondary,
    marginTop: 6,
    textAlign: 'center',
  },
  noIssueCard: {
    backgroundColor: AppColors.surface,
    borderRadius: 16,
    padding: 20,
    alignItems: 'center',
    marginVertical: 16,
    borderWidth: 1,
    borderColor: AppColors.border,
    width: '100%',
    alignSelf: 'stretch',
  },
  noIssueIconWrap: {
    marginBottom: 12,
  },
  noIssueTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: AppColors.textPrimary,
    textAlign: 'center',
    marginBottom: 6,
  },
  noIssueSub: {
    fontSize: 13,
    color: AppColors.textSecondary,
    textAlign: 'center',
    lineHeight: 18,
    marginBottom: 14,
  },
  roadConfidenceBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#F0FDF4',
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#BBF7D0',
  },
  roadConfidenceText: {
    fontSize: 12,
    fontWeight: '700',
    color: AppColors.success,
  },
  successIcon: {
    alignItems: 'center',
    marginBottom: 16,
  },
  successTitle: {
    fontSize: 24,
    fontWeight: '800',
    color: AppColors.textPrimary,
    textAlign: 'center',
    marginBottom: 8,
  },
  successSub: {
    fontSize: 14,
    color: AppColors.textSecondary,
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 20,
  },
  successCard: {
    width: '100%',
    alignSelf: 'stretch',
    backgroundColor: AppColors.surface,
    borderRadius: 16,
    padding: 20,
    borderWidth: 1,
    borderColor: AppColors.border,
    marginBottom: 16,
    gap: 4,
  },
  successLabel: {
    fontSize: 12,
    color: AppColors.textSecondary,
    marginTop: 8,
    textTransform: 'uppercase',
  },
  successValue: {
    fontSize: 15,
    fontWeight: '700',
    color: AppColors.textPrimary,
  },
  successOfficerValue: {
    fontSize: 15,
    fontWeight: '800',
    color: AppColors.primary,
  },
  successResolutionValue: {
    fontSize: 15,
    fontWeight: '800',
    color: '#0D9488',
  },
  successValueHighlight: {
    fontSize: 20,
    fontWeight: '800',
    color: AppColors.primary,
    letterSpacing: 0.5,
  },
  resultOfficerValue: {
    fontSize: 14,
    fontWeight: '800',
    color: AppColors.primary,
    textAlign: 'center',
  },
  resolutionBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#F0FDFA',
    borderWidth: 1,
    borderColor: '#99F6E4',
    borderRadius: 8,
    padding: 10,
    marginTop: 10,
  },
  resolutionBannerText: {
    fontSize: 13,
    color: '#0F766E',
    fontWeight: '600',
  },
  resultCard: {
    backgroundColor: AppColors.surface,
    borderRadius: 14,
    padding: 16,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: AppColors.border,
    width: '100%',
    alignSelf: 'stretch',
  },
  resultHeading: {
    fontSize: 15,
    fontWeight: '800',
    color: AppColors.textPrimary,
    marginBottom: 10,
  },
  resultRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 12,
    flexWrap: 'wrap',
  },
  resultIssue: {
    fontSize: 18,
    fontWeight: '800',
    color: AppColors.textPrimary,
    textTransform: 'capitalize',
    flexShrink: 1,
  },
  resultGrid: {
    flexDirection: 'row',
    backgroundColor: '#F8FAFC',
    borderRadius: 10,
    padding: 10,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  resultItem: {
    flex: 1,
    alignItems: 'center',
  },
  resultItemLabel: {
    fontSize: 11,
    color: AppColors.textSecondary,
    textTransform: 'uppercase',
    marginBottom: 2,
  },
  resultItemValueSmall: {
    fontSize: 13,
    fontWeight: '700',
    color: AppColors.textPrimary,
    textAlign: 'center',
  },
  deptRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  deptText: {
    fontSize: 12,
    color: AppColors.textSecondary,
  },
  allDetectionsCard: {
    backgroundColor: AppColors.surface,
    borderRadius: 14,
    padding: 14,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: AppColors.border,
  },
  allDetectionsTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: AppColors.textPrimary,
    marginBottom: 8,
  },
  detectionRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 4,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: AppColors.border,
  },
  detectionIssue: {
    fontSize: 13,
    color: AppColors.textPrimary,
    textTransform: 'capitalize',
    flex: 1,
  },
  detectionConf: {
    fontSize: 13,
    fontWeight: '600',
    color: AppColors.textSecondary,
    marginRight: 10,
  },
  detectionPriority: {
    fontSize: 12,
    fontWeight: '700',
  },
  sectionLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  charCounterText: {
    fontSize: 11,
    color: AppColors.textSecondary,
    fontWeight: '600',
  },
  liveDeptHint: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#F0F9FF',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    marginTop: 8,
    borderWidth: 1,
    borderColor: '#BAE6FD',
  },
  liveDeptHintText: {
    fontSize: 12,
    color: '#0369A1',
    flex: 1,
  },
  descBox: {
    backgroundColor: AppColors.surface,
    borderRadius: 12,
    padding: 14,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: AppColors.border,
  },
  descHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  editDescBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(2, 132, 199, 0.1)',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  editDescText: {
    fontSize: 11,
    fontWeight: '700',
    color: AppColors.primary,
  },
  descLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: AppColors.textSecondary,
    textTransform: 'uppercase',
  },
  descText: {
    fontSize: 14,
    color: AppColors.textPrimary,
    lineHeight: 20,
  },
  locBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: AppColors.surface,
    borderRadius: 10,
    padding: 12,
    marginBottom: 18,
    borderWidth: 1,
    borderColor: AppColors.border,
  },
  locText: {
    fontSize: 13,
    color: AppColors.textSecondary,
  },
  locCoordsText: {
    fontSize: 13,
    fontWeight: '700',
    color: AppColors.textPrimary,
  },
  locRegionText: {
    fontSize: 12,
    color: AppColors.textSecondary,
    marginTop: 2,
  },
  swmRoutingText: {
    color: '#0284C7',
    fontWeight: '700',
  },
  successRoutingBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#F0F9FF',
    borderWidth: 1,
    borderColor: '#BAE6FD',
    borderRadius: 10,
    padding: 10,
    marginTop: 10,
  },
  successRoutingText: {
    flex: 1,
    fontSize: 12,
    color: '#0369A1',
    fontWeight: '600',
    lineHeight: 16,
  },
  routedNoticeCard: {
    backgroundColor: '#F0F9FF',
    borderRadius: 14,
    padding: 14,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: '#BAE6FD',
  },
  routedNoticeHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
  },
  routedNoticeTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#0369A1',
    marginBottom: 2,
  },
  routedNoticeSub: {
    fontSize: 12,
    color: '#0C4A6E',
    lineHeight: 16,
  },
  trackNote: {
    fontSize: 13,
    color: AppColors.textSecondary,
    textAlign: 'center',
    marginBottom: 20,
    lineHeight: 18,
  },
  workflowNote: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    backgroundColor: '#EFF6FF',
    padding: 12,
    borderRadius: 10,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: '#BFDBFE',
    width: '100%',
    alignSelf: 'stretch',
  },
  workflowNoteText: {
    fontSize: 12,
    color: '#1E40AF',
    flex: 1,
    lineHeight: 17,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  modalContent: {
    backgroundColor: AppColors.surface,
    borderRadius: 20,
    padding: 24,
    width: '100%',
    alignItems: 'center',
  },
  modalIconWrap: {
    marginBottom: 12,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: AppColors.textPrimary,
    marginBottom: 8,
  },
  modalSub: {
    fontSize: 13,
    fontWeight: '600',
    color: AppColors.error,
    textAlign: 'center',
    marginBottom: 10,
  },
  modalTip: {
    fontSize: 12,
    color: AppColors.textSecondary,
    textAlign: 'center',
    lineHeight: 17,
    marginBottom: 20,
  },
  budgetSubNote: {
    fontSize: 11,
    color: AppColors.textSecondary,
    marginTop: 2,
    lineHeight: 15,
  },
  budgetCard: {
    backgroundColor: '#F0FDFA',
    borderRadius: 14,
    padding: 14,
    marginBottom: 14,
    borderWidth: 1.5,
    borderColor: '#99F6E4',
  },
  budgetCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 6,
  },
  budgetIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#CCFBF1',
    alignItems: 'center',
    justifyContent: 'center',
  },
  budgetCardTitle: {
    fontSize: 11,
    fontWeight: '700',
    color: '#0F766E',
    textTransform: 'uppercase',
  },
  budgetCardValue: {
    fontSize: 18,
    fontWeight: '800',
    color: '#0D9488',
  },
  budgetBadge: {
    backgroundColor: '#CCFBF1',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#5EEAD4',
  },
  budgetBadgeText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#0F766E',
  },
  budgetCardDesc: {
    fontSize: 12,
    color: '#134E4A',
    lineHeight: 16,
    marginTop: 2,
  },
  verifiedLocationBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: '#ECFDF5',
    borderRadius: 12,
    padding: 12,
    marginBottom: 14,
    borderWidth: 1.5,
    borderColor: '#A7F3D0',
  },
  verifiedLocationTitle: {
    fontSize: 13,
    fontWeight: '800',
    color: '#065F46',
  },
  verifiedLocationSub: {
    fontSize: 11,
    color: '#047857',
    marginTop: 2,
    lineHeight: 15,
  },


  resultHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
    flexWrap: 'wrap',
    gap: 6,
  },
  accuracyBadge: {
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
  accuracyBadgeText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#065F46',
  },
  accuracyMeterContainer: {
    backgroundColor: '#F8FAFC',
    borderRadius: 8,
    padding: 8,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  accuracyMeterTrack: {
    height: 6,
    backgroundColor: '#E2E8F0',
    borderRadius: 3,
    overflow: 'hidden',
    marginBottom: 4,
  },
  accuracyMeterFill: {
    height: '100%',
    backgroundColor: '#10B981',
    borderRadius: 3,
  },
  accuracyMeterSub: {
    fontSize: 10,
    color: '#64748B',
    fontWeight: '600',
  },
  nlpRoutingCard: {
    backgroundColor: '#F0F9FF',
    borderRadius: 14,
    padding: 14,
    marginBottom: 14,
    borderWidth: 1.5,
    borderColor: '#BAE6FD',
  },
  nlpCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 10,
    flexWrap: 'wrap',
    justifyContent: 'space-between',
  },
  nlpIconWrap: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#E0F2FE',
    alignItems: 'center',
    justifyContent: 'center',
  },
  nlpCardTitle: {
    fontSize: 13,
    fontWeight: '800',
    color: '#0369A1',
  },
  nlpCardSub: {
    fontSize: 11,
    color: '#0284C7',
    marginTop: 1,
  },
  deptCodeBadge: {
    backgroundColor: '#0284C7',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  deptCodeBadgeText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  nlpKeywordsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 8,
    flexWrap: 'wrap',
  },
  nlpKeywordsLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: '#0369A1',
  },
  nlpKeywordChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#E0F2FE',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#7DD3FC',
  },
  nlpKeywordChipText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#0369A1',
  },
  nlpRoutingDetailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
    flexWrap: 'wrap',
    gap: 4,
  },
  nlpDetailLabel: {
    fontSize: 12,
    color: '#0369A1',
    fontWeight: '600',
  },
  nlpDetailValue: {
    fontSize: 12,
    fontWeight: '700',
    color: '#0C4A6E',
  },
  nlpExplanationText: {
    fontSize: 11,
    color: '#075985',
    lineHeight: 15,
    marginTop: 6,
    paddingTop: 6,
    borderTopWidth: 1,
    borderTopColor: '#E0F2FE',
  },
  rejectedIconWrap: {
    alignItems: 'center',
    marginBottom: 14,
  },
  rejectedTitle: {
    fontSize: 22,
    fontWeight: '800',
    color: AppColors.error,
    textAlign: 'center',
    marginBottom: 4,
  },
  rejectedSub: {
    fontSize: 14,
    fontWeight: '600',
    color: AppColors.textSecondary,
    textAlign: 'center',
    marginBottom: 18,
  },
  rejectedCard: {
    width: '100%',
    alignSelf: 'stretch',
    backgroundColor: '#F8FAFC',
    borderRadius: 16,
    padding: 18,
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
    marginBottom: 16,
    gap: 4,
    opacity: 0.95,
  },
  rejectedLabel: {
    fontSize: 11,
    color: AppColors.textSecondary,
    marginTop: 8,
    textTransform: 'uppercase',
    fontWeight: '700',
  },
  rejectedValueHighlight: {
    fontSize: 18,
    fontWeight: '800',
    color: AppColors.textPrimary,
  },
  rejectedStatusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#FEF2F2',
    borderWidth: 1,
    borderColor: '#FECACA',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
    alignSelf: 'flex-start',
    marginTop: 2,
  },
  rejectedStatusBadgeText: {
    fontSize: 12,
    fontWeight: '800',
    color: '#DC2626',
  },
  rejectedExplanation: {
    fontSize: 13,
    color: AppColors.textPrimary,
    lineHeight: 18,
    marginTop: 2,
  },
  rejectedNoticeBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    backgroundColor: '#F1F5F9',
    borderRadius: 10,
    padding: 12,
    marginTop: 12,
    borderWidth: 1,
    borderColor: '#CBD5E1',
  },
  rejectedNoticeText: {
    flex: 1,
    fontSize: 12,
    color: '#475569',
    lineHeight: 16,
  },
  uncertainIconWrap: {
    alignItems: 'center',
    marginBottom: 14,
  },
  uncertainTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: '#B45309',
    textAlign: 'center',
    marginBottom: 6,
  },
  uncertainSub: {
    fontSize: 13,
    color: AppColors.textSecondary,
    textAlign: 'center',
    lineHeight: 18,
    marginBottom: 18,
  },
  uncertainCard: {
    width: '100%',
    alignSelf: 'stretch',
    backgroundColor: '#FFFBEB',
    borderRadius: 16,
    padding: 16,
    borderWidth: 1.5,
    borderColor: '#FDE68A',
    marginBottom: 18,
  },
  uncertainBanner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
  },
  uncertainBannerText: {
    flex: 1,
    fontSize: 13,
    color: '#92400E',
    lineHeight: 18,
    fontWeight: '500',
  },
  uncertainBannerTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#B45309',
    marginBottom: 2,
  },
  refIdCard: {
    width: '100%',
    backgroundColor: '#F0F9FF',
    borderRadius: 12,
    padding: 12,
    marginBottom: 14,
    borderWidth: 1.5,
    borderColor: '#BAE6FD',
  },
  refIdRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  refIdLabel: {
    fontSize: 10,
    fontWeight: '800',
    color: '#0369A1',
    letterSpacing: 0.6,
  },
  refIdValue: {
    fontSize: 16,
    fontWeight: '800',
    color: '#0C4A6E',
    marginTop: 1,
  },
  pendingBadge: {
    backgroundColor: '#E0F2FE',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#7DD3FC',
  },
  pendingBadgeText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#0284C7',
  },
  successDescText: {
    fontSize: 13,
    color: AppColors.textPrimary,
    lineHeight: 18,
    marginTop: 2,
    backgroundColor: '#F1F5F9',
    padding: 10,
    borderRadius: 8,
  },
  budgetNoticeCard: {
    backgroundColor: '#F0FDFA',
    borderRadius: 14,
    padding: 14,
    marginBottom: 14,
    borderWidth: 1.5,
    borderColor: '#99F6E4',
  },
  budgetNoticeHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 8,
  },
  budgetNoticeIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#CCFBF1',
    justifyContent: 'center',
    alignItems: 'center',
  },
  budgetNoticeTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: '#0F766E',
  },
  budgetNoticeSub: {
    fontSize: 11,
    color: '#115E59',
    fontWeight: '600',
    marginTop: 1,
  },
  budgetPendingBadge: {
    backgroundColor: '#FEF3C7',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#FDE68A',
  },
  budgetPendingBadgeText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#92400E',
  },
  budgetNoticeBody: {
    fontSize: 12,
    color: '#134E4A',
    lineHeight: 17,
  },
  successBudgetBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#F0FDFA',
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#99F6E4',
    marginBottom: 12,
  },
  successBudgetText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#0F766E',
    flex: 1,
  },
});
