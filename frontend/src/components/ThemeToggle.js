import React from 'react';
import './ThemeToggle.css';
import { SunIcon, MoonIcon } from './icons';

function ThemeToggle({ theme, onToggle }) {
  return (
    <button 
      className="theme-toggle-btn" 
      onClick={onToggle} 
      title={theme === 'light' ? 'Switch to Dark Mode' : 'Switch to Light Mode'}
    >
      {theme === 'light' ? <MoonIcon /> : <SunIcon />}
    </button>
  );
}

export default ThemeToggle;