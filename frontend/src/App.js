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
  const { status, dcState, stats, sendMIDI, sendWSImmediate, wsState, pendingPerf, midiAvailable } = useJCMP();
  const [pressedKeys, setPressedKeys] = useState(new Set());
  const [theme, setTheme] = useState(() => localStorage.getItem('theme') || 'dark');
  const [pageTitle, setPageTitle] = useState('Piano'); // For the header
  const [compareMode, setCompareMode] = useState(() => localStorage.getItem('compareMode') === '1');

  // --- Theme Logic ---
  useEffect(() => {
    document.body.className = theme === 'dark' ? 'dark-mode' : '';
    localStorage.setItem('theme', theme);
  }, [theme]);

  const toggleTheme = () => {
    setTheme(prevTheme => (prevTheme === 'light' ? 'dark' : 'light'));
  };

  const toggleCompareMode = () => {
    setCompareMode(prev => {
      const next = !prev; localStorage.setItem('compareMode', next ? '1' : '0'); return next;
    });
  };

  // --- MIDI Handlers ---
  const playNote = (noteNumber, isPressed) => {
    if (isPressed && !pressedKeys.has(noteNumber)) {
      setPressedKeys(new Set([...pressedKeys, noteNumber]));
      const msg = { type: 'noteOn', channel: 1, note: noteNumber, velocity: 100 };
      if (compareMode) { sendWSImmediate({ ...msg, timestamp: Date.now() }); } else { sendMIDI(msg); }
    } else if (!isPressed && pressedKeys.has(noteNumber)) {
      const updated = new Set(pressedKeys);
      updated.delete(noteNumber);
      setPressedKeys(updated);
      const msg = { type: 'noteOff', channel: 1, note: noteNumber };
      if (compareMode) { sendWSImmediate({ ...msg, timestamp: Date.now() }); } else { sendMIDI(msg); }
    }
  };

  const playDrum = (noteNumber) => {
    const onMsg = { type: 'noteOn', channel: 10, note: noteNumber, velocity: 127 };
    if (compareMode) { sendWSImmediate({ ...onMsg, timestamp: Date.now() }); } else { sendMIDI(onMsg); }
    setTimeout(() => {
      const offMsg = { type: 'noteOff', channel: 10, note: noteNumber };
      if (compareMode) { sendWSImmediate({ ...offMsg, timestamp: Date.now() }); } else { sendMIDI(offMsg); }
    }, 100);
  };

  const handleControlChange = (control, value) => {
    const msg = { type: 'controlChange', channel: 1, control, value: parseInt(value) };
    if (compareMode) { sendWSImmediate({ ...msg, timestamp: Date.now() }); } else { sendMIDI(msg); }
  };

  const handleTransport = (action) => {
    // Transport goes over signaling WS regardless of compare mode
    sendWSImmediate({ type: 'transport', action: action });
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
    compareMode,
    midiAvailable,
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
            compareMode={compareMode}
            onToggleCompare={toggleCompareMode}
            midiAvailable={midiAvailable}
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
