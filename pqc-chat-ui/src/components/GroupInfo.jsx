import React from "react";
import "../styles/GroupInfo.css";

const GroupInfo = ({ onClose }) => {
  return (
    <div className="group-info-panel">
      <div className="group-info-header">
        <span>Group Info</span>
        <button onClick={onClose} className="close-btn">✕</button>
      </div>
      <div className="group-info-content">
        <div className="group-avatar">PQC</div>
        <h3>Post Quantum Cryptography</h3>
        <p>Group · 42 participants</p>
        
        <div className="info-section">
          <h4>Description</h4>
          <p>Discussing post-quantum cryptography algorithms, standards, and implementations.</p>
        </div>

        <div className="info-section">
          <h4>Media</h4>
          <div className="media-grid">
            <div className="media-item">📷 12</div>
            <div className="media-item">🎵 5</div>
            <div className="media-item">📄 8</div>
          </div>
        </div>

        <div className="info-section">
          <h4>Participants</h4>
          <div className="participant">Sameer Ishaq</div>
          <div className="participant">Hani</div>
          <div className="participant">Saify</div>
          <div className="participant">Awais</div>
        </div>
      </div>
    </div>
  );
};

export default GroupInfo;