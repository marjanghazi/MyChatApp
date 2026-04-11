import { useEffect, useMemo, useRef, useState } from "react";
import {
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut,
  updateProfile,
} from "firebase/auth";
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
import { auth, db, storage } from "./firebase";
import "./App.css";

const MAX_FILE_SIZE_BYTES = 15 * 1024 * 1024;

const QUICK_EMOJIS = ["😀", "😂", "😍", "🙏", "👍", "🔥", "🎉", "❤️"];
const THEMES = [
  { id: "default", label: "Default" },
  { id: "emerald", label: "Emerald" },
  { id: "midnight", label: "Midnight" },
  { id: "sunset", label: "Sunset" },
];

const normalizePhone = (raw) => raw.replace(/\D/g, "");
const buildPhoneVariants = (raw) => {
  const digits = normalizePhone(raw);
  const variants = new Set([digits]);
  if (digits.startsWith("0") && digits.length > 1) variants.add(`92${digits.slice(1)}`);
  if (digits.startsWith("92") && digits.length > 2) variants.add(`0${digits.slice(2)}`);
  return [...variants].filter(Boolean);
};

const formatTime = (dateValue) => {
  if (!dateValue) return "";
  const date = typeof dateValue?.toDate === "function" ? dateValue.toDate() : new Date(dateValue);
  return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
};

const conversationIdFor = (uidA, uidB) => [uidA, uidB].sort().join("_");

function App() {
  const [appTheme, setAppTheme] = useState(() => {
    const savedTheme = localStorage.getItem("appTheme");
    if (savedTheme === "light" || savedTheme === "dark") return savedTheme;
    return window.matchMedia?.("(prefers-color-scheme: dark)")?.matches ? "dark" : "light";
  });
  const [authUser, setAuthUser] = useState(null);
  const [authReady, setAuthReady] = useState(false);
  const [profile, setProfile] = useState(null);
  const [authMode, setAuthMode] = useState("login");
  const [authForm, setAuthForm] = useState({ displayName: "", phoneNumber: "", email: "", password: "" });
  const [authLoading, setAuthLoading] = useState(false);
  const [authError, setAuthError] = useState("");
  const [allUsers, setAllUsers] = useState([]);
  const [conversations, setConversations] = useState({});
  const [selectedUser, setSelectedUser] = useState(null);
  const [messages, setMessages] = useState([]);
  const [messageInput, setMessageInput] = useState("");
  const [search, setSearch] = useState("");
  const [chatSearch, setChatSearch] = useState("");
  const [contactPhone, setContactPhone] = useState("");
  const [contactFeedback, setContactFeedback] = useState("");
  const [sendingAttachment, setSendingAttachment] = useState(false);
  const [updatingProfile, setUpdatingProfile] = useState(false);
  const [showProfilePanel, setShowProfilePanel] = useState(false);
  const [profileNameInput, setProfileNameInput] = useState("");
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [forwardOpenFor, setForwardOpenFor] = useState(null);
  const [statusText, setStatusText] = useState("");
  const [uploadProgress, setUploadProgress] = useState(0);
  const [localCallStream, setLocalCallStream] = useState(null);
  const [remoteCallStream, setRemoteCallStream] = useState(null);
  const [incomingOffer, setIncomingOffer] = useState(null);

  const typingTimeoutRef = useRef(null);
  const peerConnectionRef = useRef(null);
  const localVideoRef = useRef(null);
  const remoteVideoRef = useRef(null);

  useEffect(() => {
    localStorage.setItem("appTheme", appTheme);
  }, [appTheme]);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      setAuthUser(user);
      setAuthReady(true);
      setAuthError("");
      if (!user) {
        setProfile(null);
        setSelectedUser(null);
        setMessages([]);
        return;
      }

      try {
        await setDoc(
          doc(db, "users", user.uid),
          {
            uid: user.uid,
            displayName: user.displayName || user.email?.split("@")[0] || "User",
            email: user.email || "",
            isOnline: true,
            lastSeen: serverTimestamp(),
            createdAt: serverTimestamp(),
          },
          { merge: true }
        );
      } catch {
        setAuthError("Unable to sync profile. Check network and try again.");
      }
    });

    return unsubscribe;
  }, []);

  useEffect(() => {
    if (!authUser) return undefined;
    const userRef = doc(db, "users", authUser.uid);

    const unsubscribe = onSnapshot(userRef, (snapshot) => {
      setProfile(snapshot.exists() ? snapshot.data() : null);
    });

    const markOffline = async () => {
      await setDoc(userRef, { isOnline: false, lastSeen: serverTimestamp() }, { merge: true });
    };

    window.addEventListener("beforeunload", markOffline);
    return () => {
      window.removeEventListener("beforeunload", markOffline);
      markOffline();
      unsubscribe();
    };
  }, [authUser]);

  useEffect(() => {
    if (!authUser) return undefined;
    const q = query(collection(db, "users"), where("uid", "!=", authUser.uid));
    return onSnapshot(q, (snapshot) => setAllUsers(snapshot.docs.map((entry) => entry.data())));
  }, [authUser]);

  useEffect(() => {
    if (!authUser) return undefined;
    const q = query(collection(db, "conversations"), where("participants", "array-contains", authUser.uid));
    return onSnapshot(q, (snapshot) => {
      const next = {};
      snapshot.forEach((entry) => {
        next[entry.id] = entry.data();
      });
      setConversations(next);
    });
  }, [authUser]);

  useEffect(() => {
    if (!authUser || !selectedUser) return undefined;

    const conversationId = conversationIdFor(authUser.uid, selectedUser.uid);
    const conversationRef = doc(db, "conversations", conversationId);
    setDoc(conversationRef, { unreadBy: { [authUser.uid]: 0 } }, { merge: true });

    const q = query(collection(db, "conversations", conversationId, "messages"), orderBy("createdAt", "asc"));
    return onSnapshot(q, (snapshot) => {
      const nextMessages = snapshot.docs
        .map((entry) => ({ id: entry.id, ...entry.data() }))
        .filter((entry) => !(entry.deletedFor || []).includes(authUser.uid));
      setMessages(nextMessages);
    });
  }, [authUser, selectedUser]);

  useEffect(() => {
    setProfileNameInput(profile?.displayName || "");
  }, [profile?.displayName]);

  useEffect(() => {
    if (localVideoRef.current) localVideoRef.current.srcObject = localCallStream || null;
  }, [localCallStream]);

  useEffect(() => {
    if (remoteVideoRef.current) remoteVideoRef.current.srcObject = remoteCallStream || null;
  }, [remoteCallStream]);

  useEffect(() => () => stopCallMedia(), [localCallStream, remoteCallStream]);

  const contacts = useMemo(() => {
    const visibleUsers = new Map();
    const contactSet = new Set((profile?.contacts || []).map(normalizePhone));
    const usersById = new Map(allUsers.map((user) => [user.uid, user]));

    allUsers.forEach((user) => {
      if (contactSet.has(normalizePhone(user.phoneNumber || ""))) visibleUsers.set(user.uid, user);
    });

    Object.values(conversations).forEach((conversation) => {
      const partnerUid = (conversation.participants || []).find((uid) => uid !== authUser?.uid);
      if (partnerUid && usersById.get(partnerUid)) visibleUsers.set(partnerUid, usersById.get(partnerUid));
    });

    return [...visibleUsers.values()].sort((a, b) => (a.displayName || "").localeCompare(b.displayName || ""));
  }, [allUsers, authUser?.uid, conversations, profile?.contacts]);

  const filteredUsers = useMemo(() => {
    const value = search.trim().toLowerCase();
    if (!value) return contacts;
    return contacts.filter((user) => {
      const fields = [user.displayName, user.email, user.phoneNumber].map((v) => (v || "").toLowerCase());
      return fields.some((field) => field.includes(value));
    });
  }, [contacts, search]);

  const visibleMessages = useMemo(() => {
    const value = chatSearch.trim().toLowerCase();
    if (!value) return messages;
    return messages.filter((message) => (message.text || "").toLowerCase().includes(value));
  }, [messages, chatSearch]);

  const selectedConversation =
    authUser && selectedUser ? conversations[conversationIdFor(authUser.uid, selectedUser.uid)] : null;

  const selectedTheme = selectedConversation?.themeBy?.[authUser?.uid] || "default";
  const selectedPartnerTyping = selectedConversation?.typing?.[selectedUser?.uid] || false;
  const selectedMuted = selectedConversation?.mutedBy?.[authUser?.uid] || false;
  const selectedCall = selectedConversation?.callState || null;
  const selectedConversationId = authUser && selectedUser ? conversationIdFor(authUser.uid, selectedUser.uid) : "";

  const stopCallMedia = () => {
    if (peerConnectionRef.current) {
      peerConnectionRef.current.close();
      peerConnectionRef.current = null;
    }
    if (localCallStream) localCallStream.getTracks().forEach((track) => track.stop());
    if (remoteCallStream) remoteCallStream.getTracks().forEach((track) => track.stop());
    setLocalCallStream(null);
    setRemoteCallStream(null);
    setIncomingOffer(null);
  };

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
            if (selectedCall) await setCallState({ ...selectedCall, status: "active" });
          } else if (signal.type === "ice" && peerConnectionRef.current) {
            await peerConnectionRef.current.addIceCandidate(new RTCIceCandidate(signal.candidate));
          } else if (signal.type === "hangup") {
            stopCallMedia();
            if (selectedCall) await setCallState({ ...selectedCall, status: "ended", endedAt: serverTimestamp() });
          }
        } finally {
          await deleteDoc(change.doc.ref);
        }
      }
    });
  }, [authUser, selectedConversationId, selectedCall]);

  const submitAuth = async (event) => {
    event.preventDefault();
    setAuthLoading(true);
    setAuthError("");

    try {
      if (authMode === "register") {
        const phoneVariants = buildPhoneVariants(authForm.phoneNumber);
        const normalizedPhone = phoneVariants[0];
        if (!normalizedPhone) throw new Error("A valid phone number is required.");

        const [exactPhoneSnapshot, variantSnapshot] = await Promise.all([
          getDocs(query(collection(db, "users"), where("phoneNumber", "in", phoneVariants))),
          getDocs(query(collection(db, "users"), where("phoneLookupKeys", "array-contains-any", phoneVariants))),
        ]);

        if (!exactPhoneSnapshot.empty || !variantSnapshot.empty) {
          throw new Error("This phone number is already linked to another account.");
        }

        const credentials = await createUserWithEmailAndPassword(auth, authForm.email, authForm.password);
        await updateProfile(credentials.user, { displayName: authForm.displayName.trim() });

        await setDoc(doc(db, "users", credentials.user.uid), {
          uid: credentials.user.uid,
          displayName: authForm.displayName.trim(),
          email: authForm.email.trim(),
          phoneNumber: normalizedPhone,
          phoneLookupKeys: phoneVariants,
          contacts: [],
          isOnline: true,
          lastSeen: serverTimestamp(),
          createdAt: serverTimestamp(),
        });
      } else {
        await signInWithEmailAndPassword(auth, authForm.email, authForm.password);
      }

      setAuthForm({ displayName: "", phoneNumber: "", email: "", password: "" });
    } catch (error) {
      setAuthError(error.message || "Unable to complete request.");
    } finally {
      setAuthLoading(false);
    }
  };

  const addContactByPhone = async (event) => {
    event.preventDefault();
    if (!authUser || !contactPhone.trim()) return;

    const phoneVariants = buildPhoneVariants(contactPhone);
    if (!phoneVariants.length) {
      setContactFeedback("Please enter a valid phone number.");
      return;
    }

    const [directMatch, variantMatch] = await Promise.all([
      getDocs(query(collection(db, "users"), where("phoneNumber", "in", phoneVariants))),
      getDocs(query(collection(db, "users"), where("phoneLookupKeys", "array-contains-any", phoneVariants))),
    ]);

    const candidates = new Map();
    directMatch.docs.forEach((entry) => candidates.set(entry.id, entry.data()));
    variantMatch.docs.forEach((entry) => candidates.set(entry.id, entry.data()));

    const candidate = [...candidates.values()][0];
    if (!candidate) {
      setContactFeedback("No registered user found with that number.");
      return;
    }

    if (candidate.uid === authUser.uid) {
      setContactFeedback("You cannot add your own number.");
      return;
    }

    await updateDoc(doc(db, "users", authUser.uid), { contacts: arrayUnion(candidate.phoneNumber) });
    setContactFeedback(`Saved ${candidate.displayName} to your contacts.`);
    setContactPhone("");
  };

  const uploadToStorage = async (path, file) => {
    if (!file) throw new Error("File missing.");
    if (file.size > MAX_FILE_SIZE_BYTES) {
      throw new Error("File is too large. Please upload a file up to 15MB.");
    }

    const storageRef = ref(storage, `${path}/${Date.now()}_${file.name}`);
    const uploadTask = uploadBytesResumable(storageRef, file);

    return new Promise((resolve, reject) => {
      uploadTask.on(
        "state_changed",
        (snapshot) => {
          const progress = Math.round((snapshot.bytesTransferred / snapshot.totalBytes) * 100);
          setUploadProgress(progress);
        },
        async (error) => {
          try {
            await deleteObject(storageRef);
          } catch {
            // noop
          }
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

  const updateProfileName = async (event) => {
    event.preventDefault();
    if (!authUser || !profileNameInput.trim()) return;
    setUpdatingProfile(true);
    try {
      const displayName = profileNameInput.trim();
      await updateProfile(authUser, { displayName });
      await updateDoc(doc(db, "users", authUser.uid), { displayName });
      setStatusText("Profile updated.");
    } catch {
      setStatusText("Failed to update profile name.");
    } finally {
      setUpdatingProfile(false);
    }
  };

  const updateProfilePicture = async (file) => {
    if (!authUser || !file) return;
    setUpdatingProfile(true);
    try {
      const photoURL = await uploadToStorage(`avatars/${authUser.uid}`, file);
      await updateProfile(authUser, { photoURL });
      await updateDoc(doc(db, "users", authUser.uid), { photoURL });
      setStatusText("Profile photo updated.");
    } catch {
      setStatusText("Photo upload failed. Please check Firebase Storage rules.");
    } finally {
      setUpdatingProfile(false);
    }
  };

  const updateBrandLogo = async (file) => {
    if (!authUser || !file) return;
    setUpdatingProfile(true);
    try {
      const logoURL = await uploadToStorage(`logos/${authUser.uid}`, file);
      await updateDoc(doc(db, "users", authUser.uid), { logoURL });
      setStatusText("QUANTX logo updated.");
    } catch {
      setStatusText("Logo upload failed.");
    } finally {
      setUpdatingProfile(false);
    }
  };

  const updateTypingState = async (isTyping) => {
    if (!authUser || !selectedUser) return;
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
    if ((!text.trim() && !file) || !authUser || !selectedUser || !profile) return;

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
    const targetUser = allUsers.find((user) => user.uid === targetUid);
    if (!targetUser) return;

    const originalSelected = selectedUser;
    setSelectedUser(targetUser);

    await sendMessage({
      text: message.text || message.fileName || "Forwarded message",
      forwardedFrom: selectedUser?.displayName || "contact",
    });

    setSelectedUser(originalSelected);
    setForwardOpenFor(null);
    setStatusText("Message forwarded.");
  };

  const onMessageChange = async (value) => {
    setMessageInput(value);
    if (!value.trim()) {
      updateTypingState(false);
      return;
    }

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
    const confirmed = window.confirm("Delete chat history only for your account?");
    if (!confirmed) return;

    const conversationId = conversationIdFor(authUser.uid, selectedUser.uid);
    const messagesRef = collection(db, "conversations", conversationId, "messages");
    const snapshot = await getDocs(messagesRef);
    const batch = writeBatch(db);
    snapshot.docs.forEach((entry) => batch.update(entry.ref, { deletedFor: arrayUnion(authUser.uid) }));
    if (!snapshot.empty) await batch.commit();

    await setDoc(doc(db, "conversations", conversationId), {
      clearedAtBy: { [authUser.uid]: serverTimestamp() },
      unreadBy: { [authUser.uid]: 0 },
    }, { merge: true });

    setMessages([]);
    setStatusText("Chat hidden on your side.");
  };

  const setCallState = async (nextCallState) => {
    if (!authUser || !selectedUser) return;
    await setDoc(
      doc(db, "conversations", conversationIdFor(authUser.uid, selectedUser.uid)),
      { callState: nextCallState },
      { merge: true }
    );
  };

  const sendCallSignal = async (payload) => {
    if (!authUser || !selectedUser) return;
    await addDoc(collection(db, "conversations", conversationIdFor(authUser.uid, selectedUser.uid), "signals"), {
      ...payload,
      from: authUser.uid,
      to: selectedUser.uid,
      createdAt: serverTimestamp(),
    });
  };

  const buildPeerConnection = (stream) => {
    const peerConnection = new RTCPeerConnection({
      iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
    });

    stream.getTracks().forEach((track) => peerConnection.addTrack(track, stream));
    peerConnection.ontrack = (event) => {
      if (event.streams?.[0]) setRemoteCallStream(event.streams[0]);
    };
    peerConnection.onicecandidate = (event) => {
      if (event.candidate) {
        sendCallSignal({ type: "ice", candidate: event.candidate.toJSON() });
      }
    };

    peerConnectionRef.current = peerConnection;
    return peerConnection;
  };

  const startCall = async (type) => {
    if (!authUser || !selectedUser) return;
    if (!navigator.mediaDevices?.getUserMedia) {
      setStatusText("Your browser does not support calling.");
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: type === "video" });
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
        startedAt: serverTimestamp(),
      });
    } catch (error) {
      setStatusText(error?.message || "Unable to start call.");
    }
  };

  const acceptCall = async () => {
    if (!selectedCall || !incomingOffer) return;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: true,
        video: selectedCall.type === "video",
      });
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

  const logout = async () => {
    if (authUser) {
      await updateDoc(doc(db, "users", authUser.uid), { isOnline: false, lastSeen: serverTimestamp() });
    }
    await signOut(auth);
  };

  if (!authReady) {
    return (
      <div className={`auth-shell app-theme-${appTheme}`}>
        <div className="auth-card">
          <h1>QUANTX</h1>
          <p>Checking your secure workspace...</p>
          <button type="button" className="theme-switch-btn" onClick={() => setAppTheme((prev) => (prev === "dark" ? "light" : "dark"))}>
            {appTheme === "dark" ? "🌞 Light mode" : "🌙 Dark mode"}
          </button>
        </div>
      </div>
    );
  }

  if (!authUser) {
    return (
      <div className={`auth-shell app-theme-${appTheme}`}>
        <div className="auth-card">
          <h1>QUANTX</h1>
          <p>Enterprise-grade messaging with modern collaboration controls.</p>

          <button type="button" className="theme-switch-btn" onClick={() => setAppTheme((prev) => (prev === "dark" ? "light" : "dark"))}>
            {appTheme === "dark" ? "🌞 Light mode" : "🌙 Dark mode"}
          </button>

          <div className="auth-tabs">
            <button type="button" className={authMode === "login" ? "active" : ""} onClick={() => setAuthMode("login")}>
              Login
            </button>
            <button
              type="button"
              className={authMode === "register" ? "active" : ""}
              onClick={() => setAuthMode("register")}
            >
              Register
            </button>
          </div>

          <form className="auth-form" onSubmit={submitAuth}>
            {authMode === "register" && (
              <>
                <input
                  type="text"
                  placeholder="Full name"
                  value={authForm.displayName}
                  onChange={(event) => setAuthForm((prev) => ({ ...prev, displayName: event.target.value }))}
                  required
                  minLength={2}
                />
                <input
                  type="tel"
                  placeholder="Phone number (with country code)"
                  value={authForm.phoneNumber}
                  onChange={(event) => setAuthForm((prev) => ({ ...prev, phoneNumber: event.target.value }))}
                  required
                />
              </>
            )}

            <input
              type="email"
              placeholder="Email"
              value={authForm.email}
              onChange={(event) => setAuthForm((prev) => ({ ...prev, email: event.target.value }))}
              required
            />
            <input
              type="password"
              placeholder="Password"
              value={authForm.password}
              onChange={(event) => setAuthForm((prev) => ({ ...prev, password: event.target.value }))}
              required
              minLength={6}
            />

            {authError && <div className="error-text">{authError}</div>}
            <button type="submit" disabled={authLoading}>{authLoading ? "Please wait..." : authMode === "register" ? "Create account" : "Sign in"}</button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className={`chat-shell theme-${selectedTheme} app-theme-${appTheme}`}>
      <aside className="chat-sidebar">
        <div className="sidebar-header">
          <div className="brand-block">
            {profile?.logoURL ? <img src={profile.logoURL} alt="QUANTX logo" className="brand-logo" /> : <div className="brand-logo">Q</div>}
            <div>
              <h2>QUANTX</h2>
              <span>{profile?.phoneNumber || authUser.email}</span>
            </div>
          </div>
          <div className="sidebar-actions">
            <button type="button" onClick={() => setAppTheme((prev) => (prev === "dark" ? "light" : "dark"))}>
              {appTheme === "dark" ? "🌞" : "🌙"}
            </button>
            <button type="button" onClick={() => setShowProfilePanel((prev) => !prev)}>Profile</button>
            <button type="button" onClick={logout}>Logout</button>
          </div>
        </div>

        {showProfilePanel && (
          <form className="profile-panel" onSubmit={updateProfileName}>
            <div className="profile-avatar-row">
              <img
                className="profile-avatar-preview"
                src={profile?.photoURL || `https://ui-avatars.com/api/?name=${encodeURIComponent(profile?.displayName || "User")}&background=128C7E&color=fff`}
                alt={profile?.displayName || "profile"}
              />
              <label htmlFor="profile-photo" className="profile-upload-btn">Change photo</label>
              <input id="profile-photo" type="file" hidden accept="image/*" onChange={(event) => event.target.files?.[0] && updateProfilePicture(event.target.files[0])} />
            </div>

            <div className="profile-avatar-row">
              <label htmlFor="brand-logo" className="profile-upload-btn">Upload QUANTX logo</label>
              <input id="brand-logo" type="file" hidden accept="image/*" onChange={(event) => event.target.files?.[0] && updateBrandLogo(event.target.files[0])} />
            </div>

            <input
              type="text"
              value={profileNameInput}
              placeholder="Update your name"
              onChange={(event) => setProfileNameInput(event.target.value)}
              minLength={2}
              required
            />
            <button type="submit" disabled={updatingProfile}>{updatingProfile ? "Saving..." : "Save profile"}</button>
          </form>
        )}

        <form className="add-contact-form" onSubmit={addContactByPhone}>
          <input type="tel" placeholder="Add contact by phone" value={contactPhone} onChange={(event) => setContactPhone(event.target.value)} />
          <button type="submit">Add</button>
        </form>
        {contactFeedback && <p className="feedback">{contactFeedback}</p>}
        {statusText && <p className="feedback">{statusText}</p>}
        {sendingAttachment && <p className="feedback">Uploading file... {uploadProgress}%</p>}

        <div className="search-box">
          <input type="text" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search contacts" />
        </div>

        <div className="user-list">
          {filteredUsers.map((user) => {
            const conversationId = conversationIdFor(authUser.uid, user.uid);
            const conversation = conversations[conversationId];
            const unreadCount = conversation?.unreadBy?.[authUser.uid] || 0;
            return (
              <button key={user.uid} type="button" className={`user-tile ${selectedUser?.uid === user.uid ? "active" : ""}`} onClick={() => setSelectedUser(user)}>
                <div className="avatar">{(user.displayName || "U").charAt(0).toUpperCase()}</div>
                <div className="tile-content">
                  <div className="tile-title-row"><strong>{user.displayName || "Unnamed user"}</strong><span>{formatTime(conversation?.lastMessageAt)}</span></div>
                  <div className="tile-sub-row"><p>{conversation?.lastMessage || user.phoneNumber || user.email}</p>{unreadCount > 0 && <b className="unread-pill">{unreadCount}</b>}</div>
                </div>
              </button>
            );
          })}
        </div>
      </aside>

      <main className="chat-main">
        {!selectedUser ? (
          <div className="empty-state"><h3>Welcome to QUANTX</h3><p>Select a contact to start secure collaboration.</p></div>
        ) : (
          <>
            <header className="chat-header">
              <div className="avatar">{(selectedUser.displayName || "U").charAt(0).toUpperCase()}</div>
              <div>
                <h3>{selectedUser.displayName}</h3>
                <span>{selectedUser.isOnline ? "online" : `last seen ${formatTime(selectedUser.lastSeen) || "recently"}`}</span>
              </div>
              <div className="chat-header-actions">
                <button type="button" aria-label="Voice call" onClick={() => startCall("audio")}>📞</button>
                <button type="button" aria-label="Video call" onClick={() => startCall("video")}>🎥</button>
                <button type="button" onClick={setMute}>{selectedMuted ? "🔕" : "🔔"}</button>
                <button type="button" onClick={deleteChatHistory}>🗑️</button>
              </div>
            </header>

            <div className="toolbar-row">
              <input value={chatSearch} onChange={(event) => setChatSearch(event.target.value)} placeholder="Search in this chat" />
              <select value={selectedTheme} onChange={(event) => setTheme(event.target.value)}>
                {THEMES.map((theme) => <option key={theme.id} value={theme.id}>{theme.label}</option>)}
              </select>
            </div>

            {selectedCall && selectedCall.status !== "ended" && (
              <div className="call-banner">
                <span>{selectedCall.type === "video" ? "Video" : "Audio"} call: {selectedCall.status}</span>
                {selectedCall.to === authUser.uid && selectedCall.status === "ringing" && <button type="button" onClick={acceptCall}>Accept</button>}
                <button type="button" onClick={endCall}>End</button>
              </div>
            )}
            {(localCallStream || remoteCallStream) && (
              <div className="call-media-panel">
                <video ref={localVideoRef} autoPlay muted playsInline className="call-video" />
                <video ref={remoteVideoRef} autoPlay playsInline className="call-video" />
              </div>
            )}

            <section className="messages">
              {visibleMessages.map((message) => {
                const isMine = message.senderId === authUser.uid;
                return (
                  <div key={message.id} className={`message-row ${isMine ? "mine" : "theirs"}`}>
                    <div className="message-bubble">
                      {message.forwardedFrom && <small>Forwarded from {message.forwardedFrom}</small>}
                      {message.type === "image" && message.fileURL && <img src={message.fileURL} alt={message.fileName || "attachment"} className="chat-image" />}
                      {message.type === "file" && message.fileURL && <a href={message.fileURL} target="_blank" rel="noreferrer" className="file-link">{message.fileName || "Open file"}</a>}
                      {!!message.text && <p>{message.text}</p>}
                      <div className="message-meta">
                        <span>{formatTime(message.createdAt)}</span>
                        <button type="button" onClick={() => setForwardOpenFor(forwardOpenFor === message.id ? null : message.id)}>Forward</button>
                      </div>

                      {forwardOpenFor === message.id && (
                        <div className="forward-panel">
                          {contacts.filter((contact) => contact.uid !== selectedUser.uid).map((contact) => (
                            <button key={contact.uid} type="button" onClick={() => forwardMessage(message, contact.uid)}>{contact.displayName}</button>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </section>

            <div className="typing-row">{selectedPartnerTyping ? `${selectedUser.displayName} is typing...` : ""}</div>

            <footer className="composer">
              <button type="button" className="attach-btn" onClick={() => setShowEmojiPicker((prev) => !prev)}>😊</button>
              {showEmojiPicker && (
                <div className="emoji-picker">
                  {QUICK_EMOJIS.map((emoji) => <button key={emoji} type="button" onClick={() => onMessageChange(`${messageInput}${emoji}`)}>{emoji}</button>)}
                </div>
              )}
              <label htmlFor="attachment" className="attach-btn">📎</label>
              <input
                id="attachment"
                type="file"
                hidden
                accept="image/*,.pdf,.doc,.docx,.ppt,.pptx,.xls,.xlsx,.txt,.zip"
                onChange={(event) => {
                  if (event.target.files?.[0]) {
                    sendMessage({ file: event.target.files[0] });
                    event.target.value = "";
                  }
                }}
              />
              <input
                type="text"
                value={messageInput}
                onChange={(event) => onMessageChange(event.target.value)}
                placeholder="Type a message"
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    sendMessage({ text: messageInput });
                  }
                }}
              />
              <button type="button" onClick={() => sendMessage({ text: messageInput })}>{sendingAttachment ? "Uploading..." : "Send"}</button>
            </footer>
          </>
        )}
      </main>

      {(sendingAttachment || updatingProfile || authLoading) && (
        <div className="global-loader">
          <div className="loader-spinner" />
          <p>Please wait...</p>
        </div>
      )}
    </div>
  );
}

export default App;