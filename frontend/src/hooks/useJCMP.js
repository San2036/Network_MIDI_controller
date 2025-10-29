import { useEffect, useMemo, useRef, useState, useCallback } from 'react';

// RPSV client hook: uses WebSocket for signaling/stats and WebRTC DataChannel for performance
export default function useJCMP() {
  const [status, setStatus] = useState('disconnected'); // disconnected | ws | rtc
  const [dcState, setDcState] = useState('closed');
  const [stats, setStats] = useState(null);
  const [midiAvailable, setMidiAvailable] = useState(false);
  const [allowWSFallback, setAllowWSFallback] = useState(false); // Allow WS fallback after RTC timeout

  // Enforce WebRTC as primary lane
  const rtcOnly = true; // set to false to allow WS fallback for performance
  const pendingPerfRef = useRef([]);
  const rtcTimeoutRef = useRef(null);

  const wsRef = useRef(null);
  const pcRef = useRef(null);
  const dcRef = useRef(null);

  const [wsState, setWsState] = useState('connecting'); // connecting | open | closed | error
  const [pendingPerf, setPendingPerf] = useState(0);

  const wsUrl = useMemo(() => `ws://${window.location.hostname}:5000`, []);

  // Signaling via WebSocket
  const cleanupRTC = useCallback(() => {
    if (rtcTimeoutRef.current) {
      clearTimeout(rtcTimeoutRef.current);
      rtcTimeoutRef.current = null;
    }
    try { dcRef.current?.close(); } catch {}
    try { pcRef.current?.close(); } catch {}
    dcRef.current = null;
    pcRef.current = null;
    setDcState('closed');
    setAllowWSFallback(false);
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
      console.log('✅ RTC DataChannel opened');
      if (rtcTimeoutRef.current) {
        clearTimeout(rtcTimeoutRef.current);
        rtcTimeoutRef.current = null;
      }
      setAllowWSFallback(false); // Reset fallback flag when RTC opens
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
      
      // Set timeout: if RTC doesn't connect in 8 seconds, allow WS fallback for mobile
      rtcTimeoutRef.current = setTimeout(() => {
        if (dcRef.current?.readyState !== 'open') {
          console.warn('⚠️ RTC connection timeout - allowing WS fallback for performance messages');
          setAllowWSFallback(true);
          // Clear pending queue by sending via WS
          const pending = pendingPerfRef.current.splice(0);
          pending.forEach(packet => {
            safeSend(wsRef.current, packet);
          });
          setPendingPerf(0);
        }
        rtcTimeoutRef.current = null;
      }, 8000);
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
        console.log('✅ WebSocket connected to:', wsUrl);
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
            setMidiAvailable(msg.midiAvailable || false);
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

      ws.onerror = (error) => {
        console.error('❌ WebSocket error connecting to:', wsUrl, error);
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
        try { 
          console.log('📤 Sending MIDI via RTC:', packet.type);
          dcRef.current.send(JSON.stringify(packet)); 
          return; 
        } catch {}
      }
      if (rtcOnly && !allowWSFallback) {
        // queue until RTC opens; prevents WS fallback
        if (pendingPerfRef.current.length < 256) {
          pendingPerfRef.current.push(packet);
          setPendingPerf(pendingPerfRef.current.length);
        } else {
          console.warn('RPSV: drop perf event (queue full, rtcOnly)');
        }
        return;
      }
      // fallback to WS immediate if allowed
      console.log('📤 Sending MIDI via WS fallback:', msg.type);
      safeSend(wsRef.current, msg);
      return;
    }

    // Non-performance (e.g., transport) over WS signaling
    safeSend(wsRef.current, msg);
  }

  // Public WS immediate send (bypasses RTC for comparison/testing)
  function sendWSImmediate(msg) {
    safeSend(wsRef.current, msg);
  }

  return { status, dcState, stats, sendMIDI, sendWSImmediate, wsState, pendingPerf, rtcOnly, wsUrl, midiAvailable };
}
