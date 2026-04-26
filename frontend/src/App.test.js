import { render, screen } from "@testing-library/react";
import App from "./App";

test("renders auth heading", () => {
  render(<App />);
  expect(screen.getByText(/QUANTX/i)).toBeInTheDocument();
  expect(screen.getByRole("button", { name: /Login/i })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: /Register/i })).toBeInTheDocument();
});
