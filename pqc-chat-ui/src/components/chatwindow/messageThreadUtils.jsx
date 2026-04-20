export const conversationIdFor = (uidA, uidB) => [uidA, uidB].sort().join("_");

export const formatTime = (dateValue) => {
  if (!dateValue) return "";
  const date = typeof dateValue?.toDate === "function" ? dateValue.toDate() : new Date(dateValue);
  return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
};

export const formatDate = (dateValue) => {
  if (!dateValue) return "";
  const date = typeof dateValue?.toDate === "function" ? dateValue.toDate() : new Date(dateValue);
  const now = new Date();
  const diff = now - date;
  if (diff < 86400000) return "Today";
  if (diff < 172800000) return "Yesterday";
  return date.toLocaleDateString([], { month: "short", day: "numeric" });
};
