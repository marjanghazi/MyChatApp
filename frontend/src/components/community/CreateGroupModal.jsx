import { useMemo, useState } from "react";

const CreateGroupModal = ({ open, contacts, onClose, onCreate }) => {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [selectedMembers, setSelectedMembers] = useState([]);

  const canSubmit = useMemo(() => name.trim().length >= 2 && selectedMembers.length > 0, [name, selectedMembers]);

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

  const selectedCount = selectedMembers.length;

  return (
    <div className="qx-modal-overlay" onClick={onClose}>
      <div className="qx-modal-card qx-modal-card--group" onClick={(event) => event.stopPropagation()}>
        <div className="qx-modal-header">
          <h3>Create Group</h3>
          <button type="button" className="qx-modal-close" onClick={onClose}>
            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="18" y1="6" x2="6" y2="18"/>
              <line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        </div>
        <form onSubmit={submit} className="qx-modal-form">
          <div className="qx-form-group">
            <label>Group Name</label>
            <input 
              value={name} 
              onChange={(event) => setName(event.target.value)} 
              placeholder="e.g., Dev Team, Project Alpha" 
              required 
              autoFocus
            />
          </div>
          <div className="qx-form-group">
            <label>Description (optional)</label>
            <textarea 
              value={description} 
              onChange={(event) => setDescription(event.target.value)} 
              placeholder="What is this group about?" 
              rows={2}
            />
          </div>
          <div className="qx-form-group">
            <div className="qx-member-picker-header">
              <label>Add Members</label>
              <span className="qx-member-count">{selectedCount} selected</span>
            </div>
            <div className="qx-member-picker">
              {contacts.length === 0 ? (
                <div className="qx-empty-members">
                  <svg viewBox="0 0 24 24" width="32" height="32" fill="none" stroke="currentColor" strokeWidth="1.5">
                    <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/>
                    <circle cx="9" cy="7" r="4"/>
                    <path d="M23 21v-2a4 4 0 00-3-3.87"/>
                    <path d="M16 3.13a4 4 0 010 7.75"/>
                  </svg>
                  <p>No contacts yet</p>
                  <span>Add contacts first to create a group</span>
                </div>
              ) : (
                contacts.map((contact) => {
                  const isSelected = selectedMembers.includes(contact.uid);
                  const initials = (contact.displayName || contact.email || "U").split(" ").map((w) => w[0]).join("").slice(0, 2).toUpperCase();
                  return (
                    <label key={contact.uid} className={`qx-member-item ${isSelected ? "qx-member-item--selected" : ""}`}>
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => toggleMember(contact.uid)}
                      />
                      <div className="qx-member-avatar">
                        {contact.photoURL ? (
                          <img src={contact.photoURL} alt={contact.displayName} />
                        ) : (
                          <span>{initials}</span>
                        )}
                      </div>
                      <div className="qx-member-info">
                        <span className="qx-member-name">{contact.displayName || "Unknown"}</span>
                        <span className="qx-member-email">{contact.email || contact.phoneNumber || "No contact info"}</span>
                      </div>
                    </label>
                  );
                })
              )}
            </div>
          </div>
          <div className="qx-modal-actions">
            <button type="button" className="qx-btn qx-btn--secondary" onClick={onClose}>
              Cancel
            </button>
            <button 
              type="submit" 
              className="qx-btn qx-btn--primary" 
              disabled={!canSubmit}
            >
              {canSubmit ? `Create Group (${selectedCount} members)` : selectedCount === 0 ? "Select at least 1 member" : "Name required (min 2 chars)"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default CreateGroupModal;