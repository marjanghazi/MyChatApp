import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { getStorage } from "firebase/storage";

const projectId = process.env.REACT_APP_FIREBASE_PROJECT_ID || "mychatapp-bf8a9";

const firebaseConfig = {
  apiKey: process.env.REACT_APP_FIREBASE_API_KEY || "AIzaSyC9KhnJMrP_PfNm1Zc9cTKSFy2HzBwpCT4",
  authDomain: process.env.REACT_APP_FIREBASE_AUTH_DOMAIN || "mychatapp-bf8a9.firebaseapp.com",
  projectId,
  // New Firebase projects commonly use <project-id>.firebasestorage.app.
  // If your project uses appspot.com, set REACT_APP_FIREBASE_STORAGE_BUCKET in .env
  storageBucket: process.env.REACT_APP_FIREBASE_STORAGE_BUCKET || `${projectId}.firebasestorage.app`,
  messagingSenderId: process.env.REACT_APP_FIREBASE_MESSAGING_SENDER_ID || "982846048098",
  appId: process.env.REACT_APP_FIREBASE_APP_ID || "1:982846048098:web:a48c47233f66cee84a8e3b",
  measurementId: process.env.REACT_APP_FIREBASE_MEASUREMENT_ID || "G-3H5EHGZ76H",
};

const app = initializeApp(firebaseConfig);

export const auth = getAuth(app);
export const db = getFirestore(app);
export const storage = getStorage(app);
