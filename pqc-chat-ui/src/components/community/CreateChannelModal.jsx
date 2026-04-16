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
        <h3>Create Channel</h3>
        <form onSubmit={submit} className="qx-modal-form">
          <input value={name} onChange={(event) => setName(event.target.value)} placeholder="Channel name" required />
          <textarea value={description} onChange={(event) => setDescription(event.target.value)} placeholder="What is this channel about?" rows={3} />
          <div className="qx-modal-actions">
            <button type="button" className="qx-btn" onClick={onClose}>Cancel</button>
            <button type="submit" className="qx-btn qx-btn--primary" disabled={!canSubmit}>Create Channel</button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default CreateChannelModal;
