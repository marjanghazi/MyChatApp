import { useMemo, useState } from "react";

const CreateGroupModal = ({ open, contacts, onClose, onCreate }) => {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [selectedMembers, setSelectedMembers] = useState([]);

  const canSubmit = useMemo(() => name.trim().length >= 2, [name]);

  if (!open) return null;

  const toggleMember = (uid) => {
    setSelectedMembers((prev) => (prev.includes(uid) ? prev.filter((id) => id !== uid) : [...prev, uid]));
  };

  const submit = async (event) => {
    event.preventDefault();
    if (!canSubmit) return;
    await onCreate({ name, description, memberIds: selectedMembers });
    setName("");
    setDescription("");
    setSelectedMembers([]);
  };

  return (
    <div className="qx-modal-overlay" onClick={onClose}>
      <div className="qx-modal-card" onClick={(event) => event.stopPropagation()}>
        <h3>Create Group</h3>
        <form onSubmit={submit} className="qx-modal-form">
          <input value={name} onChange={(event) => setName(event.target.value)} placeholder="Group name" required />
          <textarea value={description} onChange={(event) => setDescription(event.target.value)} placeholder="Description" rows={3} />
          <div className="qx-member-picker">
            {contacts.map((contact) => (
              <label key={contact.uid} className="qx-member-item">
                <input
                  type="checkbox"
                  checked={selectedMembers.includes(contact.uid)}
                  onChange={() => toggleMember(contact.uid)}
                />
                <span>{contact.displayName || contact.email}</span>
              </label>
            ))}
            {contacts.length === 0 && <p>No contacts yet. Add contacts first.</p>}
          </div>
          <div className="qx-modal-actions">
            <button type="button" className="qx-btn" onClick={onClose}>Cancel</button>
            <button type="submit" className="qx-btn qx-btn--primary" disabled={!canSubmit}>Create Group</button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default CreateGroupModal;
