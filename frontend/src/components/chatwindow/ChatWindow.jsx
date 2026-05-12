import { useEffect, useMemo, useRef, useState } from "react";
import "./chatwindow.base.css";
import "./chatwindow.header.css";
import "./chatwindow.messages.css";
import "./chatwindow.composer.css";
import "./chatwindow.overlays.css";
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
import {
  deleteChatMessageForEveryone,
  deleteChatMessageForMe,
  editChatMessage,
  sendChatMessage,
  toggleChatMessageFlag,
  fetchThreadMessages,
  fetchCallLogs,
  fetchSignals,
  deleteSignal as deleteSignalApi,
  markConversationSeen,
  updateConversationMeta,
  addConversationCallLog,
  addConversationMessage,
  addConversationSignal,
  clearConversationForUser,
} from "../../services/chatService";
import { uploadMedia } from "../../services/mediaService";

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
  onOpenGroupDetails,
  onOpenMobileSidebar,
  onLeaveGroup,
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

  // ── Messages polling — direct ───────────────────────────────────────────
  useEffect(() => {
    if (!authUser?.uid || !selectedUser?.uid || activeThreadType !== "direct" || !selectedConversationId) return undefined;

    let alive = true;
    let inFlight = false;
    const run = async () => {
      if (!alive || inFlight || document.hidden) return;
      inFlight = true;
      try {
        const { messages: next = [] } = await fetchThreadMessages("direct", selectedConversationId, authUser.uid);
        if (!alive) return;
        setMessages(next);
        if (next.some((m) => m.receiverId === authUser.uid && !(m.readBy || []).includes(authUser.uid))) {
          await markConversationSeen(selectedConversationId, authUser.uid);
        }
      } catch (error) {
        console.error("direct polling error", error);
      } finally {
        inFlight = false;
      }
    };

    run();
    const timer = setInterval(run, 7000);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, [authUser?.uid, selectedUser?.uid, activeThreadType, selectedConversationId]);

  // ── Messages polling — group ────────────────────────────────────────────
  useEffect(() => {
    if (!authUser?.uid || !selectedGroup?.id || activeThreadType !== "group") return undefined;
    let alive = true;
    let inFlight = false;
    const run = async () => {
      if (!alive || inFlight || document.hidden) return;
      inFlight = true;
      try {
        const { messages: next = [] } = await fetchThreadMessages("group", selectedGroup.id, authUser.uid);
        if (alive) setMessages(next);
      } catch (error) {
        console.error("group polling error", error);
      } finally {
        inFlight = false;
      }
    };
    run();
    const timer = setInterval(run, 7000);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, [authUser?.uid, selectedGroup?.id, activeThreadType]);

  // ── Messages polling — channel ──────────────────────────────────────────
  useEffect(() => {
    if (!authUser?.uid || !selectedChannel?.id || activeThreadType !== "channel") return undefined;
    let alive = true;
    let inFlight = false;
    const run = async () => {
      if (!alive || inFlight || document.hidden) return;
      inFlight = true;
      try {
        const { messages: next = [] } = await fetchThreadMessages("channel", selectedChannel.id, authUser.uid);
        if (alive) setMessages(next);
      } catch (error) {
        console.error("channel polling error", error);
      } finally {
        inFlight = false;
      }
    };
    run();
    const timer = setInterval(run, 7000);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, [authUser?.uid, selectedChannel?.id, activeThreadType]);

  // ── Call logs polling ───────────────────────────────────────────────────
  useEffect(() => {
    if (!authUser?.uid || !selectedConversationId) return undefined;
    let alive = true;
    let inFlight = false;
    const run = async () => {
      if (!alive || inFlight || document.hidden) return;
      inFlight = true;
      try {
        const { logs = [] } = await fetchCallLogs(selectedConversationId);
        if (alive) setCallLogs(logs);
      } catch (error) {
        console.error("call log polling error", error);
      } finally {
        inFlight = false;
      }
    };
    run();
    const timer = setInterval(run, 15_000);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, [authUser?.uid, selectedConversationId]);

  // ── Call signals polling ─────────────────────────────────────────────────
  useEffect(() => {
    if (!authUser?.uid || !selectedConversationId) return undefined;

    let alive = true;
    let inFlight = false;
    const run = async () => {
      if (!alive || inFlight || document.hidden) return;
      inFlight = true;
      try {
        const { signals = [] } = await fetchSignals(selectedConversationId, authUser.uid);
        for (const signal of signals) {
          if (!alive) return;
          try {
            if (signal.type === "offer") {
              setIncomingOffer(signal.sdp);
            } else if (signal.type === "answer" && peerConnectionRef.current) {
              await applyRemoteDescription(peerConnectionRef.current, signal.sdp);
              const currentCall = selectedCallRef.current;
              if (currentCall?.status !== "active") {
                await setCallState({
                  ...currentCall,
                  status: "active",
                  startedAt: currentCall?.startedAt || new Date().toISOString(),
                });
              }
            } else if (signal.type === "candidate" && peerConnectionRef.current) {
              const candidate = new RTCIceCandidate(signal.candidate);
              if (!hasRemoteDescRef.current) {
                pendingIceCandidatesRef.current.push(candidate);
              } else {
                await peerConnectionRef.current.addIceCandidate(candidate).catch(() => {});
              }
            } else if (signal.type === "hangup") {
              await setCallState({
                status: "ended",
                endedAt: new Date().toISOString(),
                endedBy: signal.from,
                reason: signal.reason || "hangup",
              });
              stopCallMedia();
            }
          } finally {
            await deleteSignalApi(selectedConversationId, signal.id).catch(() => {});
          }
        }
      } catch (error) {
        console.error("signal polling error", error);
      } finally {
        inFlight = false;
      }
    };

    run();
    const timer = setInterval(run, 4000);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, [authUser?.uid, selectedConversationId]);

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
    if (!authUser?.uid || !selectedConversationId) return;
    try {
      await updateConversationMeta(selectedConversationId, {
        participants: [authUser.uid, selectedUser?.uid],
      });
      await addConversationCallLog(selectedConversationId, callData);
    } catch (e) {
      console.error("saveCallLogOnly error:", e);
    }
  };

  /**
   * Save a call log entry AND a call message in the chat thread.
   * Called only by the party who explicitly ends the call (endCall).
   */
  const saveCallLogAndMessage = async (callData) => {
    if (!authUser?.uid || !selectedConversationId || !selectedUser?.uid) return;
    try {
      await updateConversationMeta(selectedConversationId, {
        participants: [authUser.uid, selectedUser.uid],
      });
      await addConversationCallLog(selectedConversationId, callData);
      await addConversationMessage(selectedConversationId, {
        type: "call",
        callType: callData.type,
        callStatus: callData.status,
        duration: callData.duration || 0,
        senderId: callData.callerId,
        receiverId: callData.receiverId,
        readBy: [authUser.uid],
      });
    } catch (e) {
      console.error("saveCallLogAndMessage error:", e);
    }
  };

  const setCallState = async (nextCallState) => {
    if (!authUser?.uid || !selectedConversationId) return;
    try {
      await updateConversationMeta(selectedConversationId, { callState: nextCallState });
      if (onUpdateCallState) onUpdateCallState(nextCallState);
    } catch (e) {
      console.error("setCallState error:", e);
    }
  };

  const sendCallSignal = async (payload) => {
    if (!authUser?.uid || !selectedUser?.uid || !selectedConversationId) return;
    try {
      await addConversationSignal(selectedConversationId, {
        ...payload,
        from: authUser.uid,
        to: selectedUser.uid,
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
        startedAt: new Date().toISOString(),
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
      endedAt:    new Date().toISOString(),
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

    setUploadProgress(20);
    const folder = (path || "attachments").split("/")[0] || "attachments";
    const { url } = await uploadMedia({ uid: authUser?.uid || "unknown", folder, file });
    setUploadProgress(100);
    setTimeout(() => setUploadProgress(0), 150);
    return url;
  };

  const updateTypingState = async (isTyping) => {
    if (!authUser?.uid || !selectedUser?.uid || activeThreadType !== "direct" || !selectedConversationId) return;
    try {
      await updateConversationMeta(selectedConversationId, { typing: { [authUser.uid]: isTyping } });
    } catch {}
  };

  const inferMessageTypeFromFile = (file) => {
    if (!file?.type) return "file";
    if (file.type.startsWith("image/")) return "image";
    if (file.type.startsWith("video/")) return "video";
    if (file.type.startsWith("audio/")) return "audio";
    return "file";
  };

  const pushOptimisticMessage = ({ payload, threadType }) => {
    const optimisticId = `local-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const optimisticMessage = {
      id: optimisticId,
      ...payload,
      senderId: authUser?.uid,
      senderName: profile?.displayName || "You",
      receiverId: threadType === "direct" ? selectedUser?.uid : undefined,
      createdAt: new Date().toISOString(),
      readBy: [authUser?.uid].filter(Boolean),
      deliveredTo: [authUser?.uid].filter(Boolean),
      _optimistic: true,
    };
    setMessages((prev) => [...prev, optimisticMessage]);
  };

  const refreshActiveThreadMessages = async () => {
    try {
      if (activeThreadType === "direct" && selectedConversationId && authUser?.uid) {
        const { messages: next = [] } = await fetchThreadMessages("direct", selectedConversationId, authUser.uid);
        setMessages(next);
        return;
      }
      if (activeThreadType === "group" && selectedGroup?.id && authUser?.uid) {
        const { messages: next = [] } = await fetchThreadMessages("group", selectedGroup.id, authUser.uid);
        setMessages(next);
        return;
      }
      if (activeThreadType === "channel" && selectedChannel?.id && authUser?.uid) {
        const { messages: next = [] } = await fetchThreadMessages("channel", selectedChannel.id, authUser.uid);
        setMessages(next);
      }
    } catch {
      // Keep optimistic state if immediate refresh fails.
    }
  };

  // Backend domain endpoint handles persistence logic for direct/group/channel sends.
  const sendMessage = async ({ text = "", file = null, forwardedFrom = null } = {}) => {
    if (!authUser?.uid || !profile) {
      setStatusText("Database connection error");
      return false;
    }
    if (!text.trim() && !file) return false;
    const previousInput = messageInput;
    setMessageInput("");

    if (activeThreadType === "group" && selectedGroup) {
      try {
        let payload = { text: text.trim(), type: "text" };
        if (file) {
          setSendingAttachment(true);
          try {
            const fileURL = await uploadToStorage(`group/${selectedGroup.id}`, file);
            payload = {
              type: inferMessageTypeFromFile(file),
              text: text.trim() || file.name,
              fileURL,
              fileName: file.name,
              fileSize: file.size,
              mimeType: file.type || null,
            };
          } catch (err) {
            setMessageInput(previousInput);
            setStatusText(err?.message || "Attachment upload failed.");
            setSendingAttachment(false);
            return false;
          } finally {
            setSendingAttachment(false);
          }
        }
        const messagePayload = {
          ...payload,
          ...(replyTo
            ? {
                replyTo: {
                  id: replyTo.id,
                  text: replyTo.text,
                  senderId: replyTo.senderId,
                  senderName: replyTo.senderName || usersById.get(replyTo.senderId)?.displayName || "Member",
                },
              }
            : {}),
        };
        pushOptimisticMessage({ payload: messagePayload, threadType: "group" });
        await sendChatMessage({
          threadType: "group",
          threadId: selectedGroup.id,
          actorUid: authUser.uid,
          actorName: profile.displayName,
          payload,
          replyTo: replyTo
            ? {
                id: replyTo.id,
                text: replyTo.text,
                senderId: replyTo.senderId,
                senderName: replyTo.senderName || usersById.get(replyTo.senderId)?.displayName || "Member",
              }
            : null,
        });
        setReplyTo(null);
        setReplyTargetUser(null);
        refreshActiveThreadMessages();
      } catch (e) {
        setMessageInput(previousInput);
        setStatusText("Failed to send: " + e.message);
        return false;
      }
      return true;
    }

    if (activeThreadType === "channel" && selectedChannel) {
      if (selectedChannel.ownerId !== authUser.uid) {
        setStatusText("Only channel owner can publish posts.");
        return false;
      }
      try {
        let payload = { text: text.trim(), type: "post" };
        if (file) {
          setSendingAttachment(true);
          try {
            const fileURL = await uploadToStorage(`channel/${selectedChannel.id}`, file);
            payload = {
              type: inferMessageTypeFromFile(file),
              text: text.trim() || file.name,
              fileURL,
              fileName: file.name,
              fileSize: file.size,
              mimeType: file.type || null,
            };
          } catch (err) {
            setMessageInput(previousInput);
            setStatusText(err?.message || "Attachment upload failed.");
            setSendingAttachment(false);
            return false;
          } finally {
            setSendingAttachment(false);
          }
        }
        pushOptimisticMessage({
          payload,
          threadType: "channel",
        });
        await sendChatMessage({
          threadType: "channel",
          threadId: selectedChannel.id,
          actorUid: authUser.uid,
          actorName: profile.displayName,
          payload,
        });
        setReplyTo(null);
        setReplyTargetUser(null);
        refreshActiveThreadMessages();
        setStatusText("Post published!");
        setTimeout(() => setStatusText(""), 2000);
      } catch (e) {
        setMessageInput(previousInput);
        setStatusText("Failed to send post: " + e.message);
        return false;
      }
      return true;
    }

    if (activeThreadType === "direct") {
      if (!selectedUser?.uid || !selectedConversationId) {
        setStatusText("No conversation selected.");
        return false;
      }

      let payload = { type: "text", text: text.trim() };
      if (file) {
        setSendingAttachment(true);
        try {
          const fileURL = await uploadToStorage(`attachments/${selectedConversationId}`, file);
          payload = {
            type: inferMessageTypeFromFile(file),
            text: text.trim() || file.name,
            fileURL,
            fileName: file.name,
            fileSize: file.size,
            mimeType: file.type || null,
          };
        } catch (err) {
          setMessageInput(previousInput);
          setStatusText(err?.message || "Attachment upload failed.");
          setSendingAttachment(false);
          return false;
        } finally {
          setSendingAttachment(false);
        }
      }

      if (forwardedFrom) payload.forwardedFrom = forwardedFrom;
      const replyPayload = replyTo ? { id: replyTo.id, text: replyTo.text, senderId: replyTo.senderId } : null;

      try {
        pushOptimisticMessage({
          payload: {
            ...payload,
            replyTo: replyPayload || undefined,
          },
          threadType: "direct",
        });
        await sendChatMessage({
          threadType: "direct",
          threadId: selectedConversationId,
          actorUid: authUser.uid,
          actorName: profile.displayName,
          actorPhone: profile.phoneNumber || "",
          targetUid: selectedUser.uid,
          targetPhone: selectedUser.phoneNumber || "",
          isTargetOnline: Boolean(selectedUser?.isOnline),
          payload,
          replyTo: replyPayload,
        });
        setReplyTo(null);
        setReplyTargetUser(null);
        updateTypingState(false);
        setEditingMessageId(null);
        refreshActiveThreadMessages();
      } catch (e) {
        setMessageInput(previousInput);
        console.error("sendMessage error:", e);
        setStatusText("Failed to send: " + e.message);
        setTimeout(() => setStatusText(""), 3000);
        return false;
      }
      return true;
    }

    return false;
  };

  const sendDirectMessageToUser = async ({ targetUser, payload }) => {
    if (!authUser || !profile || !targetUser || !payload) return;
    const conversationId = conversationIdFor(authUser.uid, targetUser.uid);
    await sendChatMessage({
      threadType: "direct",
      threadId: conversationId,
      actorUid: authUser.uid,
      actorName: profile.displayName,
      actorPhone: profile.phoneNumber || "",
      targetUid: targetUser.uid,
      targetPhone: targetUser.phoneNumber || "",
      isTargetOnline: Boolean(targetUser?.isOnline),
      payload,
    });
  };

  const forwardMessage = async (message, targetUid) => {
    if (!authUser?.uid || !targetUid) return;
    const targetUser = allUsers.find((u) => u.uid === targetUid);
    if (!targetUser) return;
    await sendDirectMessageToUser({
      targetUser,
      payload: {
        type: ["image", "video", "audio", "file"].includes(message.type) ? message.type : "text",
        text: message.text || message.fileName || "Forwarded message",
        fileURL: message.fileURL || null,
        fileName: message.fileName || null,
        fileSize: message.fileSize || null,
        mimeType: message.mimeType || null,
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
      await editChatMessage({ threadType: "direct", threadId: selectedConversationId, messageId: msg.id, text: newText });
    }
    if (activeThreadType === "group" && selectedGroup) {
      await editChatMessage({ threadType: "group", threadId: selectedGroup.id, messageId: msg.id, text: newText });
    }
    setMessageInput("");
    setEditingMessageId(null);
    setStatusText("✓ Message edited.");
  };

  const deleteForMe = async (msg) => {
    if (!authUser) return;
    if (activeThreadType === "direct" && selectedConversationId) {
      await deleteChatMessageForMe({ threadType: "direct", threadId: selectedConversationId, messageId: msg.id, actorUid: authUser.uid });
    }
    if (activeThreadType === "group" && selectedGroup) {
      await deleteChatMessageForMe({ threadType: "group", threadId: selectedGroup.id, messageId: msg.id, actorUid: authUser.uid });
    }
  };

  const deleteForEveryone = async (msg) => {
    if (!authUser || msg.senderId !== authUser.uid) return;
    if (activeThreadType === "direct" && selectedConversationId) {
      await deleteChatMessageForEveryone({ threadType: "direct", threadId: selectedConversationId, messageId: msg.id });
    }
    if (activeThreadType === "group" && selectedGroup) {
      await deleteChatMessageForEveryone({ threadType: "group", threadId: selectedGroup.id, messageId: msg.id });
    }
  };

  const toggleMessageFlag = async (msg, key) => {
    if (!authUser) return;
    const alreadyFlagged = (msg[key] || []).includes(authUser.uid);
    if (activeThreadType === "direct" && selectedConversationId) {
      await toggleChatMessageFlag({
        threadType: "direct",
        threadId: selectedConversationId,
        messageId: msg.id,
        actorUid: authUser.uid,
        key,
        alreadyFlagged,
      });
    }
    if (activeThreadType === "group" && selectedGroup) {
      await toggleChatMessageFlag({
        threadType: "group",
        threadId: selectedGroup.id,
        messageId: msg.id,
        actorUid: authUser.uid,
        key,
        alreadyFlagged,
      });
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
    if (!authUser?.uid || !selectedConversationId) return;
    await updateConversationMeta(selectedConversationId, {
      mutedBy: { [authUser.uid]: !selectedMuted },
    }).catch(console.error);
  };

  const setTheme = async (theme) => {
    if (!authUser?.uid || !selectedConversationId) return;
    await updateConversationMeta(selectedConversationId, {
      themeBy: { [authUser.uid]: theme },
    }).catch(console.error);
  };

  const deleteChatHistory = async () => {
    if (!authUser?.uid || !selectedConversationId) return;
    if (!window.confirm("Clear this conversation's history?")) return;
    try {
      await clearConversationForUser(selectedConversationId, authUser.uid);
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

  // ═════════════════════════════════════════════════════════════════════════
  // ── Guards ────────────────────────────────────────────────────────────────
  // ═════════════════════════════════════════════════════════════════════════

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
        leaveGroup={onLeaveGroup}
        toggleFollowChannel={toggleFollowChannel}
        authUser={authUser}
        onOpenGroupDetails={onOpenGroupDetails}
        onOpenMobileSidebar={onOpenMobileSidebar}
        themes={THEMES}
      />

      <ChatToolbar chatSearch={chatSearch} setChatSearch={setChatSearch} />

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
        setStatusText={setStatusText}
      />
    </div>
  );
};

export default ChatWindow;
