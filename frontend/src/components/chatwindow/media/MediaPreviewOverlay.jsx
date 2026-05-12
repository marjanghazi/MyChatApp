import { useEffect, useState } from "react";
import "./MediaPreviewOverlay.css";

function MediaPreviewOverlay({ pendingMedia, onClose, onSend, sendingAttachment }) {
  const [previewUrl, setPreviewUrl] = useState("");

  useEffect(() => {
    if (!pendingMedia?.file) {
      setPreviewUrl("");
      return undefined;
    }
    if (pendingMedia.file.type.startsWith("image/") || pendingMedia.file.type.startsWith("video/")) {
      const url = URL.createObjectURL(pendingMedia.file);
      setPreviewUrl(url);
      return () => URL.revokeObjectURL(url);
    }
    setPreviewUrl("");
    return undefined;
  }, [pendingMedia]);

  if (!pendingMedia?.file) return null;

  const { file } = pendingMedia;
  const isImage = file.type.startsWith("image/");
  const isVideo = file.type.startsWith("video/");

  return (
    <div className="qx-media-preview-overlay">
      <div className="qx-media-preview-header">
        <button type="button" className="qx-media-preview-btn" onClick={onClose}>Cancel</button>
        <span>Preview before send</span>
        <button type="button" className="qx-media-preview-btn qx-media-preview-btn--send" onClick={onSend} disabled={sendingAttachment}>
          {sendingAttachment ? "Sending..." : "Send"}
        </button>
      </div>

      <div className="qx-media-preview-body">
        {isImage && previewUrl && <img src={previewUrl} alt="Preview" className="qx-media-preview-image" />}
        {isVideo && previewUrl && (
          <video className="qx-media-preview-video" controls autoPlay muted>
            <source src={previewUrl} type={file.type || "video/mp4"} />
          </video>
        )}
        {!isImage && !isVideo && (
          <div className="qx-media-preview-doc">
            <div className="qx-media-preview-doc-icon">📄</div>
            <p>{file.name}</p>
            <span>{(file.size / 1024).toFixed(1)} KB</span>
          </div>
        )}
      </div>
    </div>
  );
}

export default MediaPreviewOverlay;
