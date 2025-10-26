// File: src/App.js

import React, { useState, useEffect } from 'react';
import { Routes, Route } from 'react-router-dom';
import useJCMP from './hooks/useJCMP';

// Import the new Layout and Page components
import Layout from './Layout';
import PianoPage from './components/PianoPage';
import DrumPadsPage from './components/DrumPadsPage';
import DevStatsPage from './components/DevStatsPage';

function App() {
  const { status, dcState, stats, sendMIDI, wsState, pendingPerf } = useJCMP();
  const [pressedKeys, setPressedKeys] = useState(new Set());
  const [theme, setTheme] = useState(() => localStorage.getItem('theme') || 'dark');
  const [pageTitle, setPageTitle] = useState('Piano'); // For the header

  // --- Theme Logic ---
  useEffect(() => {
    document.body.className = theme === 'dark' ? 'dark-mode' : '';
    localStorage.setItem('theme', theme);
  }, [theme]);

  const toggleTheme = () => {
    setTheme(prevTheme => (prevTheme === 'light' ? 'dark' : 'light'));
  };

  // --- MIDI Handlers ---
  const playNote = (noteNumber, isPressed) => {
    if (isPressed && !pressedKeys.has(noteNumber)) {
      setPressedKeys(new Set([...pressedKeys, noteNumber]));
      sendMIDI({ type: 'noteOn', channel: 1, note: noteNumber, velocity: 100 });
    } else if (!isPressed && pressedKeys.has(noteNumber)) {
      const updated = new Set(pressedKeys);
      updated.delete(noteNumber);
      setPressedKeys(updated);
      sendMIDI({ type: 'noteOff', channel: 1, note: noteNumber });
    }
  };

  const playDrum = (noteNumber) => {
    sendMIDI({ type: 'noteOn', channel: 10, note: noteNumber, velocity: 127 });
    setTimeout(() => {
      sendMIDI({ type: 'noteOff', channel: 10, note: noteNumber });
    }, 100);
  };

  const handleControlChange = (control, value) => {
    sendMIDI({ type: 'controlChange', channel: 1, control, value: parseInt(value) });
  };

  const handleTransport = (action) => {
    sendMIDI({ type: 'transport', action: action });
  };

  // --- Props to pass down ---
  // We bundle all state and functions into a "context" object
  const contextProps = {
    playNote,
    playDrum,
    pressedKeys,
    setPageTitle,
    jcmpStats: stats,
    dcState,
    jcmpStatus: status,
    wsState,
    rtcOnly: true,
    pendingPerf,
    wsUrl: `ws://${window.location.hostname}:5000`,
  };

  return (
    <Routes>
      {/* The Layout component wraps all pages and contains the Header and Footer */}
      <Route 
        path="/" 
        element={
          <Layout 
            status={status}
            theme={theme}
            onToggleTheme={toggleTheme}
            pageTitle={pageTitle}
            onControlChange={handleControlChange}
            onTransport={handleTransport}
            context={contextProps} // Pass all page-specific props to the Outlet
          />
        }
      >
        {/* Child routes (the pages) */}
        <Route index element={<PianoPage />} /> {/* Default page */}
        <Route path="drums" element={<DrumPadsPage />} />
        
        {/* You can add more pages here later */}
        <Route path="dev" element={<DevStatsPage />} />
      </Route>
    </Routes>
  );
}

export default App;
