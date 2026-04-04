import { render, screen } from "@testing-library/react";

jest.mock(
  "firebase/auth",
  () => ({
    createUserWithEmailAndPassword: jest.fn(),
    onAuthStateChanged: jest.fn((_, cb) => {
      cb(null);
      return jest.fn();
    }),
    signInWithEmailAndPassword: jest.fn(),
    signOut: jest.fn(),
    updateProfile: jest.fn(),
  }),
  { virtual: true }
);

jest.mock(
  "firebase/firestore",
  () => ({
    addDoc: jest.fn(),
    arrayUnion: jest.fn(),
    collection: jest.fn(),
    doc: jest.fn(),
    getDoc: jest.fn(),
    increment: jest.fn(),
    onSnapshot: jest.fn(),
    orderBy: jest.fn(),
    query: jest.fn(),
    serverTimestamp: jest.fn(),
    setDoc: jest.fn(),
    updateDoc: jest.fn(),
    where: jest.fn(),
  }),
  { virtual: true }
);

jest.mock(
  "firebase/storage",
  () => ({
    getDownloadURL: jest.fn(),
    ref: jest.fn(),
    uploadBytes: jest.fn(),
  }),
  { virtual: true }
);

jest.mock("./firebase", () => ({
  auth: {},
  db: {},
  storage: {},
}));

import App from "./App";

test("renders auth heading", () => {
  render(<App />);
  expect(screen.getByText(/MyChatApp/i)).toBeInTheDocument();
});