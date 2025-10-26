import { useEffect, useMemo, useRef, useState, useCallback } from 'react';

// JCMP client hook: uses WebSocket for signaling/stats and WebRTC DataChannel for performance
export default function useJCMP() {
  const [status, setStatus] = useState('disconnected'); // disconnected | ws | rtc
  const [dcState, setDcState] = useState('closed');
  const [stats, setStats] = useState(null);

  // Enforce WebRTC as primary lane
  const rtcOnly = true; // set to false to allow WS fallback for performance
  const pendingPerfRef = useRef([]);

  const wsRef = useRef(null);
  const pcRef = useRef(null);
  const dcRef = useRef(null);

  const [wsState, setWsState] = useState('connecting'); // connecting | open | closed | error
  const [pendingPerf, setPendingPerf] = useState(0);

  const wsUrl = useMemo(() => `ws://${window.location.hostname}:5000`, []);

  // Signaling via WebSocket
  const cleanupRTC = useCallback(() => {
    try { dcRef.current?.close(); } catch {}
    try { pcRef.current?.close(); } catch {}
    dcRef.current = null;
    pcRef.current = null;
    setDcState('closed');
  }, []);

  const safeSend = useCallback((ws, obj) => {
    try { ws?.readyState === WebSocket.OPEN && ws.send(JSON.stringify(obj)); } catch {}
  }, []);

  const startWebRTC = useCallback(async () => {
    // close any previous
    cleanupRTC();

    const pc = new RTCPeerConnection({ iceServers: [] });
    pcRef.current = pc;

    pc.onicecandidate = (ev) => {
      if (ev.candidate) safeSend(wsRef.current, { type: 'webrtc-ice-candidate', candidate: ev.candidate });
    };

    // Create performance DataChannel
    const dc = pc.createDataChannel('perf', { ordered: false, maxRetransmits: 0 });
    dcRef.current = dc;

    dc.onopen = () => {
      setDcState('open');
      setStatus('rtc');
      // flush any pending performance events
      try {
        const q = pendingPerfRef.current;
        while (q.length && dc.readyState === 'open') {
          dc.send(JSON.stringify(q.shift()));
        }
        setPendingPerf(q.length);
      } catch {}
    };
    dc.onclose = () => { setDcState('closed'); setStatus(wsRef.current?.readyState === WebSocket.OPEN ? 'ws' : 'disconnected'); };
    dc.onerror = () => { setDcState('error'); setStatus('ws'); };

    try {
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      safeSend(wsRef.current, { type: 'webrtc-offer', offer });
    } catch {
      // fall back stays ws-only
    }
  }, [cleanupRTC, safeSend]);

  useEffect(() => {
    let reconnectTimer;

    const openWS = () => {
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;
      setWsState('connecting');

      ws.onopen = () => {
        setWsState('open');
        setStatus((dcRef.current && dcRef.current.readyState === 'open') ? 'rtc' : 'ws');
        // Hello + kick off WebRTC handshake
        safeSend(ws, { type: 'client-hello' });
        startWebRTC();
      };

      ws.onmessage = async (ev) => {
        let msg; try { msg = JSON.parse(ev.data); } catch { return; }
        switch (msg.type) {
          case 'server-welcome':
            // no-op; id available at msg.id
            break;
          case 'webrtc-answer':
            if (pcRef.current && msg.answer) {
              try { await pcRef.current.setRemoteDescription(msg.answer); } catch {}
            }
            break;
          case 'webrtc-ice-candidate':
            if (pcRef.current && msg.candidate) {
              try { await pcRef.current.addIceCandidate(msg.candidate); } catch {}
            }
            break;
          case 'jcmp-stats':
            setStats(msg);
            break;
          default:
            break;
        }
      };

      ws.onclose = () => {
        setWsState('closed');
        setStatus('disconnected');
        cleanupRTC();
        reconnectTimer = setTimeout(openWS, 2000);
      };

      ws.onerror = () => {
        setWsState('error');
        setStatus('disconnected');
      };
    };

    openWS();

    return () => {
      clearTimeout(reconnectTimer);
      try { wsRef.current?.close(1000, 'unmount'); } catch {}
      cleanupRTC();
    };
  }, [wsUrl, startWebRTC, cleanupRTC, safeSend]);

  // Public send API: prefer DataChannel; optionally disallow WS fallback for performance
  function sendMIDI(msg) {
    const isPerf = msg && (msg.type === 'noteOn' || msg.type === 'noteOff' || msg.type === 'controlChange' || msg.type === 'programChange');

    if (isPerf) {
      const packet = { ...msg, timestamp: Date.now() };
      if (dcRef.current && dcRef.current.readyState === 'open') {
        try { dcRef.current.send(JSON.stringify(packet)); return; } catch {}
      }
      if (rtcOnly) {
        // queue until RTC opens; prevents WS fallback
        if (pendingPerfRef.current.length < 256) {
          pendingPerfRef.current.push(packet);
          setPendingPerf(pendingPerfRef.current.length);
        } else {
          console.warn('JCMP: drop perf event (queue full, rtcOnly)');
        }
        return;
      }
      // fallback to WS immediate if allowed
      safeSend(wsRef.current, msg);
      return;
    }

    // Non-performance (e.g., transport) over WS signaling
    safeSend(wsRef.current, msg);
  }

  return { status, dcState, stats, sendMIDI, wsState, pendingPerf, rtcOnly, wsUrl };
}
