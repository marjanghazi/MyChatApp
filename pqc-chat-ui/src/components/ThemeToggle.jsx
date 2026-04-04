import React from "react";
import { useTheme } from "../context/ThemeContext";
import "../styles/ThemeToggle.css";

const ThemeToggle = () => {
  const { theme, toggleTheme } = useTheme();

  return (
    <button 
      className={`theme-toggle ${theme}`} 
      onClick={toggleTheme}
      title={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
    >
      <span className="toggle-icon">
        {theme === 'dark' ? '☀️' : '🌙'}
      </span>
      <span className="toggle-text">
        {theme === 'dark' ? 'Light' : 'Dark'}
      </span>
    </button>
  );
};

export default ThemeToggle;