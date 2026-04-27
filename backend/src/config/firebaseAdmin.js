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
  const storageBucket =
    process.env.FIREBASE_STORAGE_BUCKET ||
    process.env.REACT_APP_FIREBASE_STORAGE_BUCKET ||
    undefined;
  const appOptions = {
    ...(credential ? { credential } : {}),
    ...(storageBucket ? { storageBucket } : {}),
  };

  app = admin.initializeApp(appOptions);

  return app;
};

export const getFirestore = () => getFirebaseAdmin().firestore();
