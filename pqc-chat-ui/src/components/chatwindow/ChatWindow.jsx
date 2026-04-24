import { useEffect, useMemo, useRef, useState } from "react";
import "./chatwindow.base.css";
import "./chatwindow.header.css";
import "./chatwindow.messages.css";
import "./chatwindow.composer.css";
import "./chatwindow.overlays.css";
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
import { db, storage } from "../../firebase";
import { ICE_SERVERS, MAX_FILE_SIZE_BYTES, THEMES } from "./chatConstants";
import {
  conversationIdFor,
  formatCallDuration,
  formatCallTime,
  formatDate,
  formatTime,
  getCallIcon,
  getCallStatusText,
  toDate,
} from "./chatFormatters";
import ChatHeader from "./ChatHeader";
import ChatToolbar from "./ChatToolbar";
import ChatCallPanels from "./ChatCallPanels";
import ChatMessages from "./ChatMessages";
import ChatComposer from "./ChatComposer";

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
  const [editingMessageId, setEditingMessageId] = useState(null);
  const [showGroupMembers, setShowGroupMembers] = useState(false);

  // ── Call state ────────────────────────────────────────────────────────────
  const [localCallStream, setLocalCallStream]   = useState(null);
  const [remoteCallStream, setRemoteCallStream] = useState(null);
  const [incomingOffer, setIncomingOffer]       = useState(null);
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

  const usersById = useMemo(() => {
    const map = new Map(allUsers.map((user) => [user.uid, user]));
    if (authUser?.uid) {
      map.set(authUser.uid, {
        uid: authUser.uid,
        displayName: profile?.displayName || authUser.displayName || authUser.email?.split("@")[0] || "You",
        email: profile?.email || authUser.email || "",
        phoneNumber: profile?.phoneNumber || "",
        photoURL: profile?.photoURL || authUser.photoURL || "",
      });
    }
    return map;
  }, [allUsers, authUser, profile]);

  const selectedTheme       = selectedConversation?.themeBy?.[authUser?.uid] || "default";
  const selectedPartnerTyping = selectedConversation?.typing?.[selectedUser?.uid] || false;
  const selectedMuted       = selectedConversation?.mutedBy?.[authUser?.uid] || false;
  const selectedCall        = selectedConversation?.callState || null;
  const activeThread        = activeThreadType === "direct" ? selectedUser : activeThreadType === "group" ? selectedGroup : selectedChannel;
  const activeThreadName    = activeThreadType === "direct" ? selectedUser?.displayName : activeThreadType === "group" ? selectedGroup?.name : selectedChannel?.name;

  const groupMemberUsers = useMemo(() => {
    if (!selectedGroup?.memberIds?.length) return [];
    return selectedGroup.memberIds
      .map((memberId) => usersById.get(memberId))
      .filter(Boolean)
      .sort((a, b) => (a.displayName || "").localeCompare(b.displayName || ""));
  }, [selectedGroup?.memberIds, usersById]);
  const isGroupAdmin = activeThreadType === "group" && !!selectedGroup?.admins?.includes(authUser?.uid);

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

  useEffect(() => {
    setShowGroupMembers(false);
  }, [activeThreadType, selectedGroup?.id]);

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
      admins: arrayRemove(authUser.uid),
      updatedAt: serverTimestamp(),
    });
    setStatusText("✓ You left the group.");
  };

  const addGroupMember = async (memberUid) => {
    if (!selectedGroup?.id || !memberUid || !isGroupAdmin) return;
    try {
      await updateDoc(doc(db, "groups", selectedGroup.id), {
        memberIds: arrayUnion(memberUid),
        updatedAt: serverTimestamp(),
      });
      setStatusText("✓ Member added to group.");
    } catch (e) {
      setStatusText(`Could not add member: ${e.message}`);
    }
  };

  const toggleGroupAdmin = async (memberUid, makeAdmin) => {
    if (!selectedGroup?.id || !memberUid || !isGroupAdmin) return;
    if (!makeAdmin && memberUid === selectedGroup.createdBy) {
      setStatusText("Group creator must remain an admin.");
      return;
    }
    try {
      await updateDoc(doc(db, "groups", selectedGroup.id), {
        admins: makeAdmin ? arrayUnion(memberUid) : arrayRemove(memberUid),
        updatedAt: serverTimestamp(),
      });
      setStatusText(makeAdmin ? "✓ Admin granted." : "✓ Admin removed.");
    } catch (e) {
      setStatusText(`Could not update admin role: ${e.message}`);
    }
  };

  const removeGroupMember = async (memberUid) => {
    if (!selectedGroup?.id || !memberUid || !isGroupAdmin) return;
    if (memberUid === authUser.uid) {
      setStatusText("Use Leave Group to remove yourself.");
      return;
    }
    if (memberUid === selectedGroup.createdBy) {
      setStatusText("Group creator cannot be removed.");
      return;
    }
    try {
      await updateDoc(doc(db, "groups", selectedGroup.id), {
        memberIds: arrayRemove(memberUid),
        admins: arrayRemove(memberUid),
        updatedAt: serverTimestamp(),
      });
      setStatusText("✓ Member removed.");
    } catch (e) {
      setStatusText(`Could not remove member: ${e.message}`);
    }
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
      <ChatHeader
        activeThreadType={activeThreadType}
        selectedUser={selectedUser}
        selectedGroup={selectedGroup}
        selectedChannel={selectedChannel}
        activeThreadName={activeThreadName}
        showCallLogs={showCallLogs}
        setShowCallLogs={setShowCallLogs}
        startCall={startCall}
        selectedMuted={selectedMuted}
        setMute={setMute}
        selectedTheme={selectedTheme}
        setTheme={setTheme}
        deleteChatHistory={deleteChatHistory}
        leaveGroup={leaveGroup}
        toggleFollowChannel={toggleFollowChannel}
        authUser={authUser}
        setShowGroupMembers={setShowGroupMembers}
        THEMES={THEMES}
      />

      <ChatToolbar chatSearch={chatSearch} setChatSearch={setChatSearch} />

      {activeThreadType === "group" && showGroupMembers && (
        <div className="qx-call-logs-panel">
          <div className="qx-call-logs-header">
            <h4>Group members · {(selectedGroup?.memberIds || []).length}</h4>
            <button className="qx-call-logs-close" onClick={() => setShowGroupMembers(false)}>✕</button>
          </div>
          <div className="qx-call-logs-list">
            <div className="qx-call-log-item">
              <div className="qx-call-log-details">
                <div className="qx-call-log-type">Group admin(s)</div>
                <div className="qx-call-log-status">
                  {(selectedGroup?.admins || [])
                    .map((id) => usersById.get(id)?.displayName || "Unknown")
                    .join(", ") || "None"}
                </div>
              </div>
            </div>
            {groupMemberUsers.map((member) => {
              const memberIsAdmin = (selectedGroup?.admins || []).includes(member.uid);
              const isMe = member.uid === authUser.uid;
              return (
                <div key={member.uid} className="qx-call-log-item">
                  <div className="qx-call-log-details">
                    <div className="qx-call-log-type">
                      {member.displayName || member.email || "Member"} {isMe ? "(You)" : ""}
                    </div>
                    <div className="qx-call-log-status">
                      {memberIsAdmin ? "Admin" : "Member"} · {member.email || member.phoneNumber || "No contact"}
                    </div>
                  </div>
                  {isGroupAdmin && !isMe && (
                    <div className="qx-call-log-actions">
                      <button
                        className="qx-call-log-callback"
                        title={memberIsAdmin ? "Remove admin" : "Make admin"}
                        onClick={() => toggleGroupAdmin(member.uid, !memberIsAdmin)}
                      >
                        {memberIsAdmin ? "⬇️" : "⬆️"}
                      </button>
                      <button
                        className="qx-call-log-callback"
                        title="Remove from group"
                        onClick={() => removeGroupMember(member.uid)}
                      >
                        ➖
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
            {isGroupAdmin && (
              <>
                <div className="qx-call-log-item">
                  <div className="qx-call-log-details">
                    <div className="qx-call-log-type">Add more members</div>
                    <div className="qx-call-log-status">Select from your contacts list</div>
                  </div>
                </div>
                {contacts
                  .filter((entry) => !(selectedGroup?.memberIds || []).includes(entry.uid))
                  .map((entry) => (
                    <div key={entry.uid} className="qx-call-log-item">
                      <div className="qx-call-log-details">
                        <div className="qx-call-log-type">{entry.displayName || entry.email || "Contact"}</div>
                        <div className="qx-call-log-status">{entry.email || entry.phoneNumber || "No contact"}</div>
                      </div>
                      <div className="qx-call-log-actions">
                        <button className="qx-call-log-callback" title="Add member" onClick={() => addGroupMember(entry.uid)}>
                          ➕
                        </button>
                      </div>
                    </div>
                  ))}
              </>
            )}
          </div>
        </div>
      )}

      <ChatCallPanels
        showCallLogs={showCallLogs}
        activeThreadType={activeThreadType}
        callLogs={callLogs}
        setShowCallLogs={setShowCallLogs}
        getCallIcon={getCallIcon}
        getCallStatusText={getCallStatusText}
        formatCallTime={formatCallTime}
        startCall={startCall}
        selectedCall={selectedCall}
        authUser={authUser}
        selectedUser={selectedUser}
        formatCallDuration={formatCallDuration}
        callDurationSec={callDurationSec}
        acceptCall={acceptCall}
        endCall={endCall}
        toggleMute={toggleMute}
        isMuted={isMuted}
        toggleVideo={toggleVideo}
        isVideoOff={isVideoOff}
        localCallStream={localCallStream}
        remoteCallStream={remoteCallStream}
        remoteVideoRef={remoteVideoRef}
        localVideoRef={localVideoRef}
      />

      <ChatMessages
        visibleMessages={visibleMessages}
        authUser={authUser}
        selectedUser={selectedUser}
        activeThreadType={activeThreadType}
        formatDate={formatDate}
        formatTime={formatTime}
        formatCallDuration={formatCallDuration}
        startCall={startCall}
        activeThreadName={activeThreadName}
        usersById={usersById}
        setImagePreview={setImagePreview}
        setReplyTo={setReplyTo}
        setReplyTargetUser={setReplyTargetUser}
        replyPrivately={replyPrivately}
        setForwardOpenFor={setForwardOpenFor}
        forwardOpenFor={forwardOpenFor}
        deleteForEveryone={deleteForEveryone}
        deleteForMe={deleteForMe}
        toggleMessageFlag={toggleMessageFlag}
        contacts={contacts}
        forwardMessage={forwardMessage}
        messagesEndRef={messagesEndRef}
        setMessageInput={setMessageInput}
        setEditingMessageId={setEditingMessageId}
      />

      <ChatComposer
        activeThreadType={activeThreadType}
        selectedPartnerTyping={selectedPartnerTyping}
        selectedUser={selectedUser}
        replyTo={replyTo}
        authUser={authUser}
        replyTargetUser={replyTargetUser}
        activeThreadName={activeThreadName}
        setReplyTo={setReplyTo}
        setReplyTargetUser={setReplyTargetUser}
        composerRef={composerRef}
        setShowEmojiPicker={setShowEmojiPicker}
        showEmojiPicker={showEmojiPicker}
        messageInput={messageInput}
        onMessageChange={onMessageChange}
        editingMessageId={editingMessageId}
        messages={messages}
        editMessage={editMessage}
        sendMessage={sendMessage}
        sendingAttachment={sendingAttachment}
        uploadProgress={uploadProgress}
        imagePreview={imagePreview}
        setImagePreview={setImagePreview}
        statusText={statusText}
      />
    </div>
  );
};

export default ChatWindow;
