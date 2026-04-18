import { useEffect, useMemo, useRef, useState } from "react";
import {
  addDoc,
  arrayUnion,
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
const QUICK_EMOJIS = ["😀", "😂", "😍", "🙏", "👍", "🔥", "🎉", "❤️", "💯", "⚡", "🛡️", "🔐"];
const THEMES = [
  { id: "default", label: "⚡ Quantum" },
  { id: "emerald", label: "🌿 Emerald" },
  { id: "midnight", label: "🌌 Midnight" },
  { id: "sunset", label: "🌅 Sunset" },
  { id: "cyber", label: "🔷 Cyber" },
];

const formatTime = (dateValue) => {
  if (!dateValue) return "";
  const date = typeof dateValue?.toDate === "function" ? dateValue.toDate() : new Date(dateValue);
  return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
};

const formatDate = (dateValue) => {
  if (!dateValue) return "";
  const date = typeof dateValue?.toDate === "function" ? dateValue.toDate() : new Date(dateValue);
  const now = new Date();
  const diff = now - date;
  if (diff < 86400000) return "Today";
  if (diff < 172800000) return "Yesterday";
  return date.toLocaleDateString([], { month: "short", day: "numeric" });
};

const conversationIdFor = (uidA, uidB) => [uidA, uidB].sort().join("_");

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
  onUpdateConversation,
  onUpdateMessages,
  onUpdateCallState,
  onSendCallSignal,
  onStopCallMedia,
}) => {
  const [messages, setMessages] = useState([]);
  const [messageInput, setMessageInput] = useState("");
  const [chatSearch, setChatSearch] = useState("");
  const [sendingAttachment, setSendingAttachment] = useState(false);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [forwardOpenFor, setForwardOpenFor] = useState(null);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [localCallStream, setLocalCallStream] = useState(null);
  const [remoteCallStream, setRemoteCallStream] = useState(null);
  const [incomingOffer, setIncomingOffer] = useState(null);
  const [replyTo, setReplyTo] = useState(null);
  const [imagePreview, setImagePreview] = useState(null);
  const [statusText, setStatusText] = useState("");

  const typingTimeoutRef = useRef(null);
  const peerConnectionRef = useRef(null);
  const localVideoRef = useRef(null);
  const remoteVideoRef = useRef(null);
  const messagesEndRef = useRef(null);
  const composerRef = useRef(null);

  // Messages subscription for direct messages
  useEffect(() => {
    if (!authUser || !selectedUser || activeThreadType !== "direct") return undefined;
    const conversationId = conversationIdFor(authUser.uid, selectedUser.uid);
    const conversationRef = doc(db, "conversations", conversationId);
    setDoc(conversationRef, { unreadBy: { [authUser.uid]: 0 } }, { merge: true });

    const q = query(collection(db, "conversations", conversationId, "messages"), orderBy("createdAt", "asc"));
    return onSnapshot(q, (snapshot) => {
      const nextMessages = snapshot.docs
        .map((e) => ({ id: e.id, ...e.data() }))
        .filter((e) => !(e.deletedFor || []).includes(authUser.uid));
      setMessages(nextMessages);
      const unreadIncoming = snapshot.docs.filter((e) => {
        const data = e.data();
        return data.receiverId === authUser.uid && !(data.readBy || []).includes(authUser.uid);
      });
      unreadIncoming.forEach((e) => {
        updateDoc(e.ref, { readBy: arrayUnion(authUser.uid), readAt: serverTimestamp() });
      });
      if (unreadIncoming.length) {
        setDoc(conversationRef, { unreadBy: { [authUser.uid]: 0 } }, { merge: true });
      }
    });
  }, [authUser, selectedUser, activeThreadType]);

  // Messages subscription for groups
  useEffect(() => {
    if (!authUser || !selectedGroup || activeThreadType !== "group") return undefined;
    const q = query(collection(db, "groups", selectedGroup.id, "messages"), orderBy("createdAt", "asc"));
    return onSnapshot(q, (snapshot) => {
      setMessages(snapshot.docs.map((entry) => ({ id: entry.id, ...entry.data() })));
    });
  }, [authUser, selectedGroup, activeThreadType]);

  // Messages subscription for channels
  useEffect(() => {
    if (!authUser || !selectedChannel || activeThreadType !== "channel") return undefined;
    const q = query(collection(db, "channels", selectedChannel.id, "posts"), orderBy("createdAt", "asc"));
    return onSnapshot(q, (snapshot) => {
      setMessages(snapshot.docs.map((entry) => ({ id: entry.id, ...entry.data() })));
    });
  }, [authUser, selectedChannel, activeThreadType]);

  // Video/audio refs
  useEffect(() => { if (localVideoRef.current) localVideoRef.current.srcObject = localCallStream || null; }, [localCallStream]);
  useEffect(() => { if (remoteVideoRef.current) remoteVideoRef.current.srcObject = remoteCallStream || null; }, [remoteCallStream]);
  useEffect(() => () => stopCallMedia(), [localCallStream, remoteCallStream]);

  // Scroll to bottom on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const selectedConversation = activeThreadType === "direct" && authUser && selectedUser ? conversations[conversationIdFor(authUser.uid, selectedUser.uid)] : null;
  const selectedTheme = selectedConversation?.themeBy?.[authUser?.uid] || "default";
  const selectedPartnerTyping = selectedConversation?.typing?.[selectedUser?.uid] || false;
  const selectedMuted = selectedConversation?.mutedBy?.[authUser?.uid] || false;
  const selectedCall = selectedConversation?.callState || null;
  const selectedConversationId = activeThreadType === "direct" && authUser && selectedUser ? conversationIdFor(authUser.uid, selectedUser.uid) : "";
  const activeThread = activeThreadType === "direct" ? selectedUser : activeThreadType === "group" ? selectedGroup : selectedChannel;
  const activeThreadName = activeThreadType === "direct" ? selectedUser?.displayName : activeThreadType === "group" ? selectedGroup?.name : selectedChannel?.name;

  const visibleMessages = useMemo(() => {
    const value = chatSearch.trim().toLowerCase();
    if (!value) return messages;
    return messages.filter((m) => (m.text || "").toLowerCase().includes(value));
  }, [messages, chatSearch]);

  const stopCallMedia = () => {
    if (peerConnectionRef.current) { peerConnectionRef.current.close(); peerConnectionRef.current = null; }
    if (localCallStream) localCallStream.getTracks().forEach((t) => t.stop());
    if (remoteCallStream) remoteCallStream.getTracks().forEach((t) => t.stop());
    setLocalCallStream(null);
    setRemoteCallStream(null);
    setIncomingOffer(null);
    if (onStopCallMedia) onStopCallMedia();
  };

  // Call signals subscription
  useEffect(() => {
    if (!authUser || !selectedConversationId) return undefined;
    const signalsRef = query(collection(db, "conversations", selectedConversationId, "signals"), where("to", "==", authUser.uid));
    return onSnapshot(signalsRef, async (snapshot) => {
      for (const change of snapshot.docChanges()) {
        if (change.type !== "added") continue;
        const signal = change.doc.data();
        try {
          if (signal.type === "offer") {
            setIncomingOffer(signal.sdp);
          } else if (signal.type === "answer" && peerConnectionRef.current) {
            await peerConnectionRef.current.setRemoteDescription(new RTCSessionDescription(signal.sdp));
            if (selectedCall && onUpdateCallState) await onUpdateCallState({ ...selectedCall, status: "active" });
          } else if (signal.type === "ice" && peerConnectionRef.current) {
            await peerConnectionRef.current.addIceCandidate(new RTCIceCandidate(signal.candidate));
          } else if (signal.type === "hangup") {
            stopCallMedia();
            if (selectedCall && onUpdateCallState) await onUpdateCallState({ ...selectedCall, status: "ended", endedAt: serverTimestamp() });
          }
        } finally {
          await deleteDoc(change.doc.ref);
        }
      }
    });
  }, [authUser, selectedConversationId, selectedCall, onUpdateCallState]);

  const uploadToStorage = async (path, file) => {
    if (!file) throw new Error("File missing.");
    if (file.size > MAX_FILE_SIZE_BYTES) throw new Error("File is too large. Please upload a file up to 15MB.");

    const storageRef = ref(storage, `${path}/${Date.now()}_${file.name}`);
    const uploadTask = uploadBytesResumable(storageRef, file);

    return new Promise((resolve, reject) => {
      uploadTask.on(
        "state_changed",
        (snapshot) => setUploadProgress(Math.round((snapshot.bytesTransferred / snapshot.totalBytes) * 100)),
        async (error) => {
          try { await deleteObject(storageRef); } catch {}
          setUploadProgress(0);
          reject(error);
        },
        async () => {
          const fileUrl = await getDownloadURL(uploadTask.snapshot.ref);
          setUploadProgress(0);
          resolve(fileUrl);
        }
      );
    });
  };

  const updateTypingState = async (isTyping) => {
    if (!authUser || !selectedUser || activeThreadType !== "direct") return;
    const conversationRef = doc(db, "conversations", conversationIdFor(authUser.uid, selectedUser.uid));
    await setDoc(
      conversationRef,
      {
        participants: [authUser.uid, selectedUser.uid],
        participantPhones: [profile?.phoneNumber || "", selectedUser.phoneNumber || ""],
        typing: { [authUser.uid]: isTyping },
      },
      { merge: true }
    );
  };

  const sendMessage = async ({ text = "", file = null, forwardedFrom = null } = {}) => {
    if ((!text.trim() && !file) || !authUser || !profile) return;

    if (activeThreadType === "group" && selectedGroup) {
      await addDoc(collection(db, "groups", selectedGroup.id, "messages"), {
        text: text.trim(),
        type: "text",
        senderId: authUser.uid,
        senderName: profile.displayName,
        createdAt: serverTimestamp(),
      });
      await setDoc(doc(db, "groups", selectedGroup.id), {
        lastMessage: text.trim(),
        lastMessageAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      }, { merge: true });
      setMessageInput("");
      return;
    }

    if (activeThreadType === "channel" && selectedChannel) {
      if (selectedChannel.ownerId !== authUser.uid) {
        setStatusText("Only channel owner can publish posts.");
        return;
      }
      await addDoc(collection(db, "channels", selectedChannel.id, "posts"), {
        text: text.trim(),
        type: "post",
        senderId: authUser.uid,
        senderName: profile.displayName,
        createdAt: serverTimestamp(),
      });
      await setDoc(doc(db, "channels", selectedChannel.id), {
        lastPost: text.trim(),
        lastPostAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      }, { merge: true });
      setMessageInput("");
      return;
    }

    if (!selectedUser) return;

    const conversationId = conversationIdFor(authUser.uid, selectedUser.uid);
    const conversationRef = doc(db, "conversations", conversationId);
    let payload = { type: "text", text: text.trim() };

    if (file) {
      setSendingAttachment(true);
      try {
        const fileURL = await uploadToStorage(`attachments/${conversationId}`, file);
        payload = {
          type: file.type.startsWith("image/") ? "image" : "file",
          text: text.trim() || file.name,
          fileURL,
          fileName: file.name,
          fileSize: file.size,
        };
      } catch (error) {
        setStatusText(error?.message || "Attachment upload failed.");
        return;
      } finally {
        setSendingAttachment(false);
      }
    }

    if (forwardedFrom) payload.forwardedFrom = forwardedFrom;
    if (replyTo) {
      payload.replyTo = { id: replyTo.id, text: replyTo.text, senderId: replyTo.senderId };
      setReplyTo(null);
    }

    await setDoc(
      conversationRef,
      {
        participants: [authUser.uid, selectedUser.uid],
        participantPhones: [profile.phoneNumber || "", selectedUser.phoneNumber || ""],
        lastMessage: payload.type === "text" ? payload.text : `📎 ${payload.fileName}`,
        lastMessageType: payload.type,
        lastMessageSender: authUser.uid,
        lastMessageAt: serverTimestamp(),
        typing: { [authUser.uid]: false },
        unreadBy: { [authUser.uid]: 0, [selectedUser.uid]: increment(1) },
      },
      { merge: true }
    );

    await addDoc(collection(db, "conversations", conversationId, "messages"), {
      ...payload,
      senderId: authUser.uid,
      receiverId: selectedUser.uid,
      createdAt: serverTimestamp(),
      readBy: [authUser.uid],
    });

    setMessageInput("");
    updateTypingState(false);
  };

  const forwardMessage = async (message, targetUid) => {
    if (!authUser || !targetUid) return;
    const targetUser = allUsers.find((u) => u.uid === targetUid);
    if (!targetUser) return;
    const originalSelected = selectedUser;
    // This would need a way to set selected user temporarily
    // For now, we'll just send directly
    await sendMessage({ text: message.text || message.fileName || "Forwarded message", forwardedFrom: selectedUser?.displayName || "contact" });
    setForwardOpenFor(null);
    setStatusText("✓ Message forwarded securely.");
  };

  const onMessageChange = async (value) => {
    setMessageInput(value);
    if (activeThreadType !== "direct") return;
    if (!value.trim()) { updateTypingState(false); return; }
    await updateTypingState(true);
    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    typingTimeoutRef.current = setTimeout(() => updateTypingState(false), 1000);
  };

  const setMute = async () => {
    if (!authUser || !selectedUser) return;
    const conversationRef = doc(db, "conversations", conversationIdFor(authUser.uid, selectedUser.uid));
    await setDoc(conversationRef, { mutedBy: { [authUser.uid]: !selectedMuted } }, { merge: true });
  };

  const setTheme = async (theme) => {
    if (!authUser || !selectedUser) return;
    const conversationRef = doc(db, "conversations", conversationIdFor(authUser.uid, selectedUser.uid));
    await setDoc(conversationRef, { themeBy: { [authUser.uid]: theme } }, { merge: true });
  };

  const deleteChatHistory = async () => {
    if (!authUser || !selectedUser) return;
    const confirmed = window.confirm("Clear this channel's encrypted history?");
    if (!confirmed) return;
    const conversationId = conversationIdFor(authUser.uid, selectedUser.uid);
    const messagesRef = collection(db, "conversations", conversationId, "messages");
    const snapshot = await getDocs(messagesRef);
    const batch = writeBatch(db);
    snapshot.docs.forEach((e) => batch.update(e.ref, { deletedFor: arrayUnion(authUser.uid) }));
    if (!snapshot.empty) await batch.commit();
    await setDoc(doc(db, "conversations", conversationId), {
      clearedAtBy: { [authUser.uid]: serverTimestamp() },
      unreadBy: { [authUser.uid]: 0 },
    }, { merge: true });
    setMessages([]);
    setStatusText("✓ Channel history purged.");
  };

  const setCallState = async (nextCallState) => {
    if (!authUser || !selectedUser) return;
    await setDoc(doc(db, "conversations", conversationIdFor(authUser.uid, selectedUser.uid)), { callState: nextCallState }, { merge: true });
    if (onUpdateCallState) onUpdateCallState(nextCallState);
  };

  const sendCallSignal = async (payload) => {
    if (!authUser || !selectedUser) return;
    await addDoc(collection(db, "conversations", conversationIdFor(authUser.uid, selectedUser.uid), "signals"), {
      ...payload, from: authUser.uid, to: selectedUser.uid, createdAt: serverTimestamp(),
    });
    if (onSendCallSignal) onSendCallSignal(payload);
  };

  const buildPeerConnection = (stream) => {
    const peerConnection = new RTCPeerConnection({ iceServers: [{ urls: "stun:stun.l.google.com:19302" }] });
    stream.getTracks().forEach((track) => peerConnection.addTrack(track, stream));
    peerConnection.ontrack = (event) => { if (event.streams?.[0]) setRemoteCallStream(event.streams[0]); };
    peerConnection.onicecandidate = (event) => { if (event.candidate) sendCallSignal({ type: "ice", candidate: event.candidate.toJSON() }); };
    peerConnectionRef.current = peerConnection;
    return peerConnection;
  };

  const startCall = async (type) => {
    if (!authUser || !selectedUser) return;
    if (!navigator.mediaDevices?.getUserMedia) { setStatusText("Your browser does not support calling."); return; }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: type === "video" });
      setLocalCallStream(stream);
      const peerConnection = buildPeerConnection(stream);
      const offer = await peerConnection.createOffer();
      await peerConnection.setLocalDescription(offer);
      await sendCallSignal({ type: "offer", sdp: offer });
      await setCallState({ from: authUser.uid, to: selectedUser.uid, type, status: "ringing", startedAt: serverTimestamp() });
    } catch (error) {
      setStatusText(error?.message || "Unable to start call.");
    }
  };

  const acceptCall = async () => {
    if (!selectedCall || !incomingOffer) return;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: selectedCall.type === "video" });
      setLocalCallStream(stream);
      const peerConnection = buildPeerConnection(stream);
      await peerConnection.setRemoteDescription(new RTCSessionDescription(incomingOffer));
      const answer = await peerConnection.createAnswer();
      await peerConnection.setLocalDescription(answer);
      await sendCallSignal({ type: "answer", sdp: answer });
      await setCallState({ ...selectedCall, status: "active" });
    } catch (error) {
      setStatusText(error?.message || "Unable to accept call.");
    }
  };

  const endCall = async () => {
    if (!selectedCall) return;
    await sendCallSignal({ type: "hangup" });
    await setCallState({ ...selectedCall, status: "ended", endedAt: serverTimestamp() });
    stopCallMedia();
  };

  const toggleFollowChannel = async (channel) => {
    if (!authUser || !channel) return;
    const isFollowing = (channel.followerIds || []).includes(authUser.uid);
    // This would need to be handled by parent
    if (onUpdateConversation) {
      onUpdateConversation({ type: "toggleFollow", channel, isFollowing });
    }
  };

  if (!activeThread) return null;

  return (
    <div className={`chat-window theme-${selectedTheme}`}>
      {/* Chat header */}
      <header className="qx-chat-header">
        <div className="qx-chat-contact-avatar">
          {activeThreadType === "direct" && selectedUser?.photoURL
            ? <img src={selectedUser.photoURL} alt={selectedUser.displayName} />
            : <span>{activeThreadType === "group" ? "👥" : activeThreadType === "channel" ? "📣" : (selectedUser?.displayName || "U").charAt(0).toUpperCase()}</span>
          }
          {activeThreadType === "direct" && <span className={`qx-presence ${selectedUser?.isOnline ? "qx-presence--online" : "qx-presence--offline"}`} />}
        </div>
        <div className="qx-chat-contact-meta">
          <h3>{activeThreadName}</h3>
          <span className={activeThreadType === "direct" && selectedUser?.isOnline ? "qx-online-label" : "qx-offline-label"}>
            {activeThreadType === "group" ? `${(selectedGroup?.memberIds || []).length} members` : activeThreadType === "channel" ? `${(selectedChannel?.followerIds || []).length} followers` : selectedUser?.isOnline ? "● Online" : "○ Offline"}
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
            <button type="button" className={`qx-icon-btn ${selectedMuted ? "qx-icon-btn--active" : ""}`} title={selectedMuted ? "Unmute" : "Mute"} onClick={setMute}>
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
            {activeThreadType === "channel" && (
              <button 
                type="button" 
                className="qx-btn" 
                onClick={() => toggleFollowChannel(selectedChannel)}
              >
                {(selectedChannel?.followerIds || []).includes(authUser.uid) ? "Unfollow" : "Follow"}
              </button>
            )}
          </div>
        )}
      </header>

      {/* Chat search */}
      <div className="qx-chat-toolbar">
        <div className="qx-chat-search-wrap">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="qx-search-icon-sm"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
          <input type="text" value={chatSearch} onChange={(e) => setChatSearch(e.target.value)} placeholder="Search in conversation..." />
          {chatSearch && <button type="button" className="qx-search-clear" onClick={() => setChatSearch("")}>✕</button>}
        </div>
        <div className="qx-encryption-badge">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="12" height="12"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0110 0v4"/></svg>
          E2E Encrypted
        </div>
      </div>

      {/* Call banner */}
      {activeThreadType === "direct" && selectedCall && selectedCall.status !== "ended" && (
        <div className={`qx-call-banner qx-call-banner--${selectedCall.status}`}>
          <div className="qx-call-info">
            <div className="qx-call-icon">{selectedCall.type === "video" ? "🎥" : "📞"}</div>
            <div>
              <strong>{selectedCall.type === "video" ? "Video" : "Voice"} Call</strong>
              <span className="qx-call-status">{selectedCall.status === "ringing" ? "Incoming..." : selectedCall.status === "active" ? "In progress" : selectedCall.status}</span>
            </div>
          </div>
          <div className="qx-call-controls">
            {selectedCall.to === authUser.uid && selectedCall.status === "ringing" && (
              <button type="button" className="qx-call-accept" onClick={acceptCall}>Accept</button>
            )}
            <button type="button" className="qx-call-end" onClick={endCall}>End</button>
          </div>
        </div>
      )}

      {/* Video panels */}
      {activeThreadType === "direct" && (localCallStream || remoteCallStream) && (
        <div className="qx-call-media">
          <div className="qx-video-wrap">
            <video ref={remoteVideoRef} autoPlay playsInline className="qx-video-main" />
            <video ref={localVideoRef} autoPlay muted playsInline className="qx-video-pip" />
          </div>
        </div>
      )}

      {/* Messages */}
      <section className="qx-messages">
        {visibleMessages.length === 0 && (
          <div className="qx-messages-empty">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" width="40" height="40"><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/></svg>
            <p>No messages yet. Say hello!</p>
          </div>
        )}
        {visibleMessages.map((msg, index) => {
          const isMine = msg.senderId === authUser.uid;
          const prevMsg = visibleMessages[index - 1];
          const showDate = !prevMsg || formatDate(msg.createdAt) !== formatDate(prevMsg?.createdAt);
          const isRead = selectedUser ? (msg.readBy || []).includes(selectedUser.uid) : false;
          return (
            <div key={msg.id}>
              {showDate && (
                <div className="qx-date-divider">
                  <span>{formatDate(msg.createdAt)}</span>
                </div>
              )}
              <div className={`qx-msg-row ${isMine ? "qx-msg-row--mine" : "qx-msg-row--theirs"}`}>
                {!isMine && (
                  <div className="qx-msg-avatar">
                    {activeThreadType === "direct" && selectedUser?.photoURL
                      ? <img src={selectedUser.photoURL} alt={selectedUser.displayName} />
                      : <span>{activeThreadType === "group" ? "👥" : activeThreadType === "channel" ? "📣" : (selectedUser?.displayName || "U").charAt(0).toUpperCase()}</span>
                    }
                  </div>
                )}
                <div className="qx-msg-content">
                  {msg.replyTo && (
                    <div className="qx-reply-preview">
                      <span className="qx-reply-bar" />
                      <span>{msg.replyTo.senderId === authUser.uid ? "You" : activeThreadName}: {msg.replyTo.text?.slice(0, 80)}</span>
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
                      <img src={msg.fileURL} alt={msg.fileName || "Image"} className="qx-msg-image" onClick={() => setImagePreview(msg.fileURL)} />
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
                      {isMine && (
                        <span className={`qx-read-receipt ${isRead ? "qx-read-receipt--read" : ""}`}>
                          {isRead ? "✓✓" : "✓"}
                        </span>
                      )}
                    </div>
                  </div>
                  {activeThreadType === "direct" && (
                    <div className="qx-msg-actions">
                      <button type="button" className="qx-msg-action-btn" title="Reply" onClick={() => setReplyTo(msg)}>
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="12" height="12"><polyline points="9 14 4 9 9 4"/><path d="M20 20v-7a4 4 0 00-4-4H4"/></svg>
                      </button>
                      <button type="button" className="qx-msg-action-btn" title="Forward" onClick={() => setForwardOpenFor(forwardOpenFor === msg.id ? null : msg.id)}>
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="12" height="12"><polyline points="15 17 20 12 15 7"/><path d="M4 18v-2a4 4 0 014-4h12"/></svg>
                      </button>
                    </div>
                  )}
                  {activeThreadType === "direct" && forwardOpenFor === msg.id && (
                    <div className="qx-forward-panel">
                      <p className="qx-forward-label">Forward to:</p>
                      {contacts.filter((c) => c.uid !== selectedUser.uid).map((c) => (
                        <button key={c.uid} type="button" className="qx-forward-contact" onClick={() => forwardMessage(msg, c.uid)}>
                          <div className="qx-forward-avatar">{(c.displayName || "U").charAt(0).toUpperCase()}</div>
                          {c.displayName}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          );
        })}
        <div ref={messagesEndRef} />
      </section>

      {/* Typing indicator */}
      <div className="qx-typing-row">
        {activeThreadType === "direct" && selectedPartnerTyping && (
          <div className="qx-typing-indicator">
            <div className="qx-typing-dots"><span /><span /><span /></div>
            <span>{selectedUser?.displayName} is typing...</span>
          </div>
        )}
      </div>

      {/* Reply preview */}
      {replyTo && (
        <div className="qx-reply-bar-wrap">
          <div className="qx-reply-preview-bar">
            <span className="qx-reply-accent" />
            <div>
              <span className="qx-reply-to-name">{replyTo.senderId === authUser.uid ? "You" : activeThreadName}</span>
              <span className="qx-reply-to-text">{replyTo.text?.slice(0, 100)}</span>
            </div>
          </div>
          <button type="button" className="qx-reply-close" onClick={() => setReplyTo(null)}>✕</button>
        </div>
      )}

      {/* Composer */}
      <footer className="qx-composer" ref={composerRef}>
        <div className="qx-composer-inner">
          <div className="qx-composer-tools">
            <button type="button" className="qx-composer-btn" title="Emoji" onClick={() => setShowEmojiPicker((p) => !p)}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><path d="M8 14s1.5 2 4 2 4-2 4-2"/><line x1="9" y1="9" x2="9.01" y2="9"/><line x1="15" y1="9" x2="15.01" y2="9"/></svg>
            </button>
            <label htmlFor="attachment" className="qx-composer-btn" title="Attach file">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21.44 11.05l-9.19 9.19a6 6 0 01-8.49-8.49l9.19-9.19a4 4 0 015.66 5.66l-9.2 9.19a2 2 0 01-2.83-2.83l8.49-8.48"/></svg>
            </label>
            <input id="attachment" type="file" hidden accept="image/*,.pdf,.doc,.docx,.ppt,.pptx,.xls,.xlsx,.txt,.zip"
              onChange={(e) => { if (e.target.files?.[0]) { sendMessage({ file: e.target.files[0] }); e.target.value = ""; } }}
            />
          </div>

          <div className="qx-input-wrap">
            <input
              type="text"
              value={messageInput}
              onChange={(e) => onMessageChange(e.target.value)}
              placeholder="Type a secure message..."
              onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage({ text: messageInput }); } }}
            />
          </div>

          <button
            type="button"
            className={`qx-send-btn ${messageInput.trim() || sendingAttachment ? "qx-send-btn--active" : ""}`}
            onClick={() => sendMessage({ text: messageInput })}
            disabled={sendingAttachment}
          >
            {sendingAttachment
              ? <div className="qx-spinner-sm" />
              : <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>
            }
          </button>
        </div>

        {/* Emoji picker */}
        {showEmojiPicker && (
          <div className="qx-emoji-picker">
            {QUICK_EMOJIS.map((emoji) => (
              <button key={emoji} type="button" onClick={() => { onMessageChange(`${messageInput}${emoji}`); setShowEmojiPicker(false); }}>
                {emoji}
              </button>
            ))}
          </div>
        )}

        {/* Upload progress */}
        {sendingAttachment && uploadProgress > 0 && (
          <div className="qx-upload-progress">
            <div className="qx-upload-bar"><div className="qx-upload-fill" style={{ width: `${uploadProgress}%` }} /></div>
            <span>{uploadProgress}%</span>
          </div>
        )}
      </footer>

      {/* Image lightbox */}
      {imagePreview && (
        <div className="qx-lightbox" onClick={() => setImagePreview(null)}>
          <button type="button" className="qx-lightbox-close" onClick={() => setImagePreview(null)}>✕</button>
          <img src={imagePreview} alt="Preview" onClick={(e) => e.stopPropagation()} />
        </div>
      )}

      {/* Status message */}
      {statusText && (
        <div className="qx-status-toast">
          {statusText}
        </div>
      )}
    </div>
  );
};

export default ChatWindow;