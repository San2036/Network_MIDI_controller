// File: src/Layout.js

import React, { useState, useCallback, useEffect } from 'react';
import { Outlet, useOutletContext, useLocation } from 'react-router-dom';
import Header from './components/Header';
import ControlSliders from './components/ControlSliders';
import { NavLink } from 'react-router-dom';

// This component is the main app shell (Header, Content, Footer)
function Layout({ 
  status, 
  theme, 
  onToggleTheme, 
  pageTitle, 
  onControlChange, 
  onTransport,
  compareMode,
  onToggleCompare,
  midiAvailable,
  context // This contains all props for the child pages
}) {
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const toggleSidebar = useCallback(() => setIsSidebarOpen(v => !v), []);
  const closeSidebar = useCallback(() => setIsSidebarOpen(false), []);
  const location = useLocation();

  // Auto-close drawer on route change (helps on mobile)
  useEffect(() => {
    if (isSidebarOpen) setIsSidebarOpen(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.pathname]);

  // Close drawer with Escape key
  useEffect(() => {
    function onKey(e) { if (e.key === 'Escape') setIsSidebarOpen(false); }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  return (
    <div className="full-app-layout">

      {/* --- HEADER (Top Tabs bar for non-instrument views) --- */}
      <Header 
        status={status} 
        theme={theme} 
        onToggleTheme={onToggleTheme} 
        pageTitle={pageTitle}
        onToggleSidebar={toggleSidebar}
        compareMode={compareMode}
        onToggleCompare={onToggleCompare}
        midiAvailable={midiAvailable}
      />

      {/* --- CONTENT AREA WITH LEFT SIDEBAR --- */}
      <div className={`content-with-sidebar${isSidebarOpen ? ' sidebar-open' : ''}`}>
        <aside className="left-sidebar">
          <div className="sidebar-title">Instruments</div>
          <nav className="sidebar-nav">
            <NavLink 
              to="/" end
              className={({isActive}) => isActive ? 'sidebar-link active' : 'sidebar-link'}
              onClick={closeSidebar}
            >
              <span className="sidebar-label">Piano</span>
            </NavLink>
            <NavLink 
              to="/drums"
              className={({isActive}) => isActive ? 'sidebar-link active' : 'sidebar-link'}
              onClick={closeSidebar}
            >
              <span className="sidebar-label">Drums</span>
            </NavLink>
          </nav>
        </aside>
        {/* Overlay to close drawer on mobile */}
        {isSidebarOpen && <div className="sidebar-overlay" onClick={closeSidebar} />}

        {/* --- MAIN SCROLLABLE CONTENT --- */}
        <main className="main-page-content">
          <Outlet context={context} />
        </main>
      </div>

      {/* --- STICKY FOOTER --- */}
      <footer className="footer-controls">
        <ControlSliders
          onControlChange={onControlChange}
          onTransport={onTransport}
        />
      </footer>

    </div>
  );
}

// Custom hook for pages to easily access props
export function usePageProps() {
  return useOutletContext();
}

export default Layout;