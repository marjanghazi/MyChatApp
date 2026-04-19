import { useEffect, useMemo, useRef, useState } from "react";
import "./chatwindow.css";
import data from "@emoji-mart/data";
import Picker from "@emoji-mart/react";
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

const formatCallTime = (dateValue) => {
  if (!dateValue) return "";
  const date = typeof dateValue?.toDate === "function" ? dateValue.toDate() : new Date(dateValue);
  const now = new Date();
  const diff = now - date;
  
  if (diff < 60000) return "Just now";
  if (diff < 3600000) return `${Math.floor(diff / 60000)} min ago`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)} hours ago`;
  if (diff < 604800000) return `${Math.floor(diff / 86400000)} days ago`;
  
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
  const [isCallActive, setIsCallActive] = useState(false);
  const [callDuration, setCallDuration] = useState(0);
  const [isMuted, setIsMuted] = useState(false);
  const [isVideoOff, setIsVideoOff] = useState(false);
  const [callLogs, setCallLogs] = useState([]);
  const [showCallLogs, setShowCallLogs] = useState(false);

  const typingTimeoutRef = useRef(null);
  const peerConnectionRef = useRef(null);
  const localVideoRef = useRef(null);
  const remoteVideoRef = useRef(null);
  const messagesEndRef = useRef(null);
  const composerRef = useRef(null);
  const callDurationIntervalRef = useRef(null);

  // Get conversation ID safely
  const selectedConversationId = useMemo(() => {
    if (activeThreadType === "direct" && authUser?.uid && selectedUser?.uid) {
      return conversationIdFor(authUser.uid, selectedUser.uid);
    }
    return "";
  }, [activeThreadType, authUser?.uid, selectedUser?.uid]);

  // Get conversation data from the conversations object
  const selectedConversation = useMemo(() => {
    if (activeThreadType === "direct" && selectedConversationId) {
      return conversations[selectedConversationId] || null;
    }
    return null;
  }, [activeThreadType, selectedConversationId, conversations]);

  const selectedTheme = selectedConversation?.themeBy?.[authUser?.uid] || "default";
  const selectedPartnerTyping = selectedConversation?.typing?.[selectedUser?.uid] || false;
  const selectedMuted = selectedConversation?.mutedBy?.[authUser?.uid] || false;
  const selectedCall = selectedConversation?.callState || null;
  const activeThread = activeThreadType === "direct" ? selectedUser : activeThreadType === "group" ? selectedGroup : selectedChannel;
  const activeThreadName = activeThreadType === "direct" ? selectedUser?.displayName : activeThreadType === "group" ? selectedGroup?.name : selectedChannel?.name;

  const visibleMessages = useMemo(() => {
    const value = chatSearch.trim().toLowerCase();
    if (!value) return messages;
    return messages.filter((m) => (m.text || "").toLowerCase().includes(value));
  }, [messages, chatSearch]);

  const formatCallDuration = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const stopCallMedia = () => {
    if (peerConnectionRef.current) { 
      peerConnectionRef.current.close(); 
      peerConnectionRef.current = null; 
    }
    if (localCallStream) {
      localCallStream.getTracks().forEach((t) => {
        t.stop();
        t.enabled = false;
      });
    }
    if (remoteCallStream) {
      remoteCallStream.getTracks().forEach((t) => {
        t.stop();
        t.enabled = false;
      });
    }
    setLocalCallStream(null);
    setRemoteCallStream(null);
    setIncomingOffer(null);
    setIsCallActive(false);
    setIsMuted(false);
    setIsVideoOff(false);
    if (onStopCallMedia) onStopCallMedia();
  };

  // Save call log to Firestore
  const saveCallLog = async (callData) => {
    if (!db || !authUser?.uid || !selectedConversationId || selectedConversationId === "") return;
    
    try {
      const conversationRef = doc(db, "conversations", selectedConversationId);
      await setDoc(conversationRef, { 
        participants: [authUser.uid, selectedUser?.uid],
        updatedAt: serverTimestamp() 
      }, { merge: true });
      
      const callLogRef = collection(conversationRef, "callLogs");
      await addDoc(callLogRef, {
        ...callData,
        createdAt: serverTimestamp()
      });
    } catch (error) {
      console.error("Error saving call log:", error);
    }
  };

  // Subscribe to call logs
  useEffect(() => {
    if (!db || !authUser?.uid || !selectedConversationId || selectedConversationId === "") return;
    
    try {
      const conversationRef = doc(db, "conversations", selectedConversationId);
      const callLogsRef = collection(conversationRef, "callLogs");
      const q = query(callLogsRef, orderBy("endedAt", "desc"));
      
      const unsubscribe = onSnapshot(q, (snapshot) => {
        const logs = snapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        }));
        setCallLogs(logs);
      });
      
      return unsubscribe;
    } catch (error) {
      console.error("Error subscribing to call logs:", error);
      return undefined;
    }
  }, [authUser?.uid, selectedConversationId, db]);

  // Messages subscription for direct messages
  useEffect(() => {
    if (!db || !authUser?.uid || !selectedUser?.uid || activeThreadType !== "direct") return;
    if (!selectedConversationId || selectedConversationId === "") return;
    
    const conversationRef = doc(db, "conversations", selectedConversationId);
    
    // Initialize conversation document if it doesn't exist
    setDoc(conversationRef, {
      participants: [authUser.uid, selectedUser.uid],
      participantPhones: [profile?.phoneNumber || "", selectedUser.phoneNumber || ""],
      unreadBy: { [authUser.uid]: 0 },
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    }, { merge: true }).catch(error => {
      console.error("Error initializing conversation:", error);
    });

    const messagesRef = collection(conversationRef, "messages");
    const messagesQuery = query(messagesRef, orderBy("createdAt", "asc"));
    
    const unsubscribe = onSnapshot(messagesQuery, (snapshot) => {
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
    
    return unsubscribe;
  }, [authUser?.uid, selectedUser?.uid, activeThreadType, selectedConversationId, profile, db]);

  // Messages subscription for groups
  useEffect(() => {
    if (!db || !authUser?.uid || !selectedGroup || activeThreadType !== "group") return;
    
    try {
      const groupRef = doc(db, "groups", selectedGroup.id);
      const messagesRef = collection(groupRef, "messages");
      const q = query(messagesRef, orderBy("createdAt", "asc"));
      const unsubscribe = onSnapshot(q, (snapshot) => {
        setMessages(snapshot.docs.map((entry) => ({ id: entry.id, ...entry.data() })));
      });
      
      return unsubscribe;
    } catch (error) {
      console.error("Error in group messages subscription:", error);
      return undefined;
    }
  }, [authUser?.uid, selectedGroup, activeThreadType, db]);

  // Messages subscription for channels
  useEffect(() => {
    if (!db || !authUser?.uid || !selectedChannel || activeThreadType !== "channel") return;
    
    try {
      const channelRef = doc(db, "channels", selectedChannel.id);
      const postsRef = collection(channelRef, "posts");
      const q = query(postsRef, orderBy("createdAt", "asc"));
      const unsubscribe = onSnapshot(q, (snapshot) => {
        setMessages(snapshot.docs.map((entry) => ({ id: entry.id, ...entry.data() })));
      });
      
      return unsubscribe;
    } catch (error) {
      console.error("Error in channel messages subscription:", error);
      return undefined;
    }
  }, [authUser?.uid, selectedChannel, activeThreadType, db]);

  // Video/audio refs
  useEffect(() => { 
    if (localVideoRef.current) localVideoRef.current.srcObject = localCallStream || null; 
  }, [localCallStream]);
  
  useEffect(() => { 
    if (remoteVideoRef.current) remoteVideoRef.current.srcObject = remoteCallStream || null; 
  }, [remoteCallStream]);
  
  useEffect(() => () => stopCallMedia(), []);

  // Scroll to bottom on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Call duration timer
  useEffect(() => {
    if (selectedCall?.status === "active") {
      const startTime = selectedCall.startedAt?.toDate?.() || new Date();
      callDurationIntervalRef.current = setInterval(() => {
        const duration = Math.floor((Date.now() - startTime.getTime()) / 1000);
        setCallDuration(duration);
      }, 1000);
    } else {
      if (callDurationIntervalRef.current) {
        clearInterval(callDurationIntervalRef.current);
        callDurationIntervalRef.current = null;
      }
      setCallDuration(0);
    }
    
    return () => {
      if (callDurationIntervalRef.current) {
        clearInterval(callDurationIntervalRef.current);
      }
    };
  }, [selectedCall?.status]);

  // Call signals subscription
  useEffect(() => {
    if (!db || !authUser?.uid || !selectedConversationId || selectedConversationId === "") return;
    
    try {
      const conversationRef = doc(db, "conversations", selectedConversationId);
      setDoc(conversationRef, { updatedAt: serverTimestamp() }, { merge: true });
      
      const signalsRef = collection(conversationRef, "signals");
      const q = query(signalsRef, where("to", "==", authUser.uid));
      
      const unsubscribe = onSnapshot(q, async (snapshot) => {
        for (const change of snapshot.docChanges()) {
          if (change.type !== "added") continue;
          const signal = change.doc.data();
          try {
            if (signal.type === "offer") {
              setIncomingOffer(signal.sdp);
            } else if (signal.type === "answer" && peerConnectionRef.current) {
              await peerConnectionRef.current.setRemoteDescription(new RTCSessionDescription(signal.sdp));
              if (selectedCall && onUpdateCallState) await onUpdateCallState({ ...selectedCall, status: "active" });
              setIsCallActive(true);
            } else if (signal.type === "ice" && peerConnectionRef.current) {
              try {
                await peerConnectionRef.current.addIceCandidate(new RTCIceCandidate(signal.candidate));
              } catch (e) {
                console.log("Error adding ICE candidate:", e);
              }
            } else if (signal.type === "hangup") {
              stopCallMedia();
              if (selectedCall && onUpdateCallState) await onUpdateCallState({ ...selectedCall, status: "ended", endedAt: serverTimestamp() });
              setStatusText("Call ended");
              setTimeout(() => setStatusText(""), 3000);
            }
          } finally {
            await deleteDoc(change.doc.ref);
          }
        }
      });
      
      return unsubscribe;
    } catch (error) {
      console.error("Error in call signals subscription:", error);
      return undefined;
    }
  }, [authUser?.uid, selectedConversationId, selectedCall, onUpdateCallState, db]);

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
    if (!db || !authUser?.uid || !selectedUser?.uid || activeThreadType !== "direct") return;
    if (!selectedConversationId || selectedConversationId === "") return;
    
    try {
      const conversationRef = doc(db, "conversations", selectedConversationId);
      await setDoc(conversationRef, { updatedAt: serverTimestamp() }, { merge: true });
      
      await setDoc(
        conversationRef,
        {
          typing: { [authUser.uid]: isTyping },
        },
        { merge: true }
      );
    } catch (error) {
      console.error("Error updating typing state:", error);
    }
  };

  // SEND MESSAGE
  const sendMessage = async ({ text = "", file = null, forwardedFrom = null } = {}) => {
    console.log("=== SEND MESSAGE DEBUG ===");
    console.log("activeThreadType:", activeThreadType);
    console.log("selectedGroup:", selectedGroup);
    console.log("selectedChannel:", selectedChannel);
    console.log("selectedUser:", selectedUser);
    console.log("selectedConversationId:", selectedConversationId);
    
    if (!db || !authUser?.uid || !profile) {
      setStatusText("Database connection error");
      return;
    }
    if ((!text.trim() && !file)) return;

    // Handle group messages
    if (activeThreadType === "group" && selectedGroup) {
      console.log("Sending GROUP message to:", selectedGroup.id);
      try {
        const groupRef = doc(db, "groups", selectedGroup.id);
        const messagesRef = collection(groupRef, "messages");
        await addDoc(messagesRef, {
          text: text.trim(),
          type: "text",
          senderId: authUser.uid,
          senderName: profile.displayName,
          createdAt: serverTimestamp(),
        });
        await setDoc(groupRef, {
          lastMessage: text.trim(),
          lastMessageAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        }, { merge: true });
        setMessageInput("");
        setStatusText("Message sent to group!");
        setTimeout(() => setStatusText(""), 2000);
        console.log("Group message sent successfully");
      } catch (error) {
        console.error("Error sending group message:", error);
        setStatusText("Failed to send message: " + error.message);
      }
      return;
    }

    // Handle channel messages
    if (activeThreadType === "channel" && selectedChannel) {
      console.log("Sending CHANNEL message to:", selectedChannel.id);
      if (selectedChannel.ownerId !== authUser.uid) {
        setStatusText("Only channel owner can publish posts.");
        return;
      }
      try {
        const channelRef = doc(db, "channels", selectedChannel.id);
        const postsRef = collection(channelRef, "posts");
        await addDoc(postsRef, {
          text: text.trim(),
          type: "post",
          senderId: authUser.uid,
          senderName: profile.displayName,
          createdAt: serverTimestamp(),
        });
        await setDoc(channelRef, {
          lastPost: text.trim(),
          lastPostAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        }, { merge: true });
        setMessageInput("");
        setStatusText("Post published!");
        setTimeout(() => setStatusText(""), 2000);
        console.log("Channel post sent successfully");
      } catch (error) {
        console.error("Error sending channel post:", error);
        setStatusText("Failed to send post: " + error.message);
      }
      return;
    }

    // Handle direct messages
    if (activeThreadType === "direct") {
      console.log("Sending DIRECT message");
      
      if (!selectedUser?.uid) {
        setStatusText("No user selected");
        return;
      }
      
      if (!selectedConversationId || selectedConversationId === "") {
        setStatusText("Error: Cannot create conversation");
        return;
      }

      let payload = { type: "text", text: text.trim() };

      if (file) {
        setSendingAttachment(true);
        try {
          const fileURL = await uploadToStorage(`attachments/${selectedConversationId}`, file);
          payload = {
            type: file.type.startsWith("image/") ? "image" : "file",
            text: text.trim() || file.name,
            fileURL,
            fileName: file.name,
            fileSize: file.size,
          };
        } catch (error) {
          setStatusText(error?.message || "Attachment upload failed.");
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
      }

      try {
        const conversationRef = doc(db, "conversations", selectedConversationId);
        console.log("Conversation ref path:", conversationRef.path);
        
        // Create the conversation document with all data
        await setDoc(conversationRef, {
          participants: [authUser.uid, selectedUser.uid],
          participantPhones: [profile.phoneNumber || "", selectedUser.phoneNumber || ""],
          lastMessage: payload.type === "text" ? payload.text : `📎 ${payload.fileName}`,
          lastMessageType: payload.type,
          lastMessageSender: authUser.uid,
          lastMessageAt: serverTimestamp(),
          typing: { [authUser.uid]: false },
          unreadBy: { [authUser.uid]: 0, [selectedUser.uid]: increment(1) },
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });

        // Now add message to messages subcollection
        const messagesRef = collection(conversationRef, "messages");
        console.log("Messages ref path:", messagesRef.path);
        
        await addDoc(messagesRef, {
          ...payload,
          senderId: authUser.uid,
          receiverId: selectedUser.uid,
          createdAt: serverTimestamp(),
          readBy: [authUser.uid],
        });

        setMessageInput("");
        updateTypingState(false);
        setStatusText("Message sent!");
        setTimeout(() => setStatusText(""), 2000);
        console.log("Direct message sent successfully");
      } catch (error) {
        console.error("Error sending direct message:", error);
        setStatusText("Failed to send message: " + error.message);
        setTimeout(() => setStatusText(""), 3000);
      }
      return;
    }

    setStatusText("Error: No active conversation type");
    console.error("No valid activeThreadType:", activeThreadType);
  };

  const forwardMessage = async (message, targetUid) => {
    if (!authUser?.uid || !targetUid) return;
    const targetUser = allUsers.find((u) => u.uid === targetUid);
    if (!targetUser) return;
    await sendMessage({ text: message.text || message.fileName || "Forwarded message", forwardedFrom: selectedUser?.displayName || "contact" });
    setForwardOpenFor(null);
    setStatusText("✓ Message forwarded securely.");
    setTimeout(() => setStatusText(""), 3000);
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
    if (!db || !authUser?.uid || !selectedUser?.uid) return;
    if (!selectedConversationId || selectedConversationId === "") return;
    
    try {
      const conversationRef = doc(db, "conversations", selectedConversationId);
      await setDoc(conversationRef, { mutedBy: { [authUser.uid]: !selectedMuted } }, { merge: true });
    } catch (error) {
      console.error("Error setting mute:", error);
    }
  };

  const setTheme = async (theme) => {
    if (!db || !authUser?.uid || !selectedUser?.uid) return;
    if (!selectedConversationId || selectedConversationId === "") return;
    
    try {
      const conversationRef = doc(db, "conversations", selectedConversationId);
      await setDoc(conversationRef, { themeBy: { [authUser.uid]: theme } }, { merge: true });
    } catch (error) {
      console.error("Error setting theme:", error);
    }
  };

  const deleteChatHistory = async () => {
    if (!db || !authUser?.uid || !selectedUser?.uid) return;
    if (!selectedConversationId || selectedConversationId === "") return;
    
    const confirmed = window.confirm("Clear this conversation's encrypted history?");
    if (!confirmed) return;
    
    try {
      const conversationRef = doc(db, "conversations", selectedConversationId);
      const messagesRef = collection(conversationRef, "messages");
      const snapshot = await getDocs(messagesRef);
      const batch = writeBatch(db);
      snapshot.docs.forEach((e) => batch.update(e.ref, { deletedFor: arrayUnion(authUser.uid) }));
      if (!snapshot.empty) await batch.commit();
      
      await setDoc(conversationRef, {
        clearedAtBy: { [authUser.uid]: serverTimestamp() },
        unreadBy: { [authUser.uid]: 0 },
      }, { merge: true });
      
      setMessages([]);
      setStatusText("✓ Conversation history purged.");
      setTimeout(() => setStatusText(""), 3000);
    } catch (error) {
      console.error("Error deleting chat history:", error);
      setStatusText("Failed to clear history");
    }
  };

  const setCallState = async (nextCallState) => {
    if (!db || !authUser?.uid || !selectedUser?.uid) return;
    if (!selectedConversationId || selectedConversationId === "") return;
    
    try {
      const conversationRef = doc(db, "conversations", selectedConversationId);
      await setDoc(conversationRef, { callState: nextCallState }, { merge: true });
      if (onUpdateCallState) onUpdateCallState(nextCallState);
    } catch (error) {
      console.error("Error setting call state:", error);
    }
  };

  const sendCallSignal = async (payload) => {
    if (!db || !authUser?.uid || !selectedUser?.uid) return;
    if (!selectedConversationId || selectedConversationId === "") return;
    
    try {
      const conversationRef = doc(db, "conversations", selectedConversationId);
      await setDoc(conversationRef, { updatedAt: serverTimestamp() }, { merge: true });
      
      const signalsRef = collection(conversationRef, "signals");
      await addDoc(signalsRef, {
        ...payload, 
        from: authUser.uid, 
        to: selectedUser.uid, 
        createdAt: serverTimestamp(),
      });
      if (onSendCallSignal) onSendCallSignal(payload);
    } catch (error) {
      console.error("Error sending call signal:", error);
    }
  };

  const buildPeerConnection = (stream) => {
    const peerConnection = new RTCPeerConnection(ICE_SERVERS);
    
    stream.getTracks().forEach((track) => {
      peerConnection.addTrack(track, stream);
    });
    
    peerConnection.ontrack = (event) => { 
      if (event.streams?.[0]) {
        setRemoteCallStream(event.streams[0]);
      }
    };
    
    peerConnection.onicecandidate = (event) => { 
      if (event.candidate) {
        sendCallSignal({ type: "ice", candidate: event.candidate.toJSON() });
      }
    };
    
    peerConnection.oniceconnectionstatechange = () => {
      if (peerConnection.iceConnectionState === "disconnected" || 
          peerConnection.iceConnectionState === "failed" ||
          peerConnection.iceConnectionState === "closed") {
        endCall();
      }
    };
    
    peerConnectionRef.current = peerConnection;
    return peerConnection;
  };

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
        video: type === "video" 
      });
      setLocalCallStream(stream);
      
      const peerConnection = buildPeerConnection(stream);
      const offer = await peerConnection.createOffer();
      await peerConnection.setLocalDescription(offer);
      await sendCallSignal({ type: "offer", sdp: offer });
      await setCallState({ 
        from: authUser.uid, 
        to: selectedUser.uid, 
        type, 
        status: "ringing", 
        startedAt: serverTimestamp() 
      });
      
      setStatusText(`Calling ${selectedUser.displayName}...`);
      setTimeout(() => setStatusText(""), 3000);
    } catch (error) {
      console.error("Call start error:", error);
      setStatusText(error?.message || "Unable to start call. Please check microphone/camera permissions.");
      setTimeout(() => setStatusText(""), 5000);
      if (localCallStream) {
        localCallStream.getTracks().forEach(t => t.stop());
        setLocalCallStream(null);
      }
    }
  };

  const acceptCall = async () => {
    if (!selectedCall || !incomingOffer) return;
    
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ 
        audio: true, 
        video: selectedCall.type === "video" 
      });
      setLocalCallStream(stream);
      
      const peerConnection = buildPeerConnection(stream);
      await peerConnection.setRemoteDescription(new RTCSessionDescription(incomingOffer));
      const answer = await peerConnection.createAnswer();
      await peerConnection.setLocalDescription(answer);
      await sendCallSignal({ type: "answer", sdp: answer });
      await setCallState({ ...selectedCall, status: "active" });
      setIsCallActive(true);
      setIncomingOffer(null);
      
      await saveCallLog({
        type: selectedCall.type,
        direction: "incoming",
        status: "answered",
        startedAt: selectedCall.startedAt,
        answeredAt: serverTimestamp(),
        duration: 0,
        callerId: selectedCall.from,
        receiverId: selectedCall.to
      });
    } catch (error) {
      console.error("Accept call error:", error);
      setStatusText(error?.message || "Unable to accept call.");
      setTimeout(() => setStatusText(""), 3000);
    }
  };

  const endCall = async () => {
    if (!selectedCall) return;
    
    let callStatus = "ended";
    if (selectedCall.status === "ringing") {
      callStatus = selectedCall.from === authUser?.uid ? "cancelled" : "missed";
    } else if (selectedCall.status === "active") {
      callStatus = "completed";
    }
    
    await saveCallLog({
      type: selectedCall.type,
      direction: selectedCall.from === authUser?.uid ? "outgoing" : "incoming",
      status: callStatus,
      startedAt: selectedCall.startedAt,
      endedAt: serverTimestamp(),
      duration: callDuration,
      callerId: selectedCall.from,
      receiverId: selectedCall.to
    });
    
    await sendCallSignal({ type: "hangup" });
    await setCallState({ ...selectedCall, status: "ended", endedAt: serverTimestamp() });
    stopCallMedia();
  };

  const toggleMute = () => {
    if (localCallStream) {
      const audioTracks = localCallStream.getAudioTracks();
      audioTracks.forEach(track => {
        track.enabled = !track.enabled;
      });
      setIsMuted(!isMuted);
    }
  };

  const toggleVideo = () => {
    if (localCallStream) {
      const videoTracks = localCallStream.getVideoTracks();
      videoTracks.forEach(track => {
        track.enabled = !track.enabled;
      });
      setIsVideoOff(!isVideoOff);
    }
  };

  const toggleFollowChannel = async (channel) => {
    if (!authUser?.uid || !channel) return;
    if (onUpdateConversation) {
      onUpdateConversation({ type: "toggleFollow", channel });
    }
  };

  const getCallIcon = (log) => {
    if (log.status === "missed") return "❌";
    if (log.direction === "outgoing") return "📞";
    if (log.direction === "incoming" && log.status === "answered") return "📞";
    if (log.direction === "incoming" && log.status === "cancelled") return "🔇";
    return log.type === "video" ? "🎥" : "📞";
  };

  const getCallStatusText = (log) => {
    if (log.status === "missed") return "Missed call";
    if (log.status === "cancelled") return "Cancelled call";
    if (log.status === "completed") {
      const duration = log.duration || 0;
      const mins = Math.floor(duration / 60);
      const secs = duration % 60;
      return `Call duration ${mins}:${secs.toString().padStart(2, '0')}`;
    }
    if (log.status === "answered") return "Call answered";
    return log.direction === "outgoing" ? "Outgoing call" : "Incoming call";
  };

  // ALL CONDITIONS AFTER HOOKS
  if (!db) {
    console.error("Firestore db is not initialized!");
    return null;
  }

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
            <button 
              type="button" 
              className={`qx-icon-btn ${showCallLogs ? "qx-icon-btn--active" : ""}`} 
              title="Call History" 
              onClick={() => setShowCallLogs(!showCallLogs)}
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07A19.5 19.5 0 013.07 9.81 19.79 19.79 0 012 1.22 2 2 0 014 .04h3a2 2 0 012 1.72c.127.96.361 1.903.7 2.81a2 2 0 01-.45 2.11L8.09 7.91a16 16 0 006 6l1.27-1.27a2 2 0 012.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0122 16.92z"/><line x1="12" y1="12" x2="16" y2="16"/><line x1="16" y1="12" x2="12" y2="16"/></svg>
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

      {/* Call Logs Panel */}
      {showCallLogs && activeThreadType === "direct" && (
        <div className="qx-call-logs-panel">
          <div className="qx-call-logs-header">
            <h4>Call History</h4>
            <button className="qx-call-logs-close" onClick={() => setShowCallLogs(false)}>✕</button>
          </div>
          <div className="qx-call-logs-list">
            {callLogs.length === 0 ? (
              <div className="qx-call-logs-empty">
                <p>No call history</p>
              </div>
            ) : (
              callLogs.map((log) => (
                <div key={log.id} className={`qx-call-log-item ${log.status === "missed" ? "qx-call-log-item--missed" : ""}`}>
                  <div className="qx-call-log-icon">{getCallIcon(log)}</div>
                  <div className="qx-call-log-details">
                    <div className="qx-call-log-type">
                      {log.type === "video" ? "Video Call" : "Voice Call"}
                    </div>
                    <div className="qx-call-log-status">{getCallStatusText(log)}</div>
                    <div className="qx-call-log-time">
                      {log.endedAt ? formatCallTime(log.endedAt) : formatCallTime(log.startedAt)}
                    </div>
                  </div>
                  <div className="qx-call-log-actions">
                    <button 
                      className="qx-call-log-callback" 
                      onClick={() => startCall(log.type)}
                      title="Call back"
                    >
                      📞
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* Call banner */}
      {activeThreadType === "direct" && selectedCall && selectedCall.status !== "ended" && (
        <div className={`qx-call-banner qx-call-banner--${selectedCall.status}`}>
          <div className="qx-call-info">
            <div className="qx-call-icon">{selectedCall.type === "video" ? "🎥" : "📞"}</div>
            <div>
              <strong>{selectedCall.type === "video" ? "Video" : "Voice"} Call</strong>
              <span className="qx-call-status">
                {selectedCall.status === "ringing" 
                  ? "Incoming..." 
                  : selectedCall.status === "active" 
                    ? `In progress ${formatCallDuration(callDuration)}` 
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
            {selectedCall.status === "active" && (
              <>
                <button type="button" className="qx-call-mute" onClick={toggleMute} title={isMuted ? "Unmute" : "Mute"}>
                  {isMuted ? "🔇" : "🎤"}
                </button>
                {selectedCall.type === "video" && (
                  <button type="button" className="qx-cam-toggle" onClick={toggleVideo} title={isVideoOff ? "Turn on camera" : "Turn off camera"}>
                    {isVideoOff ? "📷❌" : "📷"}
                  </button>
                )}
              </>
            )}
            <button type="button" className="qx-call-end" onClick={endCall}>End Call</button>
          </div>
        </div>
      )}

      {/* Video panels */}
      {activeThreadType === "direct" && (localCallStream || remoteCallStream) && selectedCall?.type === "video" && (
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
            <Picker
              data={data}
              onEmojiSelect={(emoji) => {
                onMessageChange(messageInput + emoji.native);
              }}
              theme="dark"
              previewPosition="none"
            />
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