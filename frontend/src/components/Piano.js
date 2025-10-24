import React, { useEffect } from 'react';

function Piano({ pressedKeys, onPlayNote }) {
  useEffect(() => {
    const keyMap = {
      'a': 60, 'w': 61, 's': 62, 'e': 63, 'd': 64, 'f': 65, 't': 66,
      'g': 67, 'y': 68, 'h': 69, 'u': 70, 'j': 71, 'k': 72
    };

    const handleDown = (e) => {
      const note = keyMap[e.key.toLowerCase()];
      if (note && !e.repeat) onPlayNote(note, true);
    };
    const handleUp = (e) => {
      const note = keyMap[e.key.toLowerCase()];
      if (note) onPlayNote(note, false);
    };

    document.addEventListener('keydown', handleDown);
    document.addEventListener('keyup', handleUp);

    return () => {
      document.removeEventListener('keydown', handleDown);
      document.removeEventListener('keyup', handleUp);
    };
  }, [onPlayNote]);

  const whiteKeys = ['C', 'D', 'E', 'F', 'G', 'A', 'B'];
  const startOctave = 3;
  const octaves = 2;

  return (
    <div className="piano">
      {Array.from({ length: octaves }).map((_, i) =>
        whiteKeys.map((note, index) => {
          const noteNumber = ((startOctave + i) * 12) + [0, 2, 4, 5, 7, 9, 11][index];
          return (
            <div
              key={note + (startOctave + i)}
              className={`key white-key ${pressedKeys.has(noteNumber) ? 'active' : ''}`}
              onMouseDown={() => onPlayNote(noteNumber, true)}
              onMouseUp={() => onPlayNote(noteNumber, false)}
              onMouseLeave={() => onPlayNote(noteNumber, false)}
            >
              {note}{startOctave + i}
            </div>
          );
        })
      )}
    </div>
  );
}

export default Piano;
