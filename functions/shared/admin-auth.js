import { HttpsError } from "firebase-functions/v2/https";

export function requireAuthenticatedUser(request) {
  if (!request.auth?.uid || !request.auth.token.email) {
    throw new HttpsError("unauthenticated", "Sign in to continue.");
  }

  return {
    uid: request.auth.uid,
    email: request.auth.token.email,
  };
}
