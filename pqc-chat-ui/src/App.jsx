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
import CreateGroupModal from "./components/community/CreateGroupModal";
import CreateChannelModal from "./components/community/CreateChannelModal";
import { createChannel, createGroup, followChannel, unfollowChannel } from "./services/communityService";
import {
  deleteObject,
  getDownloadURL,
  ref,
  uploadBytesResumable,
} from "firebase/storage";
import { auth, db, storage } from "./firebase";
import "./App.css";
import PublicHomePage from "./pages/PublicHomePage";
import AuthPage from "./pages/AuthPage";
import Sidebar from "./components/Sidebar";
import ChatWindow from "./components/chatwindow/ChatWindow";

const MAX_FILE_SIZE_BYTES = 15 * 1024 * 1024;
const QUICK_EMOJIS = ["😀", "😂", "😍", "🙏", "👍", "🔥", "🎉", "❤️", "💯", "⚡", "🛡️", "🔐"];
const THEMES = [
  { id: "default", label: "⚡ Quantum" },
  { id: "emerald", label: "🌿 Emerald" },
  { id: "midnight", label: "🌌 Midnight" },
  { id: "sunset", label: "🌅 Sunset" },
  { id: "cyber", label: "🔷 Cyber" },
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
  const [publicView, setPublicView] = useState("home");
  const [authForm, setAuthForm] = useState({ displayName: "", phoneNumber: "", email: "", password: "" });
  const [authLoading, setAuthLoading] = useState(false);
  const [authError, setAuthError] = useState("");
  const [allUsers, setAllUsers] = useState([]);
  const [conversations, setConversations] = useState({});
  const [selectedUser, setSelectedUser] = useState(null);
  const [selectedGroup, setSelectedGroup] = useState(null);
  const [selectedChannel, setSelectedChannel] = useState(null);
  const [activeThreadType, setActiveThreadType] = useState("direct");
  const [groups, setGroups] = useState([]);
  const [followedChannels, setFollowedChannels] = useState([]);
  const [discoverChannels, setDiscoverChannels] = useState([]);
  const [showGroupModal, setShowGroupModal] = useState(false);
  const [showChannelModal, setShowChannelModal] = useState(false);
  const [search, setSearch] = useState("");
  const [contactPhone, setContactPhone] = useState("");
  const [contactFeedback, setContactFeedback] = useState("");
  const [updatingProfile, setUpdatingProfile] = useState(false);
  const [showProfilePanel, setShowProfilePanel] = useState(false);
  const [profileNameInput, setProfileNameInput] = useState("");
  const [statusText, setStatusText] = useState("");
  const [showMobileSidebar, setShowMobileSidebar] = useState(false);
  const [showSettings, setShowSettings] = useState(false);

  const typingTimeoutRef = useRef(null);
  const messagesEndRef = useRef(null);
  const composerRef = useRef(null);

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
        setSelectedGroup(null);
        setSelectedChannel(null);
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
    let heartbeatTimer = null;

    const updatePresence = async (isOnline) => {
      await setDoc(userRef, { isOnline, lastSeen: serverTimestamp(), activeAt: serverTimestamp() }, { merge: true });
    };

    const unsubscribe = onSnapshot(userRef, (snapshot) => {
      setProfile(snapshot.exists() ? snapshot.data() : null);
    });

    const markOffline = async () => { await updatePresence(false); };
    const handleVisibility = () => updatePresence(!document.hidden);

    updatePresence(true);
    heartbeatTimer = window.setInterval(() => updatePresence(!document.hidden), 60000);
    document.addEventListener("visibilitychange", handleVisibility);
    window.addEventListener("beforeunload", markOffline);

    return () => {
      if (heartbeatTimer) window.clearInterval(heartbeatTimer);
      document.removeEventListener("visibilitychange", handleVisibility);
      window.removeEventListener("beforeunload", markOffline);
      markOffline();
      unsubscribe();
    };
  }, [authUser]);

  useEffect(() => {
    if (!authUser) return undefined;
    const q = query(collection(db, "users"), where("uid", "!=", authUser.uid));
    return onSnapshot(q, (snapshot) => setAllUsers(snapshot.docs.map((e) => e.data())));
  }, [authUser]);

  useEffect(() => {
    if (!authUser) return undefined;
    const q = query(collection(db, "conversations"), where("participants", "array-contains", authUser.uid));
    return onSnapshot(q, (snapshot) => {
      const next = {};
      snapshot.forEach((e) => { next[e.id] = e.data(); });
      setConversations(next);
    });
  }, [authUser]);

  useEffect(() => {
    if (!authUser) return undefined;
    const q = query(collection(db, "groups"), where("memberIds", "array-contains", authUser.uid));
    return onSnapshot(q, (snapshot) => {
      const next = snapshot.docs.map((entry) => ({ id: entry.id, ...entry.data() }));
      setGroups(next.sort((a, b) => (a.name || "").localeCompare(b.name || "")));
    });
  }, [authUser]);

  useEffect(() => {
    if (!authUser) return undefined;
    const q = query(collection(db, "channels"));
    return onSnapshot(q, (snapshot) => {
      const channels = snapshot.docs.map((entry) => ({ id: entry.id, ...entry.data() }));
      setFollowedChannels(channels.filter((channel) => (channel.followerIds || []).includes(authUser.uid)));
      setDiscoverChannels(channels.filter((channel) => !(channel.followerIds || []).includes(authUser.uid)));
    });
  }, [authUser]);

  useEffect(() => { setProfileNameInput(profile?.displayName || ""); }, [profile?.displayName]);

  const contacts = useMemo(() => {
    const visibleUsers = new Map();
    const contactSet = new Set((profile?.contacts || []).map(normalizePhone));
    const usersById = new Map(allUsers.map((u) => [u.uid, u]));

    allUsers.forEach((u) => {
      if (contactSet.has(normalizePhone(u.phoneNumber || ""))) visibleUsers.set(u.uid, u);
    });
    Object.values(conversations).forEach((conv) => {
      const partnerUid = (conv.participants || []).find((uid) => uid !== authUser?.uid);
      if (partnerUid && usersById.get(partnerUid)) visibleUsers.set(partnerUid, usersById.get(partnerUid));
    });
    return [...visibleUsers.values()].sort((a, b) => (a.displayName || "").localeCompare(b.displayName || ""));
  }, [allUsers, authUser?.uid, conversations, profile?.contacts]);

  const filteredUsers = useMemo(() => {
    const value = search.trim().toLowerCase();
    if (!value) return contacts;
    return contacts.filter((u) =>
      [u.displayName, u.email, u.phoneNumber].map((v) => (v || "").toLowerCase()).some((f) => f.includes(value))
    );
  }, [contacts, search]);

  const totalUnread = useMemo(() => {
    return Object.values(conversations).reduce((acc, conv) => acc + (conv.unreadBy?.[authUser?.uid] || 0), 0);
  }, [conversations, authUser]);

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

        if (!exactPhoneSnapshot.empty || !variantSnapshot.empty)
          throw new Error("This phone number is already linked to another account.");

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
      setPublicView("login");
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
    if (!phoneVariants.length) { setContactFeedback("Please enter a valid phone number."); return; }

    const [directMatch, variantMatch] = await Promise.all([
      getDocs(query(collection(db, "users"), where("phoneNumber", "in", phoneVariants))),
      getDocs(query(collection(db, "users"), where("phoneLookupKeys", "array-contains-any", phoneVariants))),
    ]);

    const candidates = new Map();
    directMatch.docs.forEach((e) => candidates.set(e.id, e.data()));
    variantMatch.docs.forEach((e) => candidates.set(e.id, e.data()));
    const candidate = [...candidates.values()][0];

    if (!candidate) { setContactFeedback("No registered user found with that number."); return; }
    if (candidate.uid === authUser.uid) { setContactFeedback("You cannot add your own number."); return; }

    await updateDoc(doc(db, "users", authUser.uid), { contacts: arrayUnion(candidate.phoneNumber) });
    setContactFeedback(`✓ Secured link to ${candidate.displayName}`);
    setContactPhone("");
    setTimeout(() => setContactFeedback(""), 3000);
  };

  const handleCreateGroup = async ({ name, description, memberIds }) => {
    if (!authUser) return;
    await createGroup({ name, description, memberIds, creatorId: authUser.uid });
    setShowGroupModal(false);
    setStatusText("✓ Group created.");
  };

  const handleCreateChannel = async ({ name, description }) => {
    if (!authUser) return;
    await createChannel({ name, description, creatorId: authUser.uid });
    setShowChannelModal(false);
    setStatusText("✓ Channel created.");
  };

  const toggleFollowChannel = async (channel) => {
    if (!authUser) return;
    const isFollowing = (channel.followerIds || []).includes(authUser.uid);
    if (isFollowing) {
      await unfollowChannel(channel.id, authUser.uid);
      if (selectedChannel?.id === channel.id) {
        setSelectedChannel(null);
      }
      setStatusText(`✓ Unfollowed ${channel.name}`);
      return;
    }
    await followChannel(channel.id, authUser.uid);
    setStatusText(`✓ Following ${channel.name}`);
  };

  const updateProfileName = async (event) => {
    event.preventDefault();
    if (!authUser || !profileNameInput.trim()) return;
    setUpdatingProfile(true);
    try {
      const displayName = profileNameInput.trim();
      await updateProfile(authUser, { displayName });
      await updateDoc(doc(db, "users", authUser.uid), { displayName });
      setStatusText("✓ Identity updated.");
    } catch {
      setStatusText("✗ Update failed.");
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
      setStatusText("✓ Profile encrypted.");
    } catch {
      setStatusText("✗ Upload failed.");
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
      setStatusText("✓ QUANTX logo updated.");
    } catch {
      setStatusText("✗ Logo upload failed.");
    } finally {
      setUpdatingProfile(false);
    }
  };

  const uploadToStorage = async (path, file) => {
    if (!file) throw new Error("File missing.");
    if (file.size > MAX_FILE_SIZE_BYTES) throw new Error("File is too large. Please upload a file up to 15MB.");

    const storageRef = ref(storage, `${path}/${Date.now()}_${file.name}`);
    const uploadTask = uploadBytesResumable(storageRef, file);

    return new Promise((resolve, reject) => {
      uploadTask.on(
        "state_changed",
        (snapshot) => {},
        async (error) => {
          try { await deleteObject(storageRef); } catch {}
          reject(error);
        },
        async () => {
          const fileUrl = await getDownloadURL(uploadTask.snapshot.ref);
          resolve(fileUrl);
        }
      );
    });
  };

  const logout = async () => {
     try {
      if (authUser) {
        await updateDoc(doc(db, "users", authUser.uid), {
          isOnline: false,
          lastSeen: serverTimestamp(),
          activeAt: serverTimestamp(),
        });
      }
    } catch (error) {
      console.warn("Failed to update online status during logout:", error);
    } finally {
      await signOut(auth);
    }
  };

  // ─── Boot loader ───────────────────────────────────────────────────────────
  if (!authReady) {
    return (
      <div className={`qx-boot app-theme-${appTheme}`}>
        <div className="qx-boot-card">
          <div className="qx-boot-brand">
            <div className="qx-boot-logo">
              <span>Q</span>
              <div className="qx-boot-ring" />
              <div className="qx-boot-ring qx-boot-ring-2" />
            </div>
            <h1>QUANTX</h1>
          </div>
          <div className="qx-boot-status">
            <div className="qx-boot-bar"><div className="qx-boot-bar-fill" /></div>
            <p>Initializing secure workspace...</p>
          </div>
          <button type="button" className="qx-theme-toggle" onClick={() => setAppTheme((p) => p === "dark" ? "light" : "dark")}>
            {appTheme === "dark" ? "☀ Light" : "☾ Dark"}
          </button>
        </div>
      </div>
    );
  }

  if (!authUser) {
    if (publicView === "home") {
      return (
        <PublicHomePage
          appTheme={appTheme}
          onToggleTheme={() => setAppTheme((p) => p === "dark" ? "light" : "dark")}
          onNavigate={(view) => { setAuthMode(view === "register" ? "register" : "login"); setPublicView(view); }}
        />
      );
    }
    return (
      <AuthPage
        appTheme={appTheme}
        authMode={authMode}
        authForm={authForm}
        authLoading={authLoading}
        authError={authError}
        onToggleTheme={() => setAppTheme((p) => p === "dark" ? "light" : "dark")}
        onModeChange={setAuthMode}
        onFormChange={(field, value) => setAuthForm((prev) => ({ ...prev, [field]: value }))}
        onSubmit={submitAuth}
        onBackToHome={() => setPublicView("home")}
      />
    );
  }

  // ─── Main Chat UI ──────────────────────────────────────────────────────────
  return (
    <div className={`qx-shell app-theme-${appTheme} ${showMobileSidebar ? "sidebar-open" : ""}`}>

      {/* Sidebar - WhatsApp Style */}
      <Sidebar
        authUser={authUser}
        profile={profile}
        contacts={contacts}
        groups={groups}
        followedChannels={followedChannels}
        discoverChannels={discoverChannels}
        conversations={conversations}
        activeThreadType={activeThreadType}
        selectedUser={selectedUser}
        selectedGroup={selectedGroup}
        selectedChannel={selectedChannel}
        onSelectUser={(user) => {
          setActiveThreadType("direct");
          setSelectedUser(user);
          setSelectedGroup(null);
          setSelectedChannel(null);
          setShowMobileSidebar(false);
        }}
        onSelectGroup={(group) => {
          setActiveThreadType("group");
          setSelectedGroup(group);
          setSelectedUser(null);
          setSelectedChannel(null);
        }}
        onSelectChannel={(channel) => {
          setActiveThreadType("channel");
          setSelectedChannel(channel);
          setSelectedUser(null);
          setSelectedGroup(null);
        }}
        search={search}
        onSearch={setSearch}
        onAddContact={addContactByPhone}
        contactPhone={contactPhone}
        onContactPhoneChange={setContactPhone}
        contactFeedback={contactFeedback}
        statusText={statusText}
        appTheme={appTheme}
        onToggleTheme={() => setAppTheme((p) => p === "dark" ? "light" : "dark")}
        onShowSettings={() => setShowProfilePanel(!showProfilePanel)}
        onCreateGroup={() => setShowGroupModal(true)}
        onCreateChannel={() => setShowChannelModal(true)}
        onToggleFollowChannel={toggleFollowChannel}
        onLogout={logout}
        showMobileSidebar={showMobileSidebar}
      />

      {/* Profile Panel (Settings) */}
      {showProfilePanel && (
        <div className="qx-profile-panel-overlay" onClick={() => setShowProfilePanel(false)}>
          <div className="qx-profile-panel" onClick={(e) => e.stopPropagation()}>
            <div className="qx-profile-header">
              <div className="qx-profile-avatar-wrap">
                <img
                  className="qx-profile-avatar"
                  src={profile?.photoURL || `https://ui-avatars.com/api/?name=${encodeURIComponent(profile?.displayName || "User")}&background=4d7fff&color=fff&bold=true`}
                  alt={profile?.displayName}
                />
                <label htmlFor="profile-photo" className="qx-avatar-edit" title="Change photo">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="14" height="14"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                </label>
                <input id="profile-photo" type="file" hidden accept="image/*" onChange={(e) => e.target.files?.[0] && updateProfilePicture(e.target.files[0])} />
              </div>
              <div>
                <p className="qx-profile-name">{profile?.displayName || "Agent"}</p>
                <p className="qx-profile-phone">{profile?.phoneNumber || authUser.email}</p>
                <div className="qx-status-dot-row"><span className="qx-status-dot" /><span>Online & Secure</span></div>
              </div>
              <button type="button" className="qx-profile-close" onClick={() => setShowProfilePanel(false)}>✕</button>
            </div>
            <form className="qx-profile-form" onSubmit={updateProfileName}>
              <div className="qx-form-group">
                <label>Display Name</label>
                <input type="text" value={profileNameInput} placeholder="Enter your name" onChange={(e) => setProfileNameInput(e.target.value)} minLength={2} required />
              </div>
              <button type="submit" className="qx-btn qx-btn--primary" disabled={updatingProfile}>
                {updatingProfile ? <><span className="qx-spinner-sm" /> Updating...</> : "Save Identity"}
              </button>
            </form>
            <div className="qx-profile-uploads">
              <label htmlFor="brand-logo" className="qx-upload-btn">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="14" height="14"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>
                Upload Logo
              </label>
              <input id="brand-logo" type="file" hidden accept="image/*" onChange={(e) => e.target.files?.[0] && updateBrandLogo(e.target.files[0])} />
            </div>
            <button type="button" className="qx-logout-btn" onClick={logout}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="16" height="16"><path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>
              Sign Out
            </button>
          </div>
        </div>
      )}

      {/* Chat Window Component */}
      {!selectedUser && !selectedGroup && !selectedChannel ? (
        <div className="qx-welcome">
          <div className="qx-welcome-graphic">
            <div className="qx-welcome-orb">
              <div className="qx-welcome-ring" />
              <div className="qx-welcome-ring qx-welcome-ring-2" />
              <div className="qx-welcome-ring qx-welcome-ring-3" />
              <span>⚛</span>
            </div>
          </div>
          <h3>Welcome to QUANTX</h3>
          <p>Select a contact to begin a quantum-secured conversation</p>
          <div className="qx-welcome-features">
            <span>🔐 End-to-End Encrypted</span>
            <span>⚡ Real-Time Sync</span>
            <span>🛡️ Zero-Knowledge</span>
          </div>
        </div>
      ) : (
        <ChatWindow
          authUser={authUser}
          profile={profile}
          activeThreadType={activeThreadType}
          selectedUser={selectedUser}
          selectedGroup={selectedGroup}
          selectedChannel={selectedChannel}
          conversations={conversations}
          allUsers={allUsers}
          contacts={contacts}
        />
      )}

      <CreateGroupModal
        open={showGroupModal}
        contacts={contacts}
        onClose={() => setShowGroupModal(false)}
        onCreate={handleCreateGroup}
      />
      <CreateChannelModal
        open={showChannelModal}
        onClose={() => setShowChannelModal(false)}
        onCreate={handleCreateChannel}
      />

      {/* Mobile overlay */}
      {showMobileSidebar && <div className="qx-overlay" onClick={() => setShowMobileSidebar(false)} />}
    </div>
  );
}

export default App;