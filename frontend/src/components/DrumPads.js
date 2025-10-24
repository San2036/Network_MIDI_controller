import React from 'react';

function DrumPads({ onPlayDrum }) {
  const pads = [
    { label: 'Kick C1', note: 36 },
    { label: 'Snare D1', note: 38 },
    { label: 'Hi-Hat F#1', note: 42 },
    { label: 'Open Hat A#1', note: 46 },
    { label: 'Low Tom F1', note: 41 },
    { label: 'Mid Tom G1', note: 43 },
    { label: 'High Tom A1', note: 45 },
    { label: 'Crash C#2', note: 49 },
  ];

  return (
    <div className="drum-pads">
      {pads.map((pad, idx) => (
        <button key={idx} className="drum-pad" onClick={() => onPlayDrum(pad.note)}>
          {pad.label}
        </button>
      ))}
    </div>
  );
}

export default DrumPads;
