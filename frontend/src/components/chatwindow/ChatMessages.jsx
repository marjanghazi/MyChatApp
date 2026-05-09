
import "./ChatMessages.styles.css";

const ChatMessages = ({
  visibleMessages,
  authUser,
  selectedUser,
  activeThreadType,
  formatDate,
  formatTime,
  formatCallDuration,
  startCall,
  activeThreadName,
  usersById,
  setImagePreview,
  setReplyTo,
  setReplyTargetUser,
  replyPrivately,
  setForwardOpenFor,
  forwardOpenFor,
  deleteForEveryone,
  deleteForMe,
  toggleMessageFlag,
  contacts,
  forwardMessage,
  messagesEndRef,
  setMessageInput,
  setEditingMessageId,
}) => (
  <section className="qx-messages">
    {visibleMessages.length === 0 && (
      <div className="qx-messages-empty">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" width="40" height="40"><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/></svg>
        <p>No messages yet. Say hello!</p>
      </div>
    )}

    {visibleMessages.map((msg, index) => {
      if ((msg.deletedFor || []).includes(authUser.uid)) return null;
      const isMine   = msg.senderId === authUser.uid;
      const prevMsg  = visibleMessages[index - 1];
      const showDate = !prevMsg || formatDate(msg.createdAt) !== formatDate(prevMsg?.createdAt);
      const isRead   = selectedUser ? (msg.readBy || []).includes(selectedUser.uid) : false;
      const isDelivered = selectedUser ? (msg.deliveredTo || []).includes(selectedUser.uid) : false;
      const senderName = msg.senderName || usersById.get(msg.senderId)?.displayName || "Member";
      const shouldShowText = !!msg.text && !(
        msg.type === "audio" &&
        (msg.text === msg.fileName || /^voice-\d+\.(webm|ogg)$/i.test(msg.text || ""))
      );

      return (
        <div key={msg.id}>
          {showDate && (
            <div className="qx-date-divider"><span>{formatDate(msg.createdAt)}</span></div>
          )}

          {msg.type === "call" ? (
            <div style={{ display: "flex", justifyContent: "center", margin: "8px 0" }}>
              <div style={{
                display:         "flex",
                alignItems:      "center",
                gap:             "10px",
                background:      "rgba(255,255,255,0.07)",
                border:          `1px solid ${msg.callStatus === "missed" ? "rgba(255,80,80,0.35)" : "rgba(255,255,255,0.12)"}`,
                borderRadius:    "20px",
                padding:         "8px 18px",
                fontSize:        "0.8rem",
                color:           msg.callStatus === "missed" ? "#ff6b6b" : "rgba(255,255,255,0.7)",
                backdropFilter:  "blur(8px)",
                cursor:          "default",
                userSelect:      "none",
              }}>
                <span style={{ fontSize: "1.1rem" }}>
                  {msg.callType === "video" ? "🎥" : msg.callStatus === "missed" ? "📵" : "📞"}
                </span>
                <div>
                  <div style={{ fontWeight: 600, color: "inherit" }}>
                    {msg.callStatus === "missed"
                      ? "Missed call"
                      : msg.callStatus === "cancelled"
                      ? "Cancelled call"
                      : msg.callType === "video"
                      ? "Video call"
                      : "Voice call"}
                  </div>
                  {msg.callStatus === "completed" && msg.duration > 0 && (
                    <div style={{ opacity: 0.7, fontSize: "0.75rem" }}>
                      {formatCallDuration(msg.duration)}
                    </div>
                  )}
                  <div style={{ opacity: 0.5, fontSize: "0.7rem" }}>
                    {formatTime(msg.createdAt)}
                  </div>
                </div>
                <button
                  onClick={() => startCall(msg.callType)}
                  style={{
                    background: "rgba(77,127,255,0.2)",
                    border:     "1px solid rgba(77,127,255,0.4)",
                    borderRadius: "50%",
                    width: "28px", height: "28px",
                    cursor: "pointer",
                    color: "#4d7fff",
                    fontSize: "0.8rem",
                    display: "flex", alignItems: "center", justifyContent: "center",
                  }}
                  title={`Call back (${msg.callType})`}
                >
                  {msg.callType === "video" ? "🎥" : "📞"}
                </button>
              </div>
            </div>
          ) : (
            <div className={`qx-msg-row ${isMine ? "qx-msg-row--mine" : "qx-msg-row--theirs"}`}>
              {!isMine && (
                <div className="qx-msg-avatar">
                  {activeThreadType === "direct" && selectedUser?.photoURL
                    ? <img src={selectedUser.photoURL} alt={selectedUser.displayName} />
                    : <span>
                        {activeThreadType === "group"
                          ? "👥"
                          : activeThreadType === "channel"
                          ? "📣"
                          : (selectedUser?.displayName || "U").charAt(0).toUpperCase()}
                      </span>
                  }
                </div>
              )}
              <div className="qx-msg-content">
                {!isMine && activeThreadType === "group" && (
                  <div className="qx-msg-sender">{senderName}</div>
                )}
                {msg.replyTo && (
                  <div className="qx-reply-preview">
                    <span className="qx-reply-bar" />
                    <span>
                      {msg.replyTo.senderId === authUser.uid ? "You" : msg.replyTo.senderName || activeThreadName}:{" "}
                      {msg.replyTo.text?.slice(0, 80)}
                    </span>
                  </div>
                )}
                <div className={`qx-bubble ${isMine ? "qx-bubble--mine" : "qx-bubble--theirs"}`}>
                  {msg.forwardedFrom && (
                    <div className="qx-forwarded-label">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="12" height="12"><polyline points="15 17 20 12 15 7"/><path d="M4 18v-2a4 4 0 014-4h12"/></svg>
                      Forwarded from {msg.forwardedFrom}
                    </div>
                  )}
                  {msg.type === "image" && msg.fileURL && (
                    <img
                      src={msg.fileURL}
                      alt={msg.fileName || "Image"}
                      className="qx-msg-image"
                      onClick={() => setImagePreview(msg.fileURL)}
                    />
                  )}
                  {msg.type === "file" && msg.fileURL && (
                    <a href={msg.fileURL} target="_blank" rel="noreferrer" className="qx-file-attach">
                      <div className="qx-file-icon">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="20" height="20"><path d="M13 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V9z"/><polyline points="13 2 13 9 20 9"/></svg>
                      </div>
                      <div className="qx-file-info">
                        <span className="qx-file-name">{msg.fileName || "File"}</span>
                        {msg.fileSize && <span className="qx-file-size">{(msg.fileSize / 1024).toFixed(1)} KB</span>}
                      </div>
                    </a>
                  )}
                  {msg.type === "video" && msg.fileURL && (
                    <video className="qx-msg-video" controls preload="metadata">
                      <source src={msg.fileURL} type={msg.mimeType || "video/mp4"} />
                      Your browser does not support video playback.
                    </video>
                  )}
                  {msg.type === "audio" && msg.fileURL && (
                    <div className={`qx-audio-wrap qx-audio-wrap--voice ${isMine ? "qx-audio-wrap--mine" : "qx-audio-wrap--theirs"}`}>
                      <div className="qx-voice-wave" aria-hidden="true">
                        {Array.from({ length: 22 }).map((_, barIndex) => (
                          <span key={barIndex} className="qx-voice-wave-bar" />
                        ))}
                      </div>
                      <audio className="qx-msg-audio" controls preload="metadata">
                        <source src={msg.fileURL} type={msg.mimeType || "audio/webm"} />
                        Your browser does not support audio playback.
                      </audio>
                      <div className="qx-voice-label">Voice note</div>
                    </div>
                  )}
                  {shouldShowText && <p className="qx-msg-text">{msg.text}</p>}
                  <div className="qx-msg-meta">
                    <span className="qx-msg-time">{formatTime(msg.createdAt)}</span>
                    {msg.editedAt && <span className="qx-msg-edited">edited</span>}
                    {(msg.starredBy || []).includes(authUser.uid) && <span className="qx-msg-flag">⭐</span>}
                    {(msg.pinnedBy || []).includes(authUser.uid) && <span className="qx-msg-flag">📌</span>}
                    {isMine && (
                      <span className={`qx-read-receipt ${isRead ? "qx-read-receipt--read" : ""}`}>
                        {isRead ? "✓✓" : isDelivered ? "✓✓" : "✓"}
                      </span>
                    )}
                  </div>
                </div>
                <div className="qx-msg-actions">
                  <button
                    type="button"
                    className="qx-msg-action-btn"
                    title="Reply"
                    onClick={() => {
                      setReplyTo(msg);
                      setReplyTargetUser(msg.senderId ? usersById.get(msg.senderId) || null : null);
                    }}
                  >
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="12" height="12"><polyline points="9 14 4 9 9 4"/><path d="M20 20v-7a4 4 0 00-4-4H4"/></svg>
                  </button>
                  {activeThreadType === "group" && !isMine && (
                    <button
                      type="button"
                      className="qx-msg-action-btn"
                      title="Reply privately"
                      onClick={() => replyPrivately(msg)}
                    >
                      🔒
                    </button>
                  )}
                  <button
                    type="button"
                    className="qx-msg-action-btn"
                    title="Forward"
                    onClick={() => setForwardOpenFor(forwardOpenFor === msg.id ? null : msg.id)}
                  >
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="12" height="12"><polyline points="15 17 20 12 15 7"/><path d="M4 18v-2a4 4 0 014-4h12"/></svg>
                  </button>
                  {isMine && !msg.deletedForEveryone && (
                    <>
                      <button
                        type="button"
                        className="qx-msg-action-btn"
                        title="Edit"
                        onClick={() => { setMessageInput(msg.text || ""); setEditingMessageId(msg.id); }}
                      >
                        ✏️
                      </button>
                      <button
                        type="button"
                        className="qx-msg-action-btn qx-msg-action-btn--danger"
                        title="Delete for everyone"
                        onClick={() => deleteForEveryone(msg)}
                      >
                        🚫
                      </button>
                    </>
                  )}
                  {!isMine && (
                    <button
                      type="button"
                      className="qx-msg-action-btn"
                      title="Delete for me"
                      onClick={() => deleteForMe(msg)}
                    >
                      🗑️
                    </button>
                  )}
                  <button
                    type="button"
                    className="qx-msg-action-btn"
                    title="Star"
                    onClick={() => toggleMessageFlag(msg, "starredBy")}
                  >
                    ⭐
                  </button>
                  <button
                    type="button"
                    className="qx-msg-action-btn"
                    title="Pin"
                    onClick={() => toggleMessageFlag(msg, "pinnedBy")}
                  >
                    📌
                  </button>
                </div>
                {forwardOpenFor === msg.id && (
                  <div className="qx-forward-panel">
                    <p className="qx-forward-label">Forward to:</p>
                    {contacts.filter((c) => c.uid !== selectedUser?.uid).map((c) => (
                      <button key={c.uid} type="button" className="qx-forward-contact" onClick={() => forwardMessage(msg, c.uid)}>
                        <div className="qx-forward-avatar">{(c.displayName || "U").charAt(0).toUpperCase()}</div>
                        {c.displayName}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      );
    })}
    <div ref={messagesEndRef} />
  </section>
);

export default ChatMessages;
