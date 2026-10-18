import { initializeApp } from 'firebase/app';
import { getAuth, signInWithEmailAndPassword } from 'firebase/auth';
import { getFirestore, collection, addDoc, serverTimestamp } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: "AIzaSyBhc69f1641f1CwYmHFU3JBed9EJxwIaAE",
  authDomain: "civiceye-21b88.firebaseapp.com",
  projectId: "civiceye-21b88",
  storageBucket: "civiceye-21b88.firebasestorage.app",
  messagingSenderId: "819267334108",
  appId: "1:819267334108:web:aa1eb5f0cc91edd068a919",
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

async function testFullComplaintDoc() {
  const testEmail = 'citizen.test.1790811454940@example.com';
  const testPassword = 'Password@123';

  console.log('1. Signing in as test citizen:', testEmail);
  const userCred = await signInWithEmailAndPassword(auth, testEmail, testPassword);
  const user = userCred.user;
  console.log('Citizen signed in with UID:', user.uid);

  console.log('2. Testing FULL complaint doc with status: "Submitted"...');
  const complaintDocData = {
    complaintId: `CE${Math.floor(1000 + Math.random() * 9000)}`,
    citizenId: user.uid,
    email: testEmail,
    citizenEmail: testEmail,
    imageUri: 'https://res.cloudinary.com/demo/image/upload/sample.jpg',
    description: 'Deep road crack found near water tank',
    lat: 11.0168,
    latitude: 11.0168,
    long: 76.9672,
    longitude: 76.9672,
    region: 'Gandhipuram',
    locationSource: 'current',
    locationAddress: 'Gandhipuram, Coimbatore',
    issueType: 'cracking',
    confidence: 85,
    priority: 'HIGH',
    severity: 'HIGH',
    department: 'Road Maintenance',
    responsibleDepartment: 'Coimbatore City Municipal Corporation (CCMC)',
    departmentCode: 'ROAD',
    departmentSource: 'ai',
    routingStatus: 'Direct',
    originalDepartment: 'Road Maintenance',
    roadValidationResult: 'road',
    roadValidationConfidence: 0.95,
    analysisStatus: 'damage_detected',
    AI_prediction: 'cracking',
    AI_confidence: 85,
    AI_validation: 'road',
    AI_timestamp: serverTimestamp(),
    status: 'Submitted',
    inspectionStatus: 'PENDING',
    statusHistory: [{
      id: `hist-${Date.now()}`,
      previousStatus: 'None',
      newStatus: 'Submitted',
      updatedBy: user.uid,
      updatedByName: 'Test Citizen',
      remarks: 'Complaint raised by citizen with AI analysis. Forwarded for Field Inspector on-site verification.',
      timestamp: new Date().toISOString(),
    }],
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };

  const docRef = await addDoc(collection(db, 'complaints'), complaintDocData);
  console.log('>>> SUCCESS! Full complaint created with ID:', docRef.id);
}

testFullComplaintDoc().then(() => process.exit(0)).catch(err => {
  console.error('FAILED:', err);
  process.exit(1);
});
