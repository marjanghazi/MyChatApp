import { useMemo, useState } from "react";

const CreateChannelModal = ({ open, onClose, onCreate }) => {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const canSubmit = useMemo(() => name.trim().length >= 2, [name]);

  if (!open) return null;

  const submit = async (event) => {
    event.preventDefault();
    if (!canSubmit) return;
    await onCreate({ name, description });
    setName("");
    setDescription("");
  };

  return (
    <div className="qx-modal-overlay" onClick={onClose}>
      <div className="qx-modal-card" onClick={(event) => event.stopPropagation()}>
        <div className="qx-modal-header">
          <h3>Create Channel</h3>
          <button type="button" className="qx-modal-close" onClick={onClose}>
            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="18" y1="6" x2="6" y2="18"/>
              <line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        </div>
        <form onSubmit={submit} className="qx-modal-form">
          <div className="qx-form-group">
            <label>Channel Name</label>
            <input 
              value={name} 
              onChange={(event) => setName(event.target.value)} 
              placeholder="e.g., announcements, general-chat" 
              required 
              autoFocus
            />
          </div>
          <div className="qx-form-group">
            <label>Description (optional)</label>
            <textarea 
              value={description} 
              onChange={(event) => setDescription(event.target.value)} 
              placeholder="What is this channel about?" 
              rows={3}
            />
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
              {canSubmit ? "Create Channel" : "Name required (min 2 chars)"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default CreateChannelModal;