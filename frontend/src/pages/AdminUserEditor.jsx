import { useState } from "react";
import { updateAdminUser } from "../services/adminService";

function AdminUserEditor({ user, token, onClose, onSaved, onExpired }) {
  const [name, setName] = useState(user.displayName || "");
  const [email, setEmail] = useState(user.email || "");
  const [phone, setPhone] = useState(user.phoneNumber || "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const save = async (event) => {
    event.preventDefault();
    setSaving(true);
    setError("");
    try {
      const { user: updated } = await updateAdminUser(token, user.uid, {
        displayName: name,
        email,
        phoneNumber: phone,
      });
      onSaved(updated);
    } catch (err) {
      if (/admin session expired|admin sign in required/i.test(err.message || "")) onExpired();
      setError(err.message || "Unable to update user.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="admin-modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section className="admin-edit-card" role="dialog" aria-modal="true" aria-labelledby="admin-edit-title">
        <div className="admin-edit-heading">
          <div><div className="admin-eyebrow">EDIT USER</div><h2 id="admin-edit-title">{user.displayName || user.email}</h2></div>
          <button type="button" className="admin-quiet-button" onClick={onClose} aria-label="Close editor">✕</button>
        </div>
        <p className="admin-edit-id">User ID: {user.uid}</p>
        <form onSubmit={save}>
          <label htmlFor="admin-edit-name">Display name</label>
          <input id="admin-edit-name" type="text" maxLength="100" value={name} onChange={(event) => setName(event.target.value)} />
          <label htmlFor="admin-edit-email">Email address</label>
          <input id="admin-edit-email" type="email" required value={email} onChange={(event) => setEmail(event.target.value)} />
          <label htmlFor="admin-edit-phone">Phone number</label>
          <input id="admin-edit-phone" type="tel" value={phone} onChange={(event) => setPhone(event.target.value)} placeholder="03288179010 or +923288179010" />
          <p className="admin-edit-help">Email and phone must be unique. A blank phone removes the number. Users must use the new email at their next sign in.</p>
          {error && <div className="admin-error" role="alert">{error}</div>}
          <div className="admin-edit-actions">
            <button type="button" className="admin-quiet-button" onClick={onClose}>Cancel</button>
            <button type="submit" className="admin-primary-button" disabled={saving}>{saving ? "Saving…" : "Save changes"}</button>
          </div>
        </form>
      </section>
    </div>
  );
}

export default AdminUserEditor;
