// SettingsPanel.jsx — QuantX · Full WhatsApp-style Settings
import { useState } from "react";

const THEMES = [
  { id: "default", label: "Quantum", color: "#4d7fff" },
  { id: "emerald", label: "Emerald", color: "#00a884" },
  { id: "midnight", label: "Midnight", color: "#1a1a2e" },
  { id: "sunset", label: "Sunset", color: "#ff6b35" },
  { id: "cyber", label: "Cyber", color: "#00d4ff" },
];

const WALLPAPERS = [
  { id: "default", label: "Default", preview: "linear-gradient(135deg, #1a1a2e 0%, #16213e 100%)" },
  { id: "dark-geo", label: "Dark Geo", preview: "repeating-linear-gradient(45deg, #0d1117 0px, #0d1117 10px, #161b22 10px, #161b22 20px)" },
  { id: "quantum", label: "Quantum", preview: "radial-gradient(circle at 50% 50%, #0d2137 0%, #050d18 100%)" },
  { id: "forest", label: "Forest", preview: "linear-gradient(135deg, #0a2e1a 0%, #0d1f12 100%)" },
  { id: "ocean", label: "Ocean", preview: "linear-gradient(180deg, #001f3f 0%, #003366 100%)" },
];

const SECTIONS = [
  { id: "profile", label: "Profile", icon: ProfileIcon },
  { id: "account", label: "Account", icon: AccountIcon },
  { id: "privacy", label: "Privacy", icon: PrivacyIcon },
  { id: "notifications", label: "Notifications", icon: NotifIcon },
  { id: "appearance", label: "Appearance", icon: AppearanceIcon },
  { id: "help", label: "Help", icon: HelpIcon },
];

function ProfileIcon() {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="20" height="20"><circle cx="12" cy="8" r="4"/><path d="M4 20c0-4 3.6-7 8-7s8 3 8 7"/></svg>;
}
function AccountIcon() {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="20" height="20"><rect x="2" y="5" width="20" height="14" rx="2"/><line x1="2" y1="10" x2="22" y2="10"/></svg>;
}
function PrivacyIcon() {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="20" height="20"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0110 0v4"/></svg>;
}
function NotifIcon() {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="20" height="20"><path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 01-3.46 0"/></svg>;
}
function AppearanceIcon() {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="20" height="20"><circle cx="12" cy="12" r="3"/><path d="M12 2v2M12 20v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M2 12h2M20 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/></svg>;
}
function HelpIcon() {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="20" height="20"><circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 015.83 1c0 2-3 3-3 3"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>;
}

const Toggle = ({ checked, onChange }) => (
  <label className="qx-settings-toggle">
    <input type="checkbox" checked={checked} onChange={onChange} />
    <span className="qx-toggle-track">
      <span className="qx-toggle-thumb" />
    </span>
  </label>
);

const RadioGroup = ({ options, value, onChange }) => (
  <div className="qx-radio-group">
    {options.map((opt) => (
      <label key={opt.value} className={`qx-radio-option ${value === opt.value ? "active" : ""}`}>
        <input type="radio" name="radio" value={opt.value} checked={value === opt.value} onChange={() => onChange(opt.value)} />
        <span>{opt.label}</span>
        {value === opt.value && (
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" width="16" height="16" style={{ marginLeft: "auto", color: "var(--qx-accent)" }}><polyline points="20 6 9 17 4 12"/></svg>
        )}
      </label>
    ))}
  </div>
);

const SettingsPanel = ({
  profile,
  authUser,
  appTheme,
  onToggleTheme,
  onUpdateName,
  onUpdatePhoto,
  onUpdateBrandLogo,
  onLogout,
  onClose,
  updatingProfile,
  profileNameInput,
  onProfileNameChange,
}) => {
  const [activeSection, setActiveSection] = useState("profile");

  // Privacy settings (local UI state — connect to Firestore as needed)
  const [lastSeenVisible, setLastSeenVisible] = useState("everyone");
  const [profilePhotoVisible, setProfilePhotoVisible] = useState("everyone");
  const [readReceipts, setReadReceipts] = useState(true);
  const [onlineStatus, setOnlineStatus] = useState(true);

  // Notification settings
  const [msgNotifs, setMsgNotifs] = useState(true);
  const [groupNotifs, setGroupNotifs] = useState(true);
  const [reactionNotifs, setReactionNotifs] = useState(true);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [desktopNotifs, setDesktopNotifs] = useState(true);

  // Appearance
  const [fontSize, setFontSize] = useState("medium");
  const [selectedWallpaper, setSelectedWallpaper] = useState("default");

  const renderSection = () => {
    switch (activeSection) {
      case "profile":
        return (
          <div className="qx-settings-section-content">
            <div className="qx-settings-profile-hero">
              <div className="qx-settings-avatar-wrap">
                <img
                  src={profile?.photoURL || `https://ui-avatars.com/api/?name=${encodeURIComponent(profile?.displayName || "User")}&background=00a884&color=fff&bold=true&size=128`}
                  alt="Profile"
                  className="qx-settings-avatar"
                />
                <label htmlFor="sp-photo" className="qx-settings-avatar-edit" title="Change photo">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="16" height="16"><path d="M23 19a2 2 0 01-2 2H3a2 2 0 01-2-2V8a2 2 0 012-2h4l2-3h6l2 3h4a2 2 0 012 2z"/><circle cx="12" cy="13" r="4"/></svg>
                </label>
                <input id="sp-photo" type="file" hidden accept="image/*" onChange={(e) => e.target.files?.[0] && onUpdatePhoto(e.target.files[0])} />
              </div>
              <div className="qx-settings-profile-meta">
                <h3>{profile?.displayName || "Your Name"}</h3>
                <p>{profile?.phoneNumber || authUser?.email}</p>
                <div className="qx-settings-online-badge">
                  <span className="qx-settings-online-dot" />
                  Online &amp; Secure
                </div>
              </div>
            </div>

            <div className="qx-settings-group">
              <div className="qx-settings-group-label">Your Name</div>
              <form className="qx-settings-form" onSubmit={onUpdateName}>
                <div className="qx-settings-input-row">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="18" height="18" style={{ opacity: 0.5, flexShrink: 0 }}><circle cx="12" cy="8" r="4"/><path d="M4 20c0-4 3.6-7 8-7s8 3 8 7"/></svg>
                  <input
                    type="text"
                    value={profileNameInput}
                    onChange={(e) => onProfileNameChange(e.target.value)}
                    placeholder="Your display name"
                    minLength={2}
                    required
                    className="qx-settings-input"
                  />
                </div>
                <button type="submit" className="qx-settings-save-btn" disabled={updatingProfile}>
                  {updatingProfile ? "Saving…" : "Save Name"}
                </button>
              </form>
            </div>

            <div className="qx-settings-group">
              <div className="qx-settings-group-label">About / Status</div>
              <div className="qx-settings-row">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="18" height="18" style={{ opacity: 0.5 }}><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 013 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>
                <span>{profile?.about || "Hey there! I am using QuantX."}</span>
              </div>
            </div>

            <div className="qx-settings-group">
              <div className="qx-settings-group-label">Brand Logo</div>
              <label htmlFor="sp-logo" className="qx-settings-upload-btn">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="16" height="16"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>
                Upload Brand Logo
              </label>
              <input id="sp-logo" type="file" hidden accept="image/*" onChange={(e) => e.target.files?.[0] && onUpdateBrandLogo(e.target.files[0])} />
            </div>
          </div>
        );

      case "account":
        return (
          <div className="qx-settings-section-content">
            <div className="qx-settings-group">
              <div className="qx-settings-group-label">Account Info</div>
              <div className="qx-settings-info-row">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="18" height="18" style={{ opacity: 0.5 }}><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg>
                <div>
                  <div className="qx-settings-info-label">Email</div>
                  <div className="qx-settings-info-value">{authUser?.email || "—"}</div>
                </div>
              </div>
              <div className="qx-settings-info-row">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="18" height="18" style={{ opacity: 0.5 }}><path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07A19.5 19.5 0 013.07 9.81 19.79 19.79 0 012 1.22 2 2 0 014 .04h3a2 2 0 012 1.72c.127.96.361 1.903.7 2.81a2 2 0 01-.45 2.11L8.09 7.91a16 16 0 006 6l1.27-1.27a2 2 0 012.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0122 16.92z"/></svg>
                <div>
                  <div className="qx-settings-info-label">Phone</div>
                  <div className="qx-settings-info-value">{profile?.phoneNumber || "Not set"}</div>
                </div>
              </div>
              <div className="qx-settings-info-row">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="18" height="18" style={{ opacity: 0.5 }}><rect x="2" y="3" width="20" height="14" rx="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/></svg>
                <div>
                  <div className="qx-settings-info-label">User ID</div>
                  <div className="qx-settings-info-value qx-settings-mono">{authUser?.uid?.slice(0, 16)}…</div>
                </div>
              </div>
            </div>

            <div className="qx-settings-group">
              <div className="qx-settings-group-label">Security</div>
              <div className="qx-settings-security-badge">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="20" height="20"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
                <div>
                  <div style={{ fontWeight: 600, marginBottom: 2 }}>End-to-End Encrypted</div>
                  <div style={{ fontSize: 12, opacity: 0.7 }}>Kyber-1024 · Dilithium-3 · AES-256-GCM</div>
                </div>
              </div>
            </div>

            <div className="qx-settings-group qx-settings-group--danger">
              <div className="qx-settings-group-label">Danger Zone</div>
              <button type="button" className="qx-settings-danger-btn" onClick={onLogout}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="18" height="18"><path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>
                Sign Out
              </button>
            </div>
          </div>
        );

      case "privacy":
        return (
          <div className="qx-settings-section-content">
            <div className="qx-settings-group">
              <div className="qx-settings-group-label">Last Seen</div>
              <p className="qx-settings-group-desc">Who can see when you were last online?</p>
              <RadioGroup
                options={[
                  { value: "everyone", label: "Everyone" },
                  { value: "contacts", label: "My Contacts" },
                  { value: "nobody", label: "Nobody" },
                ]}
                value={lastSeenVisible}
                onChange={setLastSeenVisible}
              />
            </div>

            <div className="qx-settings-group">
              <div className="qx-settings-group-label">Profile Photo</div>
              <p className="qx-settings-group-desc">Who can see your profile photo?</p>
              <RadioGroup
                options={[
                  { value: "everyone", label: "Everyone" },
                  { value: "contacts", label: "My Contacts" },
                  { value: "nobody", label: "Nobody" },
                ]}
                value={profilePhotoVisible}
                onChange={setProfilePhotoVisible}
              />
            </div>

            <div className="qx-settings-group">
              <div className="qx-settings-group-label">Messaging</div>
              <div className="qx-settings-toggle-row">
                <div>
                  <div className="qx-settings-toggle-label">Read Receipts</div>
                  <div className="qx-settings-toggle-desc">Show double-check marks when messages are read</div>
                </div>
                <Toggle checked={readReceipts} onChange={(e) => setReadReceipts(e.target.checked)} />
              </div>
              <div className="qx-settings-toggle-row">
                <div>
                  <div className="qx-settings-toggle-label">Online Status</div>
                  <div className="qx-settings-toggle-desc">Show when you are online</div>
                </div>
                <Toggle checked={onlineStatus} onChange={(e) => setOnlineStatus(e.target.checked)} />
              </div>
            </div>
          </div>
        );

      case "notifications":
        return (
          <div className="qx-settings-section-content">
            <div className="qx-settings-group">
              <div className="qx-settings-group-label">Message Notifications</div>
              <div className="qx-settings-toggle-row">
                <div>
                  <div className="qx-settings-toggle-label">Direct Messages</div>
                  <div className="qx-settings-toggle-desc">Notifications for personal chats</div>
                </div>
                <Toggle checked={msgNotifs} onChange={(e) => setMsgNotifs(e.target.checked)} />
              </div>
              <div className="qx-settings-toggle-row">
                <div>
                  <div className="qx-settings-toggle-label">Group Messages</div>
                  <div className="qx-settings-toggle-desc">Notifications from groups</div>
                </div>
                <Toggle checked={groupNotifs} onChange={(e) => setGroupNotifs(e.target.checked)} />
              </div>
              <div className="qx-settings-toggle-row">
                <div>
                  <div className="qx-settings-toggle-label">Reactions</div>
                  <div className="qx-settings-toggle-desc">When someone reacts to your message</div>
                </div>
                <Toggle checked={reactionNotifs} onChange={(e) => setReactionNotifs(e.target.checked)} />
              </div>
            </div>

            <div className="qx-settings-group">
              <div className="qx-settings-group-label">Sound &amp; Display</div>
              <div className="qx-settings-toggle-row">
                <div>
                  <div className="qx-settings-toggle-label">Notification Sounds</div>
                  <div className="qx-settings-toggle-desc">Play sound for incoming messages</div>
                </div>
                <Toggle checked={soundEnabled} onChange={(e) => setSoundEnabled(e.target.checked)} />
              </div>
              <div className="qx-settings-toggle-row">
                <div>
                  <div className="qx-settings-toggle-label">Desktop Notifications</div>
                  <div className="qx-settings-toggle-desc">Show browser notifications</div>
                </div>
                <Toggle checked={desktopNotifs} onChange={(e) => {
                  if (e.target.checked && "Notification" in window) {
                    Notification.requestPermission();
                  }
                  setDesktopNotifs(e.target.checked);
                }} />
              </div>
            </div>
          </div>
        );

      case "appearance":
        return (
          <div className="qx-settings-section-content">
            <div className="qx-settings-group">
              <div className="qx-settings-group-label">App Theme</div>
              <div className="qx-settings-theme-row">
                <button
                  type="button"
                  className={`qx-settings-theme-chip ${appTheme === "light" ? "active" : ""}`}
                  onClick={() => appTheme !== "light" && onToggleTheme()}
                >
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="16" height="16"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>
                  Light
                </button>
                <button
                  type="button"
                  className={`qx-settings-theme-chip ${appTheme === "dark" ? "active" : ""}`}
                  onClick={() => appTheme !== "dark" && onToggleTheme()}
                >
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="16" height="16"><path d="M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z"/></svg>
                  Dark
                </button>
              </div>
            </div>

            <div className="qx-settings-group">
              <div className="qx-settings-group-label">Chat Color Theme</div>
              <div className="qx-settings-color-grid">
                {THEMES.map((t) => (
                  <button key={t.id} type="button" className="qx-settings-color-swatch" style={{ background: t.color }} title={t.label}>
                    <span>{t.label}</span>
                  </button>
                ))}
              </div>
            </div>

            <div className="qx-settings-group">
              <div className="qx-settings-group-label">Font Size</div>
              <RadioGroup
                options={[
                  { value: "small", label: "Small" },
                  { value: "medium", label: "Medium (Default)" },
                  { value: "large", label: "Large" },
                ]}
                value={fontSize}
                onChange={setFontSize}
              />
            </div>

            <div className="qx-settings-group">
              <div className="qx-settings-group-label">Chat Wallpaper</div>
              <div className="qx-settings-wallpaper-grid">
                {WALLPAPERS.map((w) => (
                  <button
                    key={w.id}
                    type="button"
                    className={`qx-settings-wallpaper-swatch ${selectedWallpaper === w.id ? "active" : ""}`}
                    style={{ background: w.preview }}
                    onClick={() => setSelectedWallpaper(w.id)}
                    title={w.label}
                  >
                    {selectedWallpaper === w.id && (
                      <svg viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3" width="20" height="20"><polyline points="20 6 9 17 4 12"/></svg>
                    )}
                    <span className="qx-wallpaper-label">{w.label}</span>
                  </button>
                ))}
              </div>
            </div>
          </div>
        );

      case "help":
        return (
          <div className="qx-settings-section-content">
            <div className="qx-settings-group">
              <div className="qx-settings-group-label">Support</div>
              <a href="mailto:support@quantx.app" className="qx-settings-link-row">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="18" height="18"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg>
                Contact Support
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="14" height="14" style={{ marginLeft: "auto", opacity: 0.4 }}><polyline points="9 18 15 12 9 6"/></svg>
              </a>
              <div className="qx-settings-link-row" style={{ cursor: "default" }}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="18" height="18"><circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 015.83 1c0 2-3 3-3 3"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
                FAQ &amp; Documentation
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="14" height="14" style={{ marginLeft: "auto", opacity: 0.4 }}><polyline points="9 18 15 12 9 6"/></svg>
              </div>
            </div>

            <div className="qx-settings-group">
              <div className="qx-settings-group-label">About QuantX</div>
              <div className="qx-settings-about-card">
                <div className="qx-settings-about-logo">Q</div>
                <div className="qx-settings-about-info">
                  <div style={{ fontWeight: 700, fontSize: 16, letterSpacing: "0.05em" }}>QUANTX</div>
                  <div style={{ fontSize: 12, opacity: 0.6 }}>Version 1.0.0</div>
                  <div style={{ fontSize: 11, opacity: 0.5, marginTop: 4 }}>Post-Quantum Secure Communication</div>
                </div>
              </div>
              <div className="qx-settings-crypto-info">
                <div className="qx-settings-crypto-row"><span>Key Encapsulation</span><span>CRYSTALS-Kyber-1024</span></div>
                <div className="qx-settings-crypto-row"><span>Signatures</span><span>CRYSTALS-Dilithium-3</span></div>
                <div className="qx-settings-crypto-row"><span>Encryption</span><span>AES-256-GCM</span></div>
              </div>
            </div>
          </div>
        );

      default:
        return null;
    }
  };

  return (
    <div className="qx-settings-overlay" onClick={onClose}>
      <div className="qx-settings-panel" onClick={(e) => e.stopPropagation()}>

        {/* Settings sidebar nav */}
        <div className="qx-settings-nav">
          <div className="qx-settings-nav-header">
            <button type="button" className="qx-settings-back" onClick={onClose} title="Close">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="20" height="20"><line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/></svg>
            </button>
            <h2>Settings</h2>
          </div>

          {/* Profile quick preview */}
          <div className="qx-settings-nav-profile" onClick={() => setActiveSection("profile")}>
            <img
              src={profile?.photoURL || `https://ui-avatars.com/api/?name=${encodeURIComponent(profile?.displayName || "User")}&background=00a884&color=fff&bold=true`}
              alt="Profile"
              className="qx-settings-nav-avatar"
            />
            <div>
              <div className="qx-settings-nav-name">{profile?.displayName || "Your Name"}</div>
              <div className="qx-settings-nav-sub">{profile?.about || "Hey there! I am using QuantX."}</div>
            </div>
          </div>

          {/* Nav items */}
          <nav className="qx-settings-nav-list">
            {SECTIONS.map(({ id, label, icon: Icon }) => (
              <button
                key={id}
                type="button"
                className={`qx-settings-nav-item ${activeSection === id ? "active" : ""}`}
                onClick={() => setActiveSection(id)}
              >
                <span className="qx-settings-nav-icon"><Icon /></span>
                <span>{label}</span>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="14" height="14" style={{ marginLeft: "auto", opacity: 0.3 }}><polyline points="9 18 15 12 9 6"/></svg>
              </button>
            ))}
          </nav>
        </div>

        {/* Settings content area */}
        <div className="qx-settings-content">
          <div className="qx-settings-content-header">
            <h3>{SECTIONS.find((s) => s.id === activeSection)?.label}</h3>
          </div>
          {renderSection()}
        </div>

      </div>
    </div>
  );
};

export default SettingsPanel;