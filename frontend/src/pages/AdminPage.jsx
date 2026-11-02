import { useCallback, useEffect, useMemo, useState } from "react";
import { fetchAdminUsers, signInAdmin } from "../services/adminService";
import AdminCryptoPanel from "./AdminCryptoPanel";
import AdminHowItWorks from "./AdminHowItWorks";
import AdminUserEditor from "./AdminUserEditor";
import "./AdminPage.css";

const SESSION_KEY = "quantx_admin_session";

const readSession = () => {
  try {
    const saved = JSON.parse(sessionStorage.getItem(SESSION_KEY) || "null");
    return saved?.token && saved?.email ? saved : null;
  } catch {
    return null;
  }
};

const dateTime = (value) => {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "—" : date.toLocaleString();
};

const textOrDash = (value) => value || "—";

function AdminPage() {
  const [theme, setTheme] = useState(() => localStorage.getItem("appTheme") || "dark");
  const [session, setSession] = useState(readSession);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [users, setUsers] = useState([]);
  const [query, setQuery] = useState("");
  const [module, setModule] = useState("users");
  const [demoUserId, setDemoUserId] = useState("");
  const [editingUser, setEditingUser] = useState(null);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => { localStorage.setItem("appTheme", theme); }, [theme]);

  const signOut = useCallback(() => {
    sessionStorage.removeItem(SESSION_KEY);
    setSession(null);
    setUsers([]);
    setEditingUser(null);
    setPassword("");
  }, []);

  const loadUsers = useCallback(async (token) => {
    setLoading(true);
    setError("");
    try {
      const result = await fetchAdminUsers(token);
      setUsers(result.users || []);
    } catch (err) {
      if (/admin session expired|admin sign in required/i.test(err.message || "")) signOut();
      setError(err.message || "Unable to load users.");
    } finally {
      setLoading(false);
    }
  }, [signOut]);

  useEffect(() => {
    if (session?.token) loadUsers(session.token);
  }, [session?.token, loadUsers]);

  const submit = async (event) => {
    event.preventDefault();
    setSubmitting(true);
    setError("");
    try {
      const nextSession = await signInAdmin(email.trim(), password);
      sessionStorage.setItem(SESSION_KEY, JSON.stringify(nextSession));
      setSession(nextSession);
      setPassword("");
    } catch (err) {
      setError(err.message || "Unable to sign in.");
    } finally {
      setSubmitting(false);
    }
  };

  const filteredUsers = useMemo(() => {
    const term = query.trim().toLowerCase();
    if (!term) return users;
    return users.filter((user) => [user.displayName, user.email, user.phoneNumber, user.uid]
      .some((value) => String(value || "").toLowerCase().includes(term)));
  }, [query, users]);

  const onlineCount = users.filter((user) => user.isOnline).length;

  return (
    <main className={`admin-page app-theme-${theme}`}>
      <header className="admin-topbar">
        <a className="admin-brand" href="/">QUANTX <span>Admin</span></a>
        <div className="admin-top-actions">
          <button type="button" className="admin-quiet-button" onClick={() => setTheme(theme === "dark" ? "light" : "dark")}>{theme === "dark" ? "☀ Light" : "☾ Dark"}</button>
          {session && <button type="button" className="admin-quiet-button" onClick={signOut}>Sign out</button>}
        </div>
      </header>

      {!session ? (
        <section className="admin-login-card" aria-labelledby="admin-login-title">
          <div className="admin-eyebrow">ADMIN ACCESS</div>
          <h1 id="admin-login-title">Sign in to view users</h1>
          <p>Use your administrator email and password to access the user directory.</p>
          <form onSubmit={submit}>
            <label htmlFor="admin-email">Email</label>
            <input id="admin-email" type="email" value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="username" required />
            <label htmlFor="admin-password">Password</label>
            <input id="admin-password" type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="current-password" required />
            {error && <div className="admin-error" role="alert">{error}</div>}
            <button className="admin-primary-button" type="submit" disabled={submitting}>{submitting ? "Signing in…" : "Sign in"}</button>
          </form>
          <a className="admin-back-link" href="/">← Back to QUANTX</a>
        </section>
      ) : (
        <section className="admin-content" aria-label="Admin dashboard">
          <nav className="admin-module-nav" aria-label="Admin modules">
            <button type="button" className={module === "users" ? "active" : ""} onClick={() => setModule("users")}>Users</button>
            <button type="button" className={module === "crypto" ? "active" : ""} onClick={() => setModule("crypto")}>PQC and logins</button>
            <button type="button" className={module === "how" ? "active" : ""} onClick={() => setModule("how")}>How it works · Live demo</button>
          </nav>
          {module === "users" ? <>
          <div className="admin-heading">
            <div>
              <div className="admin-eyebrow">USER DIRECTORY</div>
              <h1 id="admin-title">All users</h1>
              <p>Account and profile data stored by QUANTX.</p>
            </div>
            <button type="button" className="admin-primary-button" onClick={() => loadUsers(session.token)} disabled={loading}>{loading ? "Refreshing…" : "↻ Refresh"}</button>
          </div>

          <div className="admin-stats">
            <div><strong>{users.length}</strong><span>Total users</span></div>
            <div><strong>{onlineCount}</strong><span>Online now</span></div>
            <div><strong>{users.length - onlineCount}</strong><span>Offline</span></div>
          </div>

          <div className="admin-list-header">
            <div><h2>Accounts</h2><p>{filteredUsers.length} shown</p></div>
            <label className="admin-search"><span>Search users</span><input type="search" placeholder="Name, email, phone, or ID" value={query} onChange={(event) => setQuery(event.target.value)} /></label>
          </div>
          {error && <div className="admin-error" role="alert">{error}</div>}
          <div className="admin-table-wrap">
            <table className="admin-table">
              <thead><tr><th>User</th><th>Email</th><th>Phone</th><th>Status</th><th>Joined</th><th>Last seen</th><th>More details</th><th>Actions</th></tr></thead>
              <tbody>
                {filteredUsers.map((user) => (
                  <tr key={user.uid}>
                    <td><div className="admin-user-cell"><span className="admin-avatar">{(user.displayName || user.email || "?").charAt(0).toUpperCase()}</span><strong>{textOrDash(user.displayName)}</strong></div></td>
                    <td>{textOrDash(user.email)}</td>
                    <td>{textOrDash(user.phoneNumber)}</td>
                    <td><span className={`admin-status ${user.isOnline ? "is-online" : ""}`}>{user.isOnline ? "Online" : "Offline"}</span></td>
                    <td>{dateTime(user.createdAt)}</td>
                    <td>{dateTime(user.lastSeen)}</td>
                    <td>
                      <details className="admin-details">
                        <summary>View</summary>
                        <dl>
                          <div><dt>User ID</dt><dd>{textOrDash(user.uid)}</dd></div>
                          <div><dt>Updated</dt><dd>{dateTime(user.updatedAt)}</dd></div>
                          <div><dt>Last activity</dt><dd>{dateTime(user.activeAt)}</dd></div>
                          <div><dt>Phone lookup keys</dt><dd>{(user.phoneLookupKeys || []).join(", ") || "—"}</dd></div>
                          <div><dt>Contacts</dt><dd>{(user.contacts || []).join(", ") || "—"}</dd></div>
                          <div><dt>Profile photo URL</dt><dd>{textOrDash(user.photoURL)}</dd></div>
                          <div><dt>Logo URL</dt><dd>{textOrDash(user.logoURL)}</dd></div>
                        </dl>
                      </details>
                    </td>
                    <td className="admin-row-actions"><button type="button" className="admin-quiet-button" onClick={() => setEditingUser(user)}>Edit</button><button type="button" className="admin-quiet-button" onClick={() => { setDemoUserId(user.uid); setModule("how"); }}>Watch crypto</button></td>
                  </tr>
                ))}
                {!loading && filteredUsers.length === 0 && <tr><td colSpan="8" className="admin-empty">{users.length ? "No users match your search." : "No users found."}</td></tr>}
              </tbody>
            </table>
          </div>
          </> : module === "crypto" ? <AdminCryptoPanel token={session.token} onExpired={signOut} />
            : <AdminHowItWorks token={session.token} users={users} initialUserId={demoUserId} onExpired={signOut} onOpenRecords={() => setModule("crypto")} onRefreshUsers={() => loadUsers(session.token)} />}
          {editingUser && <AdminUserEditor
            key={editingUser.uid}
            user={editingUser}
            token={session.token}
            onClose={() => setEditingUser(null)}
            onSaved={(updated) => {
              setUsers((previous) => previous.map((entry) => entry.uid === updated.uid ? updated : entry));
              setEditingUser(null);
            }}
            onExpired={signOut}
          />}
        </section>
      )}
    </main>
  );
}

export default AdminPage;
