// Sidebar.jsx — QuantX · QUANTX-style Sidebar
import { useMemo, useState } from "react";
import "./Sidebar.css";

const FILTERS = ["All", "Unread", "Groups", "Channels"];

const toDate = (value) => {
  if (!value) return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  if (typeof value?.toDate === "function") {
    const d = value.toDate();
    return Number.isNaN(d?.getTime?.()) ? null : d;
  }

  if (typeof value === "object") {
    const seconds = typeof value.seconds === "number" ? value.seconds : value._seconds;
    const nanos = typeof value.nanoseconds === "number" ? value.nanoseconds : value._nanoseconds || 0;
    if (typeof seconds === "number") {
      const d = new Date(seconds * 1000 + Math.floor(nanos / 1_000_000));
      return Number.isNaN(d.getTime()) ? null : d;
    }
  }

  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
};

const formatTime = (dateValue) => {
  const date = toDate(dateValue);
  if (!date) return "";
  const now = new Date();
  const diff = now - date;
  if (diff < 86400000) return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  if (diff < 604800000) return date.toLocaleDateString([], { weekday: "short" });
  return date.toLocaleDateString([], { month: "short", day: "numeric" });
};

const conversationIdFor = (uidA, uidB) => [uidA, uidB].sort().join("_");

const renderStatusTick = (status) => {
  if (status === "seen") return <span className="wa-msg-tick wa-msg-tick--seen">✓✓</span>;
  if (status === "delivered") return <span className="wa-msg-tick">✓✓</span>;
  return <span className="wa-msg-tick">✓</span>;
};

const Avatar = ({ name, photoURL, icon, color, size = 49 }) => {
  const initials = (name || "U").split(" ").map((w) => w[0]).join("").slice(0, 2).toUpperCase();
  const bg = color || "var(--accent-a)";
  return (
    <div className="wa-avatar" style={{ width: size, height: size, background: photoURL ? "transparent" : bg }}>
      {photoURL
        ? <img src={photoURL} alt={name} style={{ width: "100%", height: "100%", borderRadius: "50%", objectFit: "cover" }} />
        : icon
          ? <span style={{ fontSize: size * 0.55 }}>{icon}</span>
          : <span style={{ fontSize: size * 0.4, color: "#fff", fontWeight: 600 }}>{initials}</span>
      }
    </div>
  );
};

const Sidebar = ({
  authUser,
  profile,
  contacts,
  groups,
  followedChannels,
  discoverChannels,
  conversations,
  activeThreadType,
  selectedUser,
  selectedGroup,
  selectedChannel,
  onSelectUser,
  onSelectGroup,
  onSelectChannel,
  search,
  onSearch,
  onAddContact,
  contactPhone,
  onContactPhoneChange,
  contactFeedback,
  statusText,
  appTheme,
  onToggleTheme,
  onShowSettings,
  onCreateGroup,
  onCreateChannel,
  onToggleFollowChannel,
  onLogout,
  showMobileSidebar,
}) => {
  const [filter, setFilter] = useState("All");
  const [showAddContact, setShowAddContact] = useState(false);
  const [showMenu, setShowMenu] = useState(false);
  const [activeItemMenuKey, setActiveItemMenuKey] = useState(null);

  // Build unified list items based on active filter AND search
  const listItems = useMemo(() => {
    const items = [];
    const searchLower = search.toLowerCase().trim();

    // Helper to check if item matches search
    const matchesSearch = (name, preview = "") => {
      if (!searchLower) return true;
      return name.toLowerCase().includes(searchLower) || 
             preview.toLowerCase().includes(searchLower);
    };

    // Direct messages - show in All and Unread filters
    if (filter === "All" || filter === "Unread") {
      contacts.forEach((user) => {
        const convId = conversationIdFor(authUser.uid, user.uid);
        const conv = conversations[convId];
        const unread = conv?.unreadBy?.[authUser.uid] || 0;
        const preview = conv?.lastMessage || user.phoneNumber || user.email || "No messages yet";
        const name = user.displayName || "Unknown";
        const isTyping = !!conv?.typing?.[user.uid];
        
        // Filter by unread
        if (filter === "Unread" && unread === 0) return;
        // Filter by search
        if (!matchesSearch(name, preview)) return;
        
        items.push({
          key: `dm_${user.uid}`,
          type: "direct",
          user,
          conv,
          unread,
          name,
          preview,
          isTyping,
          time: conv?.lastMessageAt,
          isActive: activeThreadType === "direct" && selectedUser?.uid === user.uid,
          isOnline: user.isOnline,
          photoURL: user.photoURL,
          isMuted: conv?.mutedBy?.[authUser.uid] || false,
          isPinned: conv?.pinnedBy?.[authUser.uid] || false,
        });
      });
    }

    // Groups - show in All and Groups filters
    if (filter === "All" || filter === "Groups") {
      groups.forEach((group) => {
        const preview = group.lastMessage || group.description || "No messages yet";
        const name = group.name;
        
        // Filter by search
        if (!matchesSearch(name, preview)) return;
        
        items.push({
          key: `grp_${group.id}`,
          type: "group",
          group,
          name,
          preview,
          time: group.lastMessageAt,
          isActive: activeThreadType === "group" && selectedGroup?.id === group.id,
          icon: "👥",
          photoURL: group.photoURL,
        });
      });
    }

    // Followed Channels - show in All and Channels filters
    if (filter === "All" || filter === "Channels") {
      followedChannels.forEach((channel) => {
        const preview = channel.lastPost || channel.description || "No posts yet";
        const name = channel.name;
        
        // Filter by search
        if (!matchesSearch(name, preview)) return;
        
        items.push({
          key: `channel_${channel.id}`,
          type: "channel",
          channel,
          name,
          preview,
          time: channel.lastPostAt,
          isActive: activeThreadType === "channel" && selectedChannel?.id === channel.id,
          icon: "📣",
          followerCount: channel.followerIds?.length || 0,
        });
      });
    }

    // Sort by recency
    items.sort((a, b) => {
      const aTime = toDate(a.time) || new Date(0);
      const bTime = toDate(b.time) || new Date(0);
      return bTime - aTime;
    });

    return items;
  }, [filter, search, contacts, groups, followedChannels, conversations, authUser.uid, activeThreadType, selectedUser, selectedGroup, selectedChannel]);

  // Pinned items (only for direct messages)
  const pinnedItems = listItems.filter(item => item.type === "direct" && item.isPinned);
  const regularItems = listItems.filter(item => !(item.type === "direct" && item.isPinned));

  const totalUnread = useMemo(() =>
    Object.values(conversations).reduce((acc, conv) => acc + (conv.unreadBy?.[authUser?.uid] || 0), 0),
    [conversations, authUser?.uid]
  );

  const handleItemClick = (item) => {
    if (item.type === "direct") onSelectUser(item.user);
    else if (item.type === "group") onSelectGroup(item.group);
    else if (item.type === "channel") onSelectChannel(item.channel);
  };

  const markAllAsRead = () => {
    // TODO: Implement mark all as read functionality
    setShowMenu(false);
  };

  const renderItemOptionsMenu = (item) => {
    const isGroup = item.type === "group";
    return (
      <div className="wa-item-options-menu" onClick={(e) => e.stopPropagation()}>
        <button type="button" className="wa-item-options-menu-item">Archive chat</button>
        <button type="button" className="wa-item-options-menu-item">Mute notifications</button>
        <button type="button" className="wa-item-options-menu-item">{item.isPinned ? "Unpin chat" : "Pin chat"}</button>
        <button type="button" className="wa-item-options-menu-item">Mark as unread</button>
        <button type="button" className="wa-item-options-menu-item">Add to favorites</button>
        <button type="button" className="wa-item-options-menu-item">Add to list</button>
        <div className="wa-item-options-menu-divider" />
        <button type="button" className="wa-item-options-menu-item">Clear chat</button>
        {isGroup && <button type="button" className="wa-item-options-menu-item wa-item-options-menu-item-danger">Exit group</button>}
      </div>
    );
  };

  return (
    <aside className={`wa-sidebar ${showMobileSidebar ? "wa-sidebar--open" : ""} app-theme-${appTheme}`}>

      {/* Header with QUANTX brand and menu */}
      <div className="wa-sidebar-header">
        <div className="wa-header-left">
          <h1 className="wa-brand">QUANTX</h1>
        </div>
        <div className="wa-header-right">
          <div className="wa-menu-container">
            <button 
              type="button" 
              className="wa-header-icon" 
              title="Menu"
              onClick={() => setShowMenu(!showMenu)}
            >
              <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="1"/>
                <circle cx="12" cy="5" r="1"/>
                <circle cx="12" cy="19" r="1"/>
              </svg>
            </button>
            {showMenu && (
              <div className="wa-dropdown-menu">
                <button type="button" className="wa-menu-item" onClick={() => { setShowAddContact(true); setShowMenu(false); }}>
                  <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/>
                  </svg>
                  New chat
                </button>
                <button type="button" className="wa-menu-item" onClick={() => { onCreateGroup(); setShowMenu(false); }}>
                  <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/>
                    <circle cx="9" cy="7" r="4"/>
                    <path d="M23 21v-2a4 4 0 00-3-3.87"/>
                    <path d="M16 3.13a4 4 0 010 7.75"/>
                  </svg>
                  New group
                </button>
                <button type="button" className="wa-menu-item" onClick={() => { onCreateChannel(); setShowMenu(false); }}>
                  <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/>
                    <polyline points="22,6 12,13 2,6"/>
                  </svg>
                  New channel
                </button>
                <div className="wa-menu-divider"></div>
                <button type="button" className="wa-menu-item" onClick={markAllAsRead}>
                  <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
                    <circle cx="12" cy="12" r="3"/>
                  </svg>
                  Mark all as read
                </button>

<button type="button" className="wa-menu-item" onClick={() => { onLogout?.(); setShowMenu(false); }}>
                  <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4"/>
                    <polyline points="16 17 21 12 16 7"/>
                    <line x1="21" y1="12" x2="9" y2="12"/>
                  </svg>
                  Sign Out
                </button>
                <button type="button" className="wa-menu-item" onClick={onToggleTheme}>
                  <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2">
                    {appTheme === "dark" ? (
                      <path d="M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z"/>
                    ) : (
                      <circle cx="12" cy="12" r="5"/>
                    )}
                  </svg>
                  {appTheme === "dark" ? "Light mode" : "Dark mode"}
                </button>
                <div className="wa-menu-divider"></div>
                <button type="button" className="wa-menu-item wa-menu-item-danger" onClick={onShowSettings}>
                  <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2">
                    <circle cx="12" cy="12" r="3"/>
                    <path d="M19.4 15a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H5.78a1.65 1.65 0 0 0-1.51 1 1.65 1.65 0 0 0 .33 1.82l.07.08A10 10 0 0 0 12 17.66a10 10 0 0 0 6.18-2.26z"/>
                  </svg>
                  Settings
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Add Contact Modal */}
      {showAddContact && (
        <div className="wa-add-modal">
          <div className="wa-add-modal-header">
            <h3>New chat</h3>
            <button type="button" className="wa-close-btn" onClick={() => setShowAddContact(false)}>✕</button>
          </div>
          <div className="wa-add-modal-body">
            <div className="wa-search-row">
              <div className="wa-search-box">
                <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="11" cy="11" r="8"/>
                  <line x1="21" y1="21" x2="16.65" y2="16.65"/>
                </svg>
                <input
                  type="tel"
                  placeholder="Phone number"
                  value={contactPhone}
                  onChange={(e) => onContactPhoneChange(e.target.value)}
                />
              </div>
              <button type="button" className="wa-add-contact-btn" onClick={onAddContact}>Add</button>
            </div>
            {contactFeedback && <p className="wa-feedback">{contactFeedback}</p>}
            {statusText && !contactFeedback && <p className="wa-feedback wa-feedback-status">{statusText}</p>}
            <div className="wa-quick-actions">
              <button type="button" className="wa-quick-btn" onClick={() => { onCreateGroup(); setShowAddContact(false); }}>
                <span className="wa-quick-icon group">👥</span>
                <span>New Group</span>
              </button>
              <button type="button" className="wa-quick-btn" onClick={() => { onCreateChannel(); setShowAddContact(false); }}>
                <span className="wa-quick-icon channel">📣</span>
                <span>New Channel</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Search Bar */}
      <div className="wa-search-container">
        <div className="wa-search-bar">
          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="11" cy="11" r="8"/>
            <line x1="21" y1="21" x2="16.65" y2="16.65"/>
          </svg>
          <input
            type="text"
            placeholder="Search or start new chat"
            value={search}
            onChange={(e) => onSearch(e.target.value)}
          />
          {search && (
            <button type="button" className="wa-search-clear" onClick={() => onSearch("")}>
              <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="18" y1="6" x2="6" y2="18"/>
                <line x1="6" y1="6" x2="18" y2="18"/>
              </svg>
            </button>
          )}
        </div>
      </div>

      {/* Filter Tabs */}
      <div className="wa-filter-tabs">
        {FILTERS.map((f) => {
          const isActive = filter === f;
          const badge = f === "Unread" && totalUnread > 0 ? totalUnread : null;
          return (
            <button
              key={f}
              type="button"
              className={`wa-filter-tab ${isActive ? "wa-filter-tab--active" : ""}`}
              onClick={() => setFilter(f)}
            >
              {f}
              {badge && <span className="wa-filter-badge">{badge > 99 ? "99+" : badge}</span>}
            </button>
          );
        })}
      </div>

      {/* Chat List */}
      <div className="wa-chat-list">
        {listItems.length === 0 && (
          <div className="wa-empty-state">
            <svg viewBox="0 0 24 24" width="48" height="48" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/>
            </svg>
            <p>
              {search ? "No results found" :
               filter === "Unread" ? "No unread messages" :
               filter === "Groups" ? "No groups yet" :
               filter === "Channels" ? "No channels followed yet" :
               "No conversations yet"}
            </p>
            {!search && filter === "Groups" && (
              <button type="button" className="wa-empty-btn" onClick={onCreateGroup}>Create a group</button>
            )}
            {!search && filter === "Channels" && (
              <button type="button" className="wa-empty-btn" onClick={onCreateChannel}>Create a channel</button>
            )}
          </div>
        )}

        {/* Pinned Chats Section (only for direct messages) */}
        {pinnedItems.length > 0 && (
          <>
            <div className="wa-chat-section-label">Pinned</div>
            {pinnedItems.map((item) => (
              <button
                key={item.key}
                type="button"
                className={`wa-chat-item ${item.isActive ? "wa-chat-item--active" : ""}`}
                onClick={() => handleItemClick(item)}
              >
                <div className="wa-chat-avatar">
                  <Avatar
                    name={item.name}
                    photoURL={item.photoURL}
                    icon={item.icon}
                  />
                  <span className={`wa-status ${item.isOnline ? "wa-status--online" : ""}`} />
                </div>
                <div className="wa-chat-info">
                  <div className="wa-chat-header">
                    <span className="wa-chat-name">{item.name}</span>
                    <span className="wa-chat-time">{formatTime(item.time)}</span>
                  </div>
                  <div className="wa-chat-preview">
                    {item.conv?.lastMessageSender === authUser.uid && (
                      renderStatusTick(item.conv?.lastMessageStatus)
                    )}
                    {item.isMuted && <span className="wa-muted-icon">🔇</span>}
                    <span className={`wa-preview-text ${item.isTyping ? "wa-preview-text--typing" : ""}`}>
                      {item.isTyping ? "typing…" : item.preview}
                    </span>
                    {item.unread > 0 && (
                      <span className="wa-unread-badge">{item.unread > 99 ? "99+" : item.unread}</span>
                    )}
                  </div>
                </div>
                <div className="wa-item-options-wrap">
                  <button
                    type="button"
                    className="wa-item-options-btn"
                    onClick={(e) => {
                      e.stopPropagation();
                      setActiveItemMenuKey((prev) => prev === item.key ? null : item.key);
                    }}
                  >
                    ▾
                  </button>
                  {activeItemMenuKey === item.key && renderItemOptionsMenu(item)}
                </div>
              </button>
            ))}
          </>
        )}

        {/* Regular Chats */}
        {regularItems.length > 0 && (
          <>
            {pinnedItems.length > 0 && <div className="wa-chat-section-label">Chats</div>}
            {regularItems.map((item) => (
              <button
                key={item.key}
                type="button"
                className={`wa-chat-item ${item.isActive ? "wa-chat-item--active" : ""}`}
                onClick={() => handleItemClick(item)}
              >
                <div className="wa-chat-avatar">
                  <Avatar
                    name={item.name}
                    photoURL={item.photoURL}
                    icon={item.icon}
                  />
                  {item.type === "direct" && (
                    <span className={`wa-status ${item.isOnline ? "wa-status--online" : ""}`} />
                  )}
                </div>
                <div className="wa-chat-info">
                  <div className="wa-chat-header">
                    <span className="wa-chat-name">{item.name}</span>
                    <span className="wa-chat-time">
                      {item.type === "channel" 
                        ? `${item.followerCount} followers`
                        : formatTime(item.time)
                      }
                    </span>
                  </div>
                  <div className="wa-chat-preview">
                    {item.type === "direct" && item.conv?.lastMessageSender === authUser.uid && (
                      renderStatusTick(item.conv?.lastMessageStatus)
                    )}
                    {item.type === "direct" && item.isMuted && <span className="wa-muted-icon">🔇</span>}
                    <span className={`wa-preview-text ${item.isTyping ? "wa-preview-text--typing" : ""}`}>
                      {item.isTyping ? "typing…" : item.preview}
                    </span>
                    {item.type === "direct" && item.unread > 0 && (
                      <span className="wa-unread-badge">{item.unread > 99 ? "99+" : item.unread}</span>
                    )}
                  </div>
                </div>
                <div className="wa-item-options-wrap">
                  <button
                    type="button"
                    className="wa-item-options-btn"
                    onClick={(e) => {
                      e.stopPropagation();
                      setActiveItemMenuKey((prev) => prev === item.key ? null : item.key);
                    }}
                  >
                    ▾
                  </button>
                  {activeItemMenuKey === item.key && renderItemOptionsMenu(item)}
                </div>
              </button>
            ))}
          </>
        )}

        {/* Discover Channels Section - only in All filter and when not searching */}
        {filter === "All" && !search && discoverChannels.length > 0 && (
          <>
            <div className="wa-chat-section-label">Discover Channels</div>
            {discoverChannels.slice(0, 3).map((channel) => (
              <div key={`discover_${channel.id}`} className="wa-discover-item">
                <div className="wa-chat-avatar">
                  <Avatar name={channel.name} icon="📣" />
                </div>
                <div className="wa-chat-info">
                  <div className="wa-chat-header">
                    <span className="wa-chat-name">{channel.name}</span>
                    <span className="wa-chat-time">{channel.followerIds?.length || 0} followers</span>
                  </div>
                  <div className="wa-chat-preview">
                    <span className="wa-preview-text">{channel.description || "No description"}</span>
                  </div>
                </div>
                <button
                  type="button"
                  className="wa-follow-btn"
                  onClick={() => onToggleFollowChannel(channel)}
                >
                  Follow
                </button>
              </div>
            ))}
          </>
        )}
      </div>


      {/* Bottom Profile */}
      <div className="wa-bottom-profile">
        <button 
          type="button" 
          className="wa-profile-btn"
          onClick={onShowSettings}
        >
          <Avatar
            name={profile?.displayName || "User"}
            photoURL={profile?.photoURL}
            size={36}
          />
          <div className="wa-profile-info">
            <span className="wa-profile-name">{profile?.displayName || "User"}</span>
            <span className="wa-profile-status">Online</span>
          </div>
        </button>
      </div>
    </aside>
  );
};

export default Sidebar;
