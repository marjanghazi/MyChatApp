import React from "react";
import "../styles/ArchiveHeader.css";

const ArchiveHeader = () => {
  return (
    <div className="archive-header">
      <span className="archive-icon">📁</span>
      <span className="archive-text">Archived</span>
      <span className="archive-count">3</span>
    </div>
  );
};

export default ArchiveHeader;