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
  doc,
  increment,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
} from "firebase/firestore";
import { getDownloadURL, ref, uploadBytes } from "firebase/storage";
import { auth, db, storage } from "./firebase";
import "./App.css";

const normalizePhone = (raw) => raw.replace(/[^\d+]/g, "");

const formatTime = (dateValue) => {
  if (!dateValue) return "";

  const date = typeof dateValue?.toDate === "function" ? dateValue.toDate() : new Date(dateValue);

  return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
};

const conversationIdFor = (uidA, uidB) => [uidA, uidB].sort().join("_");

function App() {
  const [authUser, setAuthUser] = useState(null);
  const [authReady, setAuthReady] = useState(false);
  const [profile, setProfile] = useState(null);
  const [authMode, setAuthMode] = useState("login");
  const [authForm, setAuthForm] = useState({
    displayName: "",
    phoneNumber: "",
    email: "",
    password: "",
  });
  const [authLoading, setAuthLoading] = useState(false);
  const [authError, setAuthError] = useState("");

  const [allUsers, setAllUsers] = useState([]);
  const [conversations, setConversations] = useState({});
  const [selectedUser, setSelectedUser] = useState(null);
  const [messages, setMessages] = useState([]);
  const [messageInput, setMessageInput] = useState("");
  const [search, setSearch] = useState("");
  const [contactPhone, setContactPhone] = useState("");
  const [contactFeedback, setContactFeedback] = useState("");
  const [sendingAttachment, setSendingAttachment] = useState(false);

  const typingTimeoutRef = useRef(null);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      setAuthUser(user);
      setAuthError("");
      setAuthReady(true);

      if (!user) {
        setProfile(null);
        setSelectedUser(null);
        setMessages([]);
        return;
      }

      const userRef = doc(db, "users", user.uid);
      try {
        await setDoc(
          userRef,
          {
            uid: user.uid,
            displayName: user.displayName || user.email?.split("@")[0] || "New User",
            email: user.email || "",
            isOnline: true,
            lastSeen: serverTimestamp(),
            createdAt: serverTimestamp(),
          },
          { merge: true }
        );
      } catch (error) {
        setAuthError(
          navigator.onLine
            ? "Unable to load your profile right now. Please retry."
            : "You're offline. Reconnect to load chat data."
        );
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
      await setDoc(
        userRef,
        {
          isOnline: false,
          lastSeen: serverTimestamp(),
        },
        { merge: true }
      );
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

    const usersQuery = query(collection(db, "users"), where("uid", "!=", authUser.uid));
    const unsubscribe = onSnapshot(usersQuery, (snapshot) => {
      setAllUsers(snapshot.docs.map((entry) => entry.data()));
    });

    return unsubscribe;
  }, [authUser]);

  useEffect(() => {
    if (!authUser) return undefined;

    const conversationsQuery = query(
      collection(db, "conversations"),
      where("participants", "array-contains", authUser.uid)
    );

    const unsubscribe = onSnapshot(conversationsQuery, (snapshot) => {
      const map = {};
      snapshot.forEach((entry) => {
        map[entry.id] = entry.data();
      });
      setConversations(map);
    });

    return unsubscribe;
  }, [authUser]);

  useEffect(() => {
    if (!authUser || !selectedUser) return undefined;

    const conversationId = conversationIdFor(authUser.uid, selectedUser.uid);
    const messagesQuery = query(
      collection(db, "conversations", conversationId, "messages"),
      orderBy("createdAt", "asc")
    );

    const conversationRef = doc(db, "conversations", conversationId);
    setDoc(conversationRef, { unreadBy: { [authUser.uid]: 0 } }, { merge: true });

    const unsubscribe = onSnapshot(messagesQuery, (snapshot) => {
      setMessages(snapshot.docs.map((entry) => ({ id: entry.id, ...entry.data() })));
    });

    return unsubscribe;
  }, [authUser, selectedUser]);

  const contacts = useMemo(() => {
    if (!profile?.contacts?.length) return [];

    const contactsSet = new Set(profile.contacts.map(normalizePhone));

    return allUsers
      .filter((user) => contactsSet.has(normalizePhone(user.phoneNumber || "")))
      .sort((a, b) => (a.displayName || "").localeCompare(b.displayName || ""));
  }, [allUsers, profile]);

  const filteredUsers = useMemo(() => {
    const value = search.trim().toLowerCase();
    if (!value) return contacts;

    return contacts.filter((user) => {
      const name = user.displayName?.toLowerCase() || "";
      const email = user.email?.toLowerCase() || "";
      const phone = user.phoneNumber?.toLowerCase() || "";
      return name.includes(value) || email.includes(value) || phone.includes(value);
    });
  }, [contacts, search]);

  const selectedConversation =
    authUser && selectedUser ? conversations[conversationIdFor(authUser.uid, selectedUser.uid)] : null;

  const selectedPartnerTyping =
    selectedConversation && selectedUser ? selectedConversation?.typing?.[selectedUser.uid] : false;

  const submitAuth = async (event) => {
    event.preventDefault();
    setAuthError("");
    setAuthLoading(true);

    try {
      if (authMode === "register") {
        const normalizedPhone = normalizePhone(authForm.phoneNumber);
        if (!normalizedPhone) {
          throw new Error("A valid phone number is required.");
        }

        const existingPhoneQuery = query(collection(db, "users"), where("phoneNumber", "==", normalizedPhone));

        let phoneAlreadyTaken = false;
        await new Promise((resolve) => {
          const unsubscribe = onSnapshot(existingPhoneQuery, (snapshot) => {
            phoneAlreadyTaken = !snapshot.empty;
            unsubscribe();
            resolve();
          });
        });

        if (phoneAlreadyTaken) {
          throw new Error("This phone number is already linked to another account.");
        }

        const credentials = await createUserWithEmailAndPassword(auth, authForm.email, authForm.password);
        await updateProfile(credentials.user, {
          displayName: authForm.displayName.trim(),
        });

        await setDoc(doc(db, "users", credentials.user.uid), {
          uid: credentials.user.uid,
          displayName: authForm.displayName.trim(),
          email: authForm.email.trim(),
          phoneNumber: normalizedPhone,
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

    const normalizedPhone = normalizePhone(contactPhone);
    const phoneQuery = query(collection(db, "users"), where("phoneNumber", "==", normalizedPhone));

    await new Promise((resolve) => {
      const unsubscribe = onSnapshot(phoneQuery, async (snapshot) => {
        if (snapshot.empty) {
          setContactFeedback("No registered user found with that number.");
          unsubscribe();
          resolve();
          return;
        }

        const candidate = snapshot.docs[0].data();
        if (candidate.uid === authUser.uid) {
          setContactFeedback("You cannot add your own number.");
          unsubscribe();
          resolve();
          return;
        }

        await updateDoc(doc(db, "users", authUser.uid), {
          contacts: arrayUnion(normalizedPhone),
        });

        setContactFeedback(`Saved ${candidate.displayName} to your contacts.`);
        setContactPhone("");
        unsubscribe();
        resolve();
      });
    });
  };

  const updateTypingState = async (isTyping) => {
    if (!authUser || !selectedUser) return;

    const conversationId = conversationIdFor(authUser.uid, selectedUser.uid);
    const conversationRef = doc(db, "conversations", conversationId);

    await setDoc(
      conversationRef,
      {
        participants: [authUser.uid, selectedUser.uid],
        participantPhones: [profile?.phoneNumber || "", selectedUser.phoneNumber || ""],
        typing: {
          [authUser.uid]: isTyping,
        },
      },
      { merge: true }
    );
  };

  const queueTypingStop = () => {
    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
    }

    typingTimeoutRef.current = setTimeout(() => {
      updateTypingState(false);
    }, 1000);
  };

  const sendMessage = async ({ text = "", file = null } = {}) => {
    if ((!text.trim() && !file) || !authUser || !selectedUser || !profile) return;

    const conversationId = conversationIdFor(authUser.uid, selectedUser.uid);
    const conversationRef = doc(db, "conversations", conversationId);

    let payload = {
      type: "text",
      text: text.trim(),
    };

    if (file) {
      setSendingAttachment(true);
      const storageRef = ref(storage, `attachments/${conversationId}/${Date.now()}_${file.name}`);
      await uploadBytes(storageRef, file);
      const fileURL = await getDownloadURL(storageRef);
      payload = {
        type: file.type.startsWith("image/") ? "image" : "file",
        text: text.trim() || file.name,
        fileURL,
        fileName: file.name,
        fileSize: file.size,
      };
      setSendingAttachment(false);
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
        unreadBy: {
          [authUser.uid]: 0,
          [selectedUser.uid]: increment(1),
        },
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

  const onMessageChange = async (value) => {
    setMessageInput(value);

    if (!value.trim()) {
      updateTypingState(false);
      return;
    }

    await updateTypingState(true);
    queueTypingStop();
  };

  const logout = async () => {
    if (authUser) {
      await updateDoc(doc(db, "users", authUser.uid), {
        isOnline: false,
        lastSeen: serverTimestamp(),
      });
    }

    await signOut(auth);
  };

  if (!authReady) {
    return (
      <div className="auth-shell">
        <div className="auth-card">
          <h1>MyChatApp</h1>
          <p>Checking your session...</p>
        </div>
      </div>
    );
  }

  if (!authUser) {
    return (
      <div className="auth-shell">
        <div className="auth-card">
          <h1>MyChatApp</h1>
          <p>WhatsApp-style secure chat with contacts-by-phone, presence, and file sharing.</p>

          <div className="auth-tabs">
            <button
              type="button"
              className={authMode === "login" ? "active" : ""}
              onClick={() => setAuthMode("login")}
            >
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
                  onChange={(event) =>
                    setAuthForm((prev) => ({
                      ...prev,
                      displayName: event.target.value,
                    }))
                  }
                  required
                  minLength={2}
                />
                <input
                  type="tel"
                  placeholder="Phone number (with country code)"
                  value={authForm.phoneNumber}
                  onChange={(event) =>
                    setAuthForm((prev) => ({
                      ...prev,
                      phoneNumber: event.target.value,
                    }))
                  }
                  required
                />
              </>
            )}
            <input
              type="email"
              placeholder="Email"
              value={authForm.email}
              onChange={(event) =>
                setAuthForm((prev) => ({
                  ...prev,
                  email: event.target.value,
                }))
              }
              required
            />
            <input
              type="password"
              placeholder="Password"
              value={authForm.password}
              onChange={(event) =>
                setAuthForm((prev) => ({
                  ...prev,
                  password: event.target.value,
                }))
              }
              required
              minLength={6}
            />

            {authError && <div className="error-text">{authError}</div>}

            <button type="submit" disabled={authLoading}>
              {authLoading
                ? "Please wait..."
                : authMode === "register"
                ? "Create account"
                : "Sign in"}
            </button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="chat-shell">
      <aside className="chat-sidebar">
        <div className="sidebar-header">
          <div>
            <h2>Chats</h2>
            <span>{profile?.phoneNumber || authUser.email}</span>
          </div>
          <button type="button" onClick={logout}>
            Logout
          </button>
        </div>

        <form className="add-contact-form" onSubmit={addContactByPhone}>
          <input
            type="tel"
            placeholder="Add contact by phone"
            value={contactPhone}
            onChange={(event) => setContactPhone(event.target.value)}
          />
          <button type="submit">Add</button>
        </form>
        {contactFeedback && <p className="feedback">{contactFeedback}</p>}

        <div className="search-box">
          <input
            type="text"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search contacts"
          />
        </div>

        <div className="user-list">
          {filteredUsers.map((user) => {
            const conversationId = conversationIdFor(authUser.uid, user.uid);
            const conversation = conversations[conversationId];
            const unreadCount = conversation?.unreadBy?.[authUser.uid] || 0;
            const isActive = selectedUser?.uid === user.uid;

            return (
              <button
                key={user.uid}
                type="button"
                className={`user-tile ${isActive ? "active" : ""}`}
                onClick={() => setSelectedUser(user)}
              >
                <div className="avatar">{(user.displayName || "U").charAt(0).toUpperCase()}</div>
                <div className="tile-content">
                  <div className="tile-title-row">
                    <strong>{user.displayName || "Unnamed user"}</strong>
                    <span>{formatTime(conversation?.lastMessageAt)}</span>
                  </div>
                  <div className="tile-sub-row">
                    <p>{conversation?.lastMessage || user.phoneNumber || user.email}</p>
                    {unreadCount > 0 && <b className="unread-pill">{unreadCount}</b>}
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </aside>

      <main className="chat-main">
        {!selectedUser ? (
          <div className="empty-state">
            <h3>Welcome to MyChatApp</h3>
            <p>Add a phone contact and select them to start real-time messaging.</p>
          </div>
        ) : (
          <>
            <header className="chat-header">
              <div className="avatar">{(selectedUser.displayName || "U").charAt(0).toUpperCase()}</div>
              <div>
                <h3>{selectedUser.displayName}</h3>
                <span>
                  {selectedUser.isOnline
                    ? "online"
                    : `last seen ${formatTime(selectedUser.lastSeen) || "recently"}`}
                </span>
              </div>
            </header>

            <section className="messages">
              {messages.map((message) => {
                const isMine = message.senderId === authUser.uid;
                return (
                  <div key={message.id} className={`message-row ${isMine ? "mine" : "theirs"}`}>
                    <div className="message-bubble">
                      {message.type === "image" && message.fileURL && (
                        <img src={message.fileURL} alt={message.fileName || "attachment"} className="chat-image" />
                      )}

                      {message.type === "file" && message.fileURL && (
                        <a href={message.fileURL} target="_blank" rel="noreferrer" className="file-link">
                          {message.fileName || "Open file"}
                        </a>
                      )}

                      {!!message.text && <p>{message.text}</p>}
                      <span>{formatTime(message.createdAt)}</span>
                    </div>
                  </div>
                );
              })}
            </section>

            <div className="typing-row">{selectedPartnerTyping ? `${selectedUser.displayName} is typing...` : ""}</div>

            <footer className="composer">
              <label htmlFor="attachment" className="attach-btn">
                📎
              </label>
              <input
                id="attachment"
                type="file"
                hidden
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
              <button type="button" onClick={() => sendMessage({ text: messageInput })}>
                {sendingAttachment ? "Uploading..." : "Send"}
              </button>
            </footer>
          </>
        )}
      </main>
    </div>
  );
}

export default App;