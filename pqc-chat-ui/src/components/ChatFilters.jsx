import React from "react";
import "../styles/ChatFilters.css";

const ChatFilters = ({ activeFilter, onFilterChange }) => {
  const filters = ["All", "Unread", "Favorites", "Groups"];

  return (
    <div className="chat-filters">
      {filters.map(filter => (
        <button
          key={filter}
          className={`filter-btn ${activeFilter === filter ? 'active' : ''}`}
          onClick={() => onFilterChange(filter)}
        >
          {filter}
        </button>
      ))}
    </div>
  );
};

export default ChatFilters;