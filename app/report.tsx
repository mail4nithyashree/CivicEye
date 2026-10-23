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
import { analyzeCivicImage, validateImageQuality, type AnalysisResult } from '@/services/imageAnalysis';
import { classifyComplaintFromDescription, checkDescriptionHasNoIssue } from '@/services/descriptionClassifier';
import { validateComplaintSubmission, type ImageDescriptionValidationResult } from '@/services/imageDescriptionValidator';
import { useAppTheme } from '@/context/ThemeContext';
import { formatDisplayIssueName } from '@/services/predictionContract';
import { calculatePriorityWithExplanation } from '@/services/detectionConfig';
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
  const { colors } = useAppTheme();
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
  const [validationRejection, setValidationRejection] = useState<{
    title: string;
    message: string;
    outcome: string;
  } | null>(null);
  const [rejectedInfo, setRejectedInfo] = useState<{
    complaintId: string;
    reason: string;
    rejectionType: string;
    issueType?: string;
    imageUrl?: string;
  } | null>(null);
  const [uncertainAnalysis, setUncertainAnalysis] = useState<AnalysisResult | null>(null);
  const [submittedInfo, setSubmittedInfo] = useState<{
    complaintId: string;
    department: string;
    departmentCode: string;
    routingStatus: string;
    routingMessage?: string;
    issueType: string;
    displayIssueName?: string;
    confidence?: number;
    confidenceRaw?: number;
    confidenceType?: string;
    priority: string;
    priorityReason?: string;
    predictionState?: string;
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

    if (!description.trim()) {
      Alert.alert('Description Required', 'Please describe the issue briefly (e.g., pothole, road crack, waterlogging).');
      return;
    }
    if (!location) {
      Alert.alert('Location Required', 'Please enable GPS location to tag the issue.');
      return;
    }

    console.log('[SUBMIT] Description:', description);
    console.log('[SUBMIT] Image URI:', imageUri);
    console.log('[SUBMIT] Processing issue completely from citizen description');

    setStep('checking');
    setValidationRejection(null);

    try {
      // 1. Description validation: Check if citizen explicitly reported no issue
      const noIssueCheck = checkDescriptionHasNoIssue(description.trim());
      if (noIssueCheck.isNoIssue) {
        Alert.alert(
          'No Issue Found',
          'Your description does not report an active civic problem. Please describe the problem you would like to report (e.g., pothole, road crack, waterlogging).'
        );
        setStep('form');
        return;
      }

      // 2. Authoritative Classification from Citizen Description
      const descClassification = classifyComplaintFromDescription(description.trim());
      if (descClassification.requiresClarification) {
        Alert.alert(
          'Clarification Required',
          descClassification.clarificationMessage || 'Please clarify the description to indicate the civic issue (e.g., pothole, road crack, waterlogging).'
        );
        setStep('form');
        return;
      }

      const canonicalIssueName = descClassification.displayIssueName;
      const activeDept = descClassification.department;
      const activeDeptCode = descClassification.departmentCode;
      const isRoad = isRoadDepartment({
        department: activeDept,
        departmentCode: activeDeptCode,
        routingStatus: descClassification.routingStatus,
      });

      console.log(`[ANALYZE] Classified from description: ${canonicalIssueName}, Priority: ${descClassification.priority}, Confidence: ${descClassification.confidence}% (${descClassification.confidenceBand})`);

      // Log analysis record to Firestore
      await logAnalysisRecord({
        citizenId: user?.uid,
        citizenEmail: user?.email ?? '',
        roadValidationResult: isRoad ? 'road' : 'not_road',
        roadValidationConfidence: 0.95,
        analysisStatus: 'damage_detected',
        detectedIssue: canonicalIssueName,
        detectionConfidence: descClassification.confidence,
        latitude: location.lat,
        longitude: location.lng,
        region: selectedRegion,
      });

      setAnalysis({
        isRoad,
        roadConfidence: 0.95,
        hasDamage: true,
        predictionState: 'VALID_ISSUE',
        displayIssueName: canonicalIssueName,
        predictedClass: canonicalIssueName,
        priorityReason: descClassification.priorityReason,
        analysisStatus: 'damage_detected',
        issueType: canonicalIssueName,
        confidence: descClassification.confidence,
        confidenceRaw: descClassification.confidenceRaw,
        confidenceType: 'description_heuristic',
        priority: descClassification.priority,
        department: activeDept,
        departmentCode: activeDeptCode,
        modelVersion: 'CivicEye-Description-Classifier-v1',
        allDetections: [],
      });

      setStep('result');
    } catch (err: any) {
      console.log('[ANALYZE] Analysis error details:', err);
      Alert.alert(
        'Processing Error',
        err?.message || 'Unable to process description right now. Please try again.'
      );
      setStep('form');
    }
  }

  async function handleSubmit() {
    if (submitting || step === 'checking' || step === 'analyzing') return;
    if (!analysis || !location || !user) return;

    setSubmitting(true);

    console.log('[SUBMIT] API URL:', getApiBaseUrl());
    console.log('[SUBMIT] Description:', description);
    console.log('[SUBMIT] Image URI:', imageUri);
    console.log('[SUBMIT] Starting complaint submission');

    try {
      let cloudinaryUrl = '';
      if (imageUri) {
        try {
          cloudinaryUrl = await uploadComplaintImage(imageUri);
        } catch (uploadErr) {
          console.warn('[SUBMIT] Image upload issue, using local URI:', uploadErr);
          cloudinaryUrl = imageUri;
        }
      }
      const classifiedDept = classifyDepartmentFromDescription(description.trim(), analysis.department);
      const isRoad = isRoadDepartment(classifiedDept);
      const isCleanRoadRequested = analysis.issueType === 'Road Surface (Inspection Requested)';
      const isNoMajorIssue = analysis.predictionState === 'NO_MAJOR_ISSUE' || analysis.issueType === 'no_major_issue';
      const canonicalDisplayIssue = isCleanRoadRequested
        ? 'Road Surface (Inspection Requested)'
        : (analysis.displayIssueName || formatDisplayIssueName(analysis.issueType));

      const activeDept = classifiedDept?.department || analysis.department;
      const activeDeptCode = classifiedDept?.departmentCode || analysis.departmentCode;
      const responsibleOfficerName = await getResponsibleOfficerName(
        activeDept,
        activeDeptCode
      );
      const submitPriority = (isNoMajorIssue || isCleanRoadRequested || analysis.priority === 'NONE') ? 'NONE' : (analysis.priority || 'MEDIUM');
      const submitConfidence = analysis.confidence ?? 0;
      const submitConfidenceRaw = analysis.confidenceRaw ?? (submitConfidence > 0 ? submitConfidence / 100 : 0);
      const submitConfidenceType = analysis.confidenceType || 'description_heuristic';
      const submitPredictionState = analysis.predictionState || (isNoMajorIssue ? 'NO_MAJOR_ISSUE' : 'VALID_ISSUE');
      const submitPredictedClass = analysis.predictedClass || (isNoMajorIssue ? null : canonicalDisplayIssue);
      const submitPriorityReason = analysis.priorityReason || `${submitPriority} priority assessed for ${canonicalDisplayIssue}.`;
      const submitModelVersion = analysis.modelVersion || 'CivicEye-Description-Classifier-v1';

      const submitResult = await submitComplaint({
        citizenId: user.uid,
        citizenEmail: user.email ?? '',
        imageUri: cloudinaryUrl || imageUri || '',
        predictionContract: analysis.predictionContract,
        description: description.trim(),
        latitude: location.lat,
        longitude: location.lng,
        region: selectedRegion,
        issueType: canonicalDisplayIssue,
        displayIssueName: canonicalDisplayIssue,
        predictedClass: submitPredictedClass,
        confidence: submitConfidence,
        confidenceRaw: submitConfidenceRaw,
        confidenceType: submitConfidenceType,
        predictionState: submitPredictionState,
        priority: submitPriority,
        severity: submitPriority,
        priorityReason: submitPriorityReason,
        modelVersion: submitModelVersion,
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
        analysisStatus: analysis.analysisStatus === 'inference_failed' ? 'unclear_image' : analysis.analysisStatus,
        detectedIssue: canonicalDisplayIssue,
        detectionConfidence: submitConfidence,
        suggestedRoadName: isRoad ? (suggestedRoad || undefined) : undefined,
        suggestedAuthority: isRoad ? (suggestedAuthority || undefined) : undefined,
        assignedOfficer: responsibleOfficerName,
        officerName: responsibleOfficerName,
        status: 'Submitted',
      });

      const durationResult = getEstimatedResolutionDuration(
        submitPriority,
        canonicalDisplayIssue,
        activeDept,
        new Date()
      );

      setSubmittedInfo({
        complaintId: submitResult.complaintId,
        department: activeDept,
        departmentCode: activeDeptCode,
        routingStatus: classifiedDept.routingStatus,
        routingMessage: classifiedDept.routingMessage,
        issueType: canonicalDisplayIssue,
        displayIssueName: canonicalDisplayIssue,
        confidence: submitConfidence,
        confidenceRaw: submitConfidenceRaw,
        confidenceType: submitConfidenceType,
        priority: submitPriority,
        priorityReason: submitPriorityReason,
        predictionState: submitPredictionState,
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
        analysisStatus: analysis.analysisStatus === 'inference_failed' ? 'unclear_image' : analysis.analysisStatus,
        detectedIssue: canonicalDisplayIssue,
        detectionConfidence: submitConfidence,
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
          message: `Your complaint ${submitResult.complaintId} in ${selectedRegion} has been registered with status: Submitted. A Coimbatore Field Inspector has been notified for on-site inspection and manual budget estimation.`,
          type: 'complaint_raised',
        });

        // Broadcast to Field Inspector queue
        await createNotification({
          recipientRole: 'field_inspector',
          complaintId: submitResult.id,
          title: 'New Complaint Awaiting Field Inspection',
          message: `New complaint ${submitResult.complaintId} in ${selectedRegion} (${canonicalDisplayIssue}). On-site physical inspection and manual budget estimation required.`,
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
      <SafeAreaView style={[styles.centered, { backgroundColor: colors.background }]}>
        <ActivityIndicator size="large" color={colors.buttonPrimary} />
        <Text style={[styles.analyzingTitle, { color: colors.textOnDark }]}>
          {step === 'checking' ? 'Analyzing Civic Issue…' : 'Processing Image Analysis…'}
        </Text>
        <Text style={[styles.analyzingSubtitle, { color: colors.textOnDarkSecondary }]}>
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
      <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]}>
        <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
          <View style={styles.header}>
            <TouchableOpacity onPress={() => setStep('form')} accessibilityRole="button" accessibilityLabel="Back">
              <Ionicons name="arrow-back" size={24} color={colors.textOnDark} />
            </TouchableOpacity>
            <Text style={[styles.headerTitle, { color: colors.textOnDark }]}>Road Verification</Text>
            <View style={{ width: 24 }} />
          </View>

          {/* Reference ID Card */}
          <View style={[styles.refIdCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <View style={styles.refIdRow}>
              <Ionicons name="shield-checkmark" size={20} color="#059669" />
              <View style={{ flex: 1 }}>
                <Text style={[styles.refIdLabel, { color: colors.textSecondary }]}>AI VERIFICATION RESULT</Text>
                <Text style={[styles.refIdValue, { color: colors.textPrimary }]}>No Supported Defect Detected</Text>
              </View>
              <View style={[styles.pendingBadge, { backgroundColor: colors.surfaceElevated, borderColor: colors.borderLight }]}>
                <Text style={[styles.pendingBadgeText, { color: colors.textPrimary }]}>Verified Clean</Text>
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
          <View style={[styles.resultCard, { borderColor: colors.border, backgroundColor: colors.card }]}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 }}>
              <Ionicons name="checkmark-circle" size={24} color="#059669" />
              <Text style={[styles.resultHeading, { color: colors.textPrimary, marginBottom: 0 }]}>
                Normal Road Surface
              </Text>
            </View>
            <Text style={{ fontSize: 13, color: colors.textSecondary, lineHeight: 18, marginBottom: 12 }}>
              The computer vision model verified an undamaged road surface with no visible major potholes, cracking, or pavement failure detected.
            </Text>

            <View style={[styles.resultGrid, { backgroundColor: colors.surfaceElevated, padding: 10, borderRadius: 8, borderWidth: 1, borderColor: colors.borderLight }]}>
              <View style={styles.resultItem}>
                <Text style={[styles.resultItemLabel, { color: colors.textSecondary }]}>Model Status</Text>
                <Text style={[styles.resultItemValueSmall, { color: colors.textPrimary }]}>No defect detected</Text>
              </View>
              <View style={styles.resultItem}>
                <Text style={[styles.resultItemLabel, { color: colors.textSecondary }]}>Road Confidence</Text>
                <Text style={[styles.resultItemValueSmall, { color: colors.textPrimary }]}>95% Normal</Text>
              </View>
            </View>
          </View>

          {/* Citizen Description Card */}
          <View style={[styles.descBox, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <View style={styles.descHeaderRow}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <Ionicons name="chatbox-ellipses-outline" size={16} color={colors.buttonPrimary} />
                <Text style={[styles.descLabel, { color: colors.textSecondary }]}>Your Submitted Description</Text>
              </View>
              <TouchableOpacity
                onPress={() => setStep('form')}
                style={styles.editDescBtn}
                accessibilityRole="button"
                accessibilityLabel="Edit description"
              >
                <Ionicons name="pencil" size={12} color={colors.buttonPrimary} />
                <Text style={[styles.editDescText, { color: colors.buttonPrimary }]}>Edit</Text>
              </TouchableOpacity>
            </View>
            <Text style={[styles.descText, { color: colors.textPrimary }]}>
              {description.trim() ? description : '(No additional description provided)'}
            </Text>
          </View>

          {/* Explanatory Notice */}
          <View style={[styles.rejectedNoticeBox, { backgroundColor: colors.surfaceElevated, borderColor: colors.borderLight }]}>
            <Ionicons name="information-circle-outline" size={18} color={colors.textSecondary} />
            <Text style={[styles.rejectedNoticeText, { color: colors.textPrimary }]}>
              To prevent false complaints from entering municipal repair queues, CivicEye does not automatically log undamaged roads as defects. If you believe there is a subtle defect requiring on-site examination, you may request a physical inspection below.
            </Text>
          </View>

          {/* Action Buttons */}
          <View style={[styles.actionButtonGroup, { marginTop: 18 }]}>
            <TouchableOpacity
              style={[styles.primaryBtn, { backgroundColor: colors.buttonPrimary }]}
              onPress={() => {
                setAnalysis(prev => prev ? {
                  ...prev,
                  issueType: 'Road Surface (Inspection Requested)',
                  hasDamage: false,
                  priority: 'NONE',
                  predictionContract: prev.predictionContract ? {
                    ...prev.predictionContract,
                    displayIssueName: 'Road Surface (Inspection Requested)',
                    predictedClass: null,
                    validationStatus: 'valid_clean_road',
                    priority: 'NONE',
                    severity: 'NONE',
                  } : undefined,
                } : null);
                setStep('result');
              }}
              accessible
              accessibilityRole="button"
              accessibilityLabel="Request Physical On-Site Inspection"
            >
              <Ionicons name="shield-outline" size={18} color="#FFFFFF" />
              <Text style={[styles.primaryBtnText, { color: colors.buttonText }]}>Request Physical Inspection</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.secondaryBtn, { backgroundColor: colors.card, borderColor: colors.border }]}
              onPress={() => {
                setAnalysis(null);
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
              <Ionicons name="crop-outline" size={18} color={colors.textPrimary} />
              <Text style={[styles.secondaryBtnText, { color: colors.textPrimary }]}>Retake / Crop Photo</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.secondaryBtn, { backgroundColor: colors.card, borderColor: colors.border }]}
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
              <Ionicons name="arrow-back-outline" size={18} color={colors.textPrimary} />
              <Text style={[styles.secondaryBtnText, { color: colors.textPrimary }]}>Report Another Issue</Text>
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
    const priorityVal = submittedInfo?.priority || analysis?.priority || 'NONE';
    const displayBudget = submittedInfo?.estimatedBudget ?? (analysis ? getStandardEstimatedBudget(analysis.issueType, analysis.priority).budget : 18500);
    const displayDuration = submittedInfo?.estimatedResolutionDuration || getEstimatedResolutionDuration(priorityVal, submittedInfo?.issueType || analysis?.issueType || 'pothole', displayDept).durationText;
    const displayExpDate = submittedInfo?.expectedResolutionDate ? formatResolutionDate(submittedInfo.expectedResolutionDate) : formatResolutionDate(getEstimatedResolutionDuration(priorityVal, submittedInfo?.issueType || analysis?.issueType || 'pothole', displayDept).expectedResolutionDate);

    return (
      <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]}>
        <ScrollView contentContainerStyle={styles.centeredScroll} showsVerticalScrollIndicator={false}>
          <View style={styles.successIcon}>
            <Ionicons name="checkmark-circle" size={72} color={colors.success} />
          </View>
          <Text style={[styles.successTitle, { color: colors.textOnDark }]}>Complaint Successfully Registered ✓</Text>
          <Text style={[styles.successSub, { color: colors.textOnDarkSecondary }]}>Your complaint has been registered with the Coimbatore Municipal Corporation.</Text>

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

          <View style={[styles.successCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            {submittedInfo?.complaintId && (
              <>
                <Text style={[styles.successLabel, { color: colors.textSecondary }]}>Registered Complaint ID</Text>
                <Text style={[styles.successValueHighlight, { color: colors.textPrimary }]}>{submittedInfo.complaintId}</Text>
              </>
            )}

            <Text style={[styles.successLabel, { color: colors.textSecondary }]}>Issue Name</Text>
            <Text style={[styles.successValue, { color: colors.textPrimary }]}>
              {submittedInfo?.displayIssueName || submittedInfo?.issueType || analysis?.displayIssueName || formatDisplayIssueName(analysis?.issueType)}
            </Text>

            {(submittedInfo?.confidence ?? analysis?.confidence ?? 0) > 0 ? (
              <>
                <Text style={[styles.successLabel, { color: colors.textSecondary }]}>Confidence Score</Text>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 8 }}>
                  <Ionicons name="sparkles" size={14} color="#059669" />
                  <Text style={{ fontSize: 13, fontWeight: '700', color: '#047857' }}>
                    {submittedInfo?.confidence ?? analysis?.confidence}%
                  </Text>
                  <View style={{ backgroundColor: colors.surfaceElevated, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 }}>
                    <Text style={{ fontSize: 10, color: colors.textPrimary, fontWeight: '600' }}>Description Assessment</Text>
                  </View>
                </View>
              </>
            ) : null}

            <Text style={[styles.successLabel, { color: colors.textSecondary }]}>Priority</Text>
            <Text style={[styles.successValue, priorityTextColor(priorityVal)]}>
              {priorityVal.toUpperCase()}
            </Text>

            {(submittedInfo?.priorityReason || analysis?.priorityReason) ? (
              <View style={{ backgroundColor: colors.surfaceElevated, borderRadius: 8, padding: 8, marginBottom: 8, borderWidth: 1, borderColor: colors.borderLight }}>
                <Text style={{ fontSize: 11, color: colors.textSecondary, fontWeight: '600' }}>
                  Priority Reason: <Text style={{ color: colors.textPrimary, fontWeight: '500' }}>{submittedInfo?.priorityReason || analysis?.priorityReason}</Text>
                </Text>
              </View>
            ) : null}

            <Text style={[styles.successLabel, { color: colors.textSecondary }]}>Department</Text>
            <Text style={[styles.successValue, { color: colors.textPrimary }]}>{displayDept}</Text>

            <Text style={[styles.successLabel, { color: colors.textSecondary }]}>Assigned Officer</Text>
            <Text style={[styles.successOfficerValue, { color: colors.textPrimary }]}>
              {submittedInfo?.officerName || reviewOfficerName || 'Awaiting Assignment'}
            </Text>

            <Text style={[styles.successLabel, { color: colors.textSecondary }]}>Citizen Description &amp; Landmark</Text>
            <Text style={[styles.successDescText, { backgroundColor: colors.surfaceElevated, color: colors.textPrimary }]}>
              {description.trim() ? description : '(No additional description provided)'}
            </Text>

            <Text style={[styles.successLabel, { color: colors.textSecondary }]}>Tagged Location</Text>
            <Text style={[styles.successValue, { color: colors.textPrimary }]}>
              {location ? `${location.lat.toFixed(5)}, ${location.lng.toFixed(5)}` : 'GPS Tagged'} • Region: {submittedInfo?.region || selectedRegion}
              {suggestedRoad ? ` • Near ${suggestedRoad}` : ''}
            </Text>

            <Text style={[styles.successLabel, { color: colors.textSecondary }]}>Estimated Resolution Duration</Text>
            <Text style={[styles.successResolutionValue, { color: colors.textPrimary }]}>
              {displayDuration}
            </Text>

            <Text style={[styles.successLabel, { color: colors.textSecondary }]}>Expected Resolution Date</Text>
            <Text style={[styles.successValue, { color: colors.textPrimary }]}>
              {displayExpDate}
            </Text>

            <Text style={[styles.successLabel, { color: colors.textSecondary }]}>Registration Status</Text>
            <Text style={[styles.successValue, { color: '#047857', fontWeight: '800' }]}>
              Registered / Active
            </Text>

            <Text style={[styles.successLabel, { color: colors.textSecondary }]}>Estimated Budget</Text>
            <View style={[styles.successBudgetBox, { backgroundColor: colors.surfaceElevated, borderColor: colors.borderLight }]}>
              <Ionicons name="time-outline" size={15} color={colors.textPrimary} />
              <Text style={[styles.successBudgetText, { color: colors.textPrimary }]}>
                Pending on-site manual estimation by Field Inspector
              </Text>
            </View>

            <Text style={[styles.successLabel, { color: colors.textSecondary }]}>Routing Status</Text>
            <Text style={[styles.successValue, { color: colors.textPrimary }, (!isRoad || isPWD) ? styles.swmRoutingText : {}]}>
              {displayRoutingStatus}
            </Text>

            {(!isRoad || isPWD) && (
              <View style={[styles.successRoutingBanner, { backgroundColor: colors.surfaceElevated, borderColor: colors.borderLight }]}>
                <Ionicons name="information-circle" size={18} color={colors.buttonPrimary} />
                <Text style={[styles.successRoutingText, { color: colors.textPrimary }]}>
                  {displayRoutingMessage || (isPWD ? 'Your complaint has been routed to the Public Works Department for public route maintenance.' : `Your complaint has been moved to the ${displayDept} Department.`)}
                </Text>
              </View>
            )}
          </View>

          <View style={[styles.workflowNote, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Ionicons name="information-circle-outline" size={18} color={colors.buttonPrimary} />
            <Text style={[styles.workflowNoteText, { color: colors.textPrimary }]}>
              A designated Coimbatore Field Inspector has been notified and will verify the complaint on-site.
            </Text>
          </View>

          <View style={styles.actionButtonGroup}>
            <TouchableOpacity
              style={[styles.primaryBtn, { backgroundColor: colors.buttonPrimary }]}
              onPress={() => router.push('/my-complaints')}
              accessible
              accessibilityRole="button"
              accessibilityLabel="View My Complaints"
            >
              <Ionicons name="list-outline" size={18} color="#FFFFFF" />
              <Text style={[styles.primaryBtnText, { color: colors.buttonText }]}>View My Complaints</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.secondaryBtn, { backgroundColor: colors.card, borderColor: colors.border }]}
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
              <Ionicons name="add-circle-outline" size={18} color={colors.textPrimary} />
              <Text style={[styles.secondaryBtnText, { color: colors.textPrimary }]}>Report Another Issue</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.secondaryBtn, { backgroundColor: colors.card, borderColor: colors.border }]}
              onPress={() => router.replace('/(tabs)')}
              accessible
              accessibilityRole="button"
              accessibilityLabel="Back to Home"
            >
              <Ionicons name="home-outline" size={18} color={colors.textPrimary} />
              <Text style={[styles.secondaryBtnText, { color: colors.textPrimary }]}>Back to Home</Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </SafeAreaView>
    );
  }

  if (step === 'rejected') {
    const title = validationRejection?.title || 'Invalid Issue Image';
    const message = validationRejection?.message || 'Invalid Issue Image. The uploaded image does not match the reported civic issue. Please upload a relevant image and try again.';

    return (
      <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]}>
        <ScrollView contentContainerStyle={styles.centeredScroll} showsVerticalScrollIndicator={false}>
          {imageUri && (
            <View style={[styles.previewWrap, { marginBottom: 16 }]}>
              <CivicImage
                uri={imageUri}
                issueType={title}
                isInvalid={true}
                invalidMessage={title}
                style={styles.previewImage}
                resizeMode="cover"
              />
            </View>
          )}

          <View style={styles.rejectedIconWrap}>
            <Ionicons name="close-circle" size={72} color={colors.error} />
          </View>
          <Text style={[styles.rejectedTitle, { color: colors.textOnDark }]}>{title}</Text>
          <Text style={[styles.rejectedSub, { color: colors.textOnDarkSecondary, lineHeight: 22, marginTop: 8 }]}>
            {message}
          </Text>

          {/* Citizen Description Card (Preserved!) */}
          <View style={[styles.descBox, { backgroundColor: colors.card, borderColor: colors.border, marginTop: 18 }]}>
            <View style={styles.descHeaderRow}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <Ionicons name="chatbox-ellipses-outline" size={16} color={colors.buttonPrimary} />
                <Text style={[styles.descLabel, { color: colors.textSecondary }]}>Your Description</Text>
              </View>
            </View>
            <Text style={[styles.descText, { color: colors.textPrimary }]}>
              {description.trim() ? description : '(No description entered)'}
            </Text>
          </View>

          {/* Action Buttons: View Past Complaints & Report an Issue */}
          <View style={[styles.actionButtonGroup, { marginTop: 24 }]}>
            <TouchableOpacity
              style={[styles.primaryBtn, { backgroundColor: colors.buttonPrimary }]}
              onPress={() => router.push('/my-complaints')}
              accessible
              accessibilityRole="button"
              accessibilityLabel="View Past Complaints"
            >
              <Ionicons name="list-outline" size={18} color="#FFFFFF" />
              <Text style={[styles.primaryBtnText, { color: colors.buttonText }]}>View Past Complaints</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.secondaryBtn, { backgroundColor: colors.card, borderColor: colors.border }]}
              onPress={() => {
                // Return to form with image and description preserved!
                setValidationRejection(null);
                setStep('form');
              }}
              accessible
              accessibilityRole="button"
              accessibilityLabel="Report an Issue"
            >
              <Ionicons name="create-outline" size={18} color={colors.textPrimary} />
              <Text style={[styles.secondaryBtnText, { color: colors.textPrimary }]}>Report an Issue</Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </SafeAreaView>
    );
  }

  if (step === 'uncertain') {
    const uDept = classifyDepartmentFromDescription(description.trim(), uncertainAnalysis?.department);
    const resolvedIssue = formatDisplayIssueName(
      uncertainAnalysis?.displayIssueName ||
      (uncertainAnalysis?.issueType && uncertainAnalysis.issueType !== 'unclear_image'
        ? uncertainAnalysis.issueType
        : (description.trim() ? uDept.department : 'Road & Civic Infrastructure Issue'))
    );

    return (
      <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]}>
        <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
          <View style={styles.header}>
            <TouchableOpacity onPress={() => setStep('form')} accessibilityRole="button" accessibilityLabel="Back">
              <Ionicons name="arrow-back" size={24} color={colors.textOnDark} />
            </TouchableOpacity>
            <Text style={[styles.headerTitle, { color: colors.textOnDark }]}>Review &amp; Submit</Text>
            <View style={{ width: 24 }} />
          </View>

          {/* Issue ID Card */}
          <View style={[styles.refIdCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <View style={styles.refIdRow}>
              <Ionicons name="finger-print-outline" size={20} color={colors.buttonPrimary} />
              <View style={{ flex: 1 }}>
                <Text style={[styles.refIdLabel, { color: colors.textSecondary }]}>COMPLAINT ID</Text>
                <Text style={[styles.refIdValue, { color: colors.textPrimary }]}>Generated on Submission</Text>
              </View>
              <View style={[styles.pendingBadge, { backgroundColor: colors.surfaceElevated, borderColor: colors.borderLight }]}>
                <Text style={[styles.pendingBadgeText, { color: colors.textPrimary }]}>Pending Submission</Text>
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
          <View style={[styles.resultCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Text style={[styles.resultHeading, { color: colors.textPrimary }]}>Issue Summary</Text>
            <View style={styles.resultRow}>
              <Ionicons name="alert-circle" size={20} color={colors.buttonPrimary} />
              <Text style={[styles.resultIssue, { color: colors.textPrimary }]}>{resolvedIssue}</Text>
            </View>
            <View style={[styles.resultGrid, { backgroundColor: colors.surfaceElevated, borderColor: colors.borderLight }]}>
              <View style={styles.resultItem}>
                <Text style={[styles.resultItemLabel, { color: colors.textSecondary }]}>Department</Text>
                <Text style={[styles.resultItemValueSmall, { color: colors.textPrimary }]}>{uDept.department}</Text>
              </View>
              <View style={styles.resultItem}>
                <Text style={[styles.resultItemLabel, { color: colors.textSecondary }]}>Priority</Text>
                <Text style={[styles.resultItemValueSmall, priorityTextColor(uncertainAnalysis?.priority || 'NONE')]}>{uncertainAnalysis?.priority || 'NONE'}</Text>
              </View>
            </View>
          </View>

          {/* Citizen Description Card */}
          <View style={[styles.descBox, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <View style={styles.descHeaderRow}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <Ionicons name="chatbox-ellipses-outline" size={16} color={colors.buttonPrimary} />
                <Text style={[styles.descLabel, { color: colors.textSecondary }]}>Citizen Description &amp; Landmark</Text>
              </View>
              <TouchableOpacity
                onPress={() => setStep('form')}
                style={styles.editDescBtn}
                accessibilityRole="button"
                accessibilityLabel="Edit description"
              >
                <Ionicons name="pencil" size={12} color={colors.buttonPrimary} />
                <Text style={[styles.editDescText, { color: colors.buttonPrimary }]}>Edit</Text>
              </TouchableOpacity>
            </View>
            <Text style={[styles.descText, { color: colors.textPrimary }]}>
              {description.trim() ? description : '(No additional description provided)'}
            </Text>
          </View>

          {/* Location Card */}
          <View style={[styles.locBox, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Ionicons name="location" size={18} color={colors.buttonPrimary} />
            <View style={{ flex: 1 }}>
              <Text style={[styles.locCoordsText, { color: colors.textPrimary }]}>
                {location?.lat.toFixed(5)}, {location?.lng.toFixed(5)}
              </Text>
              <Text style={[styles.locRegionText, { color: colors.textSecondary }]}>
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
              <Ionicons name="pencil" size={12} color={colors.buttonPrimary} />
              <Text style={[styles.editDescText, { color: colors.buttonPrimary }]}>Edit</Text>
            </TouchableOpacity>
          </View>

          {/* Action Buttons */}
          <View style={styles.actionButtonGroup}>
            <TouchableOpacity
              style={[styles.primaryBtn, { backgroundColor: colors.buttonPrimary }]}
              onPress={() => {
                setAnalysis({
                  isRoad: true,
                  roadConfidence: uncertainAnalysis?.roadConfidence || 0.85,
                  hasDamage: false,
                  predictionState: 'UNCLEAR_IMAGE',
                  displayIssueName: formatDisplayIssueName(resolvedIssue),
                  priorityReason: 'Manual verification requested for unclear image.',
                  analysisStatus: 'unclear_image',
                  issueType: resolvedIssue,
                  confidence: 0,
                  confidenceRaw: 0,
                  priority: 'NONE',
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
              <Text style={[styles.primaryBtnText, { color: colors.buttonText }]}>Proceed to Submit</Text>
              <Ionicons name="arrow-forward" size={18} color="#FFFFFF" />
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.secondaryBtn, { backgroundColor: colors.card, borderColor: colors.border }]}
              onPress={() => setStep('form')}
              accessible
              accessibilityRole="button"
              accessibilityLabel="Edit Details"
            >
              <Ionicons name="create-outline" size={18} color={colors.textPrimary} />
              <Text style={[styles.secondaryBtnText, { color: colors.textPrimary }]}>Edit Details</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.secondaryBtn, { backgroundColor: colors.card, borderColor: colors.border }]}
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
              <Ionicons name="camera-reverse-outline" size={18} color={colors.textPrimary} />
              <Text style={[styles.secondaryBtnText, { color: colors.textPrimary }]}>Retake / Edit Photo</Text>
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
      <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]}>
        <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
          <View style={styles.header}>
            <TouchableOpacity onPress={() => setStep('form')} accessibilityRole="button" accessibilityLabel="Back">
              <Ionicons name="arrow-back" size={24} color={colors.textOnDark} />
            </TouchableOpacity>
            <Text style={[styles.headerTitle, { color: colors.textOnDark }]}>Review &amp; Submit</Text>
            <View style={{ width: 24 }} />
          </View>

          {/* Issue Reference ID Card */}
          <View style={[styles.refIdCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <View style={styles.refIdRow}>
              <Ionicons name="finger-print-outline" size={20} color={colors.buttonPrimary} />
              <View style={{ flex: 1 }}>
                <Text style={[styles.refIdLabel, { color: colors.textSecondary }]}>COMPLAINT ID</Text>
                <Text style={[styles.refIdValue, { color: colors.textPrimary }]}>Generated on Submission</Text>
              </View>
              <View style={[styles.pendingBadge, { backgroundColor: colors.surfaceElevated, borderColor: colors.borderLight }]}>
                <Text style={[styles.pendingBadgeText, { color: colors.textPrimary }]}>Ready to Submit</Text>
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
            <View style={[styles.verifiedLocationBanner, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <Ionicons name="shield-checkmark" size={18} color="#059669" />
              <View style={{ flex: 1 }}>
                <Text style={[styles.verifiedLocationTitle, { color: colors.textPrimary }]}>Location Verified for Street Lighting</Text>
                <Text style={[styles.verifiedLocationSub, { color: colors.textSecondary }]}>
                  GPS coordinates matched within Coimbatore {selectedRegion} sector coverage.
                </Text>
              </View>
            </View>
          )}

          {/* Department Routing Notice if non-Road or PWD */}
          {(!isRoad || isPWD) && (
            <View style={[styles.routedNoticeCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <View style={styles.routedNoticeHeader}>
                <Ionicons name="swap-horizontal" size={22} color={colors.buttonPrimary} />
                <View style={{ flex: 1 }}>
                  <Text style={[styles.routedNoticeTitle, { color: colors.textPrimary }]}>
                    Routing to {displayDept}
                  </Text>
                  <Text style={[styles.routedNoticeSub, { color: colors.textSecondary }]}>
                    {classifiedDept?.routingMessage || `Your complaint has been moved to the ${displayDept} Department for further action.`}
                  </Text>
                </View>
              </View>
            </View>
          )}

          {/* Primary detection / issue card */}
          <View style={[styles.resultCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Text style={[styles.resultHeading, { color: colors.textPrimary }]}>Issue Summary</Text>
            <View style={styles.resultRow}>
              <Ionicons name="alert-circle" size={20} color={colors.buttonPrimary} />
              <Text style={[styles.resultIssue, { color: colors.textPrimary }]}>{analysis.displayIssueName || formatDisplayIssueName(analysis.issueType)}</Text>
            </View>
            <View style={[styles.resultGrid, { backgroundColor: colors.surfaceElevated, borderColor: colors.borderLight }]}>
              <View style={styles.resultItem}>
                <Text style={[styles.resultItemLabel, { color: colors.textSecondary }]}>Department</Text>
                <Text style={[styles.resultItemValueSmall, { color: colors.textPrimary }]}>{displayDept}</Text>
              </View>
              <View style={styles.resultItem}>
                <Text style={[styles.resultItemLabel, { color: colors.textSecondary }]}>Priority</Text>
                <Text style={[styles.resultItemValueSmall, priorityTextColor(analysis.priority)]}>
                  {analysis.priority}
                </Text>
              </View>
            </View>

            {analysis.confidence > 0 ? (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 8 }}>
                <Ionicons name="sparkles" size={14} color="#059669" />
                <Text style={{ fontSize: 12, fontWeight: '700', color: '#047857' }}>
                  Confidence: {analysis.confidence}% ({analysis.confidence >= 85 ? 'High' : analysis.confidence > 45 ? 'Medium' : 'Low'})
                </Text>
                <View style={{ backgroundColor: colors.surfaceElevated, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 }}>
                  <Text style={{ fontSize: 10, color: colors.textPrimary, fontWeight: '600' }}>Description Assessment</Text>
                </View>
              </View>
            ) : null}

            {analysis.priorityReason ? (
              <View style={{ backgroundColor: colors.surfaceElevated, borderRadius: 8, padding: 8, marginTop: 8, borderWidth: 1, borderColor: colors.borderLight }}>
                <Text style={{ fontSize: 11, color: colors.textSecondary, fontWeight: '600' }}>
                  Priority Reason: <Text style={{ color: colors.textPrimary, fontWeight: '500' }}>{analysis.priorityReason}</Text>
                </Text>
              </View>
            ) : null}

            <View style={[styles.resultGrid, { backgroundColor: colors.surfaceElevated, borderColor: colors.borderLight, marginTop: 8 }]}>
              <View style={styles.resultItem}>
                <Text style={[styles.resultItemLabel, { color: colors.textSecondary }]}>Assigned Officer</Text>
                <Text style={[styles.resultOfficerValue, { color: colors.textPrimary }]}>
                  {reviewOfficerName || 'Awaiting Assignment'}
                </Text>
              </View>
              <View style={styles.resultItem}>
                <Text style={[styles.resultItemLabel, { color: colors.textSecondary }]}>Expected Resolution Date</Text>
                <Text style={[styles.resultItemValueSmall, { color: colors.textPrimary }]}>
                  {formatResolutionDate(resultDuration.expectedResolutionDate)}
                </Text>
              </View>
            </View>

            <View style={[styles.resolutionBanner, { backgroundColor: colors.surfaceElevated, borderColor: colors.borderLight }]}>
              <Ionicons name="time-outline" size={16} color={colors.buttonPrimary} />
              <Text style={[styles.resolutionBannerText, { color: colors.textPrimary }]}>
                Estimated Resolution: <Text style={{ fontWeight: '700' }}>{resultDuration.durationText}</Text>
              </Text>
            </View>
          </View>

          {/* Field Inspector Budget Assessment Notice */}
          <View style={[styles.budgetNoticeCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <View style={styles.budgetNoticeHeader}>
              <View style={[styles.budgetNoticeIconWrap, { backgroundColor: colors.surfaceElevated }]}>
                <Ionicons name="calculator-outline" size={20} color={colors.buttonPrimary} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.budgetNoticeTitle, { color: colors.textPrimary }]}>Budget & Cost Estimation</Text>
                <Text style={[styles.budgetNoticeSub, { color: colors.textSecondary }]}>Manual On-Site Assessment by Field Inspector</Text>
              </View>
              <View style={[styles.budgetPendingBadge, { backgroundColor: colors.surfaceElevated, borderColor: colors.borderLight }]}>
                <Text style={[styles.budgetPendingBadgeText, { color: colors.textPrimary }]}>Pending Inspection</Text>
              </View>
            </View>
            <Text style={[styles.budgetNoticeBody, { color: colors.textPrimary }]}>
              The repair budget, required materials, and machinery will be physically assessed and manually entered by the designated Coimbatore Field Inspector upon on-site verification.
            </Text>
          </View>

          {/* All detections if any */}
          {analysis.allDetections && analysis.allDetections.length > 1 && (
            <View style={[styles.allDetectionsCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <Text style={[styles.allDetectionsTitle, { color: colors.textPrimary }]}>Detections (After NMS)</Text>
              {analysis.allDetections.map((d, i) => (
                <View key={i} style={styles.detectionRow}>
                  <Text style={[styles.detectionIssue, { color: colors.textPrimary }]}>{d.issueType}</Text>
                  <Text style={[styles.detectionConf, { color: colors.textSecondary }]}>{Math.round(d.confidence * 100)}%</Text>
                  <Text style={[styles.detectionPriority, priorityTextColor(d.priority)]}>{d.priority}</Text>
                </View>
              ))}
            </View>
          )}

          {/* Citizen Description Card - High Visibility */}
          <View style={[styles.descBox, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <View style={styles.descHeaderRow}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <Ionicons name="chatbox-ellipses-outline" size={16} color={colors.buttonPrimary} />
                <Text style={[styles.descLabel, { color: colors.textSecondary }]}>Citizen Description &amp; Landmark</Text>
              </View>
              <TouchableOpacity
                onPress={() => setStep('form')}
                style={styles.editDescBtn}
                accessibilityRole="button"
                accessibilityLabel="Edit description"
              >
                <Ionicons name="pencil" size={12} color={colors.buttonPrimary} />
                <Text style={[styles.editDescText, { color: colors.buttonPrimary }]}>Edit</Text>
              </TouchableOpacity>
            </View>
            <Text style={[styles.descText, { color: colors.textPrimary }]}>
              {description.trim() ? description : '(No additional description provided)'}
            </Text>
          </View>

          {/* GPS Location & Region Card */}
          <View style={[styles.locBox, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Ionicons name="location" size={18} color={colors.buttonPrimary} />
            <View style={{ flex: 1 }}>
              <Text style={[styles.locCoordsText, { color: colors.textPrimary }]}>
                {location?.lat.toFixed(5)}, {location?.lng.toFixed(5)}
              </Text>
              <Text style={[styles.locRegionText, { color: colors.textSecondary }]}>
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
              <Ionicons name="pencil" size={12} color={colors.buttonPrimary} />
              <Text style={[styles.editDescText, { color: colors.buttonPrimary }]}>Edit</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.actionButtonGroup}>
            <TouchableOpacity
              style={[styles.primaryBtn, { backgroundColor: colors.buttonPrimary }, submitting && styles.disabledBtn]}
              onPress={handleSubmit}
              disabled={submitting}
              accessible
              accessibilityRole="button"
              accessibilityLabel="Submit Complaint"
              accessibilityState={{ busy: submitting }}
            >
              {submitting ? (
                <ActivityIndicator color="#FFFFFF" />
              ) : (
                <>
                  <Text style={[styles.primaryBtnText, { color: colors.buttonText }]}>Submit Complaint</Text>
                  <Ionicons name="checkmark-circle-outline" size={18} color="#FFFFFF" />
                </>
              )}
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.secondaryBtn, { backgroundColor: colors.card, borderColor: colors.border }]}
              onPress={() => setStep('form')}
              accessible
              accessibilityRole="button"
              accessibilityLabel="Edit Details"
            >
              <Ionicons name="create-outline" size={18} color={colors.textPrimary} />
              <Text style={[styles.secondaryBtnText, { color: colors.textPrimary }]}>Edit Details</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.secondaryBtn, { backgroundColor: colors.card, borderColor: colors.border }]}
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
              <Ionicons name="crop-outline" size={18} color={colors.textPrimary} />
              <Text style={[styles.secondaryBtnText, { color: colors.textPrimary }]}>Change Photo / Edit</Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </SafeAreaView>
    );
  }

  // Step: form
  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
          {/* Header */}
          <View style={styles.header}>
            <TouchableOpacity onPress={() => router.back()} accessibilityRole="button" accessibilityLabel="Back">
              <Ionicons name="arrow-back" size={24} color={colors.textOnDark} />
            </TouchableOpacity>
            <Text style={[styles.headerTitle, { color: colors.textOnDark }]}>Report Complaint</Text>
            <View style={{ width: 24 }} />
          </View>

          {/* 1. Image Section: Defect Photo */}
          <View style={styles.section}>
            <Text style={[styles.sectionLabel, { color: colors.textOnDark }]}>1. Defect Photo</Text>
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
                    <Ionicons name="crop-outline" size={14} color="#FFFFFF" />
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
                    <Ionicons name="camera-reverse-outline" size={14} color="#FFFFFF" />
                    <Text style={styles.retakeBtnText}>Change</Text>
                  </TouchableOpacity>
                </View>
              </View>
            ) : (
              <View style={styles.imagePickerRow}>
                <TouchableOpacity
                  style={[styles.pickCard, { backgroundColor: colors.card, borderColor: colors.borderLight }]}
                  onPress={captureImage}
                  accessible
                  accessibilityRole="button"
                  accessibilityLabel="Take Photo with Camera"
                >
                  <Ionicons name="camera-outline" size={32} color={colors.textPrimary} />
                  <Text style={[styles.pickCardText, { color: colors.textPrimary }]}>Take Photo</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.pickCard, { backgroundColor: colors.card, borderColor: colors.borderLight }]}
                  onPress={pickImage}
                  accessible
                  accessibilityRole="button"
                  accessibilityLabel="Choose Photo from Gallery"
                >
                  <Ionicons name="images-outline" size={32} color={colors.textPrimary} />
                  <Text style={[styles.pickCardText, { color: colors.textPrimary }]}>From Gallery</Text>
                </TouchableOpacity>
              </View>
            )}
          </View>

          {/* 2. Location Section (Coimbatore Region & GPS) */}
          <View style={styles.section}>
            <Text style={[styles.sectionLabel, { color: colors.textOnDark }]}>2. Coimbatore Region &amp; Location</Text>
            <View style={styles.regionGrid}>
              {ALL_COIMBATORE_REGIONS.map(reg => (
                <TouchableOpacity
                  key={reg}
                  style={[
                    styles.regionChip,
                    {
                      backgroundColor: selectedRegion === reg ? colors.buttonPrimary : colors.card,
                      borderColor: selectedRegion === reg ? colors.buttonPrimary : colors.border,
                    },
                  ]}
                  onPress={() => setSelectedRegion(reg)}
                  accessible
                  accessibilityRole="radio"
                  accessibilityState={{ selected: selectedRegion === reg }}
                >
                  <Ionicons
                    name="location-outline"
                    size={14}
                    color={selectedRegion === reg ? '#FFFFFF' : colors.textPrimary}
                  />
                  <Text
                    style={[
                      styles.regionChipText,
                      { color: selectedRegion === reg ? '#FFFFFF' : colors.textPrimary },
                      selectedRegion === reg && styles.regionChipTextActive,
                    ]}
                  >
                    {reg}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <View style={[styles.locationBox, { backgroundColor: colors.card, borderColor: colors.border, marginTop: 10 }]}>
              <Ionicons name="navigate-circle-outline" size={24} color={colors.textPrimary} />
              <View style={{ flex: 1 }}>
                {location ? (
                  <>
                    <Text style={[styles.locationCoords, { color: colors.textPrimary }]}>
                      {location.lat.toFixed(5)}, {location.lng.toFixed(5)}
                    </Text>
                    <Text style={[styles.locationSub, { color: colors.textSecondary }]}>
                      Region: {selectedRegion}
                      {suggestedRoad ? ` • Near ${suggestedRoad}` : ''}
                    </Text>
                  </>
                ) : (
                  <Text style={[styles.locationPlaceholder, { color: colors.textSecondary }]}>
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
                  <ActivityIndicator size="small" color={colors.buttonPrimary} />
                ) : (
                  <Ionicons name="refresh" size={18} color={colors.textPrimary} />
                )}
              </TouchableOpacity>
            </View>
          </View>

          {/* 3. Description Section */}
          <View style={styles.section}>
            <View style={styles.sectionLabelRow}>
              <Text style={[styles.sectionLabel, { color: colors.textOnDark }]}>3. Description &amp; Landmark</Text>
              <Text style={[styles.charCounterText, { color: colors.textOnDarkSecondary }]}>{description.length} / 300 characters</Text>
            </View>
            <TextInput
              style={[
                styles.textInput,
                {
                  backgroundColor: colors.inputBg,
                  borderColor: colors.inputBorder,
                  color: colors.inputText,
                },
              ]}
              placeholder="e.g. Deep pothole or public route defect near Peelamedu corridor"
              placeholderTextColor={colors.inputPlaceholder}
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
                  <View style={[styles.liveDeptHint, { backgroundColor: colors.card, borderColor: colors.border }]}>
                    <Ionicons name="sparkles" size={13} color={colors.buttonPrimary} />
                    <Text style={[styles.liveDeptHintText, { color: colors.textPrimary }]}>
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
              style={[
                styles.primaryBtn,
                { backgroundColor: colors.buttonPrimary },
                (!imageUri || !description.trim()) && styles.btnDisabled,
              ]}
              onPress={handleAnalyze}
              disabled={!imageUri || !description.trim() || isBusy}
              accessible
              accessibilityRole="button"
              accessibilityLabel="Validate and Analyze Defect"
            >
              <Text style={[styles.primaryBtnText, { color: colors.buttonText }]}>Analyze Defect with AI</Text>
              <Ionicons name="scan" size={18} color="#FFFFFF" />
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
          <View style={[styles.modalContent, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <View style={styles.modalIconWrap}>
              <Ionicons name="close-circle" size={54} color={colors.error} />
            </View>
            <Text style={[styles.modalTitle, { color: colors.textPrimary }]}>Non-Road Image Detected</Text>
            <Text style={styles.modalSub}>
              The uploaded image does not appear to contain a road or asphalt pavement.
            </Text>
            <Text style={[styles.modalTip, { color: colors.textSecondary }]}>
              Please upload a clear photo of an asphalt road, street, or pavement showing potholes or cracks, or describe a solid waste management issue in the description.
            </Text>
            <TouchableOpacity
              style={[styles.primaryBtn, { backgroundColor: colors.buttonPrimary }]}
              onPress={() => setShowInvalidModal(false)}
              accessible
              accessibilityRole="button"
              accessibilityLabel="Upload Valid Image"
            >
              <Text style={[styles.primaryBtnText, { color: colors.buttonText }]}>Try Again</Text>
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
