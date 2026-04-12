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
    deleteDoc: jest.fn(),
    doc: jest.fn(),
    getDocs: jest.fn(async () => ({ empty: true, docs: [], forEach: jest.fn() })),
    increment: jest.fn(),
    onSnapshot: jest.fn(),
    orderBy: jest.fn(),
    query: jest.fn(),
    serverTimestamp: jest.fn(),
    setDoc: jest.fn(),
    updateDoc: jest.fn(),
    where: jest.fn(),
    writeBatch: jest.fn(() => ({ update: jest.fn(), commit: jest.fn() })),
  }),
  { virtual: true }
);

jest.mock(
  "firebase/storage",
  () => ({
    deleteObject: jest.fn(),
    getDownloadURL: jest.fn(),
    ref: jest.fn(),
    uploadBytesResumable: jest.fn(() => ({
      on: (_evt, _progress, _error, done) => done(),
      snapshot: { ref: {} },
    })),
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
  expect(screen.getByText(/QUANTX/i)).toBeInTheDocument();
  expect(screen.getByRole("button", { name: /Login/i })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: /Register/i })).toBeInTheDocument();
});