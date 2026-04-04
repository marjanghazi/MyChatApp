import React, { useState, useEffect } from "react";
import Header from "./components/Header";
import Sidebar from "./components/Sidebar";
import ChatWindow from "./components/ChatWindow";
import ChatInput from "./components/ChatInput";
import GroupInfo from "./components/GroupInfo";
import ThemeToggle from "./components/ThemeToggle";
import { ThemeProvider } from "./context/ThemeContext";
import "./styles/App.css";

function App() {
  const [selectedUser, setSelectedUser] = useState(null);
  const [selectedGroup, setSelectedGroup] = useState(null);
  const [messages, setMessages] = useState({});
  const [showGroupInfo, setShowGroupInfo] = useState(false);
  const [theme, setTheme] = useState(() => {
    // Check system preference
    const systemPrefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    return systemPrefersDark ? 'dark' : 'light';
  });

  useEffect(() => {
    // Listen for system theme changes
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    const handleChange = (e) => {
      setTheme(e.matches ? 'dark' : 'light');
    };
    
    mediaQuery.addEventListener('change', handleChange);
    return () => mediaQuery.removeEventListener('change', handleChange);
  }, []);

  const toggleTheme = () => {
    setTheme(prevTheme => prevTheme === 'dark' ? 'light' : 'dark');
  };

  const initialMessages = {
    "Post Quantum Cryptography": [
      { sender: "System", text: "You reacted ❤️ to: \"Nice one, developer\"", time: "2/9/2026", type: "reaction" },
      { sender: "System", text: "this is ... 🎉", time: "2/9/2026", type: "system" }
    ],
    "Blessing 🌟": [
      { sender: "Hina", text: "Hey! How are you?", time: "2:02 PM" }
    ],
    "Marjan (You)": [
      { sender: "Marjan", text: "وہ تعامل کر رہے ہیں یہاں میں سے تو کیا کچھ کیجئے میرے آپ ہے ...", time: "1:55 PM" }
    ],
    "Saify": [
      { sender: "Saify", text: "45 pr hi pass hai", time: "1:30 PM" },
      { sender: "You", text: "4", time: "1:31 PM", status: "sent" }
    ],
    "Hustlers": [
      { sender: "Sameer Ishaq", text: "📸 Photo", time: "2:04 PM", type: "image" }
    ],
    "Scholarship Region E14": [
      { sender: "Tife Empire 👩‍🎓", text: "Wema Bank Bankers in Tr...", time: "Yesterday", unread: 17 }
    ],
    "Awais IT NUML": [
      { sender: "Awais", text: "See you tomorrow!", time: "2:01 PM" }
    ]
  };

  const sendMessage = (text, user) => {
    const userMessages = messages[user] || initialMessages[user] || [];
    setMessages({
      ...messages,
      [user]: [...userMessages, { 
        sender: "You", 
        text, 
        time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        status: "sent"
      }]
    });
  };

  const handleUserSelect = (user) => {
    setSelectedUser(user);
    if (user === "Post Quantum Cryptography") {
      setSelectedGroup(user);
    } else {
      setSelectedGroup(null);
    }
    setShowGroupInfo(false);
  };

  return (
    <ThemeProvider value={{ theme, toggleTheme }}>
      <div className={`app-container theme-${theme}`}>
        <Sidebar 
          selectUser={handleUserSelect} 
          selectedUser={selectedUser} 
        />
        <div className="chat-section">
          <Header 
            selectedUser={selectedUser} 
            selectedGroup={selectedGroup}
            onGroupInfoClick={() => setShowGroupInfo(!showGroupInfo)}
          />
          {selectedUser ? (
            <>
              {showGroupInfo && selectedGroup === "Post Quantum Cryptography" && (
                <GroupInfo onClose={() => setShowGroupInfo(false)} />
              )}
              <ChatWindow 
                messages={messages[selectedUser] || initialMessages[selectedUser] || []} 
                selectedUser={selectedUser}
              />
              <ChatInput 
                sendMessage={(text) => sendMessage(text, selectedUser)} 
                selectedUser={selectedUser}
              />
            </>
          ) : (
            <div className="empty-chat">Select a chat to start messaging</div>
          )}
          <ThemeToggle />
        </div>
      </div>
    </ThemeProvider>
  );
}

export default App;