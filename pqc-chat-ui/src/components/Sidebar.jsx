import React, { useState } from "react";
import ContactList from "./ContactList";
import ChatFilters from "./ChatFilters";
import ArchiveHeader from "./ArchiveHeader";
import "../styles/Sidebar.css";

const Sidebar = ({ selectUser, selectedUser }) => {
  const [filter, setFilter] = useState("All");
  const [searchQuery, setSearchQuery] = useState("");

  return (
    <div className="sidebar">
      <div className="sidebar-header">
        <div className="sidebar-header-top">
          <h2>QuantX</h2>
          <div className="header-icons">
            <span className="icon">🌐</span>
            <span className="icon">⋯</span>
          </div>
        </div>
      </div>
      
      <div className="search-bar">
        <span className="search-icon">🔍</span>
        <input 
          type="text" 
          placeholder="Search or start a new chat"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
        />
      </div>

      <ChatFilters activeFilter={filter} onFilterChange={setFilter} />
      
      <ArchiveHeader />
      
      <ContactList 
        selectUser={selectUser} 
        selectedUser={selectedUser}
        searchQuery={searchQuery}
        filter={filter}
      />
    </div>
  );
};

export default Sidebar;