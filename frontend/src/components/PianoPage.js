// File: src/pages/PianoPage.js

import React, { useEffect } from 'react';
import Piano from '../components/Piano';
import { usePageProps } from '../Layout'; // Custom hook to get props

function PianoPage() {
  // Get the state and functions passed down from App.js
  const { pressedKeys, playNote, setPageTitle } = usePageProps();

  // Set the header title when this page loads
  useEffect(() => {
    setPageTitle('Piano');
  }, [setPageTitle]);

  return (
    <div className="section">
      <h2>🎹 Piano Keyboard</h2>
      <Piano 
        pressedKeys={pressedKeys} 
        onPlayNote={playNote} 
      />
    </div>
  );
}

export default PianoPage;