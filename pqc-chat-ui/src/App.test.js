import { render, screen } from "@testing-library/react";

jest.mock("./services/firebaseCompat", () => ({
  addDoc: jest.fn(),
  arrayRemove: jest.fn(),
  arrayUnion: jest.fn(),
  collection: jest.fn(),
  db: {},
  deleteDoc: jest.fn(),
  deleteObject: jest.fn(),
  doc: jest.fn(),
  getDocs: jest.fn(async () => ({ docs: [] })),
  getDownloadURL: jest.fn(),
  increment: jest.fn(),
  onSnapshot: jest.fn(() => jest.fn()),
  orderBy: jest.fn(),
  query: jest.fn(),
  ref: jest.fn(),
  serverTimestamp: jest.fn(),
  setDoc: jest.fn(),
  storage: {},
  updateDoc: jest.fn(),
  uploadBytesResumable: jest.fn(() => ({
    on: (_evt, onProgress, _error, done) => {
      onProgress?.({ bytesTransferred: 1, totalBytes: 1 });
      done?.();
    },
    snapshot: { ref: {} },
  })),
  where: jest.fn(),
  writeBatch: jest.fn(() => ({ update: jest.fn(), commit: jest.fn() })),
}));

import App from "./App";

test("renders auth heading", () => {
  render(<App />);
  expect(screen.getByText(/QUANTX/i)).toBeInTheDocument();
  expect(screen.getByRole("button", { name: /Login/i })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: /Register/i })).toBeInTheDocument();
});
