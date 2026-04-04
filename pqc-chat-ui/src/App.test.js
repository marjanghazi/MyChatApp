import { render, screen } from "@testing-library/react";
import App from "./App";

test("renders auth heading", () => {
  render(<App />);
  expect(screen.getByText(/MyChatApp/i)).toBeInTheDocument();
});