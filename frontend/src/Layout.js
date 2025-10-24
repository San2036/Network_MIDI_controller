// File: src/Layout.js

import React from 'react';
import { Outlet, useOutletContext } from 'react-router-dom';
import Header from './components/Header';
import ControlSliders from './components/ControlSliders';

// This component is the main app shell (Header, Content, Footer)
function Layout({ 
  status, 
  theme, 
  onToggleTheme, 
  pageTitle, 
  onControlChange, 
  onTransport,
  context // This contains all props for the child pages
}) {
  return (
    <div className="full-app-layout">
      
      {/* --- HEADER (Top Bar) --- */}
      <Header 
        status={status} 
        theme={theme} 
        onToggleTheme={onToggleTheme} 
        pageTitle={pageTitle}
      />

      {/* --- MAIN SCROLLABLE CONTENT --- */}
      {/* Outlet renders the current page (e.g., PianoPage) */}
      <main className="main-page-content">
        <Outlet context={context} />
      </main>

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