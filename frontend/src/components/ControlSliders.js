// File: src/components/ControlSliders.js

import React, { useState } from 'react';

function ControlSliders({ onControlChange, onTransport }) {
  const [values, setValues] = useState({ volume: 100, pan: 64 });

  const sliders = [
    { label: 'Volume', control: 7, key: 'volume' },
    { label: 'Pan', control: 10, key: 'pan' },
  ];

  const handleChange = (key, control, value) => {
    setValues({ ...values, [key]: value });
    onControlChange(control, value);
  };

  return (
    <div className="controls">
      {sliders.map((s) => (
        <div className="slider-container" key={s.key}>
          <label className="slider-label">{s.label}</label>
          <input
            type="range"
            min="0"
            max="127"
            value={values[s.key]}
            onChange={(e) => handleChange(s.key, s.control, parseInt(e.target.value))}
            className="slider"
          />
          <div className="value-display">{values[s.key]}</div>
        </div>
      ))}

      {/* *** FIX: Changed className to match your App.css file *** */}
      <div className="transport-controls">
        <button className="transport-btn play" onClick={() => onTransport('play')}>Play</button>
        <button className="transport-btn" onClick={() => onTransport('pause')}>Pause</button>
        <button className="transport-btn stop" onClick={() => onTransport('stop')}>Stop</button>
        <button className="transport-btn record" onClick={() => onTransport('record')}>Record</button>
      </div>
    </div>
  );
}

export default ControlSliders;