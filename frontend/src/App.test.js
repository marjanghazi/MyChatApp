import { fireEvent, render, screen } from "@testing-library/react";
import App from "./App";

// Avoid importing SweetAlert's browser stylesheet into JSDOM.
jest.mock('./services/alertService', () => ({ showToast: jest.fn(), showError: jest.fn(), showSuccess: jest.fn(), showConfirm: jest.fn() }));

test("landing page explains the migration and opens sign-in", () => {
  render(<App />);
  expect(screen.getByRole('heading', { name: /Secure Communication for the Post-Quantum Era/i })).toBeInTheDocument();
  expect(screen.getByText(/Direct messages and their attachments are encrypted in your browser/i)).toBeInTheDocument();
  fireEvent.click(screen.getAllByRole('button', { name: /sign in/i })[0]);
  expect(screen.getByLabelText(/email/i)).toBeInTheDocument();
});
