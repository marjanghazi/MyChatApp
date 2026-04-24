export const toDate = (v) =>
  !v ? null : typeof v?.toDate === "function" ? v.toDate() : new Date(v);

export const formatTime = (dateValue) => {
  const d = toDate(dateValue);
  if (!d) return "";
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
};

export const formatDate = (dateValue) => {
  const d = toDate(dateValue);
  if (!d) return "";
  const diff = Date.now() - d.getTime();
  if (diff < 86_400_000) return "Today";
  if (diff < 172_800_000) return "Yesterday";
  return d.toLocaleDateString([], { month: "short", day: "numeric" });
};

export const formatCallTime = (dateValue) => {
  const d = toDate(dateValue);
  if (!d) return "";
  const diff = Date.now() - d.getTime();
  if (diff < 60_000) return "Just now";
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)} min ago`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
  if (diff < 604_800_000) return `${Math.floor(diff / 86_400_000)}d ago`;
  return d.toLocaleDateString([], { month: "short", day: "numeric" });
};

export const formatCallDuration = (seconds) => {
  if (!seconds || seconds <= 0) return "";
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
};

export const conversationIdFor = (uidA, uidB) => [uidA, uidB].sort().join("_");

export const getCallIcon = (log) => {
  if (log.status === "missed") return "📵";
  if (log.status === "cancelled") return "↩️";
  if (log.type === "video") return log.direction === "outgoing" ? "📹" : "🎥";
  return log.direction === "outgoing" ? "📞" : "📲";
};

export const getCallStatusText = (log) => {
  if (log.status === "missed") return "Missed call";
  if (log.status === "cancelled") return "Cancelled";
  if (log.status === "completed") {
    const d = formatCallDuration(log.duration || 0);
    return d ? `${d}` : "Completed";
  }
  return log.direction === "outgoing" ? "Outgoing" : "Incoming";
};
