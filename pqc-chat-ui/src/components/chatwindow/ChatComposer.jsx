import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import Picker from "@emoji-mart/react";
import data from "@emoji-mart/data";
import VoiceRecorderButton from "./voice/VoiceRecorderButton";
import "./ChatComposer.css";

const ChatComposer = ({
  activeThreadType,
  selectedPartnerTyping,
  selectedUser,
  replyTo,
  authUser,
  replyTargetUser,
  activeThreadName,
  setReplyTo,
  setReplyTargetUser,
  composerRef,
  setShowEmojiPicker,
  showEmojiPicker,
  messageInput,
  onMessageChange,
  editingMessageId,
  messages,
  editMessage,
  sendMessage,
  sendingAttachment,
  uploadProgress,
  imagePreview,
  setImagePreview,
  statusText,
  setStatusText,
}) => {
  const emojiButtonRef = useRef(null);
  const [emojiPickerPos, setEmojiPickerPos] = useState(null);

  useEffect(() => {
    if (!showEmojiPicker) return undefined;
    const updateEmojiPosition = () => {
      const buttonRect = emojiButtonRef.current?.getBoundingClientRect();
      if (!buttonRect) return;
      setEmojiPickerPos({
        left: buttonRect.left,
        top: buttonRect.top - 442,
      });
    };
    updateEmojiPosition();
    window.addEventListener("resize", updateEmojiPosition);
    window.addEventListener("scroll", updateEmojiPosition, true);
    return () => {
      window.removeEventListener("resize", updateEmojiPosition);
      window.removeEventListener("scroll", updateEmojiPosition, true);
    };
  }, [showEmojiPicker, setShowEmojiPicker]);

  return (
  <>
    <div className="qx-typing-row">
      {activeThreadType === "direct" && selectedPartnerTyping && (
        <div className="qx-typing-indicator">
          <div className="qx-typing-dots"><span /><span /><span /></div>
          <span>{selectedUser?.displayName} is typing…</span>
        </div>
      )}
    </div>

    {replyTo && (
      <div className="qx-reply-bar-wrap">
        <div className="qx-reply-preview-bar">
          <span className="qx-reply-accent" />
          <div>
            <span className="qx-reply-to-name">
              {replyTo.senderId === authUser.uid ? "You" : replyTargetUser?.displayName || activeThreadName}
            </span>
            <span className="qx-reply-to-text">{replyTo.text?.slice(0, 100)}</span>
          </div>
        </div>
        <button type="button" className="qx-reply-close" onClick={() => { setReplyTo(null); setReplyTargetUser(null); }}>✕</button>
      </div>
    )}

    <footer className="qx-composer" ref={composerRef}>
      <div className="qx-composer-inner">
        <div className="qx-composer-tools">
          <button
            type="button"
            className="qx-composer-btn qx-composer-btn--emoji"
            title="Emoji"
            ref={emojiButtonRef}
            onClick={() => setShowEmojiPicker((p) => !p)}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><path d="M8 14s1.5 2 4 2 4-2 4-2"/><line x1="9" y1="9" x2="9.01" y2="9"/><line x1="15" y1="9" x2="15.01" y2="9"/></svg>
          </button>
          <label htmlFor="attachment" className="qx-composer-btn" title="Attach media / file">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21.44 11.05l-9.19 9.19a6 6 0 01-8.49-8.49l9.19-9.19a4 4 0 015.66 5.66l-9.2 9.19a2 2 0 01-2.83-2.83l8.49-8.48"/></svg>
          </label>
          <input
            id="attachment" type="file" hidden
            accept="image/*,video/*,audio/*,.pdf,.doc,.docx,.ppt,.pptx,.xls,.xlsx,.txt,.zip"
            onChange={(e) => {
              if (e.target.files?.[0]) {
                sendMessage({ file: e.target.files[0] });
                e.target.value = "";
              }
            }}
          />
          <VoiceRecorderButton
            disabled={sendingAttachment}
            onVoiceRecorded={(voiceFile) => sendMessage({ file: voiceFile })}
            onStatusChange={setStatusText}
          />
        </div>
        <div className="qx-input-wrap">
          <textarea
            value={messageInput}
            onChange={(e) => onMessageChange(e.target.value)}
            placeholder={editingMessageId ? "Edit your message..." : "Type a secure message…"}
            rows={1}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                if (editingMessageId) {
                  const msg = messages.find((entry) => entry.id === editingMessageId);
                  if (msg) editMessage(msg);
                  return;
                }
                sendMessage({ text: messageInput });
              }
            }}
          />
        </div>
        <button
          type="button"
          className={`qx-send-btn ${messageInput.trim() || sendingAttachment ? "qx-send-btn--active" : ""}`}
          onClick={() => {
            if (editingMessageId) {
              const msg = messages.find((entry) => entry.id === editingMessageId);
              if (msg) editMessage(msg);
              return;
            }
            sendMessage({ text: messageInput });
          }}
          disabled={sendingAttachment}
        >
          {sendingAttachment
            ? <div className="qx-spinner-sm" />
            : <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>
          }
        </button>
      </div>

      {showEmojiPicker && emojiPickerPos && createPortal(
        <div className="qx-emoji-layer" onClick={() => setShowEmojiPicker(false)}>
          <div
            className="qx-emoji-picker qx-emoji-picker--popover"
            style={{ top: `${emojiPickerPos.top}px`, left: `${emojiPickerPos.left}px` }}
            onClick={(event) => event.stopPropagation()}
          >
            <Picker
              data={data}
              onEmojiSelect={(emoji) => onMessageChange(`${messageInput}${emoji.native}`)}
              theme="dark"
              previewPosition="none"
              set="native"
              navPosition="bottom"
            />
          </div>
        </div>,
        document.body
      )}

      {sendingAttachment && uploadProgress > 0 && (
        <div className="qx-upload-progress">
          <div className="qx-upload-bar"><div className="qx-upload-fill" style={{ width: `${uploadProgress}%` }} /></div>
          <span>{uploadProgress}%</span>
        </div>
      )}
    </footer>

    {imagePreview && (
      <div className="qx-lightbox" onClick={() => setImagePreview(null)}>
        <button type="button" className="qx-lightbox-close" onClick={() => setImagePreview(null)}>✕</button>
        <img src={imagePreview} alt="Preview" onClick={(e) => e.stopPropagation()} />
      </div>
    )}

    {statusText && <div className="qx-status-toast">{statusText}</div>}
  </>
  );
};

export default ChatComposer;
