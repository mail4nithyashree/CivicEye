import { initializeApp } from 'firebase/app';
import { getAuth, signInWithEmailAndPassword } from 'firebase/auth';
import { getFirestore, collection, addDoc, serverTimestamp } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: "AIzaSyD2SIXmgD8xgYvdFMG0ZryGF3F5tgYOlGs",
  authDomain: "civiceye-c127c.firebaseapp.com",
  projectId: "civiceye-c127c",
  storageBucket: "civiceye-c127c.firebasestorage.app",
  messagingSenderId: "930740300088",
  appId: "1:930740300088:web:aa1eb5f0cc91edd068a919",
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

async function testNotif() {
  const testEmail = 'citizen1@civiceye.demo';
  const testPassword = 'Password@123';
  const userCred = await signInWithEmailAndPassword(auth, testEmail, testPassword);
  const user = userCred.user;
  console.log('Authenticated citizen UID:', user.uid);

  const tests = [
    { name: 'Plain notif with userId only', data: { userId: user.uid, title: 'Test 1', message: 'msg', createdAt: serverTimestamp() } },
    { name: 'Notif with recipientId only', data: { recipientId: user.uid, title: 'Test 2', message: 'msg', createdAt: serverTimestamp() } },
    { name: 'Notif with both userId and recipientId', data: { userId: user.uid, recipientId: user.uid, title: 'Test 3', message: 'msg', createdAt: serverTimestamp() } },
    { name: 'Notif with recipientRole', data: { recipientRole: 'citizen', userId: user.uid, title: 'Test 4', message: 'msg', createdAt: serverTimestamp() } },
    { name: 'Notif for inspector with recipientRole', data: { recipientRole: 'field_inspector', title: 'Test 5', message: 'msg', createdAt: serverTimestamp() } },
  ];

  for (const t of tests) {
    try {
      const ref = await addDoc(collection(db, 'notifications'), t.data);
      console.log(`✅ SUCCESS [${t.name}]: Doc ID: ${ref.id}`);
    } catch (err) {
      console.log(`❌ FAILED [${t.name}]: ${err.message}`);
    }
  }
}

testNotif().then(() => process.exit(0)).catch(e => {
  console.error(e);
  process.exit(1);
});
