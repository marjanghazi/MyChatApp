import admin from "firebase-admin";

let app;

const buildCredential = () => {
  const projectId = process.env.FIREBASE_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n");

  if (!projectId || !clientEmail || !privateKey) {
    return null;
  }

  return admin.credential.cert({
    projectId,
    clientEmail,
    privateKey,
  });
};

export const getFirebaseAdmin = () => {
  if (app) {
    return app;
  }

  const credential = buildCredential();
  app = credential
    ? admin.initializeApp({ credential })
    : admin.initializeApp();

  return app;
};

export const getFirestore = () => getFirebaseAdmin().firestore();
