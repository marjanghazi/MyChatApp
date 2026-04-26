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
  arrayRemove,
  arrayUnion,
  collection,
  deleteDoc,
  doc,
  getDoc,
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
import CreateGroupModal   from "./components/community/CreateGroupModal";
import CreateChannelModal from "./components/community/CreateChannelModal";
import GroupDetailsPage from "./components/community/GroupDetailsPage";
import {
  createChannel,
  createGroup,
  followChannel,
  unfollowChannel,
} from "./services/communityService";
import { addContactByPhoneApi, checkPhoneAvailability } from "./services/userService";
import {
  deleteObject,
  getDownloadURL,
  ref,
  uploadBytesResumable,
} from "firebase/storage";
import { auth, db, storage } from "./firebase";
import "./App.css";
import PublicHomePage from "./pages/PublicHomePage";
import AuthPage       from "./pages/AuthPage";
import Sidebar        from "./components/Sidebar";
import ChatWindow     from "./components/chatwindow/ChatWindow";

const MAX_FILE_SIZE_BYTES = 15 * 1024 * 1024;

const normalizePhone = (raw) => raw.replace(/\D/g, "");
const conversationIdFor = (uidA, uidB) => [uidA, uidB].sort().join("_");

const AUTH_ERROR_MESSAGES = {
  "auth/invalid-email": "Please enter a valid email address.",
  "auth/user-not-found": "No account found for this email. Please register first.",
  "auth/wrong-password": "Incorrect password. Please try again.",
  "auth/invalid-credential": "Email or password is incorrect.",
  "auth/email-already-in-use": "This email is already in use. Please sign in instead.",
  "auth/weak-password": "Password is too weak. Use at least 6 characters.",
  "auth/too-many-requests": "Too many attempts. Please wait a moment and try again.",
  "auth/network-request-failed": "Network issue detected. Please check your connection.",
};

const getAuthErrorMessage = (error) => {
  if (!error) return "Unable to complete request.";
  if (error.message?.includes("phone number is already linked")) return error.message;
  return AUTH_ERROR_MESSAGES[error.code] || error.message || "Unable to complete request.";
};

function App() {
  const [appTheme, setAppTheme] = useState(() => {
    const saved = localStorage.getItem("appTheme");
    if (saved === "light" || saved === "dark") return saved;
    return window.matchMedia?.("(prefers-color-scheme: dark)")?.matches ? "dark" : "light";
  });

  const [authUser,          setAuthUser]          = useState(null);
  const [authReady,         setAuthReady]         = useState(false);
  const [profile,           setProfile]           = useState(null);
  const [authMode,          setAuthMode]          = useState("login");
  const [publicView,        setPublicView]        = useState("home");
  const [authForm,          setAuthForm]          = useState({ displayName: "", phoneNumber: "", email: "", password: "" });
  const [authLoading,       setAuthLoading]       = useState(false);
  const [authError,         setAuthError]         = useState("");
  const [allUsers,          setAllUsers]          = useState([]);
  const [conversations,     setConversations]     = useState({});
  const [selectedUser,      setSelectedUser]      = useState(null);
  const [selectedGroup,     setSelectedGroup]     = useState(null);
  const [selectedChannel,   setSelectedChannel]   = useState(null);
  const [activeThreadType,  setActiveThreadType]  = useState("direct");
  const [groups,            setGroups]            = useState([]);
  const [followedChannels,  setFollowedChannels]  = useState([]);
  const [discoverChannels,  setDiscoverChannels]  = useState([]);
  const [showGroupModal,    setShowGroupModal]    = useState(false);
  const [showChannelModal,  setShowChannelModal]  = useState(false);
  const [search,            setSearch]            = useState("");
  const [contactPhone,      setContactPhone]      = useState("");
  const [contactFeedback,   setContactFeedback]   = useState("");
  const [updatingProfile,   setUpdatingProfile]   = useState(false);
  const [showProfilePanel,  setShowProfilePanel]  = useState(false);
  const [profileNameInput,  setProfileNameInput]  = useState("");
  const [statusText,        setStatusText]        = useState("");
  const [showMobileSidebar, setShowMobileSidebar] = useState(false);
  const [showGroupDetails,  setShowGroupDetails]  = useState(false);

  // ── Persist theme ────────────────────────────────────────────────────────
  useEffect(() => { localStorage.setItem("appTheme", appTheme); }, [appTheme]);

  // ── Auth state ───────────────────────────────────────────────────────────
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
        await setDoc(doc(db, "users", user.uid), {
          uid:         user.uid,
          displayName: user.displayName || user.email?.split("@")[0] || "User",
          email:       user.email || "",
          isOnline:    true,
          lastSeen:    serverTimestamp(),
          createdAt:   serverTimestamp(),
        }, { merge: true });
      } catch {
        setAuthError("Unable to sync profile. Check network and try again.");
      }
    });
    return unsubscribe;
  }, []);

  // ── Presence ─────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!authUser) return undefined;

    const userRef        = doc(db, "users", authUser.uid);
    let heartbeatTimer   = null;

    const updatePresence = async (isOnline) => {
      await setDoc(userRef, { isOnline, lastSeen: serverTimestamp(), activeAt: serverTimestamp() }, { merge: true });
    };

    const unsubscribe       = onSnapshot(userRef, (snap) => setProfile(snap.exists() ? snap.data() : null));
    const markOffline       = () => updatePresence(false);
    const handleVisibility  = () => updatePresence(!document.hidden);

    updatePresence(true);
    heartbeatTimer = window.setInterval(() => updatePresence(!document.hidden), 60_000);
    document.addEventListener("visibilitychange", handleVisibility);
    window.addEventListener("beforeunload", markOffline);

    return () => {
      window.clearInterval(heartbeatTimer);
      document.removeEventListener("visibilitychange", handleVisibility);
      window.removeEventListener("beforeunload", markOffline);
      markOffline();
      unsubscribe();
    };
  }, [authUser]);

  // ── Users ─────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!authUser) return undefined;
    const q = query(collection(db, "users"), where("uid", "!=", authUser.uid));
    return onSnapshot(q, (snap) => setAllUsers(snap.docs.map((e) => e.data())));
  }, [authUser]);

  // ── Conversations ────────────────────────────────────────────────────────
  useEffect(() => {
    if (!authUser) return undefined;
    const q = query(collection(db, "conversations"), where("participants", "array-contains", authUser.uid));
    return onSnapshot(q, (snap) => {
      const next = {};
      snap.forEach((e) => { next[e.id] = e.data(); });
      setConversations(next);
    });
  }, [authUser]);

  useEffect(() => {
    if (!authUser?.uid) return;
    const pendingDeliveries = Object.entries(conversations).filter(([, conv]) =>
      conv?.lastMessageSender &&
      conv.lastMessageSender !== authUser.uid &&
      conv.lastMessageStatus === "sent"
    );
    pendingDeliveries.forEach(([conversationId]) => {
      updateDoc(doc(db, "conversations", conversationId), {
        lastMessageStatus: "delivered",
        updatedAt: serverTimestamp(),
      }).catch(() => {});
    });
  }, [conversations, authUser?.uid]);

  // ── Groups ────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!authUser) return undefined;
    const q = query(collection(db, "groups"), where("memberIds", "array-contains", authUser.uid));
    return onSnapshot(q, (snap) => {
      const next = snap.docs.map((e) => ({ id: e.id, ...e.data() }));
      setGroups(next.sort((a, b) => (a.name || "").localeCompare(b.name || "")));
    });
  }, [authUser]);

  // ── Channels ──────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!authUser) return undefined;
    return onSnapshot(collection(db, "channels"), (snap) => {
      const channels = snap.docs.map((e) => ({ id: e.id, ...e.data() }));
      setFollowedChannels(channels.filter((c) => (c.followerIds || []).includes(authUser.uid)));
      setDiscoverChannels(channels.filter((c) => !(c.followerIds || []).includes(authUser.uid)));
    });
  }, [authUser]);

  useEffect(() => { setProfileNameInput(profile?.displayName || ""); }, [profile?.displayName]);
  useEffect(() => { setShowGroupDetails(false); }, [selectedGroup?.id, activeThreadType]);
  useEffect(() => {
    if (!selectedGroup?.id) return;
    const refreshedGroup = groups.find((entry) => entry.id === selectedGroup.id);
    if (!refreshedGroup) {
      setShowGroupDetails(false);
      setSelectedGroup(null);
      return;
    }
    if (refreshedGroup !== selectedGroup) setSelectedGroup(refreshedGroup);
  }, [groups, selectedGroup]);

  // ── Contacts ──────────────────────────────────────────────────────────────
  const contacts = useMemo(() => {
    const visible   = new Map();
    const contactSet = new Set((profile?.contacts || []).map(normalizePhone));
    const usersById  = new Map(allUsers.map((u) => [u.uid, u]));

    allUsers.forEach((u) => {
      if (contactSet.has(normalizePhone(u.phoneNumber || ""))) visible.set(u.uid, u);
    });
    Object.values(conversations).forEach((conv) => {
      const partnerUid = (conv.participants || []).find((uid) => uid !== authUser?.uid);
      if (partnerUid && usersById.get(partnerUid)) visible.set(partnerUid, usersById.get(partnerUid));
    });
    return [...visible.values()].sort((a, b) => (a.displayName || "").localeCompare(b.displayName || ""));
  }, [allUsers, authUser?.uid, conversations, profile?.contacts]);

  const filteredUsers = useMemo(() => {
    const v = search.trim().toLowerCase();
    if (!v) return contacts;
    return contacts.filter((u) =>
      [u.displayName, u.email, u.phoneNumber]
        .map((x) => (x || "").toLowerCase())
        .some((f) => f.includes(v))
    );
  }, [contacts, search]);

  const totalUnread = useMemo(
    () => Object.values(conversations).reduce((acc, c) => acc + (c.unreadBy?.[authUser?.uid] || 0), 0),
    [conversations, authUser]
  );

  // ── Auth actions ──────────────────────────────────────────────────────────
  const submitAuth = async (event) => {
    event.preventDefault();
    setAuthLoading(true);
    setAuthError("");
    try {
      if (authMode === "register") {
        const { available, normalizedPhone, phoneVariants } = await checkPhoneAvailability(authForm.phoneNumber);
        if (!available) throw new Error("This phone number is already linked to another account.");

        const creds = await createUserWithEmailAndPassword(auth, authForm.email, authForm.password);
        await updateProfile(creds.user, { displayName: authForm.displayName.trim() });
        await setDoc(doc(db, "users", creds.user.uid), {
          uid:             creds.user.uid,
          displayName:     authForm.displayName.trim(),
          email:           authForm.email.trim(),
          phoneNumber:     normalizedPhone,
          phoneLookupKeys: phoneVariants,
          contacts:        [],
          isOnline:        true,
          lastSeen:        serverTimestamp(),
          createdAt:       serverTimestamp(),
        });
      } else {
        await signInWithEmailAndPassword(auth, authForm.email, authForm.password);
      }
      setAuthForm({ displayName: "", phoneNumber: "", email: "", password: "" });
      setPublicView("login");
    } catch (error) {
      setAuthError(getAuthErrorMessage(error));
    } finally {
      setAuthLoading(false);
    }
  };

  const addContactByPhone = async (event) => {
    event.preventDefault();
    if (!authUser || !contactPhone.trim()) return;
    try {
      const { candidate } = await addContactByPhoneApi({ uid: authUser.uid, phoneNumber: contactPhone });
      setContactFeedback(`✓ Secured link to ${candidate.displayName}`);
    } catch (error) {
      setContactFeedback(error?.message || "Unable to add contact right now.");
      return;
    }
    setContactPhone("");
    setTimeout(() => setContactFeedback(""), 3000);
  };

  // ── Community ─────────────────────────────────────────────────────────────
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
    if (!authUser || !channel) return;
    const isFollowing = (channel.followerIds || []).includes(authUser.uid);
    if (isFollowing) {
      await unfollowChannel(channel.id, authUser.uid);
      if (selectedChannel?.id === channel.id) setSelectedChannel(null);
      setStatusText(`✓ Unfollowed ${channel.name}`);
    } else {
      await followChannel(channel.id, authUser.uid);
      setStatusText(`✓ Following ${channel.name}`);
    }
  };

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

  const leaveSelectedGroup = async () => {
    if (!authUser || activeThreadType !== "group" || !selectedGroup) return;
    const confirmed = window.confirm(`Leave ${selectedGroup.name}?`);
    if (!confirmed) return;
    const groupSnap = await getDoc(doc(db, "groups", selectedGroup.id));
    if (!groupSnap.exists()) {
      setStatusText("Group no longer exists.");
      return;
    }
    await updateDoc(doc(db, "groups", selectedGroup.id), {
      memberIds: arrayRemove(authUser.uid),
      admins: arrayRemove(authUser.uid),
      updatedAt: serverTimestamp(),
    });
    setShowGroupDetails(false);
    setSelectedGroup(null);
    setStatusText("✓ You left the group.");
  };

  const addGroupMember = async (memberUid) => {
    if (!selectedGroup?.id || !memberUid) return;
    const groupSnap = await getDoc(doc(db, "groups", selectedGroup.id));
    if (!groupSnap.exists()) {
      setStatusText("Group not found.");
      return;
    }
    const groupData = groupSnap.data();
    const isGroupAdmin = !!groupData.admins?.includes(authUser?.uid);
    if (!isGroupAdmin) {
      setStatusText("Only admins can add members.");
      return;
    }
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
    if (!selectedGroup?.id || !memberUid) return;
    const groupSnap = await getDoc(doc(db, "groups", selectedGroup.id));
    if (!groupSnap.exists()) {
      setStatusText("Group not found.");
      return;
    }
    const groupData = groupSnap.data();
    const isGroupAdmin = !!groupData.admins?.includes(authUser?.uid);
    if (!isGroupAdmin) {
      setStatusText("Only admins can update admin rights.");
      return;
    }
    if (!makeAdmin && memberUid === groupData.createdBy) {
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
    if (!selectedGroup?.id || !memberUid) return;
    const groupSnap = await getDoc(doc(db, "groups", selectedGroup.id));
    if (!groupSnap.exists()) {
      setStatusText("Group not found.");
      return;
    }
    const groupData = groupSnap.data();
    const isGroupAdmin = !!groupData.admins?.includes(authUser?.uid);
    if (!isGroupAdmin) {
      setStatusText("Only admins can remove members.");
      return;
    }
    if (memberUid === authUser?.uid) {
      setStatusText("Use Leave Group to remove yourself.");
      return;
    }
    if (memberUid === groupData.createdBy) {
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

  // ── Profile ───────────────────────────────────────────────────────────────
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
      setStatusText("✓ Profile picture updated.");
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
      setStatusText("✓ Logo updated.");
    } catch {
      setStatusText("✗ Logo upload failed.");
    } finally {
      setUpdatingProfile(false);
    }
  };

  const uploadToStorage = async (path, file) => {
    if (!file) throw new Error("File missing.");
    if (file.size > MAX_FILE_SIZE_BYTES) throw new Error("File too large. Max 15 MB.");

    const storageRef = ref(storage, `${path}/${Date.now()}_${file.name}`);
    const uploadTask = uploadBytesResumable(storageRef, file);

    return new Promise((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        uploadTask.cancel();
        reject(new Error("Upload timed out. Check Firebase Storage bucket/rules and try again."));
      }, 45000);

      uploadTask.on(
        "state_changed",
        () => {},
        async (err) => {
          clearTimeout(timeoutId);
          try { await deleteObject(storageRef); } catch {}
          reject(err);
        },
        async () => {
          clearTimeout(timeoutId);
          resolve(await getDownloadURL(uploadTask.snapshot.ref));
        }
      );
    });
  };

  const logout = async () => {
    try {
      if (authUser) {
        await updateDoc(doc(db, "users", authUser.uid), {
          isOnline:  false,
          lastSeen:  serverTimestamp(),
          activeAt:  serverTimestamp(),
        });
      }
    } catch (e) {
      console.warn("Failed to update online status during logout:", e);
    } finally {
      await signOut(auth);
    }
  };

  // ── Boot loader ───────────────────────────────────────────────────────────
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
            <p>Initializing secure workspace…</p>
          </div>
          <button type="button" className="qx-theme-toggle" onClick={() => setAppTheme((p) => p === "dark" ? "light" : "dark")}>
            {appTheme === "dark" ? "☀ Light" : "☾ Dark"}
          </button>
        </div>
      </div>
    );
  }

  // ── Public / Auth pages ───────────────────────────────────────────────────
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

  // ── Main shell ────────────────────────────────────────────────────────────
  return (
    <div className={`qx-shell app-theme-${appTheme} ${showMobileSidebar ? "sidebar-open" : ""}`}>

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
          setShowGroupDetails(false);
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
        onShowSettings={() => setShowProfilePanel((p) => !p)}
        onCreateGroup={() => setShowGroupModal(true)}
        onCreateChannel={() => setShowChannelModal(true)}
        onToggleFollowChannel={toggleFollowChannel}
        onLogout={logout}
        showMobileSidebar={showMobileSidebar}
      />

      {/* Profile panel */}
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
                <input
                  type="text"
                  value={profileNameInput}
                  placeholder="Enter your name"
                  onChange={(e) => setProfileNameInput(e.target.value)}
                  minLength={2}
                  required
                />
              </div>
              <button type="submit" className="qx-btn qx-btn--primary" disabled={updatingProfile}>
                {updatingProfile ? <><span className="qx-spinner-sm" /> Updating…</> : "Save Identity"}
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

      {/* Chat window or welcome screen */}
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
      ) : showGroupDetails && activeThreadType === "group" && selectedGroup ? (
        <GroupDetailsPage
          selectedGroup={selectedGroup}
          authUser={authUser}
          usersById={usersById}
          contacts={contacts}
          onBack={() => setShowGroupDetails(false)}
          onLeaveGroup={leaveSelectedGroup}
          onToggleAdmin={toggleGroupAdmin}
          onRemoveMember={removeGroupMember}
          onAddMember={addGroupMember}
        />
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
          onOpenGroupDetails={() => setShowGroupDetails(true)}
          onLeaveGroup={leaveSelectedGroup}
          // FIX: was missing — channel follow toggle inside ChatWindow header now works
          onUpdateConversation={({ type, channel }) => {
            if (type === "toggleFollow") toggleFollowChannel(channel);
          }}
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

      {showMobileSidebar && (
        <div className="qx-overlay" onClick={() => setShowMobileSidebar(false)} />
      )}
    </div>
  );
}

export default App;
