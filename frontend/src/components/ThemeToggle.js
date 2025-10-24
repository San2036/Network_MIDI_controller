import React from 'react';
import './ThemeToggle.css';

function ThemeToggle({ theme, onToggle }) {
  return (
    <button 
      className="theme-toggle-btn" 
      onClick={onToggle} 
      title={theme === 'light' ? 'Switch to Dark Mode' : 'Switch to Light Mode'}
    >
      {theme === 'light' ? '🌙' : '☀️'}
    </button>
  );
}

export default ThemeToggle;