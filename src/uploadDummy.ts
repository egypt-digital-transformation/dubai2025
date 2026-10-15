// uploadData.ts
import { initializeApp } from 'firebase/app';
import { getFirestore, collection, addDoc, Timestamp } from 'firebase/firestore';
import data from './assets/data/trial.json'; 

// Your Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyBamzLLaALQlR0nkN5nlIttLt-XmdFF1J0",
  authDomain: "mea-egypt-ahlanapp-prd.firebaseapp.com",
  projectId: "mea-egypt-ahlanapp-prd",
  storageBucket: "mea-egypt-ahlanapp-prd.firebasestorage.app",
  messagingSenderId: "107201585408",
  appId: "1:107201585408:web:45f4aaa5690d72e5a693e5",
  measurementId: "G-MNX0Y34XMN"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

// Convert ISO string to Firestore Timestamp
const convertToTimestamp = (isoString: string): Timestamp => {
  return Timestamp.fromDate(new Date(isoString));
};

// Upload sessions
const uploadSessions = async () => {
  try {
    const sessionsCollection = collection(db, 'sessions');

    for (const session of data.sessions) {
      // Convert startTime/endTime if they exist
      const sessionData: any = { ...session };

      if (session.startTime) sessionData.startTime = convertToTimestamp(session.startTime);
      if (session.endTime) sessionData.endTime = convertToTimestamp(session.endTime);

type RotationalSchedule = {
  [group: string]: { startTime: string; endTime: string };
};

if (session.rotationalSchedule) {
  const schedule: RotationalSchedule = session.rotationalSchedule;
  sessionData.rotationalSchedule = {};
  for (const group in schedule) {
    sessionData.rotationalSchedule[group] = {
      startTime: convertToTimestamp(schedule[group].startTime),
      endTime: convertToTimestamp(schedule[group].endTime)
    };
  }
}

      const docRef = await addDoc(sessionsCollection, sessionData);
      console.log(`✅ Session added: ${session.title} (ID: ${docRef.id})`);
    }

    console.log(`\n🎉 Uploaded ${data.sessions.length} sessions successfully!`);
  } catch (error) {
    console.error('❌ Error uploading sessions:', error);
  }
};

// Upload users
const uploadUsers = async () => {
  try {
    const usersCollection = collection(db, 'users');

    for (const user of data.users) {
      const docRef = await addDoc(usersCollection, user);
      console.log(`✅ User added: ${user.firstName} ${user.lastName} (ID: ${docRef.id})`);
    }

    console.log(`\n🎉 Uploaded ${data.users.length} users successfully!`);
  } catch (error) {
    console.error('❌ Error uploading users:', error);
  }
};

// Run uploads sequentially
const uploadAll = async () => {
  await uploadUsers();
  await uploadSessions();
};

uploadAll();
