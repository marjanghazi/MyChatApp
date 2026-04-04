import { useEffect, useMemo, useState } from "react";
import {
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut,
  updateProfile,
} from "firebase/auth";
import {
  addDoc,
  collection,
  doc,
  getDoc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
} from "firebase/firestore";
import { auth, db } from "./firebase";
import "./App.css";

const formatTime = (dateValue) => {
  if (!dateValue) return "";

  const date = typeof dateValue?.toDate === "function" ? dateValue.toDate() : new Date(dateValue);

  return date.toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });
};

const conversationIdFor = (uidA, uidB) => [uidA, uidB].sort().join("_");

function App() {
  const [authUser, setAuthUser] = useState(null);
  const [authMode, setAuthMode] = useState("login");
  const [authForm, setAuthForm] = useState({
    displayName: "",
    email: "",
    password: "",
  });
  const [authLoading, setAuthLoading] = useState(false);
  const [authError, setAuthError] = useState("");

  const [users, setUsers] = useState([]);
  const [conversations, setConversations] = useState({});
  const [selectedUser, setSelectedUser] = useState(null);
  const [messages, setMessages] = useState([]);
  const [messageInput, setMessageInput] = useState("");
  const [search, setSearch] = useState("");

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      setAuthUser(user);
      setAuthError("");
      if (!user) {
        setSelectedUser(null);
        setMessages([]);
        return;
      }

      const userRef = doc(db, "users", user.uid);
      const existingDoc = await getDoc(userRef);
      if (!existingDoc.exists()) {
        await setDoc(userRef, {
          uid: user.uid,
          displayName: user.displayName || user.email?.split("@")[0] || "New User",
          email: user.email,
          photoURL: user.photoURL || "",
          createdAt: serverTimestamp(),
          lastSeen: serverTimestamp(),
        });
      } else {
        await updateDoc(userRef, {
          lastSeen: serverTimestamp(),
        });
      }
    });

    return unsubscribe;
  }, []);

  useEffect(() => {
    if (!authUser) return undefined;

    const usersQuery = query(collection(db, "users"), where("uid", "!=", authUser.uid));
    const unsubscribe = onSnapshot(usersQuery, (snapshot) => {
      const nextUsers = snapshot.docs.map((entry) => entry.data());
      setUsers(nextUsers);
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
      snapshot.forEach((conversationDoc) => {
        map[conversationDoc.id] = conversationDoc.data();
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

    const unsubscribe = onSnapshot(messagesQuery, (snapshot) => {
      setMessages(snapshot.docs.map((entry) => ({ id: entry.id, ...entry.data() })));
    });

    return unsubscribe;
  }, [authUser, selectedUser]);

  const filteredUsers = useMemo(() => {
    const value = search.trim().toLowerCase();
    if (!value) return users;

    return users.filter((user) => {
      const name = user.displayName?.toLowerCase() || "";
      const email = user.email?.toLowerCase() || "";
      return name.includes(value) || email.includes(value);
    });
  }, [search, users]);

  const submitAuth = async (event) => {
    event.preventDefault();
    setAuthError("");
    setAuthLoading(true);

    try {
      if (authMode === "register") {
        const credentials = await createUserWithEmailAndPassword(auth, authForm.email, authForm.password);
        await updateProfile(credentials.user, {
          displayName: authForm.displayName.trim(),
        });
      } else {
        await signInWithEmailAndPassword(auth, authForm.email, authForm.password);
      }
      setAuthForm({ displayName: "", email: "", password: "" });
    } catch (error) {
      setAuthError(error.message || "Unable to complete request.");
    } finally {
      setAuthLoading(false);
    }
  };

  const sendMessage = async () => {
    if (!messageInput.trim() || !authUser || !selectedUser) return;

    const conversationId = conversationIdFor(authUser.uid, selectedUser.uid);
    const conversationRef = doc(db, "conversations", conversationId);
    const text = messageInput.trim();

    await setDoc(
      conversationRef,
      {
        participants: [authUser.uid, selectedUser.uid],
        participantMeta: {
          [authUser.uid]: {
            displayName: authUser.displayName || authUser.email,
            email: authUser.email,
          },
          [selectedUser.uid]: {
            displayName: selectedUser.displayName,
            email: selectedUser.email,
          },
        },
        lastMessage: text,
        lastMessageSender: authUser.uid,
        lastMessageAt: serverTimestamp(),
      },
      { merge: true }
    );

    await addDoc(collection(db, "conversations", conversationId, "messages"), {
      text,
      senderId: authUser.uid,
      receiverId: selectedUser.uid,
      createdAt: serverTimestamp(),
    });

    setMessageInput("");
  };

  if (!authUser) {
    return (
      <div className="auth-shell">
        <div className="auth-card">
          <h1>MyChatApp</h1>
          <p>Secure real-time messaging inspired by WhatsApp.</p>

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
            <span>{authUser.displayName || authUser.email}</span>
          </div>
          <button type="button" onClick={() => signOut(auth)}>
            Logout
          </button>
        </div>

        <div className="search-box">
          <input
            type="text"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search people"
          />
        </div>

        <div className="user-list">
          {filteredUsers.map((user) => {
            const conversationId = conversationIdFor(authUser.uid, user.uid);
            const conversation = conversations[conversationId];
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
                  <p>{conversation?.lastMessage || user.email}</p>
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
            <p>Select a contact from the left to start real-time messaging.</p>
          </div>
        ) : (
          <>
            <header className="chat-header">
              <div className="avatar">{(selectedUser.displayName || "U").charAt(0).toUpperCase()}</div>
              <div>
                <h3>{selectedUser.displayName}</h3>
                <span>{selectedUser.email}</span>
              </div>
            </header>

            <section className="messages">
              {messages.map((message) => {
                const isMine = message.senderId === authUser.uid;
                return (
                  <div key={message.id} className={`message-row ${isMine ? "mine" : "theirs"}`}>
                    <div className="message-bubble">
                      <p>{message.text}</p>
                      <span>{formatTime(message.createdAt)}</span>
                    </div>
                  </div>
                );
              })}
            </section>

            <footer className="composer">
              <input
                type="text"
                value={messageInput}
                onChange={(event) => setMessageInput(event.target.value)}
                placeholder="Type a message"
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    sendMessage();
                  }
                }}
              />
              <button type="button" onClick={sendMessage}>
                Send
              </button>
            </footer>
          </>
        )}
      </main>
    </div>
  );
}

export default App;