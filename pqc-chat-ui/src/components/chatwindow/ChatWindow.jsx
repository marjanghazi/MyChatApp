import { useEffect, useMemo, useRef, useState } from "react";
import "./chatwindow.css";
import data from "@emoji-mart/data";
import Picker from "@emoji-mart/react";
import {
  addDoc,
  arrayUnion,
  arrayRemove,
  collection,
  deleteDoc,
  doc,
  getDocs,
  increment,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  writeBatch,
} from "firebase/firestore";
import {
  deleteObject,
  getDownloadURL,
  ref,
  uploadBytesResumable,
} from "firebase/storage";
import { auth, db, storage } from "../../firebase";

const MAX_FILE_SIZE_BYTES = 15 * 1024 * 1024;
const THEMES = [
  { id: "default", label: "⚡ Quantum" },
  { id: "emerald", label: "🌿 Emerald" },
  { id: "midnight", label: "🌌 Midnight" },
  { id: "sunset", label: "🌅 Sunset" },
  { id: "cyber", label: "🔷 Cyber" },
];

// Only STUN here — for production across different networks you MUST add TURN servers.
// Without TURN, calls will fail on symmetric NAT (most mobile networks).
const ICE_SERVERS = {
  iceServers: [
    { urls: "stun:stun.l.google.com:19302" },
    { urls: "stun:stun1.l.google.com:19302" },
    { urls: "stun:stun2.l.google.com:19302" },
    { urls: "stun:stun3.l.google.com:19302" },
    { urls: "stun:stun4.l.google.com:19302" },
  ],
  iceCandidatePoolSize: 10,
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

const toDate = (v) =>
  !v ? null : typeof v?.toDate === "function" ? v.toDate() : new Date(v);

const formatTime = (dateValue) => {
  const d = toDate(dateValue);
  if (!d) return "";
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
};

const formatDate = (dateValue) => {
  const d = toDate(dateValue);
  if (!d) return "";
  const diff = Date.now() - d.getTime();
  if (diff < 86_400_000) return "Today";
  if (diff < 172_800_000) return "Yesterday";
  return d.toLocaleDateString([], { month: "short", day: "numeric" });
};

const formatCallTime = (dateValue) => {
  const d = toDate(dateValue);
  if (!d) return "";
  const diff = Date.now() - d.getTime();
  if (diff < 60_000) return "Just now";
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)} min ago`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
  if (diff < 604_800_000) return `${Math.floor(diff / 86_400_000)}d ago`;
  return d.toLocaleDateString([], { month: "short", day: "numeric" });
};

const formatCallDuration = (seconds) => {
  if (!seconds || seconds <= 0) return "";
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
};

const conversationIdFor = (uidA, uidB) => [uidA, uidB].sort().join("_");

// ─── Component ───────────────────────────────────────────────────────────────

const ChatWindow = ({
  authUser,
  profile,
  activeThreadType,
  selectedUser,
  selectedGroup,
  selectedChannel,
  conversations,
  allUsers,
  contacts,
  onUpdateConversation,   // ({ type, channel }) => void  — used for channel follow toggle
  onUpdateCallState,      // optional parent notification
  onSendCallSignal,       // optional parent notification
  onStopCallMedia,        // optional parent notification
}) => {
  // ── UI state ──────────────────────────────────────────────────────────────
  const [messages, setMessages]               = useState([]);
  const [messageInput, setMessageInput]       = useState("");
  const [chatSearch, setChatSearch]           = useState("");
  const [sendingAttachment, setSendingAttachment] = useState(false);
  const [uploadProgress, setUploadProgress]   = useState(0);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [forwardOpenFor, setForwardOpenFor]   = useState(null);
  const [replyTo, setReplyTo]                 = useState(null);
  const [replyTargetUser, setReplyTargetUser] = useState(null);
  const [imagePreview, setImagePreview]       = useState(null);
  const [statusText, setStatusText]           = useState("");
  const [showCallLogs, setShowCallLogs]       = useState(false);
  const [callLogs, setCallLogs]               = useState([]);
  const [openActionMenuFor, setOpenActionMenuFor] = useState(null);
  const [editingMessageId, setEditingMessageId] = useState(null);

  // ── Call state ────────────────────────────────────────────────────────────
  const [localCallStream, setLocalCallStream]   = useState(null);
  const [remoteCallStream, setRemoteCallStream] = useState(null);
  const [incomingOffer, setIncomingOffer]       = useState(null);
  const [isCallActive, setIsCallActive]         = useState(false);
  const [isMuted, setIsMuted]                   = useState(false);
  const [isVideoOff, setIsVideoOff]             = useState(false);
  const [callDurationSec, setCallDurationSec]   = useState(0);

  // ── Refs ──────────────────────────────────────────────────────────────────
  const typingTimeoutRef          = useRef(null);
  const peerConnectionRef         = useRef(null);
  const localVideoRef             = useRef(null);
  const remoteVideoRef            = useRef(null);
  const messagesEndRef            = useRef(null);
  const composerRef               = useRef(null);
  const callDurationIntervalRef   = useRef(null);

  // FIX #1 — ICE candidate buffer. Candidates arriving before setRemoteDescription
  // is called are buffered here and flushed once the remote desc is applied.
  const pendingIceCandidatesRef   = useRef([]);
  const hasRemoteDescRef          = useRef(false);

  // FIX #2 — Always-current selectedCall ref so event handlers don't capture stale state.
  const selectedCallRef           = useRef(null);

  // ── Derived values ────────────────────────────────────────────────────────
  const selectedConversationId = useMemo(() => {
    if (activeThreadType === "direct" && authUser?.uid && selectedUser?.uid) {
      return conversationIdFor(authUser.uid, selectedUser.uid);
    }
    return "";
  }, [activeThreadType, authUser?.uid, selectedUser?.uid]);

  const selectedConversation = useMemo(() => {
    if (activeThreadType === "direct" && selectedConversationId) {
      return conversations[selectedConversationId] || null;
    }
    return null;
  }, [activeThreadType, selectedConversationId, conversations]);

  const usersById = useMemo(() => new Map(allUsers.map((user) => [user.uid, user])), [allUsers]);

  const selectedTheme       = selectedConversation?.themeBy?.[authUser?.uid] || "default";
  const selectedPartnerTyping = selectedConversation?.typing?.[selectedUser?.uid] || false;
  const selectedMuted       = selectedConversation?.mutedBy?.[authUser?.uid] || false;
  const selectedCall        = selectedConversation?.callState || null;
  const activeThread        = activeThreadType === "direct" ? selectedUser : activeThreadType === "group" ? selectedGroup : selectedChannel;
  const activeThreadName    = activeThreadType === "direct" ? selectedUser?.displayName : activeThreadType === "group" ? selectedGroup?.name : selectedChannel?.name;

  // Keep ref in sync so WebRTC event handlers always see current call state
  useEffect(() => { selectedCallRef.current = selectedCall; }, [selectedCall]);

  const visibleMessages = useMemo(() => {
    const v = chatSearch.trim().toLowerCase();
    if (!v) return messages;
    return messages.filter((m) => (m.text || "").toLowerCase().includes(v));
  }, [messages, chatSearch]);

  // ── Video element wiring ──────────────────────────────────────────────────
  useEffect(() => {
    if (localVideoRef.current) localVideoRef.current.srcObject = localCallStream || null;
  }, [localCallStream]);

  useEffect(() => {
    if (remoteVideoRef.current) remoteVideoRef.current.srcObject = remoteCallStream || null;
  }, [remoteCallStream]);

  // ── Scroll to bottom ──────────────────────────────────────────────────────
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // ── Cleanup on unmount ────────────────────────────────────────────────────
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => () => stopCallMedia(), []);

  // ── Call duration timer ───────────────────────────────────────────────────
  useEffect(() => {
    if (selectedCall?.status === "active") {
      const startTime = toDate(selectedCall.startedAt) || new Date();
      callDurationIntervalRef.current = setInterval(() => {
        setCallDurationSec(Math.floor((Date.now() - startTime.getTime()) / 1000));
      }, 1000);
    } else {
      clearInterval(callDurationIntervalRef.current);
      callDurationIntervalRef.current = null;
      setCallDurationSec(0);
    }
    return () => clearInterval(callDurationIntervalRef.current);
  }, [selectedCall?.status, selectedCall?.startedAt]);

  // ── Messages subscription — direct ───────────────────────────────────────
  useEffect(() => {
    if (!db || !authUser?.uid || !selectedUser?.uid || activeThreadType !== "direct") return;
    if (!selectedConversationId) return;

    const conversationRef = doc(db, "conversations", selectedConversationId);
    setDoc(conversationRef, {
      participants:      [authUser.uid, selectedUser.uid],
      participantPhones: [profile?.phoneNumber || "", selectedUser.phoneNumber || ""],
      unreadBy:          { [authUser.uid]: 0 },
      createdAt:         serverTimestamp(),
      updatedAt:         serverTimestamp(),
    }, { merge: true }).catch(console.error);

    const q = query(collection(conversationRef, "messages"), orderBy("createdAt", "asc"));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const next = snapshot.docs
        .map((e) => ({ id: e.id, ...e.data() }))
        .filter((e) => !(e.deletedFor || []).includes(authUser.uid));
      setMessages(next);

      const unread = snapshot.docs.filter((e) => {
        const d = e.data();
        return d.receiverId === authUser.uid && !(d.readBy || []).includes(authUser.uid);
      });
      unread.forEach((e) =>
        updateDoc(e.ref, { readBy: arrayUnion(authUser.uid), readAt: serverTimestamp() })
      );
      if (unread.length) {
        setDoc(conversationRef, { unreadBy: { [authUser.uid]: 0 } }, { merge: true });
      }
    });
    return unsubscribe;
  }, [authUser?.uid, selectedUser?.uid, activeThreadType, selectedConversationId, profile]);

  // ── Messages subscription — group ────────────────────────────────────────
  useEffect(() => {
    if (!db || !authUser?.uid || !selectedGroup || activeThreadType !== "group") return;
    const q = query(collection(doc(db, "groups", selectedGroup.id), "messages"), orderBy("createdAt", "asc"));
    return onSnapshot(q, (snapshot) =>
      setMessages(snapshot.docs.map((e) => ({ id: e.id, ...e.data() })))
    );
  }, [authUser?.uid, selectedGroup, activeThreadType]);

  // ── Messages subscription — channel ──────────────────────────────────────
  useEffect(() => {
    if (!db || !authUser?.uid || !selectedChannel || activeThreadType !== "channel") return;
    const q = query(collection(doc(db, "channels", selectedChannel.id), "posts"), orderBy("createdAt", "asc"));
    return onSnapshot(q, (snapshot) =>
      setMessages(snapshot.docs.map((e) => ({ id: e.id, ...e.data() })))
    );
  }, [authUser?.uid, selectedChannel, activeThreadType]);

  // ── Call logs subscription ────────────────────────────────────────────────
  useEffect(() => {
    if (!db || !authUser?.uid || !selectedConversationId) return;
    const logsRef = collection(doc(db, "conversations", selectedConversationId), "callLogs");
    const q = query(logsRef, orderBy("createdAt", "desc"));
    return onSnapshot(q, (snapshot) =>
      setCallLogs(snapshot.docs.map((e) => ({ id: e.id, ...e.data() })))
    );
  }, [authUser?.uid, selectedConversationId]);

  // ── Call signals subscription ─────────────────────────────────────────────
  // FIX: ICE candidates buffered until remote description is applied.
  useEffect(() => {
    if (!db || !authUser?.uid || !selectedConversationId) return;

    const conversationRef = doc(db, "conversations", selectedConversationId);
    const signalsRef      = collection(conversationRef, "signals");
    const q               = query(signalsRef, where("to", "==", authUser.uid));

    const unsubscribe = onSnapshot(q, async (snapshot) => {
      for (const change of snapshot.docChanges()) {
        if (change.type !== "added") continue;
        const signal = change.doc.data();

        try {
          if (signal.type === "offer") {
            // Caller's offer — just store it; don't touch the peer connection yet.
            setIncomingOffer(signal.sdp);

          } else if (signal.type === "answer" && peerConnectionRef.current) {
            // FIX: use applyRemoteDescription to flush buffered ICE after this.
            await applyRemoteDescription(peerConnectionRef.current, signal.sdp);
            const currentCall = selectedCallRef.current;
            if (currentCall && onUpdateCallState) onUpdateCallState({ ...currentCall, status: "active" });
            setIsCallActive(true);

          } else if (signal.type === "ice") {
            // FIX: buffer if peer connection doesn't exist OR remote desc not yet set.
            if (peerConnectionRef.current && hasRemoteDescRef.current) {
              try {
                await peerConnectionRef.current.addIceCandidate(
                  new RTCIceCandidate(signal.candidate)
                );
              } catch (e) {
                console.warn("ICE candidate error:", e);
              }
            } else {
              pendingIceCandidatesRef.current.push(signal.candidate);
            }

          } else if (signal.type === "hangup") {
            const currentCall = selectedCallRef.current;
            // Receiver side: save call log so both parties have a record.
            if (currentCall) {
              const status =
                currentCall.status === "ringing"
                  ? currentCall.from === authUser.uid ? "cancelled" : "missed"
                  : "completed";
              await saveCallLogOnly({
                type:      currentCall.type,
                direction: currentCall.to === authUser.uid ? "incoming" : "outgoing",
                status,
                startedAt: currentCall.startedAt,
                endedAt:   serverTimestamp(),
                duration:  callDurationSec,
                callerId:  currentCall.from,
                receiverId: currentCall.to,
              });
            }
            stopCallMedia();
            if (currentCall && onUpdateCallState)
              onUpdateCallState({ ...currentCall, status: "ended" });
            setStatusText("Call ended");
            setTimeout(() => setStatusText(""), 3000);
          }
        } finally {
          // Always delete the processed signal
          await deleteDoc(change.doc.ref).catch(() => {});
        }
      }
    });

    return unsubscribe;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authUser?.uid, selectedConversationId]);

  // ═════════════════════════════════════════════════════════════════════════
  // ── Call helpers ──────────────────────────────────────────────────────────
  // ═════════════════════════════════════════════════════════════════════════

  /**
   * FIX: Apply remote description then flush any ICE candidates that arrived
   * before the description was ready.
   */
  const applyRemoteDescription = async (pc, sdp) => {
    await pc.setRemoteDescription(new RTCSessionDescription(sdp));
    hasRemoteDescRef.current = true;

    const pending = [...pendingIceCandidatesRef.current];
    pendingIceCandidatesRef.current = [];
    for (const candidate of pending) {
      try {
        await pc.addIceCandidate(new RTCIceCandidate(candidate));
      } catch (e) {
        console.warn("Buffered ICE flush error:", e);
      }
    }
  };

  const stopCallMedia = () => {
    // Reset ICE state
    hasRemoteDescRef.current        = false;
    pendingIceCandidatesRef.current = [];

    if (peerConnectionRef.current) {
      peerConnectionRef.current.close();
      peerConnectionRef.current = null;
    }
    setLocalCallStream((prev) => {
      prev?.getTracks().forEach((t) => { t.stop(); t.enabled = false; });
      return null;
    });
    setRemoteCallStream((prev) => {
      prev?.getTracks().forEach((t) => { t.stop(); t.enabled = false; });
      return null;
    });
    setIncomingOffer(null);
    setIsCallActive(false);
    setIsMuted(false);
    setIsVideoOff(false);
    if (onStopCallMedia) onStopCallMedia();
  };

  /** Save only the call log subcollection entry (no chat message). */
  const saveCallLogOnly = async (callData) => {
    if (!db || !authUser?.uid || !selectedConversationId) return;
    try {
      const conversationRef = doc(db, "conversations", selectedConversationId);
      await setDoc(conversationRef, {
        participants: [authUser.uid, selectedUser?.uid],
        updatedAt:    serverTimestamp(),
      }, { merge: true });
      await addDoc(collection(conversationRef, "callLogs"), {
        ...callData,
        createdAt: serverTimestamp(),
      });
    } catch (e) {
      console.error("saveCallLogOnly error:", e);
    }
  };

  /**
   * Save a call log entry AND a call message in the chat thread.
   * Called only by the party who explicitly ends the call (endCall).
   */
  const saveCallLogAndMessage = async (callData) => {
    if (!db || !authUser?.uid || !selectedConversationId || !selectedUser?.uid) return;
    try {
      const conversationRef = doc(db, "conversations", selectedConversationId);
      await setDoc(conversationRef, {
        participants: [authUser.uid, selectedUser.uid],
        updatedAt:    serverTimestamp(),
      }, { merge: true });

      // Log entry
      await addDoc(collection(conversationRef, "callLogs"), {
        ...callData,
        createdAt: serverTimestamp(),
      });

      // Chat message so the call shows inline in the conversation
      await addDoc(collection(conversationRef, "messages"), {
        type:       "call",
        callType:   callData.type,          // "audio" | "video"
        callStatus: callData.status,        // "completed" | "missed" | "cancelled"
        duration:   callData.duration || 0,
        senderId:   callData.callerId,
        receiverId: callData.receiverId,
        createdAt:  serverTimestamp(),
        readBy:     [authUser.uid],
      });
    } catch (e) {
      console.error("saveCallLogAndMessage error:", e);
    }
  };

  const setCallState = async (nextCallState) => {
    if (!db || !authUser?.uid || !selectedConversationId) return;
    try {
      const conversationRef = doc(db, "conversations", selectedConversationId);
      await setDoc(conversationRef, { callState: nextCallState }, { merge: true });
      if (onUpdateCallState) onUpdateCallState(nextCallState);
    } catch (e) {
      console.error("setCallState error:", e);
    }
  };

  const sendCallSignal = async (payload) => {
    if (!db || !authUser?.uid || !selectedUser?.uid || !selectedConversationId) return;
    try {
      const conversationRef = doc(db, "conversations", selectedConversationId);
      const signalsRef      = collection(conversationRef, "signals");
      await addDoc(signalsRef, {
        ...payload,
        from:      authUser.uid,
        to:        selectedUser.uid,
        createdAt: serverTimestamp(),
      });
      if (onSendCallSignal) onSendCallSignal(payload);
    } catch (e) {
      console.error("sendCallSignal error:", e);
    }
  };

  const buildPeerConnection = (stream) => {
    const pc = new RTCPeerConnection(ICE_SERVERS);

    stream.getTracks().forEach((track) => pc.addTrack(track, stream));

    pc.ontrack = (event) => {
      if (event.streams?.[0]) setRemoteCallStream(event.streams[0]);
    };

    pc.onicecandidate = (event) => {
      if (event.candidate) {
        sendCallSignal({ type: "ice", candidate: event.candidate.toJSON() });
      }
    };

    // FIX: use the ref so the handler always sees current call state, not stale closure.
    pc.oniceconnectionstatechange = () => {
      const state = pc.iceConnectionState;
      if (state === "disconnected" || state === "failed" || state === "closed") {
        endCall();
      }
    };

    peerConnectionRef.current = pc;
    return pc;
  };

  // ── Start call (caller) ───────────────────────────────────────────────────
  const startCall = async (type) => {
    if (!authUser?.uid || !selectedUser?.uid) return;
    if (!navigator.mediaDevices?.getUserMedia) {
      setStatusText("Your browser does not support calling.");
      setTimeout(() => setStatusText(""), 3000);
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: true,
        video: type === "video",
      });
      setLocalCallStream(stream);

      const pc     = buildPeerConnection(stream);
      const offer  = await pc.createOffer();
      await pc.setLocalDescription(offer);
      // NOTE: caller does NOT call applyRemoteDescription here — the remote desc
      // arrives later as an "answer" signal and is handled in the subscription.

      await sendCallSignal({ type: "offer", sdp: offer });
      await setCallState({
        from:      authUser.uid,
        to:        selectedUser.uid,
        type,
        status:    "ringing",
        startedAt: serverTimestamp(),
      });

      setStatusText(`Calling ${selectedUser.displayName}…`);
      setTimeout(() => setStatusText(""), 5000);
    } catch (error) {
      console.error("startCall error:", error);
      setStatusText(error?.message || "Unable to start call. Check mic/camera permissions.");
      setTimeout(() => setStatusText(""), 5000);
      localCallStream?.getTracks().forEach((t) => t.stop());
      setLocalCallStream(null);
    }
  };

  // ── Accept call (callee) ──────────────────────────────────────────────────
  const acceptCall = async () => {
    const currentCall = selectedCallRef.current;
    if (!currentCall || !incomingOffer) return;

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: true,
        video: currentCall.type === "video",
      });
      setLocalCallStream(stream);

      const pc = buildPeerConnection(stream);

      // FIX: applyRemoteDescription flushes any ICE candidates that arrived early.
      await applyRemoteDescription(pc, incomingOffer);

      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      await sendCallSignal({ type: "answer", sdp: answer });
      await setCallState({ ...currentCall, status: "active" });
      setIsCallActive(true);
      setIncomingOffer(null);
    } catch (error) {
      console.error("acceptCall error:", error);
      setStatusText(error?.message || "Unable to accept call.");
      setTimeout(() => setStatusText(""), 3000);
    }
  };

  // ── End call ──────────────────────────────────────────────────────────────
  const endCall = async () => {
    const currentCall = selectedCallRef.current;
    // Determine outcome
    let callStatus = "ended";
    if (currentCall?.status === "ringing") {
      callStatus = currentCall.from === authUser?.uid ? "cancelled" : "missed";
    } else if (currentCall?.status === "active") {
      callStatus = "completed";
    }

    const callData = {
      type:       currentCall?.type || "audio",
      direction:  currentCall?.from === authUser?.uid ? "outgoing" : "incoming",
      status:     callStatus,
      startedAt:  currentCall?.startedAt || null,
      endedAt:    serverTimestamp(),
      duration:   callDurationSec,
      callerId:   currentCall?.from || authUser?.uid,
      receiverId: currentCall?.to || selectedUser?.uid,
    };

    // Save log + chat message (only this party saves the message; the other side
    // saves only a log in the hangup signal handler).
    if (currentCall) await saveCallLogAndMessage(callData);

    await sendCallSignal({ type: "hangup" });

    if (currentCall) {
      await setCallState({ ...currentCall, status: "ended" });
    }
    stopCallMedia();
  };

  // ── Mute / video toggle ───────────────────────────────────────────────────
  const toggleMute = () => {
    localCallStream?.getAudioTracks().forEach((t) => { t.enabled = !t.enabled; });
    setIsMuted((p) => !p);
  };

  const toggleVideo = () => {
    localCallStream?.getVideoTracks().forEach((t) => { t.enabled = !t.enabled; });
    setIsVideoOff((p) => !p);
  };

  // ═════════════════════════════════════════════════════════════════════════
  // ── Messaging helpers ─────────────────────────────────────────────────────
  // ═════════════════════════════════════════════════════════════════════════

  const uploadToStorage = async (path, file) => {
    if (!file) throw new Error("File missing.");
    if (file.size > MAX_FILE_SIZE_BYTES) throw new Error("File too large. Max 15 MB.");

    const storageRef  = ref(storage, `${path}/${Date.now()}_${file.name}`);
    const uploadTask  = uploadBytesResumable(storageRef, file);

    return new Promise((resolve, reject) => {
      uploadTask.on(
        "state_changed",
        (s) => setUploadProgress(Math.round((s.bytesTransferred / s.totalBytes) * 100)),
        async (err) => {
          try { await deleteObject(storageRef); } catch {}
          setUploadProgress(0);
          reject(err);
        },
        async () => {
          const url = await getDownloadURL(uploadTask.snapshot.ref);
          setUploadProgress(0);
          resolve(url);
        }
      );
    });
  };

  const updateTypingState = async (isTyping) => {
    if (!db || !authUser?.uid || !selectedUser?.uid || activeThreadType !== "direct") return;
    if (!selectedConversationId) return;
    try {
      await setDoc(
        doc(db, "conversations", selectedConversationId),
        { typing: { [authUser.uid]: isTyping } },
        { merge: true }
      );
    } catch {}
  };

  // FIX: setDoc always uses { merge: true } to avoid nuking themes/mute settings.
  const sendMessage = async ({ text = "", file = null, forwardedFrom = null } = {}) => {
    if (!db || !authUser?.uid || !profile) {
      setStatusText("Database connection error");
      return;
    }
    if (!text.trim() && !file) return;

    // ── Group ──
    if (activeThreadType === "group" && selectedGroup) {
      try {
        const groupRef = doc(db, "groups", selectedGroup.id);
        const payload = {
          text:       text.trim(),
          type:       "text",
          senderId:   authUser.uid,
          senderName: profile.displayName,
          createdAt:  serverTimestamp(),
        };
        if (replyTo) {
          payload.replyTo = {
            id: replyTo.id,
            text: replyTo.text,
            senderId: replyTo.senderId,
            senderName: replyTo.senderName || usersById.get(replyTo.senderId)?.displayName || "Member",
          };
        }
        await addDoc(collection(groupRef, "messages"), payload);
        await setDoc(groupRef, {
          lastMessage:   text.trim(),
          lastMessageAt: serverTimestamp(),
          updatedAt:     serverTimestamp(),
        }, { merge: true });
        setMessageInput("");
        setReplyTo(null);
        setReplyTargetUser(null);
      } catch (e) {
        setStatusText("Failed to send: " + e.message);
      }
      return;
    }

    // ── Channel ──
    if (activeThreadType === "channel" && selectedChannel) {
      if (selectedChannel.ownerId !== authUser.uid) {
        setStatusText("Only channel owner can publish posts.");
        return;
      }
      try {
        const channelRef = doc(db, "channels", selectedChannel.id);
        await addDoc(collection(channelRef, "posts"), {
          text:       text.trim(),
          type:       "post",
          senderId:   authUser.uid,
          senderName: profile.displayName,
          createdAt:  serverTimestamp(),
        });
        await setDoc(channelRef, {
          lastPost:   text.trim(),
          lastPostAt: serverTimestamp(),
          updatedAt:  serverTimestamp(),
        }, { merge: true });
        setMessageInput("");
        setReplyTo(null);
        setReplyTargetUser(null);
        setStatusText("Post published!");
        setTimeout(() => setStatusText(""), 2000);
      } catch (e) {
        setStatusText("Failed to send post: " + e.message);
      }
      return;
    }

    // ── Direct ──
    if (activeThreadType === "direct") {
      if (!selectedUser?.uid || !selectedConversationId) {
        setStatusText("No conversation selected.");
        return;
      }

      let payload = { type: "text", text: text.trim() };

      if (file) {
        setSendingAttachment(true);
        try {
          const fileURL = await uploadToStorage(
            `attachments/${selectedConversationId}`,
            file
          );
          payload = {
            type:     file.type.startsWith("image/") ? "image" : "file",
            text:     text.trim() || file.name,
            fileURL,
            fileName: file.name,
            fileSize: file.size,
          };
        } catch (err) {
          setStatusText(err?.message || "Attachment upload failed.");
          setSendingAttachment(false);
          return;
        } finally {
          setSendingAttachment(false);
        }
      }

      if (forwardedFrom) payload.forwardedFrom = forwardedFrom;
      if (replyTo) {
        payload.replyTo = { id: replyTo.id, text: replyTo.text, senderId: replyTo.senderId };
        setReplyTo(null);
        setReplyTargetUser(null);
      }

      try {
        const conversationRef = doc(db, "conversations", selectedConversationId);
        // FIX: merge:true — never overwrite themes, mute settings, etc.
        await setDoc(conversationRef, {
          participants:        [authUser.uid, selectedUser.uid],
          participantPhones:   [profile.phoneNumber || "", selectedUser.phoneNumber || ""],
          lastMessage:         payload.type === "text" ? payload.text : `📎 ${payload.fileName}`,
          lastMessageType:     payload.type,
          lastMessageSender:   authUser.uid,
          lastMessageAt:       serverTimestamp(),
          typing:              { [authUser.uid]: false },
          unreadBy:            { [authUser.uid]: 0, [selectedUser.uid]: increment(1) },
          createdAt:           serverTimestamp(),
          updatedAt:           serverTimestamp(),
        }, { merge: true });

        await addDoc(collection(conversationRef, "messages"), {
          ...payload,
          senderId:   authUser.uid,
          receiverId: selectedUser.uid,
          createdAt:  serverTimestamp(),
          readBy:     [authUser.uid],
        });

        setMessageInput("");
        updateTypingState(false);
        setEditingMessageId(null);
      } catch (e) {
        console.error("sendMessage error:", e);
        setStatusText("Failed to send: " + e.message);
        setTimeout(() => setStatusText(""), 3000);
      }
    }
  };

  const sendDirectMessageToUser = async ({ targetUser, payload }) => {
    if (!authUser || !profile || !targetUser || !payload) return;
    const conversationId = conversationIdFor(authUser.uid, targetUser.uid);
    const conversationRef = doc(db, "conversations", conversationId);
    await setDoc(
      conversationRef,
      {
        participants: [authUser.uid, targetUser.uid],
        participantPhones: [profile.phoneNumber || "", targetUser.phoneNumber || ""],
        lastMessage: payload.type === "text" ? payload.text : `📎 ${payload.fileName || "attachment"}`,
        lastMessageType: payload.type,
        lastMessageSender: authUser.uid,
        lastMessageAt: serverTimestamp(),
        unreadBy: { [authUser.uid]: 0, [targetUser.uid]: increment(1) },
      },
      { merge: true }
    );
    await addDoc(collection(db, "conversations", conversationId, "messages"), {
      ...payload,
      senderId: authUser.uid,
      receiverId: targetUser.uid,
      createdAt: serverTimestamp(),
      readBy: [authUser.uid],
    });
  };

  const forwardMessage = async (message, targetUid) => {
    if (!authUser?.uid || !targetUid) return;
    const targetUser = allUsers.find((u) => u.uid === targetUid);
    if (!targetUser) return;
    await sendDirectMessageToUser({
      targetUser,
      payload: {
        type: message.type === "image" || message.type === "file" ? message.type : "text",
        text: message.text || message.fileName || "Forwarded message",
        fileURL: message.fileURL || null,
        fileName: message.fileName || null,
        fileSize: message.fileSize || null,
        forwardedFrom: activeThreadName || "thread",
      },
    });
    setForwardOpenFor(null);
    setStatusText("✓ Message forwarded securely.");
  };

  const editMessage = async (msg) => {
    if (!authUser || msg.senderId !== authUser.uid) return;
    const newText = messageInput.trim();
    if (!newText) return;
    if (activeThreadType === "direct" && selectedConversationId) {
      await updateDoc(doc(db, "conversations", selectedConversationId, "messages", msg.id), {
        text: newText,
        editedAt: serverTimestamp(),
      });
    }
    if (activeThreadType === "group" && selectedGroup) {
      await updateDoc(doc(db, "groups", selectedGroup.id, "messages", msg.id), {
        text: newText,
        editedAt: serverTimestamp(),
      });
    }
    setMessageInput("");
    setEditingMessageId(null);
    setStatusText("✓ Message edited.");
  };

  const deleteForMe = async (msg) => {
    if (!authUser) return;
    if (activeThreadType === "direct" && selectedConversationId) {
      await updateDoc(doc(db, "conversations", selectedConversationId, "messages", msg.id), {
        deletedFor: arrayUnion(authUser.uid),
      });
    }
    if (activeThreadType === "group" && selectedGroup) {
      await updateDoc(doc(db, "groups", selectedGroup.id, "messages", msg.id), {
        deletedFor: arrayUnion(authUser.uid),
      });
    }
  };

  const deleteForEveryone = async (msg) => {
    if (!authUser || msg.senderId !== authUser.uid) return;
    const deletionPayload = {
      text: "🚫 This message was deleted.",
      deletedForEveryone: true,
      deletedAt: serverTimestamp(),
      fileURL: null,
      fileName: null,
      fileSize: null,
    };
    if (activeThreadType === "direct" && selectedConversationId) {
      await updateDoc(doc(db, "conversations", selectedConversationId, "messages", msg.id), deletionPayload);
    }
    if (activeThreadType === "group" && selectedGroup) {
      await updateDoc(doc(db, "groups", selectedGroup.id, "messages", msg.id), deletionPayload);
    }
  };

  const toggleMessageFlag = async (msg, key) => {
    if (!authUser) return;
    const alreadyFlagged = (msg[key] || []).includes(authUser.uid);
    const payload = { [key]: alreadyFlagged ? arrayRemove(authUser.uid) : arrayUnion(authUser.uid) };
    if (activeThreadType === "direct" && selectedConversationId) {
      await updateDoc(doc(db, "conversations", selectedConversationId, "messages", msg.id), payload);
    }
    if (activeThreadType === "group" && selectedGroup) {
      await updateDoc(doc(db, "groups", selectedGroup.id, "messages", msg.id), payload);
    }
  };

  const replyPrivately = async (msg) => {
    if (!authUser || !profile || !msg.senderId || msg.senderId === authUser.uid) return;
    const targetUser = usersById.get(msg.senderId);
    if (!targetUser) {
      setStatusText("Could not find that member in contacts.");
      return;
    }
    const preview = msg.text || msg.fileName || "Message";
    await sendDirectMessageToUser({
      targetUser,
      payload: {
        type: "text",
        text: `Private reply to "${preview.slice(0, 60)}"`,
        forwardedFrom: `Group: ${selectedGroup?.name || "group"}`,
      },
    });
    setStatusText(`✓ Sent private reply to ${targetUser.displayName}.`);
  };

  const onMessageChange = async (value) => {
    setMessageInput(value);
    if (activeThreadType !== "direct") return;
    if (!value.trim()) { updateTypingState(false); return; }
    await updateTypingState(true);
    clearTimeout(typingTimeoutRef.current);
    typingTimeoutRef.current = setTimeout(() => updateTypingState(false), 1500);
  };

  const setMute = async () => {
    if (!db || !authUser?.uid || !selectedConversationId) return;
    await setDoc(
      doc(db, "conversations", selectedConversationId),
      { mutedBy: { [authUser.uid]: !selectedMuted } },
      { merge: true }
    ).catch(console.error);
  };

  const setTheme = async (theme) => {
    if (!db || !authUser?.uid || !selectedConversationId) return;
    await setDoc(
      doc(db, "conversations", selectedConversationId),
      { themeBy: { [authUser.uid]: theme } },
      { merge: true }
    ).catch(console.error);
  };

  const deleteChatHistory = async () => {
    if (!db || !authUser?.uid || !selectedConversationId) return;
    if (!window.confirm("Clear this conversation's history?")) return;
    try {
      const conversationRef = doc(db, "conversations", selectedConversationId);
      const snapshot        = await getDocs(collection(conversationRef, "messages"));
      const batch           = writeBatch(db);
      snapshot.docs.forEach((e) => batch.update(e.ref, { deletedFor: arrayUnion(authUser.uid) }));
      if (!snapshot.empty) await batch.commit();
      await setDoc(conversationRef, {
        clearedAtBy: { [authUser.uid]: serverTimestamp() },
        unreadBy:    { [authUser.uid]: 0 },
      }, { merge: true });
      setMessages([]);
      setStatusText("Conversation history cleared.");
      setTimeout(() => setStatusText(""), 3000);
    } catch (e) {
      console.error("deleteChatHistory error:", e);
      setStatusText("Failed to clear history.");
    }
  };

  const toggleFollowChannel = async (channel) => {
    if (!authUser?.uid || !channel) return;
    // Prefer parent handler if provided
    if (onUpdateConversation) {
      onUpdateConversation({ type: "toggleFollow", channel });
    }
  };

  const leaveGroup = async () => {
    if (!authUser || activeThreadType !== "group" || !selectedGroup) return;
    const confirmed = window.confirm(`Leave ${selectedGroup.name}?`);
    if (!confirmed) return;
    await updateDoc(doc(db, "groups", selectedGroup.id), {
      memberIds: arrayRemove(authUser.uid),
      updatedAt: serverTimestamp(),
    });
    setStatusText("✓ You left the group.");
  };

  // ── Call log helpers ──────────────────────────────────────────────────────
  const getCallIcon = (log) => {
    if (log.status === "missed")     return "📵";
    if (log.status === "cancelled")  return "↩️";
    if (log.type   === "video")      return log.direction === "outgoing" ? "📹" : "🎥";
    return log.direction === "outgoing" ? "📞" : "📲";
  };

  const getCallStatusText = (log) => {
    if (log.status === "missed")    return "Missed call";
    if (log.status === "cancelled") return "Cancelled";
    if (log.status === "completed") {
      const d = formatCallDuration(log.duration || 0);
      return d ? `${d}` : "Completed";
    }
    return log.direction === "outgoing" ? "Outgoing" : "Incoming";
  };

  // ═════════════════════════════════════════════════════════════════════════
  // ── Guards ────────────────────────────────────────────────────────────────
  // ═════════════════════════════════════════════════════════════════════════

  if (!db)           return null;
  if (!activeThread) return null;

  // ═════════════════════════════════════════════════════════════════════════
  // ── Render ────────────────────────────────────────────────────────────────
  // ═════════════════════════════════════════════════════════════════════════

  return (
    <div className={`chat-window theme-${selectedTheme}`}>

      {/* ── Header ── */}
      <header className="qx-chat-header">
        <div className="qx-chat-contact-avatar">
          {activeThreadType === "direct" && selectedUser?.photoURL
            ? <img src={selectedUser.photoURL} alt={selectedUser.displayName} />
            : <span>
                {activeThreadType === "group"
                  ? "👥"
                  : activeThreadType === "channel"
                  ? "📣"
                  : (selectedUser?.displayName || "U").charAt(0).toUpperCase()}
              </span>
          }
          {activeThreadType === "direct" && (
            <span className={`qx-presence ${selectedUser?.isOnline ? "qx-presence--online" : "qx-presence--offline"}`} />
          )}
        </div>
        <div className="qx-chat-contact-meta">
          <h3>{activeThreadName}</h3>
          <span className={activeThreadType === "direct" && selectedUser?.isOnline ? "qx-online-label" : "qx-offline-label"}>
            {activeThreadType === "group"
              ? `${(selectedGroup?.memberIds || []).length} members`
              : activeThreadType === "channel"
              ? `${(selectedChannel?.followerIds || []).length} followers`
              : selectedUser?.isOnline
              ? "● Online"
              : "○ Offline"}
          </span>
        </div>

        {activeThreadType === "direct" ? (
          <div className="qx-chat-actions">
            <button type="button" className="qx-icon-btn" title="Voice call" onClick={() => startCall("audio")}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07A19.5 19.5 0 013.07 9.81 19.79 19.79 0 012 1.22 2 2 0 014 .04h3a2 2 0 012 1.72c.127.96.361 1.903.7 2.81a2 2 0 01-.45 2.11L8.09 7.91a16 16 0 006 6l1.27-1.27a2 2 0 012.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0122 16.92z"/></svg>
            </button>
            <button type="button" className="qx-icon-btn" title="Video call" onClick={() => startCall("video")}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polygon points="23 7 16 12 23 17 23 7"/><rect x="1" y="5" width="15" height="14" rx="2" ry="2"/></svg>
            </button>
            <button
              type="button"
              className={`qx-icon-btn ${showCallLogs ? "qx-icon-btn--active" : ""}`}
              title="Call history"
              onClick={() => setShowCallLogs((p) => !p)}
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07A19.5 19.5 0 013.07 9.81 19.79 19.79 0 012 1.22 2 2 0 014 .04h3a2 2 0 012 1.72c.127.96.361 1.903.7 2.81a2 2 0 01-.45 2.11L8.09 7.91a16 16 0 006 6l1.27-1.27a2 2 0 012.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0122 16.92z"/>
                <line x1="18" y1="6" x2="23" y2="6"/>
                <line x1="18" y1="10" x2="23" y2="10"/>
              </svg>
            </button>
            <button
              type="button"
              className={`qx-icon-btn ${selectedMuted ? "qx-icon-btn--active" : ""}`}
              title={selectedMuted ? "Unmute" : "Mute"}
              onClick={setMute}
            >
              {selectedMuted
                ? <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="1" y1="1" x2="23" y2="23"/><path d="M9 9v3a3 3 0 005.12 2.12M15 9.34V4a3 3 0 00-5.94-.6M17 16.95A7 7 0 015 12v-2m14 0v2a7 7 0 01-.11 1.23M12 19v4M8 23h8"/></svg>
                : <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 1a3 3 0 00-3 3v8a3 3 0 006 0V4a3 3 0 00-3-3z"/><path d="M19 10v2a7 7 0 01-14 0v-2M12 19v4M8 23h8"/></svg>
              }
            </button>
            <div className="qx-theme-select-wrap">
              <select value={selectedTheme} onChange={(e) => setTheme(e.target.value)} className="qx-theme-select">
                {THEMES.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
              </select>
            </div>
            <button type="button" className="qx-icon-btn qx-icon-btn--danger" title="Clear history" onClick={deleteChatHistory}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4a1 1 0 011-1h4a1 1 0 011 1v2"/></svg>
            </button>
          </div>
        ) : (
          <div className="qx-chat-actions">
            <span className="qx-encryption-badge">Community thread</span>
            {activeThreadType === "group" && (
              <button type="button" className="qx-btn qx-btn--danger-soft" onClick={leaveGroup}>
                Leave Group
              </button>
            )}
            {activeThreadType === "channel" && (
              <button type="button" className="qx-btn" onClick={() => toggleFollowChannel(selectedChannel)}>
                {(selectedChannel?.followerIds || []).includes(authUser.uid) ? "Unfollow" : "Follow"}
              </button>
            )}
          </div>
        )}
      </header>

      {/* ── Toolbar ── */}
      <div className="qx-chat-toolbar">
        <div className="qx-chat-search-wrap">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="qx-search-icon-sm"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
          <input type="text" value={chatSearch} onChange={(e) => setChatSearch(e.target.value)} placeholder="Search in conversation…" />
          {chatSearch && <button type="button" className="qx-search-clear" onClick={() => setChatSearch("")}>✕</button>}
        </div>
        <div className="qx-encryption-badge">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="12" height="12"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0110 0v4"/></svg>
          E2E Encrypted
        </div>
      </div>

      {/* ── Call logs panel ── */}
      {showCallLogs && activeThreadType === "direct" && (
        <div className="qx-call-logs-panel">
          <div className="qx-call-logs-header">
            <h4>Call History</h4>
            <button className="qx-call-logs-close" onClick={() => setShowCallLogs(false)}>✕</button>
          </div>
          <div className="qx-call-logs-list">
            {callLogs.length === 0 ? (
              <div className="qx-call-logs-empty"><p>No call history yet</p></div>
            ) : (
              callLogs.map((log) => (
                <div key={log.id} className={`qx-call-log-item ${log.status === "missed" ? "qx-call-log-item--missed" : ""}`}>
                  <div className="qx-call-log-icon">{getCallIcon(log)}</div>
                  <div className="qx-call-log-details">
                    <div className="qx-call-log-type">{log.type === "video" ? "Video Call" : "Voice Call"}</div>
                    <div className="qx-call-log-status">{getCallStatusText(log)}</div>
                    <div className="qx-call-log-time">
                      {formatCallTime(log.endedAt || log.startedAt)}
                    </div>
                  </div>
                  <div className="qx-call-log-actions">
                    <button className="qx-call-log-callback" onClick={() => startCall(log.type)} title="Call back">
                      {log.type === "video" ? "🎥" : "📞"}
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* ── Call banner (incoming / active) ── */}
      {activeThreadType === "direct" && selectedCall && selectedCall.status !== "ended" && (
        <div className={`qx-call-banner qx-call-banner--${selectedCall.status}`}>
          <div className="qx-call-info">
            <div className="qx-call-icon">{selectedCall.type === "video" ? "🎥" : "📞"}</div>
            <div>
              <strong>{selectedCall.type === "video" ? "Video" : "Voice"} Call</strong>
              <span className="qx-call-status">
                {selectedCall.status === "ringing"
                  ? selectedCall.from === authUser.uid
                    ? `Calling ${selectedUser?.displayName}…`
                    : "Incoming call…"
                  : selectedCall.status === "active"
                  ? `In progress · ${formatCallDuration(callDurationSec) || "00:00"}`
                  : selectedCall.status}
              </span>
            </div>
          </div>
          <div className="qx-call-controls">
            {selectedCall.to === authUser.uid && selectedCall.status === "ringing" && (
              <>
                <button type="button" className="qx-call-accept" onClick={acceptCall}>Accept</button>
                <button type="button" className="qx-call-decline" onClick={endCall}>Decline</button>
              </>
            )}
            {selectedCall.from === authUser.uid && selectedCall.status === "ringing" && (
              <button type="button" className="qx-call-end" onClick={endCall}>Cancel</button>
            )}
            {selectedCall.status === "active" && (
              <>
                <button type="button" className="qx-call-mute" onClick={toggleMute} title={isMuted ? "Unmute" : "Mute"}>
                  {isMuted ? "🔇" : "🎤"}
                </button>
                {selectedCall.type === "video" && (
                  <button type="button" className="qx-cam-toggle" onClick={toggleVideo} title={isVideoOff ? "Camera on" : "Camera off"}>
                    {isVideoOff ? "📷❌" : "📷"}
                  </button>
                )}
                <button type="button" className="qx-call-end" onClick={endCall}>End Call</button>
              </>
            )}
          </div>
        </div>
      )}

      {/* ── Video panels ── */}
      {activeThreadType === "direct" && (localCallStream || remoteCallStream) && selectedCall?.type === "video" && (
        <div className="qx-call-media">
          <div className="qx-video-wrap">
            <video ref={remoteVideoRef} autoPlay playsInline className="qx-video-main" />
            <video ref={localVideoRef}  autoPlay muted playsInline className="qx-video-pip" />
          </div>
        </div>
      )}

      {/* ── Messages ── */}
      <section className="qx-messages">
        {visibleMessages.length === 0 && (
          <div className="qx-messages-empty">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" width="40" height="40"><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/></svg>
            <p>No messages yet. Say hello!</p>
          </div>
        )}

        {visibleMessages.map((msg, index) => {
          if ((msg.deletedFor || []).includes(authUser.uid)) return null;
          const isMine   = msg.senderId === authUser.uid;
          const prevMsg  = visibleMessages[index - 1];
          const showDate = !prevMsg || formatDate(msg.createdAt) !== formatDate(prevMsg?.createdAt);
          const isRead   = selectedUser ? (msg.readBy || []).includes(selectedUser.uid) : false;

          return (
            <div key={msg.id}>
              {showDate && (
                <div className="qx-date-divider"><span>{formatDate(msg.createdAt)}</span></div>
              )}

              {/* ── Call message (inline in chat) ── */}
              {msg.type === "call" ? (
                <div style={{ display: "flex", justifyContent: "center", margin: "8px 0" }}>
                  <div style={{
                    display:         "flex",
                    alignItems:      "center",
                    gap:             "10px",
                    background:      "rgba(255,255,255,0.07)",
                    border:          `1px solid ${msg.callStatus === "missed" ? "rgba(255,80,80,0.35)" : "rgba(255,255,255,0.12)"}`,
                    borderRadius:    "20px",
                    padding:         "8px 18px",
                    fontSize:        "0.8rem",
                    color:           msg.callStatus === "missed" ? "#ff6b6b" : "rgba(255,255,255,0.7)",
                    backdropFilter:  "blur(8px)",
                    cursor:          "default",
                    userSelect:      "none",
                  }}>
                    <span style={{ fontSize: "1.1rem" }}>
                      {msg.callType === "video" ? "🎥" : msg.callStatus === "missed" ? "📵" : "📞"}
                    </span>
                    <div>
                      <div style={{ fontWeight: 600, color: "inherit" }}>
                        {msg.callStatus === "missed"
                          ? "Missed call"
                          : msg.callStatus === "cancelled"
                          ? "Cancelled call"
                          : msg.callType === "video"
                          ? "Video call"
                          : "Voice call"}
                      </div>
                      {msg.callStatus === "completed" && msg.duration > 0 && (
                        <div style={{ opacity: 0.7, fontSize: "0.75rem" }}>
                          {formatCallDuration(msg.duration)}
                        </div>
                      )}
                      <div style={{ opacity: 0.5, fontSize: "0.7rem" }}>
                        {formatTime(msg.createdAt)}
                      </div>
                    </div>
                    <button
                      onClick={() => startCall(msg.callType)}
                      style={{
                        background: "rgba(77,127,255,0.2)",
                        border:     "1px solid rgba(77,127,255,0.4)",
                        borderRadius: "50%",
                        width: "28px", height: "28px",
                        cursor: "pointer",
                        color: "#4d7fff",
                        fontSize: "0.8rem",
                        display: "flex", alignItems: "center", justifyContent: "center",
                      }}
                      title={`Call back (${msg.callType})`}
                    >
                      {msg.callType === "video" ? "🎥" : "📞"}
                    </button>
                  </div>
                </div>
              ) : (
                /* ── Regular message ── */
                <div className={`qx-msg-row ${isMine ? "qx-msg-row--mine" : "qx-msg-row--theirs"}`}>
                  {!isMine && (
                    <div className="qx-msg-avatar">
                      {activeThreadType === "direct" && selectedUser?.photoURL
                        ? <img src={selectedUser.photoURL} alt={selectedUser.displayName} />
                        : <span>
                            {activeThreadType === "group"
                              ? "👥"
                              : activeThreadType === "channel"
                              ? "📣"
                              : (selectedUser?.displayName || "U").charAt(0).toUpperCase()}
                          </span>
                      }
                    </div>
                  )}
                  <div className="qx-msg-content">
                    {msg.replyTo && (
                      <div className="qx-reply-preview">
                        <span className="qx-reply-bar" />
                        <span>
                          {msg.replyTo.senderId === authUser.uid ? "You" : msg.replyTo.senderName || activeThreadName}:{" "}
                          {msg.replyTo.text?.slice(0, 80)}
                        </span>
                      </div>
                    )}
                    <div className={`qx-bubble ${isMine ? "qx-bubble--mine" : "qx-bubble--theirs"}`}>
                      {msg.forwardedFrom && (
                        <div className="qx-forwarded-label">
                          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="12" height="12"><polyline points="15 17 20 12 15 7"/><path d="M4 18v-2a4 4 0 014-4h12"/></svg>
                          Forwarded from {msg.forwardedFrom}
                        </div>
                      )}
                      {msg.type === "image" && msg.fileURL && (
                        <img
                          src={msg.fileURL}
                          alt={msg.fileName || "Image"}
                          className="qx-msg-image"
                          onClick={() => setImagePreview(msg.fileURL)}
                        />
                      )}
                      {msg.type === "file" && msg.fileURL && (
                        <a href={msg.fileURL} target="_blank" rel="noreferrer" className="qx-file-attach">
                          <div className="qx-file-icon">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="20" height="20"><path d="M13 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V9z"/><polyline points="13 2 13 9 20 9"/></svg>
                          </div>
                          <div className="qx-file-info">
                            <span className="qx-file-name">{msg.fileName || "File"}</span>
                            {msg.fileSize && <span className="qx-file-size">{(msg.fileSize / 1024).toFixed(1)} KB</span>}
                          </div>
                        </a>
                      )}
                      {!!msg.text && <p className="qx-msg-text">{msg.text}</p>}
                      <div className="qx-msg-meta">
                        <span className="qx-msg-time">{formatTime(msg.createdAt)}</span>
                        {msg.editedAt && <span className="qx-msg-edited">edited</span>}
                        {(msg.starredBy || []).includes(authUser.uid) && <span className="qx-msg-flag">⭐</span>}
                        {(msg.pinnedBy || []).includes(authUser.uid) && <span className="qx-msg-flag">📌</span>}
                        {isMine && (
                          <span className={`qx-read-receipt ${isRead ? "qx-read-receipt--read" : ""}`}>
                            {isRead ? "✓✓" : "✓"}
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="qx-msg-actions">
                      <button
                        type="button"
                        className="qx-msg-action-btn"
                        title="Reply"
                        onClick={() => {
                          setReplyTo(msg);
                          setReplyTargetUser(msg.senderId ? usersById.get(msg.senderId) || null : null);
                        }}
                      >
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="12" height="12"><polyline points="9 14 4 9 9 4"/><path d="M20 20v-7a4 4 0 00-4-4H4"/></svg>
                      </button>
                      {activeThreadType === "group" && !isMine && (
                        <button
                          type="button"
                          className="qx-msg-action-btn"
                          title="Reply privately"
                          onClick={() => replyPrivately(msg)}
                        >
                          🔒
                        </button>
                      )}
                      <button
                        type="button"
                        className="qx-msg-action-btn"
                        title="Forward"
                        onClick={() => setForwardOpenFor(forwardOpenFor === msg.id ? null : msg.id)}
                      >
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="12" height="12"><polyline points="15 17 20 12 15 7"/><path d="M4 18v-2a4 4 0 014-4h12"/></svg>
                      </button>
                      {isMine && !msg.deletedForEveryone && (
                        <>
                          <button
                            type="button"
                            className="qx-msg-action-btn"
                            title="Edit"
                            onClick={() => { setMessageInput(msg.text || ""); setEditingMessageId(msg.id); }}
                          >
                            ✏️
                          </button>
                          <button
                            type="button"
                            className="qx-msg-action-btn qx-msg-action-btn--danger"
                            title="Delete for everyone"
                            onClick={() => deleteForEveryone(msg)}
                          >
                            🚫
                          </button>
                        </>
                      )}
                      {!isMine && (
                        <button
                          type="button"
                          className="qx-msg-action-btn"
                          title="Delete for me"
                          onClick={() => deleteForMe(msg)}
                        >
                          🗑️
                        </button>
                      )}
                      <button
                        type="button"
                        className="qx-msg-action-btn"
                        title="Star"
                        onClick={() => toggleMessageFlag(msg, "starredBy")}
                      >
                        ⭐
                      </button>
                      <button
                        type="button"
                        className="qx-msg-action-btn"
                        title="Pin"
                        onClick={() => toggleMessageFlag(msg, "pinnedBy")}
                      >
                        📌
                      </button>
                    </div>
                    {forwardOpenFor === msg.id && (
                      <div className="qx-forward-panel">
                        <p className="qx-forward-label">Forward to:</p>
                        {contacts.filter((c) => c.uid !== selectedUser?.uid).map((c) => (
                          <button key={c.uid} type="button" className="qx-forward-contact" onClick={() => forwardMessage(msg, c.uid)}>
                            <div className="qx-forward-avatar">{(c.displayName || "U").charAt(0).toUpperCase()}</div>
                            {c.displayName}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          );
        })}
        <div ref={messagesEndRef} />
      </section>

      {/* ── Typing indicator ── */}
      <div className="qx-typing-row">
        {activeThreadType === "direct" && selectedPartnerTyping && (
          <div className="qx-typing-indicator">
            <div className="qx-typing-dots"><span /><span /><span /></div>
            <span>{selectedUser?.displayName} is typing…</span>
          </div>
        )}
      </div>

      {/* ── Reply bar ── */}
      {replyTo && (
        <div className="qx-reply-bar-wrap">
          <div className="qx-reply-preview-bar">
            <span className="qx-reply-accent" />
            <div>
              <span className="qx-reply-to-name">
                {replyTo.senderId === authUser.uid ? "You" : replyTargetUser?.displayName || activeThreadName}
              </span>
              <span className="qx-reply-to-text">{replyTo.text?.slice(0, 100)}</span>
            </div>
          </div>
          <button type="button" className="qx-reply-close" onClick={() => { setReplyTo(null); setReplyTargetUser(null); }}>✕</button>
        </div>
      )}

      {/* ── Composer ── */}
      <footer className="qx-composer" ref={composerRef}>
        <div className="qx-composer-inner">
          <div className="qx-composer-tools">
            <button type="button" className="qx-composer-btn" title="Emoji" onClick={() => setShowEmojiPicker((p) => !p)}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><path d="M8 14s1.5 2 4 2 4-2 4-2"/><line x1="9" y1="9" x2="9.01" y2="9"/><line x1="15" y1="9" x2="15.01" y2="9"/></svg>
            </button>
            <label htmlFor="attachment" className="qx-composer-btn" title="Attach file">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21.44 11.05l-9.19 9.19a6 6 0 01-8.49-8.49l9.19-9.19a4 4 0 015.66 5.66l-9.2 9.19a2 2 0 01-2.83-2.83l8.49-8.48"/></svg>
            </label>
            <input
              id="attachment" type="file" hidden
              accept="image/*,.pdf,.doc,.docx,.ppt,.pptx,.xls,.xlsx,.txt,.zip"
              onChange={(e) => {
                if (e.target.files?.[0]) {
                  sendMessage({ file: e.target.files[0] });
                  e.target.value = "";
                }
              }}
            />
          </div>
          <div className="qx-input-wrap">
            <input
              type="text"
              value={messageInput}
              onChange={(e) => onMessageChange(e.target.value)}
              placeholder={editingMessageId ? "Edit your message..." : "Type a secure message…"}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  if (editingMessageId) {
                    const msg = messages.find((entry) => entry.id === editingMessageId);
                    if (msg) editMessage(msg);
                    return;
                  }
                  sendMessage({ text: messageInput });
                }
              }}
            />
          </div>
          <button
            type="button"
            className={`qx-send-btn ${messageInput.trim() || sendingAttachment ? "qx-send-btn--active" : ""}`}
            onClick={() => {
              if (editingMessageId) {
                const msg = messages.find((entry) => entry.id === editingMessageId);
                if (msg) editMessage(msg);
                return;
              }
              sendMessage({ text: messageInput });
            }}
            disabled={sendingAttachment}
          >
            {sendingAttachment
              ? <div className="qx-spinner-sm" />
              : <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>
            }
          </button>
        </div>

        {showEmojiPicker && (
          <div className="qx-emoji-picker">
            <Picker
              data={data}
              onEmojiSelect={(emoji) => onMessageChange(messageInput + emoji.native)}
              theme="dark"
              previewPosition="none"
            />
          </div>
        )}

        {sendingAttachment && uploadProgress > 0 && (
          <div className="qx-upload-progress">
            <div className="qx-upload-bar"><div className="qx-upload-fill" style={{ width: `${uploadProgress}%` }} /></div>
            <span>{uploadProgress}%</span>
          </div>
        )}
      </footer>

      {/* ── Image lightbox ── */}
      {imagePreview && (
        <div className="qx-lightbox" onClick={() => setImagePreview(null)}>
          <button type="button" className="qx-lightbox-close" onClick={() => setImagePreview(null)}>✕</button>
          <img src={imagePreview} alt="Preview" onClick={(e) => e.stopPropagation()} />
        </div>
      )}

      {/* ── Status toast ── */}
      {statusText && <div className="qx-status-toast">{statusText}</div>}
    </div>
  );
};

export default ChatWindow;