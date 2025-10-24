// File: src/components/Header.js

import React from 'react';
import { NavLink } from 'react-router-dom';
import StatusBadge from './StatusBadge';
import ThemeToggle from './ThemeToggle';

function Header({ status, theme, onToggleTheme, pageTitle }) {
  
  // In a future step, you can add state here to make the hamburger button
  // open and close a mobile menu.
  
  return (
    <header className="header">
      
      {/* Left Side: Menu + Title */}
      <div className="header-left">
        <button className="hamburger-btn" title="Open Menu">
          ☰
        </button>
        <h2 className="page-title">{pageTitle}</h2>
      </div>
      
      {/* Right Side: Nav + Status */}
      <div className="header-right">
        <nav className="header-nav">
          <NavLink 
            to="/" 
            className={({isActive}) => isActive ? 'nav-link active' : 'nav-link'}
          >
            Piano
          </NavLink>
          <NavLink 
            to="/drums" 
            className={({isActive}) => isActive ? 'nav-link active' : 'nav-link'}
          >
            Drums
          </NavLink>
          <NavLink 
            to="/dev" 
            className={({isActive}) => isActive ? 'nav-link active' : 'nav-link'}
          >
            Dev
          </NavLink>
        </nav>
        <ThemeToggle theme={theme} onToggle={onToggleTheme} />
        <StatusBadge status={status} />
      </div>

    </header>
  );
}

export default Header;