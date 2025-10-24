import { useEffect, useRef, useState, useCallback } from 'react';

export default function useWebSocket() {
  const [status, setStatus] = useState('disconnected');
  const wsRef = useRef(null);

  // Wrap the 'connect' function in useCallback
  // This creates a stable function that doesn't change on re-renders.
  const connect = useCallback(() => {
    // Use window.location.hostname instead of 'localhost'
    const wsUrl = `ws://${window.location.hostname}:5000`;
    
    console.log('Connecting to WebSocket:', wsUrl);

    wsRef.current = new WebSocket(wsUrl);

    wsRef.current.onopen = () => {
      console.log('Connected to MIDI server');
      setStatus('connected');
    };

    wsRef.current.onclose = () => {
      console.log('Disconnected, retrying...');
      setStatus('disconnected');
      setTimeout(connect, 3000); // Auto-reconnect
    };

    wsRef.current.onerror = (err) => {
      console.error('WebSocket error:', err);
      setStatus('disconnected');
    }; // <-- The stray 'M' was here and has been removed.
  }, []); // We use an empty dependency array because 'setStatus' and 'wsRef' are stable.

  // Add the stable 'connect' function to the dependency array
  useEffect(() => {
    connect();
    
    // Cleanup on unmount
    return () => {
      if (wsRef.current) {
        // We use code 1000 for a normal, intentional close.
        wsRef.current.close(1000, 'Component unmounted');
      }
    };
  }, [connect]); // Now the dependency is correctly listed.

  const sendMIDI = (message) => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(message));
    }
  };

  return { ws: wsRef.current, status, sendMIDI };
}