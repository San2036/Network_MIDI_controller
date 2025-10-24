import React from 'react';

function TransportControls({ onTransport }) {
  return (
    <div className="transport-controls">
      <button className="transport-btn play" onClick={() => onTransport('play')}>▶️ Play</button>
      <button className="transport-btn" onClick={() => onTransport('pause')}>⏸️ Pause</button>
      <button className="transport-btn stop" onClick={() => onTransport('stop')}>⏹️ Stop</button>
      <button className="transport-btn record" onClick={() => onTransport('record')}>⏺️ Record</button>
    </div>
  );
}

export default TransportControls;
