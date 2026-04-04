import React, { useState } from "react";
import "../styles/ChatInput.css";

const ChatInput = ({ sendMessage, selectedUser }) => {
  const [text, setText] = useState("");

  const handleSend = () => {
    if (text.trim()) {
      sendMessage(text);
      setText("");
    }
  };

  return (
    <div className="chat-input">
      <button className="emoji-btn">😊</button>
      <button className="attach-btn">📎</button>
      <input
        type="text"
        placeholder="Type a message"
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && handleSend()}
      />
      {text.trim() ? (
        <button className="send-btn" onClick={handleSend}>➡️</button>
      ) : (
        <button className="mic-btn">🎤</button>
      )}
    </div>
  );
};

export default ChatInput;