// File: src/components/DevStatsPage.js

import React, { useEffect } from 'react';
import { usePageProps } from '../Layout';

export default function DevStatsPage() {
  const { setPageTitle, jcmpStats, dcState, jcmpStatus, wsState, rtcOnly, pendingPerf, wsUrl, compareMode } = usePageProps();

  useEffect(() => { setPageTitle('Dev Stats'); }, [setPageTitle]);

  const clients = jcmpStats?.clients || [];

  return (
    <div className="section">
      <h2>JCMP Runtime Stats</h2>
      <div style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))' }}>
        <div className="card">
          <h3>Client</h3>
          <div>Status: {jcmpStatus}</div>
          <div>WS: {wsState} ({wsUrl})</div>
          <div>DC: {dcState}</div>
          <div>RTC only: {String(rtcOnly)}</div>
          <div>Pending perf queue: {pendingPerf}</div>
          <div>Compare mode: {compareMode ? 'TCP (WS immediate)' : 'JCMP (RTC + buffer)'}</div>
        </div>
        <div className="card">
          <h3>Server</h3>
          <div>Server Time: {jcmpStats?.serverTime ?? '-'}</div>
          <div>Playback Queue Len: {jcmpStats?.queueLength ?? '-'}</div>
          <div>Lane counters: RTC={jcmpStats?.laneCounters?.rtcPerf ?? 0}, WS={jcmpStats?.laneCounters?.wsImmediate ?? 0}</div>
        </div>
        {clients.map(c => (
          <div key={c.id} className="card">
            <h3>Client #{c.id}</h3>
            <div>DC: {c.dcState}</div>
            <div>Buffer: {c.bufferSizeMs} ms</div>
            <div>RTT p95: {c.rttP95} ms</div>
            <div>RTT avg: {c.rttAvg} ms</div>
            <div>Last seen: {c.lastSeen ? new Date(c.lastSeen).toLocaleTimeString() : '-'}</div>
            {Array.isArray(c.latencyHistory) && c.latencyHistory.length > 0 && (
              <div style={{ marginTop: 8 }}>
                <div style={{ fontSize: 12, opacity: 0.8 }}>Recent RTTs (last {Math.min(20, c.latencyHistory.length)}):</div>
                <div style={{ display: 'flex', gap: 2, alignItems: 'flex-end', height: 40 }}>
                  {c.latencyHistory.slice(-20).map((v, i) => (
                    <div key={i} title={`${v} ms`} style={{ width: 6, height: Math.max(2, Math.min(40, v / 3)), background: '#61b0ff' }} />
                  ))}
                </div>
              </div>
            )}
          </div>
        ))}
      </div>

      <h3>Raw</h3>
      <pre style={{ maxHeight: 300, overflow: 'auto', background: '#111', color: '#0f0', padding: 12 }}>
        {JSON.stringify(jcmpStats, null, 2)}
      </pre>
    </div>
  );
}
