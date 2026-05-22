
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
  onOpenContactProfile,
}) => (
  <>
    <header className="qx-chat-header">
      <button type="button" className="qx-mobile-back" onClick={onOpenMobileSidebar} aria-label="Open conversations">☰</button>
      <button
        type="button"
        className={`qx-chat-contact-trigger ${(activeThreadType === "group" || activeThreadType === "direct") ? "qx-chat-contact-trigger--active" : ""}`}
        onClick={() => {
          if (activeThreadType === "group") onOpenGroupDetails?.();
          if (activeThreadType === "direct") onOpenContactProfile?.();
        }}
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
        {/* {activeThreadType === "direct" && (
          <span className={`qx-presence ${selectedUser?.isOnline ? "qx-presence--online" : "qx-presence--offline"}`} />
        )} */}
      </div>
      <div className="qx-chat-contact-meta">
        <h3>{activeThreadName}</h3>
        <span className={activeThreadType === "direct" && selectedUser?.isOnline ? "qx-online-label" : "qx-offline-label"}>
          {activeThreadType === "group"
            ? `${(selectedGroup?.memberIds || []).length} members`
            : activeThreadType === "channel"
            ? `${(selectedChannel?.followerIds || []).length} followers`
            : selectedUser?.isOnline
            ? "online"
            : "offline"}
        </span>
      </div>
      </button>

      {activeThreadType === "direct" ? (
        <div className="qx-chat-actions">
          <button type="button" className="qx-icon-btn" title="Video call" onClick={() => startCall("video")}> 
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polygon points="23 7 16 12 23 17 23 7"/><rect x="1" y="5" width="15" height="14" rx="2" ry="2"/></svg>
          </button>
          <button
            type="button"
            className={`qx-icon-btn ${showCallLogs ? "qx-icon-btn--active" : ""}`}
            title="Search / logs"
            onClick={() => setShowCallLogs((p) => !p)}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
          </button>
          <button type="button" className="qx-icon-btn" title={selectedMuted ? "Unmute chat" : "Mute chat"} onClick={setMute}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="5" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="12" cy="19" r="1"/></svg>
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
