import React, { useRef, useEffect } from "react";
import "../styles/ChatWindow.css";

const ChatWindow = ({ messages, selectedUser }) => {
  const endRef = useRef(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const renderMessage = (msg, idx) => {
    if (msg.type === "system" || msg.type === "reaction") {
      return (
        <div key={idx} className="system-message">
          <div className="system-text">{msg.text}</div>
          <div className="message-time">{msg.time}</div>
        </div>
      );
    }

    if (msg.type === "image") {
      return (
        <div key={idx} className={`message ${msg.sender === "You" ? "me" : "other"}`}>
          <div className="message-image">📸</div>
          <div className="message-text">{msg.text}</div>
          <div className="message-time">
            {msg.time} 
            {msg.sender === "You" && <span className="status"> ✓✓</span>}
          </div>
        </div>
      );
    }

    return (
      <div key={idx} className={`message ${msg.sender === "You" ? "me" : "other"}`}>
        {msg.sender !== "You" && msg.sender !== "System" && (
          <div className="message-sender">{msg.sender}</div>
        )}
        <div className="message-text">{msg.text}</div>
        <div className="message-time">
          {msg.time} 
          {msg.sender === "You" && <span className="status"> ✓✓</span>}
        </div>
      </div>
    );
  };

  return (
    <div className="chat-window">
      {selectedUser === "Post Quantum Cryptography" && (
        <div className="chat-header-info">
          <div className="chat-header-title">What is Cryptology?</div>
          <div className="chat-header-description">
            <strong>Cryptology</strong> is the <em>science of secure communication</em>.<br />
            It is the <em>umbrella field</em> that deals with <em>creating secure systems</em> and <em>breaking them to test security</em>.<br /><br />
            In simple words:<br />
            <strong>Cryptology = Cryptography + Cryptanalysis</strong>
          </div>
          
          <div className="chat-header-subsection">
            <div className="subsection-title">Two Main Parts of Cryptology</div>
            <div className="subsection-item">
              <span className="item-icon">🔒</span>
              <strong>Cryptography</strong> - Designing techniques to <em>secure information</em><br />
              <small>Example: Encrypting a message so only the receiver can read it.</small>
            </div>
            <div className="subsection-item">
              <span className="item-icon">💻</span>
              <strong>Cryptanalysis</strong> - Studying methods to <em>break or attack encryption</em><br />
              <small>Example: Trying to ...Read more</small>
            </div>
          </div>
        </div>
      )}
      
      {messages.map((msg, idx) => renderMessage(msg, idx))}
      <div ref={endRef} />
    </div>
  );
};

export default ChatWindow;