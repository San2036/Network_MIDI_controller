const express = require('express');
const WebSocket = require('ws');
const easymidi = require('easymidi');
const path = require('path');
const fs = require('fs');
const { RTCPeerConnection } = require('wrtc');

const app = express();
const port = process.env.PORT || 5000;

// MIDI Setup
let midiOutput = null;

function connectMIDI() {
    const outputs = easymidi.getOutputs();
    console.log('Available MIDI outputs:', outputs);
    
    for (let outputName of outputs) {
        if (outputName.includes('loopMIDI') || 
            outputName.includes('MIDI Controller') || 
            outputName.includes('Virtual') ||
            outputName.includes('IAC')) {
            try {
                midiOutput = new easymidi.Output(outputName);
                console.log(`✅ Connected to MIDI output: ${outputName}`);
                return true;
            } catch (error) {
                console.log(`❌ Failed to connect to ${outputName}:`, error.message);
            }
        }
    }
    
    try {
        midiOutput = new easymidi.Output('Web MIDI Controller', true);
        console.log('✅ Created virtual MIDI output: Web MIDI Controller');
        return true;
    } catch (error) {
        console.log('⚠️  Could not create virtual port:', error.message);
        if (outputs.length > 0) {
            try {
                midiOutput = new easymidi.Output(outputs[0]);
                console.log(`✅ Connected to fallback MIDI output: ${outputs[0]}`);
                return true;
            } catch (fallbackError) {
                console.log('❌ Fallback connection failed:', fallbackError.message);
            }
        }
    }
    return false;
}

if (!connectMIDI()) {
    console.error('❌ Could not connect to any MIDI port');
    console.log('💡 Make sure loopMIDI is running and has an active port');
    console.log('💡 Available outputs:', easymidi.getOutputs());
} else {
    console.log('✅ MIDI output ready. Make sure your DAW/synth is configured to receive from this port.');
}

// Serve static files
app.use(express.static('public'));

// Optionally serve React build if available (SPA)
const buildPath = path.join(__dirname, 'frontend', 'build');
if (fs.existsSync(buildPath)) {
    app.use(express.static(buildPath));
    // Serve index.html for all non-API routes (Express 5 compatible route regex)
    app.get(/^(?!\/api)(?!\/ws).*/, (req, res) => {
        res.sendFile(path.join(buildPath, 'index.html'));
    });
}

// Simple API endpoint for status
app.get('/api/status', (req, res) => {
    res.json({
        server: 'Web MIDI Controller',
        midiConnected: !!midiOutput,
        timestamp: new Date().toISOString()
    });
});

// Create HTTP server - bind to all interfaces for network access
const server = app.listen(port, '0.0.0.0', () => {
    console.log('\n🎵 MIDI Controller Server Started!');
    console.log(`📱 Local access: http://localhost:${port}`);
    console.log(`🌐 Network access: http://${getLocalIP()}:${port}`);
    console.log('🔗 Share the Network URL with other devices on your WiFi\n');
});

// WebSocket server
const wss = new WebSocket.Server({ server });

// ===== RPSV State =====
const RPSV_DEBUG = process.env.RPSV_DEBUG === '1';
let nextClientId = 1;
const clients = new Map(); // id -> { id, ws, pc, dc, latencyHistory: [], bufferSizeMs, lastSeen }
const playbackQueue = []; // Array of { playAt, type, data }
const LATE_DROP_MS = 50; // drop if we're over this late
const SAFETY_MARGIN_MS = 15;
// Counters to distinguish lanes used
const counters = { wsImmediate: 0, rtcPerf: 0 };
let lastPlaybackDispatchAt = null; // for inter-playback interval metrics

function logMetric(obj) {
    try {
        console.log('METRIC ' + JSON.stringify({ ts: Date.now(), ...obj }));
    } catch {}
}

function percentile(arr, p) {
    if (!arr.length) return 0;
    const sorted = arr.slice().sort((a, b) => a - b);
    const idx = Math.floor((p / 100) * (sorted.length - 1));
    return sorted[idx];
}

function insertEvent(evt) {
    // simple sorted insert by playAt
    let i = playbackQueue.length - 1;
    while (i >= 0 && playbackQueue[i].playAt > evt.playAt) i--;
    playbackQueue.splice(i + 1, 0, evt);
}

setInterval(() => {
    const now = Date.now();
    while (playbackQueue.length && playbackQueue[0].playAt <= now) {
        const evt = playbackQueue.shift();
        const playbackError = now - evt.playAt;
        if (playbackError > LATE_DROP_MS) continue; // late drop

        if (RPSV_DEBUG) {
            const interval = lastPlaybackDispatchAt != null ? (now - lastPlaybackDispatchAt) : null;
            if (interval != null) {
                console.log(`RPSV Debug: PlaybackError=${playbackError}ms, InterPlayback=${interval}ms`);
                logMetric({ kind: 'rpsv_playback', playbackErrorMs: playbackError, interPlaybackMs: interval });
            } else {
                console.log(`RPSV Debug: PlaybackError=${playbackError}ms`);
                logMetric({ kind: 'rpsv_playback', playbackErrorMs: playbackError });
            }
            lastPlaybackDispatchAt = now;
        }
        switch (evt.type) {
            case 'noteOn':
                sendNoteOn(evt.channel || 1, evt.note, evt.velocity || 100);
                break;
            case 'noteOff':
                sendNoteOff(evt.channel || 1, evt.note, 0);
                break;
            case 'cc':
                sendControlChange(evt.channel || 1, evt.control, evt.value);
                break;
            case 'program':
                sendProgramChange(evt.channel || 1, evt.program);
                break;
        }
    }
}, 5);

setInterval(() => {
    // broadcast dev stats over WS
    const snapshot = {
        type: 'jcmp-stats',
        serverTime: Date.now(),
        queueLength: playbackQueue.length,
        laneCounters: { ...counters },
        clients: Array.from(clients.values()).map(c => ({
            id: c.id,
            bufferSizeMs: c.bufferSizeMs || 0,
            rttP95: percentile(c.latencyHistory || [], 95),
            rttAvg: (c.latencyHistory && c.latencyHistory.length)
                ? Math.round(c.latencyHistory.reduce((a, b) => a + b, 0) / c.latencyHistory.length)
                : 0,
            latencyHistory: c.latencyHistory?.slice(-50) || [],
            dcState: c.dc?.readyState || 'closed',
            lastSeen: c.lastSeen || null,
        }))
    };
    wss.clients.forEach(sock => {
        if (sock.readyState === WebSocket.OPEN) {
            try { sock.send(JSON.stringify(snapshot)); } catch {}
        }
    });
}, 1000);

// Log usage summary every 5s and reset counters
setInterval(() => {
    console.log(`RPSV lanes (last 5s): RTC perf msgs=${counters.rtcPerf}, WS immediate=${counters.wsImmediate}, clients=${clients.size}, queue=${playbackQueue.length}`);
    counters.wsImmediate = 0;
    counters.rtcPerf = 0;
}, 5000);

function ensureClient(ws) {
    if (ws._clientId && clients.has(ws._clientId)) return clients.get(ws._clientId);
    const id = nextClientId++;
    ws._clientId = id;
    const c = { id, ws, pc: null, dc: null, latencyHistory: [], bufferSizeMs: 40, lastSeen: null };
    clients.set(id, c);
    return c;
}

function setupPeerForClient(c, offer) {
    if (c.pc) {
        try { c.pc.close(); } catch {}
        c.pc = null; c.dc = null;
    }
    const pc = new RTCPeerConnection({ iceServers: [] });
    c.pc = pc;

    pc.onconnectionstatechange = () => {
        console.log(`PC state (client ${c.id}): ${pc.connectionState}`);
    };
    pc.oniceconnectionstatechange = () => {
        console.log(`ICE state (client ${c.id}): ${pc.iceConnectionState}`);
    };

    pc.onicecandidate = ({ candidate }) => {
        if (candidate) {
            try {
                c.ws.send(JSON.stringify({ type: 'webrtc-ice-candidate', candidate }));
            } catch {}
        }
    };

    pc.ondatachannel = (evt) => {
        const dc = evt.channel;
        c.dc = dc;
        dc.onopen = () => {
            console.log(`🔌 RPSV DataChannel OPEN (client ${c.id}) — using WebRTC lane`);
        };
        dc.onclose = () => {
            console.log(`🔌 RPSV DataChannel CLOSE (client ${c.id}) — fallback to WebSocket lane`);
        };
        dc.onmessage = (msg) => handlePerformancePacket(c, msg);
    };

    return pc.setRemoteDescription(offer)
        .then(() => pc.createAnswer())
        .then(answer => pc.setLocalDescription(answer).then(() => answer));
}

function handlePerformancePacket(c, msg) {
    c.lastSeen = Date.now();
    counters.rtcPerf++;
    let obj;
    try {
        obj = typeof msg.data === 'string' ? JSON.parse(msg.data) : JSON.parse(Buffer.from(msg.data).toString());
    } catch (e) {
        return;
    }
    const now = Date.now();
    const ts = typeof obj.timestamp === 'number' ? obj.timestamp : now;
    const latency = Math.max(0, now - ts);
    c.latencyHistory.push(latency);
    if (c.latencyHistory.length > 200) c.latencyHistory.splice(0, c.latencyHistory.length - 200);
    const p95 = percentile(c.latencyHistory, 95);
    c.bufferSizeMs = Math.max(10, Math.min(300, Math.round(p95 + SAFETY_MARGIN_MS)));

    if (RPSV_DEBUG) {
        console.log(`RPSV Debug: RTC latency=${latency}ms, bufferSizeMs=${c.bufferSizeMs}`);
        logMetric({ kind: 'rpsv_rtc', rttMs: latency, bufferSizeMs: c.bufferSizeMs, clientId: c.id });
    }

    // Use server arrival time to avoid cross-device clock skew dropping events
    const playAt = now + c.bufferSizeMs;
    switch (obj.type) {
        case 'noteOn':
            insertEvent({ playAt, type: 'noteOn', channel: obj.channel || 1, note: obj.note, velocity: obj.velocity || 100 });
            // safety noteOff after 800ms if missing
            insertEvent({ playAt: playAt + 800, type: 'noteOff', channel: obj.channel || 1, note: obj.note });
            break;
        case 'noteOff':
            insertEvent({ playAt, type: 'noteOff', channel: obj.channel || 1, note: obj.note });
            break;
        case 'controlChange':
            insertEvent({ playAt, type: 'cc', channel: obj.channel || 1, control: obj.control, value: obj.value });
            break;
        case 'programChange':
            insertEvent({ playAt, type: 'program', channel: obj.channel || 1, program: obj.program });
            break;
    }
}

// MIDI helper functions
function sendNoteOn(channel, note, velocity) {
    if (!midiOutput) {
        console.log('⚠️  No MIDI output available');
        return;
    }
    
    try {
        midiOutput.send('noteon', {
            channel: channel - 1,
            note: note,
            velocity: velocity
        });
        console.log(`🎹 Note ON: Ch${channel}, Note${note}, Vel${velocity} → MIDI sent`);
    } catch (error) {
        console.error('❌ Error sending note on:', error.message, error.stack);
    }
}

function sendNoteOff(channel, note, velocity = 0) {
    if (!midiOutput) return;
    
    try {
        midiOutput.send('noteoff', {
            channel: channel - 1,
            note: note,
            velocity: velocity
        });
        console.log(`🎹 Note OFF: Ch${channel}, Note${note}`);
    } catch (error) {
        console.error('❌ Error sending note off:', error.message);
    }
}

function sendControlChange(channel, control, value) {
    if (!midiOutput) {
        console.log('⚠️  No MIDI output available');
        return;
    }
    
    try {
        midiOutput.send('cc', {
            channel: channel - 1,
            controller: control,
            value: value
        });
        console.log(`🎛️  CC: Ch${channel}, CC${control}=${value}`);
    } catch (error) {
        console.error('❌ Error sending control change:', error.message);
    }
}

function sendProgramChange(channel, program) {
    if (!midiOutput) return;
    
    try {
        midiOutput.send('program', {
            channel: channel - 1,
            number: program
        });
        console.log(`🎵 Program Change: Ch${channel}, Program${program}`);
    } catch (error) {
        console.error('❌ Error sending program change:', error.message);
    }
}

// WebSocket connection handling
let connectionCount = 0;

wss.on('connection', (ws, req) => {
    connectionCount++;
    const clientIP = req.socket.remoteAddress || 'unknown';
    const client = ensureClient(ws);
    console.log(`📱 Client connected from ${clientIP} (${connectionCount} total) id=${client.id}`);
    
    // Send welcome message
    ws.send(JSON.stringify({
        type: 'server-welcome',
        id: client.id,
        message: 'Connected to MIDI Controller',
        midiAvailable: !!midiOutput
    }));
    
    ws.on('message', async (data) => {
        let message;
        try { message = JSON.parse(data); } catch (e) { return; }
        
        switch (message.type) {
            // Legacy immediate MIDI over WS (kept for compatibility)
            case 'noteOn':
                counters.wsImmediate++;
                if (RPSV_DEBUG) {
                    const arrival = Date.now();
                    const wsLatency = typeof message.timestamp === 'number' ? Math.max(0, arrival - message.timestamp) : null;
                    console.log(wsLatency != null ? `🎯 WS lane: noteOn (latency=${wsLatency}ms)` : '🎯 WS lane: noteOn');
                    if (wsLatency != null) logMetric({ kind: 'tcp_ws', action: 'noteOn', latencyMs: wsLatency });
                } else {
                    console.log('🎯 WS lane: noteOn');
                }
                sendNoteOn(message.channel || 1, message.note, message.velocity || 127);
                break;
            case 'noteOff':
                counters.wsImmediate++;
                if (RPSV_DEBUG) {
                    const arrival = Date.now();
                    const wsLatency = typeof message.timestamp === 'number' ? Math.max(0, arrival - message.timestamp) : null;
                    console.log(wsLatency != null ? `🎯 WS lane: noteOff (latency=${wsLatency}ms)` : '🎯 WS lane: noteOff');
                    if (wsLatency != null) logMetric({ kind: 'tcp_ws', action: 'noteOff', latencyMs: wsLatency });
                } else {
                    console.log('🎯 WS lane: noteOff');
                }
                sendNoteOff(message.channel || 1, message.note);
                break;
            case 'controlChange':
                counters.wsImmediate++;
                if (RPSV_DEBUG) {
                    const arrival = Date.now();
                    const wsLatency = typeof message.timestamp === 'number' ? Math.max(0, arrival - message.timestamp) : null;
                    console.log(wsLatency != null ? `🎯 WS lane: controlChange (latency=${wsLatency}ms)` : '🎯 WS lane: controlChange');
                    if (wsLatency != null) logMetric({ kind: 'tcp_ws', action: 'controlChange', latencyMs: wsLatency });
                } else {
                    console.log('🎯 WS lane: controlChange');
                }
                sendControlChange(message.channel || 1, message.control, message.value);
                break;
            case 'programChange':
                counters.wsImmediate++;
                if (RPSV_DEBUG) {
                    const arrival = Date.now();
                    const wsLatency = typeof message.timestamp === 'number' ? Math.max(0, arrival - message.timestamp) : null;
                    console.log(wsLatency != null ? `🎯 WS lane: programChange (latency=${wsLatency}ms)` : '🎯 WS lane: programChange');
                    if (wsLatency != null) logMetric({ kind: 'tcp_ws', action: 'programChange', latencyMs: wsLatency });
                } else {
                    console.log('🎯 WS lane: programChange');
                }
                sendProgramChange(message.channel || 1, message.program);
                break;
            case 'transport':
                handleTransportControl(message.action);
                break;

            // JCMP signaling
            case 'client-hello': {
                ws.send(JSON.stringify({ type: 'server-welcome', id: client.id, midiAvailable: !!midiOutput }));
                break;
            }
            case 'webrtc-offer': {
                try {
                    console.log(`🛰️  Received WebRTC offer from client ${client.id}`);
                    const answer = await setupPeerForClient(client, message.offer);
                    ws.send(JSON.stringify({ type: 'webrtc-answer', answer }));
                    console.log(`🛰️  Sent WebRTC answer to client ${client.id}`);
                } catch (e) {
                    console.error('❌ WebRTC setup error:', e.message);
                }
                break;
            }
            case 'webrtc-ice-candidate': {
                try {
                    if (client.pc) await client.pc.addIceCandidate(message.candidate);
                } catch (e) {
                    console.error('ICE add error:', e.message);
                }
                break;
            }
            default:
                console.log('❓ Unknown message type:', message.type);
        }
    });
    
    ws.on('close', () => {
        connectionCount--;
        const c = clients.get(ws._clientId);
        if (c && c.pc) { try { c.pc.close(); } catch {} }
        clients.delete(ws._clientId);
        console.log(`📱 Client disconnected from ${clientIP} (${connectionCount} remaining)`);
    });
    
    ws.on('error', (error) => {
        console.error('🔌 WebSocket error:', error.message);
    });
});

// Transport controls
function handleTransportControl(action) {
    if (!midiOutput) {
        console.log('⚠️  No MIDI output for transport control');
        return;
    }
    
    try {
        switch (action) {
            case 'play':
                midiOutput.send('start');
                console.log('▶️  MIDI Start sent');
                sendMMC('play');
                sendTransportNote('play');
                break;
            case 'stop':
                midiOutput.send('stop');
                console.log('⏹️  MIDI Stop sent');
                sendMMC('stop');
                sendTransportNote('stop');
                break;
            case 'pause':
                midiOutput.send('continue');
                console.log('⏸️  MIDI Continue sent');
                sendMMC('pause');
                sendTransportNote('pause');
                break;
            case 'record':
                sendControlChange(1, 119, 127); // Record CC
                console.log('⏺️  Record command sent (CC 119)');
                sendMMC('record');
                sendTransportNote('record');
                break;
        }
    } catch (error) {
        console.error('❌ Error sending transport command:', error.message);
    }
}

// Send MMC (MIDI Machine Control) SysEx for broader DAW transport compatibility
function sendMMC(action) {
    if (!midiOutput) return;
    // MMC: F0 7F 7F 06 <cmd> F7 (7F = all devices)
    const CMD = {
        stop: 0x01,
        play: 0x02,
        // deferred play could be 0x03; use pause 0x09
        pause: 0x09,
        // record strobe starts recording
        record: 0x06,
    };
    const cmd = CMD[action];
    if (cmd == null) return;
    try {
        // easymidi expects raw bytes array for sysex
        midiOutput.send('sysex', [0xF0, 0x7F, 0x7F, 0x06, cmd, 0xF7]);
        console.log(`🛰️  MMC sent: ${action} (0x${cmd.toString(16)})`);
    } catch (e) {
        console.log('⚠️  MMC send failed:', e.message);
    }
}

// Also emit dedicated note triggers for easy MIDI Learn in DAWs
function sendTransportNote(action) {
    if (!midiOutput) return;
    const NOTE = {
        play: 24,   // C1
        stop: 25,
        pause: 26,
        record: 27,
    };
    const note = NOTE[action];
    if (note == null) return;
    const channel = 16; // use channel 16 for transport mapping
    try {
        midiOutput.send('noteon', { channel: channel - 1, note, velocity: 100 });
        setTimeout(() => {
            try { midiOutput.send('noteoff', { channel: channel - 1, note, velocity: 0 }); } catch {}
        }, 50);
        console.log(`🎚️  Transport note sent: ${action} → Ch${channel} Note${note}`);
    } catch (e) {
        console.log('⚠️  Transport note send failed:', e.message);
    }
}

// Get local IP address
function getLocalIP() {
    const { networkInterfaces } = require('os');
    const nets = networkInterfaces();
    
    for (const name of Object.keys(nets)) {
        for (const net of nets[name]) {
            if (net.family === 'IPv4' && !net.internal) {
                return net.address;
            }
        }
    }
    return 'localhost';
}

// Graceful shutdown
process.on('SIGINT', () => {
    console.log('\n🛑 Shutting down gracefully...');
    
    if (midiOutput) {
        try {
            midiOutput.close();
            console.log('🎵 MIDI output closed');
        } catch (error) {
            console.log('⚠️  Error closing MIDI output:', error.message);
        }
    }
    
    console.log('👋 Server stopped');
    process.exit(0);
});

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
    console.error('💥 Uncaught Exception:', error.message);
    process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('💥 Unhandled Rejection at:', promise, 'reason:', reason);
    process.exit(1);
});