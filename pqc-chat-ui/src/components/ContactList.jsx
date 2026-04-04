import React from "react";
import { contacts } from "../data/contactsData";
import "../styles/ContactList.css";

const ContactList = ({ selectUser, selectedUser, searchQuery, filter }) => {
  
  const filteredContacts = contacts.filter(contact => {
    // Search filter
    if (searchQuery && !contact.name.toLowerCase().includes(searchQuery.toLowerCase()) && 
        !contact.last.toLowerCase().includes(searchQuery.toLowerCase())) {
      return false;
    }
    
    // Category filters
    if (filter === "Unread" && contact.unread === 0) return false;
    if (filter === "Favorites" && !contact.favorite) return false;
    if (filter === "Groups" && !contact.isGroup) return false;
    
    return true;
  });

  return (
    <div className="contact-list">
      {filteredContacts.map((contact, index) => (
        <div
          key={index}
          className={`contact-item ${selectedUser === contact.name ? "active" : ""} ${contact.isGroup ? 'group' : ''} ${contact.archived ? 'archived' : ''}`}
          onClick={() => selectUser(contact.name)}
        >
          <div className="avatar" style={{ backgroundColor: contact.avatarColor || '#075e54' }}>
            {contact.avatar ? <img src={contact.avatar} alt={contact.name} /> : contact.name[0]}
            {contact.isGroup && <span className="group-icon">👥</span>}
          </div>
          
          <div className="contact-info">
            <div className="contact-name">
              {contact.name}
              {contact.isGroup && <span className="group-badge">Group</span>}
            </div>
            <div className="last-message">
              {contact.sender && <span className="sender">{contact.sender}: </span>}
              {contact.reaction && <span className="reaction">{contact.reaction} </span>}
              {contact.last}
            </div>
          </div>
          
          <div className="contact-meta">
            <span className="time">{contact.time}</span>
            {contact.unread > 0 && (
              <span className="unread">{contact.unread}</span>
            )}
            {contact.pinned && <span className="pinned">📌</span>}
            {contact.muted && <span className="muted">🔇</span>}
          </div>
        </div>
      ))}
    </div>
  );
};

export default ContactList;