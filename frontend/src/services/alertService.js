import Swal from "sweetalert2";

const baseToast = {
  toast: true,
  position: "top-end",
  showConfirmButton: false,
  timer: 2200,
  timerProgressBar: true,
};

const inferIcon = (message = "") => {
  const text = String(message).toLowerCase();
  if (text.includes("fail") || text.includes("error") || text.includes("could not") || text.includes("unable")) return "error";
  if (text.includes("warn") || text.includes("offline")) return "warning";
  return "success";
};

export const showToast = (message, icon) => {
  if (!message) return;
  Swal.fire({ ...baseToast, icon: icon || inferIcon(message), title: message.replace(/^✓\s*/, "").replace(/^✗\s*/, "") });
};

export const showError = (title, text = "") =>
  Swal.fire({ icon: "error", title, text, confirmButtonColor: "#3b82f6" });
