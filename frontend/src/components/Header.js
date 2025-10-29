import React from 'react';
import { NavLink } from 'react-router-dom';
import StatusBadge from './StatusBadge';
import ThemeToggle from './ThemeToggle';
import { HamburgerIcon } from './icons';

function Header({ status, theme, onToggleTheme, pageTitle, onToggleSidebar, compareMode, onToggleCompare, midiAvailable }) {
  
  // In a future step, you can add state here to make the hamburger button
  // open and close a mobile menu.
  
  return (
    <header className="header">
      
      {/* Left Side: Menu + Title */}
      <div className="header-left">
        <button className="hamburger-btn" title="Open Menu" onClick={onToggleSidebar} aria-label="Toggle sidebar">
          <HamburgerIcon />
        </button>
        <h2 className="page-title">{pageTitle}</h2>
      </div>
      
      {/* Right Side: Tabs (non-instrument) + Status */}
      <div className="header-right">
        <nav className="header-nav">
          <NavLink 
            to="/dev" 
            className={({isActive}) => isActive ? 'nav-link active' : 'nav-link'}
          >
            Dev
          </NavLink>
        </nav>
        <button className={"compare-toggle-btn"} onClick={onToggleCompare} title="Toggle comparison mode (TCP vs RPSV)">
          {compareMode ? 'TCP' : 'RPSV'}
        </button>
        <ThemeToggle theme={theme} onToggle={onToggleTheme} />
        <StatusBadge status={status} compareMode={compareMode} midiAvailable={midiAvailable} />
      </div>

    </header>
  );
}

export default Header;