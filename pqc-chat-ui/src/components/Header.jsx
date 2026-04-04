import React from "react";
import { useTheme } from "../context/ThemeContext";
import "../styles/Header.css";

const Header = ({ selectedUser, selectedGroup, onGroupInfoClick }) => {
  const { theme } = useTheme();

  return (
    <div className={`header theme-${theme}`}>
      {selectedUser ? (
        <>
          <div className="header-left">
            <div className="user-avatar">
              {selectedUser[0]}
              {selectedGroup && <span className="group-indicator">👥</span>}
            </div>
            <div className="user-info" onClick={onGroupInfoClick}>
              <div className="user-name">{selectedUser}</div>
              <div className="user-status">
                {selectedGroup ? 'click here for group info' : 'online'}
              </div>
            </div>
          </div>
          <div className="header-right">
            <span className="icon">📞</span>
            <span className="icon">📹</span>
            <span className="icon">⋯</span>
          </div>
        </>
      ) : (
        <h2>QuantX</h2>
      )}
    </div>
  );
};

export default Header;