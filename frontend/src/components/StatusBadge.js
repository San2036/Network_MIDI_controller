import React from 'react';

function StatusBadge({ status, compareMode, midiAvailable }) {
  // Determine protocol mode
  const protocol = compareMode ? 'TCP' : (status === 'rtc' ? 'RTC' : 'WS');
  
  // Determine connection state
  const isConnected = status !== 'disconnected';
  
  // Build status text
  let text = '';
  if (!isConnected) {
    text = 'Disconnected';
  } else {
    text = `${protocol}${midiAvailable ? ' • MIDI' : ''}`;
  }
  
  // Status class includes protocol and connection state
  const statusClass = isConnected ? (compareMode ? 'tcp' : status) : 'disconnected';
  
  return (
    <div className={`status-badge ${statusClass} ${midiAvailable ? 'midi-connected' : ''}`}>
      {text}
    </div>
  );
}

export default StatusBadge;
