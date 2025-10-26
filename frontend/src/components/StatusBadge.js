import React from 'react';

function StatusBadge({ status }) {
  const text = status === 'rtc'
    ? '🟢 Realtime (RTC)'
    : status === 'ws'
    ? '🟡 Signaling (WS)'
    : status === 'connected'
    ? '🟢 Connected'
    : '🔴 Disconnected';
  return (
    <div className={`status-badge ${status}`}>
      {text}
    </div>
  );
}

export default StatusBadge;
