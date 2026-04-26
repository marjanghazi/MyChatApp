import "./ChatToolbar.css";

const ChatToolbar = ({ chatSearch, setChatSearch }) => (
  <div className="qx-chat-toolbar">
    <div className="qx-chat-search-wrap">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="qx-search-icon-sm"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
      <input type="text" value={chatSearch} onChange={(e) => setChatSearch(e.target.value)} placeholder="Search in conversation…" />
      {chatSearch && <button type="button" className="qx-search-clear" onClick={() => setChatSearch("")}>✕</button>}
    </div>
    <div className="qx-encryption-badge">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="12" height="12"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0110 0v4"/></svg>
      E2E Encrypted
    </div>
  </div>
);

export default ChatToolbar;
