import React from 'react';

function StatusBadge({ status }) {
  return (
    <div className={`status-badge ${status}`}>
      {status === "connected" ? "🟢 Connected" : "🔴 Disconnected"}
    </div>
  );
}

export default StatusBadge;
