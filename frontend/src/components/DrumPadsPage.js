// File: src/pages/DrumPadsPage.js

import React, { useEffect } from 'react';
import DrumPads from '../components/DrumPads';
import { usePageProps } from '../Layout'; // Custom hook to get props

function DrumPadsPage() {
  // Get the function passed down from App.js
  const { playDrum, setPageTitle } = usePageProps();

  // Set the header title when this page loads
  useEffect(() => {
    setPageTitle('Drum Pads');
  }, [setPageTitle]);
  
  return (
    <div className="section">
      <h2>🥁 Drum Pads</h2>
      <DrumPads onPlayDrum={playDrum} />
    </div>
  );
}

export default DrumPadsPage;