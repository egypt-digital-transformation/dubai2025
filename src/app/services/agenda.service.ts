import { Injectable } from '@angular/core';
import {
  Firestore,
  collection,
  doc,
  setDoc,
  getDocs,
  getDoc,
  query,
  where,
  CollectionReference,
} from '@angular/fire/firestore';
import { AuthService } from './auth.service';

interface Session {
  id: string;
  title: string;
  startTime: any;
  endTime: any;
  location: string;
  day: string;
  category?: string;
  rotationalSchedule?: Record<string, { startTime: string; endTime: string }>;
  reminderSent?: boolean;
}

@Injectable({
  providedIn: 'root',
})
export class AgendaService {
  constructor(private firestore: Firestore, private authService: AuthService) {}

  /** Generate a personalized agenda for the authenticated user */
async generateUserAgenda(): Promise<void> {
  const user = this.authService.currentUser;
  if (!user?.email) return;

  const userEmail = user.email.toLowerCase();

  // 1️⃣ Fetch user doc
  const usersRef = collection(this.firestore, 'users');
  const q = query(usersRef, where('email', '==', userEmail));
  const userDocs = await getDocs(q);
  if (userDocs.empty) return;

  const userDocSnap = userDocs.docs[0];
  const userData = userDocSnap.data() as any;

  // 2️⃣ Fetch all sessions
  const sessionsRef = collection(this.firestore, 'sessions') as CollectionReference<Session>;
  const sessionDocs = await getDocs(sessionsRef);

  // 3️⃣ Build personalized agenda
  const personalizedSessions: Session[] = [];

  sessionDocs.forEach((docSnap) => {
    const s = docSnap.data();
    const dayKey = `day${s.day}`;
    const dayInfo = userData[dayKey];

    let includeSession = false;
    let startTime = s.startTime;
    let endTime = s.endTime;

    // --- Include all general sessions ---
    if (!s.category || s.category === 'general') {
      includeSession = true;
    }

    // --- Include workshops for the user's group ---
    if (s.category === 'workshop' && s.rotationalSchedule && dayInfo?.group) {
      const groupTiming = s.rotationalSchedule[`group${dayInfo.group}`];
      if (groupTiming) {
        startTime = groupTiming.startTime;
        endTime = groupTiming.endTime;
        includeSession = true;
      }
    }

    // --- Include site visits for SV users ---
    if (s.category === 'site visit' && dayInfo?.groupAM === 'SV') {
      includeSession = true;
    }

    // --- Add to personalized agenda ---
    if (includeSession) {
      personalizedSessions.push({
        id: docSnap.id,
        title: s.title || 'Untitled Session',
        startTime,
        endTime,
        location: s.location || 'TBD',
        day: s.day,
        category: s.category,
        reminderSent: false,
      });
    }
  });

  // 4️⃣ Save to user's agenda collection
  const userAgendaRef = collection(this.firestore, `users/${userDocSnap.id}/agenda`);
  for (const session of personalizedSessions) {
    const agendaDoc = doc(userAgendaRef, session.id);
    const existingAgendaDoc = await getDoc(agendaDoc);
    await setDoc(
      agendaDoc,
      {
        ...session,
        reminderSent: existingAgendaDoc.data()?.['reminderSent'] === true,
      },
      { merge: true }
    );
  }

  console.log(`[AgendaService] ✅ Saved ${personalizedSessions.length} sessions to ${userEmail}'s agenda`);
}
}
