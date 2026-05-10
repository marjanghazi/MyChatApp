
const ChatHeader = ({
  activeThreadType,
  selectedUser,
  selectedGroup,
  selectedChannel,
  activeThreadName,
  showCallLogs,
  setShowCallLogs,
  startCall,
  selectedMuted,
  setMute,
  selectedTheme,
  themes,
  setTheme,
  deleteChatHistory,
  leaveGroup,
  toggleFollowChannel,
  authUser,
  onOpenGroupDetails,
  onOpenMobileSidebar,
}) => (
  <>
    <header className="qx-chat-header">
      <button type="button" className="qx-mobile-back" onClick={onOpenMobileSidebar} aria-label="Open conversations">☰</button>
      <button
        type="button"
        className={`qx-chat-contact-trigger ${activeThreadType === "group" ? "qx-chat-contact-trigger--active" : ""}`}
        onClick={() => activeThreadType === "group" && onOpenGroupDetails?.()}
      >
      <div className="qx-chat-contact-avatar">
        {(activeThreadType === "direct" && selectedUser?.photoURL) ||
         (activeThreadType === "group" && selectedGroup?.photoURL) ||
         (activeThreadType === "channel" && selectedChannel?.photoURL)
          ? <img
              src={
                activeThreadType === "direct"
                  ? selectedUser?.photoURL
                  : activeThreadType === "group"
                  ? selectedGroup?.photoURL
                  : selectedChannel?.photoURL
              }
              alt={activeThreadName}
            />
          : <span>
              {activeThreadType === "group"
                ? "👥"
                : activeThreadType === "channel"
                ? "📣"
                : (selectedUser?.displayName || "U").charAt(0).toUpperCase()}
            </span>
        }
        {activeThreadType === "direct" && (
          <span className={`qx-presence ${selectedUser?.isOnline ? "qx-presence--online" : "qx-presence--offline"}`} />
        )}
      </div>
      <div className="qx-chat-contact-meta">
        <h3>{activeThreadName}</h3>
        <span className={activeThreadType === "direct" && selectedUser?.isOnline ? "qx-online-label" : "qx-offline-label"}>
          {activeThreadType === "group"
            ? `${(selectedGroup?.memberIds || []).length} members`
            : activeThreadType === "channel"
            ? `${(selectedChannel?.followerIds || []).length} followers`
            : selectedUser?.isOnline
            ? "● Online"
            : "○ Offline"}
        </span>
      </div>
      </button>

      {activeThreadType === "direct" ? (
        <div className="qx-chat-actions">
          <button type="button" className="qx-icon-btn" title="Voice call" onClick={() => startCall("audio")}> 
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07A19.5 19.5 0 013.07 9.81 19.79 19.79 0 012 1.22 2 2 0 014 .04h3a2 2 0 012 1.72c.127.96.361 1.903.7 2.81a2 2 0 01-.45 2.11L8.09 7.91a16 16 0 006 6l1.27-1.27a2 2 0 012.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0122 16.92z"/></svg>
          </button>
          <button type="button" className="qx-icon-btn" title="Video call" onClick={() => startCall("video")}> 
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polygon points="23 7 16 12 23 17 23 7"/><rect x="1" y="5" width="15" height="14" rx="2" ry="2"/></svg>
          </button>
          <button
            type="button"
            className={`qx-icon-btn ${showCallLogs ? "qx-icon-btn--active" : ""}`}
            title="Call history"
            onClick={() => setShowCallLogs((p) => !p)}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07A19.5 19.5 0 013.07 9.81 19.79 19.79 0 012 1.22 2 2 0 014 .04h3a2 2 0 012 1.72c.127.96.361 1.903.7 2.81a2 2 0 01-.45 2.11L8.09 7.91a16 16 0 006 6l1.27-1.27a2 2 0 012.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0122 16.92z"/>
              <line x1="18" y1="6" x2="23" y2="6"/>
              <line x1="18" y1="10" x2="23" y2="10"/>
            </svg>
          </button>
          <button
            type="button"
            className={`qx-icon-btn ${selectedMuted ? "qx-icon-btn--active" : ""}`}
            title={selectedMuted ? "Unmute" : "Mute"}
            onClick={setMute}
          >
            {selectedMuted
              ? <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="1" y1="1" x2="23" y2="23"/><path d="M9 9v3a3 3 0 005.12 2.12M15 9.34V4a3 3 0 00-5.94-.6M17 16.95A7 7 0 015 12v-2m14 0v2a7 7 0 01-.11 1.23M12 19v4M8 23h8"/></svg>
              : <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 1a3 3 0 00-3 3v8a3 3 0 006 0V4a3 3 0 00-3-3z"/><path d="M19 10v2a7 7 0 01-14 0v-2M12 19v4M8 23h8"/></svg>
            }
          </button>
          <div className="qx-theme-select-wrap">
            <select value={selectedTheme} onChange={(e) => setTheme(e.target.value)} className="qx-theme-select">
              {themes.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
            </select>
          </div>
          <button type="button" className="qx-icon-btn qx-icon-btn--danger" title="Clear history" onClick={deleteChatHistory}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4a1 1 0 011-1h4a1 1 0 011 1v2"/></svg>
          </button>
        </div>
      ) : (
        <div className="qx-chat-actions">
          <span className="qx-encryption-badge">Community thread</span>
          {activeThreadType === "group" && (
            <button type="button" className="qx-btn qx-btn--danger-soft" onClick={leaveGroup}>
              Leave Group
            </button>
          )}
          {activeThreadType === "channel" && (
            <button type="button" className="qx-btn" onClick={() => toggleFollowChannel(selectedChannel)}>
              {(selectedChannel?.followerIds || []).includes(authUser.uid) ? "Unfollow" : "Follow"}
            </button>
          )}
        </div>
      )}
    </header>
  </>
);

export default ChatHeader;
