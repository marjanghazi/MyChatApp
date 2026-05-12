import "./AttachmentPickerMenu.css";

function AttachmentPickerMenu({
  open,
  onClose,
  onPickDocument,
  onPickImage,
  onPickVideo,
  onPickCamera,
}) {
  if (!open) return null;

  return (
    <div className="qx-attach-menu-overlay" onClick={onClose}>
      <div className="qx-attach-menu" onClick={(event) => event.stopPropagation()}>
        <p className="qx-attach-menu-title">What do you want to upload?</p>
        <button type="button" className="qx-attach-option" onClick={onPickDocument}>📄 Document</button>
        <button type="button" className="qx-attach-option" onClick={onPickImage}>🖼️ Picture</button>
        <button type="button" className="qx-attach-option" onClick={onPickVideo}>🎬 Video</button>
        <button type="button" className="qx-attach-option" onClick={onPickCamera}>📷 Capture live picture</button>
      </div>
    </div>
  );
}

export default AttachmentPickerMenu;
