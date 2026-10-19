import { HttpsError } from "firebase-functions/v2/https";
import { db } from "./firebase.js";

export function requireAuthenticatedUser(request) {
  if (!request.auth?.uid || !request.auth.token.email) {
    throw new HttpsError("unauthenticated", "Sign in to continue.");
  }

  return {
    uid: request.auth.uid,
    email: request.auth.token.email,
  };
}

export async function requireAdminIdentity(user) {
  if (!user?.uid || !user.email) {
    throw new HttpsError("unauthenticated", "Sign in to continue.");
  }

  const email = user.email.trim().toLowerCase();
  const adminSnapshot = await db.collection("admins").doc(email).get();
  if (!adminSnapshot.exists || adminSnapshot.data()?.active !== true) {
    throw new HttpsError("permission-denied", "Administrator access is required.");
  }

  return { uid: user.uid, email: user.email };
}

export async function requireAdminUser(request) {
  return requireAdminIdentity(requireAuthenticatedUser(request));
}
