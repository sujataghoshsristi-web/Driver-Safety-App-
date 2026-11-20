import express from 'express';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createServer as createViteServer } from 'vite';
import { GoogleGenAI, Type, FunctionCallingConfigMode, type FunctionDeclaration } from '@google/genai';
import dotenv from 'dotenv';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// System instructions provided by user for Hands-Free Android Voice Assistant
const HANDS_FREE_SYSTEM_INSTRUCTION = `You are a hands-free Android voice assistant. Your primary task is to help the user place immediate phone calls without requiring physical touch. 

When the user asks to call someone, you must immediately invoke the \`place_immediate_call\` tool. Do not ask for confirmation or add conversational filler. Extract the phone number or the contact name precisely. If the user provides a name instead of a number, pass the name to the function so the system can look it up in the address book.`;

// Tool / Function Declaration provided by user
const placeImmediateCallDeclaration: FunctionDeclaration = {
  name: 'place_immediate_call',
  description:
    'Triggers an instant, native Android phone call to a specific number or contact without requiring user confirmation.',
  parameters: {
    type: Type.OBJECT,
    properties: {
      target: {
        type: Type.STRING,
        description:
          "The exact phone number (e.g., '+1234567890') or the name of the contact to call.",
      },
    },
    required: ['target'],
  },
};

// Built-in fleet address book lookup when user speaks a contact name instead of digits
const FLEET_ADDRESS_BOOK: Record<string, string> = {
  dispatch: '82199',
  'emergency dispatch': '82199',
  'central dispatch': '82199',
  emergency: '82199',
  'control room': '82199',
  supervisor: '82199',
  'fleet supervisor': '82199',
  ambulance: '108',
  police: '112',
  fire: '101',
  mechanic: '82199',
};

function resolveContactTarget(rawTarget: string, defaultEmergencyNumber: string = '82199'): {
  target: string;
  resolvedNumber: string;
  contactName: string | null;
} {
  const trimmed = (rawTarget || '').trim();
  if (!trimmed) {
    return {
      target: defaultEmergencyNumber,
      resolvedNumber: defaultEmergencyNumber,
      contactName: 'Emergency Dispatch',
    };
  }

  const lower = trimmed.toLowerCase();
  for (const [name, num] of Object.entries(FLEET_ADDRESS_BOOK)) {
    if (lower === name || lower.includes(name)) {
      const finalNum = num === '82199' ? defaultEmergencyNumber : num;
      return {
        target: trimmed,
        resolvedNumber: finalNum,
        contactName: trimmed,
      };
    }
  }

  // Extract phone digits/symbols if present
  const digitsMatch = trimmed.match(/[+0-9][0-9\-\s().+*#]{1,20}/);
  if (digitsMatch) {
    const cleanedDigits = digitsMatch[0].replace(/[^0-9+*#]/g, '');
    if (cleanedDigits.length >= 3) {
      return {
        target: trimmed,
        resolvedNumber: cleanedDigits,
        contactName: null,
      };
    }
  }

  // Fallback to default emergency number if contact name is unknown
  return {
    target: trimmed,
    resolvedNumber: defaultEmergencyNumber,
    contactName: trimmed,
  };
}

function fallbackExtractTargetFromSpeech(utterance: string, defaultNum: string): string {
  const cleaned = utterance
    .replace(/^(please\s+|hey\s+|ok\s+|ai\s+)?(call|dial|phone|ring|connect\s+to)\s+/i, '')
    .replace(/\s+(immediately|right\s+now|now|instantly|on\s+speaker|please)\.?$/i, '')
    .trim();
  return cleaned || defaultNum;
}

async function startServer() {
  const app = express();
  const PORT = 3000;

  process.on('uncaughtException', (err) => {
    console.warn('Ignored uncaughtException:', err?.message || err);
  });
  process.on('unhandledRejection', (reason: any) => {
    console.warn('Ignored unhandledRejection:', reason?.message || reason);
  });

  app.use(express.json({ limit: '5mb' }));

  // Force any previously installed Service Worker on Phone or Laptop to unregister and clear caches immediately
  app.get('/sw.js', (_req, res) => {
    res.setHeader('Content-Type', 'application/javascript; charset=utf-8');
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.send(`
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.map((k) => caches.delete(k))))
      .then(() => self.registration.unregister())
      .then(() => self.clients.matchAll({ type: 'window' }))
      .then((clients) => {
        for (const c of clients) {
          if ('navigate' in c) c.navigate(c.url);
        }
      })
  );
});
`);
  });

  app.get('/registerSW.js', (_req, res) => {
    res.setHeader('Content-Type', 'application/javascript; charset=utf-8');
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
    res.send('// Service Worker disabled');
  });

  // Allow cross-IP, Wi-Fi LAN, and Capacitor Android APK requests to reach this server
  app.use('/api', (req, res, next) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    res.setHeader('Access-Control-Allow-Private-Network', 'true');
    if (req.method === 'OPTIONS') {
      return res.sendStatus(204);
    }
    next();
  });

  // ============================================================================
  // REAL TWO-WAY VOICE CALL + LIVE PHONE GPS LOCATION SERVER (Phone <-> Laptop over 2 IPs)
  // Universal Global Room ('DRIVELOCK_DISPATCH') + Server-to-Server WSS Bridge
  // ============================================================================
  const GLOBAL_ROOM_ID = 'DRIVELOCK_DISPATCH';
  const SERVER_BRIDGE_TOPIC = `drivelock_v2_voice_room/${GLOBAL_ROOM_ID}`;
  const SERVER_NODE_ID = `srv_${Math.random().toString(36).slice(2, 10)}`;

  interface AudioChunkPacket {
    seq: number;
    packetId: string;
    senderId: string;
    role: 'caller' | 'callee';
    mimeType: string;
    base64: string;
    pcm16?: string;
    sampleRate?: number;
    timestamp: number;
  }

  interface LiveLocationPayload {
    latitude: number;
    longitude: number;
    accuracy?: number;
    speedKmh?: number;
    heading?: number;
    impactG?: number;
    knockCount?: number;
    unitNumber?: string;
    driverId?: string;
    reason?: string;
    updatedAt: number;
  }

  interface WebRtcRoom {
    roomId: string;
    status: 'ringing' | 'connected' | 'ended';
    callerSenderId?: string;
    callerContext?: Record<string, any>;
    liveLocation?: LiveLocationPayload | null;
    locationTrail: Array<{ lat: number; lon: number; ts: number }>;
    offer: RTCSessionDescriptionInit | null;
    answer: RTCSessionDescriptionInit | null;
    callerCandidates: RTCIceCandidateInit[];
    calleeCandidates: RTCIceCandidateInit[];
    audioChunks: AudioChunkPacket[];
    nextAudioSeq: number;
    updatedAt: number;
  }

  const webrtcRooms = new Map<string, WebRtcRoom>();
  const seenBridgePacketIds = new Set<string>();

  function getOrCreateGlobalRoom(): WebRtcRoom {
    let room = webrtcRooms.get(GLOBAL_ROOM_ID);
    if (!room) {
      room = {
        roomId: GLOBAL_ROOM_ID,
        status: 'ended',
        callerContext: {},
        liveLocation: null,
        locationTrail: [],
        offer: null,
        answer: null,
        callerCandidates: [],
        calleeCandidates: [],
        audioChunks: [],
        nextAudioSeq: 1,
        updatedAt: Date.now(),
      };
      webrtcRooms.set(GLOBAL_ROOM_ID, room);
    }
    return room;
  }

  function rememberPacketId(id: string): boolean {
    if (!id) return false;
    if (seenBridgePacketIds.has(id)) return true;
    seenBridgePacketIds.add(id);
    if (seenBridgePacketIds.size > 600) {
      const oldest = seenBridgePacketIds.values().next().value;
      if (oldest) seenBridgePacketIds.delete(oldest);
    }
    return false;
  }

  // --- Server-Side MQTT-over-WSS Bridge (syncs ais-dev <-> ais-pre <-> browser clients) ---
  const BRIDGE_BROKERS = [
    'wss://broker.emqx.io:8084/mqtt',
    'wss://test.mosquitto.org:8081',
  ];
  const bridgeSockets = new Map<string, WebSocket>();
  const connectedBridgeBrokers = new Set<string>();
  const textEncoder = new TextEncoder();
  const textDecoder = new TextDecoder();

  function mqttEncodeLen(len: number): number[] {
    const out: number[] = [];
    let x = len;
    do {
      let b = x % 128;
      x = Math.floor(x / 128);
      if (x > 0) b |= 128;
      out.push(b);
    } while (x > 0);
    return out;
  }

  function mqttDecodeLen(bytes: Uint8Array, start: number): { value: number; next: number } {
    let mult = 1;
    let val = 0;
    let idx = start;
    let b = 0;
    do {
      if (idx >= bytes.length) return { value: -1, next: bytes.length };
      b = bytes[idx++];
      val += (b & 127) * mult;
      mult *= 128;
    } while ((b & 128) !== 0);
    return { value: val, next: idx };
  }

  function mqttBuildPublish(topic: string, jsonStr: string): ArrayBuffer {
    const tBytes = textEncoder.encode(topic);
    const pBytes = textEncoder.encode(jsonStr);
    const remLen = 2 + tBytes.length + pBytes.length;
    const remBytes = mqttEncodeLen(remLen);
    const out = new Uint8Array(1 + remBytes.length + remLen);
    let o = 0;
    out[o++] = 0x30;
    for (const rb of remBytes) out[o++] = rb;
    out[o++] = (tBytes.length >> 8) & 0xff;
    out[o++] = tBytes.length & 0xff;
    out.set(tBytes, o);
    o += tBytes.length;
    out.set(pBytes, o);
    return out.buffer as ArrayBuffer;
  }

  function publishToServerBridge(packet: Record<string, any>) {
    const id =
      packet.id ||
      `${SERVER_NODE_ID}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    rememberPacketId(id);
    const fullPacket = {
      ...packet,
      id,
      roomId: GLOBAL_ROOM_ID,
      originServerId: SERVER_NODE_ID,
      ts: Date.now(),
    };
    const buf = mqttBuildPublish(SERVER_BRIDGE_TOPIC, JSON.stringify(fullPacket));
    for (const [url, ws] of bridgeSockets.entries()) {
      if (ws.readyState === WebSocket.OPEN && connectedBridgeBrokers.has(url)) {
        try {
          ws.send(buf);
        } catch (e) {}
      }
    }
  }

  function handleIncomingBridgePacket(pkt: any) {
    if (!pkt || !pkt.id || pkt.originServerId === SERVER_NODE_ID) return;
    if (rememberPacketId(pkt.id)) return;

    if (pkt.type === 'hangup') {
      webrtcRooms.delete(GLOBAL_ROOM_ID);
      return;
    }

    const room = getOrCreateGlobalRoom();

    if (pkt.location && (pkt.location.latitude || pkt.location.longitude)) {
      const lat = Number(pkt.location.latitude);
      const lon = Number(pkt.location.longitude);
      if (!isNaN(lat) && !isNaN(lon) && (lat !== 0 || lon !== 0)) {
        room.liveLocation = {
          ...room.liveLocation,
          ...pkt.location,
          latitude: lat,
          longitude: lon,
          updatedAt: Date.now(),
        };
        const lastPt = room.locationTrail[room.locationTrail.length - 1];
        if (!lastPt || Math.abs(lastPt.lat - lat) > 0.00002 || Math.abs(lastPt.lon - lon) > 0.00002) {
          room.locationTrail.push({ lat, lon, ts: Date.now() });
          if (room.locationTrail.length > 40) room.locationTrail.shift();
        }
        room.updatedAt = Date.now();
      }
    }

    if (pkt.type === 'ring') {
      if (room.status !== 'connected') {
        room.status = 'ringing';
      }
      if (pkt.senderId && !room.callerSenderId) {
        room.callerSenderId = String(pkt.senderId);
      }
      if (!room.offer) {
        room.offer = { type: 'offer', sdp: '' };
      }
      room.updatedAt = Date.now();
    } else if (pkt.type === 'answer') {
      room.status = 'connected';
      if (!room.answer) {
        room.answer = { type: 'answer', sdp: '' };
      }
      room.updatedAt = Date.now();
    } else if (pkt.type === 'audio' && pkt.pcm16) {
      if (room.status === 'ended') {
        room.status = 'connected';
      } else if (
        room.status === 'ringing' &&
        (pkt.role === 'callee' || (room.callerSenderId && room.callerSenderId !== pkt.senderId))
      ) {
        room.status = 'connected';
      }
      room.audioChunks.push({
        seq: room.nextAudioSeq++,
        packetId: String(pkt.id),
        senderId: String(pkt.senderId || pkt.role || 'caller'),
        role: pkt.role === 'callee' ? 'callee' : 'caller',
        mimeType: 'audio/pcm;rate=8000',
        base64: '',
        pcm16: String(pkt.pcm16),
        sampleRate: Number(pkt.sampleRate) || 8000,
        timestamp: Date.now(),
      });
      if (room.audioChunks.length > 45) {
        room.audioChunks.splice(0, room.audioChunks.length - 45);
      }
      room.updatedAt = Date.now();
    }
  }

  function connectServerBridge() {
    if (typeof WebSocket === 'undefined') return;
    for (const url of BRIDGE_BROKERS) {
      const existing = bridgeSockets.get(url);
      if (
        existing &&
        (existing.readyState === WebSocket.OPEN || existing.readyState === WebSocket.CONNECTING)
      ) {
        continue;
      }
      try {
        const ws = new WebSocket(url, 'mqtt');
        ws.binaryType = 'arraybuffer';
        bridgeSockets.set(url, ws);

        ws.onopen = () => {
          try {
            const clientId = `${SERVER_NODE_ID}_${Math.random().toString(36).slice(2, 6)}`;
            const idBytes = textEncoder.encode(clientId);
            const varHdr = [0x00, 0x04, 0x4d, 0x51, 0x54, 0x54, 0x04, 0x02, 0x00, 0x3c];
            const pl = [(idBytes.length >> 8) & 0xff, idBytes.length & 0xff, ...Array.from(idBytes)];
            const rem = varHdr.length + pl.length;
            ws.send(new Uint8Array([0x10, ...mqttEncodeLen(rem), ...varHdr, ...pl]).buffer as ArrayBuffer);
          } catch (e) {}
        };

        ws.onmessage = (ev) => {
          if (!(ev.data instanceof ArrayBuffer)) return;
          const bytes = new Uint8Array(ev.data);
          let offset = 0;
          while (offset < bytes.length) {
            const b0 = bytes[offset];
            const pType = b0 & 0xf0;
            const { value: remLen, next } = mqttDecodeLen(bytes, offset + 1);
            if (remLen < 0 || next + remLen > bytes.length) break;
            const pEnd = next + remLen;

            if (pType === 0x20) {
              connectedBridgeBrokers.add(url);
              const tBytes = textEncoder.encode(SERVER_BRIDGE_TOPIC);
              const vh = [0x00, 0x01];
              const pl = [(tBytes.length >> 8) & 0xff, tBytes.length & 0xff, ...Array.from(tBytes), 0x00];
              ws.send(
                new Uint8Array([0x82, ...mqttEncodeLen(vh.length + pl.length), ...vh, ...pl])
                  .buffer as ArrayBuffer
              );
            } else if (pType === 0x30) {
              const qos = (b0 >> 1) & 0x03;
              const tLen = (bytes[next] << 8) | bytes[next + 1];
              let pStart = next + 2 + tLen + (qos > 0 ? 2 : 0);
              if (pStart <= pEnd) {
                try {
                  const str = textDecoder.decode(bytes.subarray(pStart, pEnd));
                  handleIncomingBridgePacket(JSON.parse(str));
                } catch (e) {}
              }
            }
            offset = pEnd;
          }
        };

        ws.onerror = () => connectedBridgeBrokers.delete(url);
        ws.onclose = () => {
          connectedBridgeBrokers.delete(url);
          bridgeSockets.delete(url);
        };
      } catch (e) {}
    }
  }

  connectServerBridge();
  setInterval(() => {
    connectServerBridge();
    const ping = new Uint8Array([0xc0, 0x00]).buffer as ArrayBuffer;
    for (const [url, ws] of bridgeSockets.entries()) {
      if (ws.readyState === WebSocket.OPEN && connectedBridgeBrokers.has(url)) {
        try {
          ws.send(ping);
        } catch (e) {}
      }
    }
  }, 15_000);

  // Clean up stale rooms older than 10 minutes
  setInterval(() => {
    const now = Date.now();
    for (const [key, room] of webrtcRooms.entries()) {
      if (now - room.updatedAt > 10 * 60 * 1000) {
        webrtcRooms.delete(key);
      }
    }
  }, 60_000);

  // GET /api/webrtc/room/:roomId — Poll universal dispatch room state
  app.get('/api/webrtc/room/:roomId', (_req, res) => {
    const room = webrtcRooms.get(GLOBAL_ROOM_ID);
    if (!room || room.status === 'ended') {
      return res.json({
        status: 'idle',
        roomId: GLOBAL_ROOM_ID,
        liveLocation: room?.liveLocation || null,
        locationTrail: room?.locationTrail || [],
      });
    }
    return res.json({
      roomId: GLOBAL_ROOM_ID,
      status: room.status,
      callerSenderId: room.callerSenderId,
      callerContext: room.callerContext,
      liveLocation: room.liveLocation,
      locationTrail: room.locationTrail,
      offer: room.offer,
      answer: room.answer,
      callerCandidates: room.callerCandidates,
      calleeCandidates: room.calleeCandidates,
      latestAudioSeq: room.nextAudioSeq - 1,
      updatedAt: room.updatedAt,
    });
  });

  // POST /api/webrtc/offer — Caller posts WebRTC SDP Offer + initial GPS coordinates
  app.post('/api/webrtc/offer', (req, res) => {
    const { offer, callerContext, senderId } = req.body || {};
    const existing = webrtcRooms.get(GLOBAL_ROOM_ID);
    const lat = Number(callerContext?.latitude) || existing?.liveLocation?.latitude || 37.7749;
    const lon = Number(callerContext?.longitude) || existing?.liveLocation?.longitude || -122.4194;
    const initialLoc: LiveLocationPayload = {
      latitude: lat,
      longitude: lon,
      accuracy: Number(callerContext?.accuracy) || 12,
      speedKmh: Number(callerContext?.speedKmh) || 0,
      impactG: Number(callerContext?.impactG) || 4.2,
      knockCount: Number(callerContext?.knockCount) || 4,
      unitNumber: callerContext?.unitNumber || 'AUTO-101',
      driverId: callerContext?.driverId || 'DRV-8841',
      reason: callerContext?.reason || 'CRASH',
      updatedAt: Date.now(),
    };

    const room: WebRtcRoom = {
      roomId: GLOBAL_ROOM_ID,
      status: 'ringing',
      callerSenderId: String(senderId || ''),
      callerContext: callerContext || {},
      liveLocation: initialLoc,
      locationTrail: existing?.locationTrail?.length
        ? [...existing.locationTrail, { lat, lon, ts: Date.now() }].slice(-40)
        : [{ lat, lon, ts: Date.now() }],
      offer: offer || { type: 'offer', sdp: '' },
      answer: null,
      callerCandidates: [],
      calleeCandidates: [],
      audioChunks: [],
      nextAudioSeq: 1,
      updatedAt: Date.now(),
    };
    webrtcRooms.set(GLOBAL_ROOM_ID, room);

    publishToServerBridge({
      type: 'ring',
      senderId: String(senderId || 'caller'),
      role: 'caller',
      location: initialLoc,
    });

    return res.json({ ok: true, room });
  });

  // POST /api/webrtc/answer — Callee (Laptop or Phone) posts WebRTC SDP Answer
  app.post('/api/webrtc/answer', (req, res) => {
    const { answer, senderId } = req.body || {};
    const room = getOrCreateGlobalRoom();
    room.answer = answer || { type: 'answer', sdp: '' };
    room.status = 'connected';
    room.updatedAt = Date.now();

    publishToServerBridge({
      type: 'answer',
      senderId: String(senderId || 'callee'),
      role: 'callee',
    });

    return res.json({ ok: true, room });
  });

  // POST /api/webrtc/candidate — Exchange ICE candidates between Phone and Laptop
  app.post('/api/webrtc/candidate', (req, res) => {
    const { role, candidate } = req.body || {};
    const room = webrtcRooms.get(GLOBAL_ROOM_ID);
    if (!room || !candidate) {
      return res.status(404).json({ error: 'Room or candidate not found' });
    }
    if (role === 'caller') {
      room.callerCandidates.push(candidate);
    } else {
      room.calleeCandidates.push(candidate);
    }
    room.updatedAt = Date.now();
    return res.json({ ok: true });
  });

  // POST /api/webrtc/location — Phone streams its real-time GPS coordinates to Laptop Control Room
  app.post('/api/webrtc/location', (req, res) => {
    const {
      latitude,
      longitude,
      accuracy,
      speedKmh,
      heading,
      impactG,
      knockCount,
      unitNumber,
      driverId,
      reason,
      senderId,
    } = req.body || {};
    const room = getOrCreateGlobalRoom();
    const lat = Number(latitude);
    const lon = Number(longitude);
    if (!isNaN(lat) && !isNaN(lon) && (lat !== 0 || lon !== 0)) {
      room.liveLocation = {
        latitude: lat,
        longitude: lon,
        accuracy: accuracy !== undefined ? Number(accuracy) : room.liveLocation?.accuracy,
        speedKmh: speedKmh !== undefined ? Number(speedKmh) : room.liveLocation?.speedKmh,
        heading: heading !== undefined ? Number(heading) : room.liveLocation?.heading,
        impactG: impactG !== undefined ? Number(impactG) : room.liveLocation?.impactG,
        knockCount: knockCount !== undefined ? Number(knockCount) : room.liveLocation?.knockCount,
        unitNumber: unitNumber || room.liveLocation?.unitNumber || 'AUTO-101',
        driverId: driverId || room.liveLocation?.driverId || 'DRV-8841',
        reason: reason || room.liveLocation?.reason || 'LIVE-GPS',
        updatedAt: Date.now(),
      };
      const lastPt = room.locationTrail[room.locationTrail.length - 1];
      if (!lastPt || Math.abs(lastPt.lat - lat) > 0.00002 || Math.abs(lastPt.lon - lon) > 0.00002) {
        room.locationTrail.push({ lat, lon, ts: Date.now() });
        if (room.locationTrail.length > 40) {
          room.locationTrail.shift();
        }
      }
      room.updatedAt = Date.now();

      publishToServerBridge({
        type: 'gps',
        senderId: String(senderId || 'caller'),
        role: 'caller',
        location: room.liveLocation,
      });
    }
    return res.json({ ok: true, liveLocation: room.liveLocation });
  });

  // POST /api/webrtc/audio — Server-side live PCM16 voice audio relay across 2 IPs
  app.post('/api/webrtc/audio', (req, res) => {
    const { packetId, senderId, role, mimeType, base64, pcm16, sampleRate } = req.body || {};
    const payloadData = pcm16 || base64;
    if (!payloadData) {
      return res.status(400).json({ error: 'Audio data missing' });
    }
    const cleanSenderId = String(senderId || role || 'caller');
    const cleanPacketId =
      String(packetId || '') ||
      `${cleanSenderId}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;

    const room = getOrCreateGlobalRoom();
    if (room.status === 'ended') {
      room.status = 'connected';
      room.callerSenderId = cleanSenderId;
    } else if (
      (role === 'callee' || (room.callerSenderId && room.callerSenderId !== cleanSenderId)) &&
      room.status === 'ringing'
    ) {
      room.status = 'connected';
    }

    if (!rememberPacketId(cleanPacketId)) {
      room.audioChunks.push({
        seq: room.nextAudioSeq++,
        packetId: cleanPacketId,
        senderId: cleanSenderId,
        role: role === 'callee' ? 'callee' : 'caller',
        mimeType: mimeType || 'audio/pcm;rate=8000',
        base64: base64 || '',
        pcm16: pcm16 || '',
        sampleRate: Number(sampleRate) || 8000,
        timestamp: Date.now(),
      });
      if (room.audioChunks.length > 45) {
        room.audioChunks.splice(0, room.audioChunks.length - 45);
      }
      room.updatedAt = Date.now();

      if (pcm16) {
        publishToServerBridge({
          id: cleanPacketId,
          type: 'audio',
          senderId: cleanSenderId,
          role: role === 'callee' ? 'callee' : 'caller',
          pcm16,
          sampleRate: Number(sampleRate) || 8000,
        });
      }
    }

    return res.json({ ok: true, seq: room.nextAudioSeq - 1, status: room.status });
  });

  // GET /api/webrtc/audio/:roomId/:listenRole — Fetch new audio chunks from any other senderId
  app.get('/api/webrtc/audio/:roomId/:listenRole', (req, res) => {
    const listenRole = req.params.listenRole === 'callee' ? 'callee' : 'caller';
    const mySenderId = String(req.query.senderId || '');
    const afterSeq = Number(req.query.after || 0);
    const room = webrtcRooms.get(GLOBAL_ROOM_ID);
    if (!room || room.status === 'ended') {
      return res.json({ chunks: [], status: 'idle', latestSeq: 0 });
    }
    const targetSenderRole = listenRole === 'caller' ? 'callee' : 'caller';
    const chunks = room.audioChunks.filter((c) => {
      if (c.seq <= afterSeq) return false;
      if (mySenderId && c.senderId) {
        return c.senderId !== mySenderId;
      }
      return c.role === targetSenderRole;
    });
    return res.json({
      chunks,
      status: room.status,
      latestSeq: room.nextAudioSeq - 1,
    });
  });

  // POST /api/webrtc/hangup — End the active call in the global dispatch room
  app.post('/api/webrtc/hangup', (req, res) => {
    const { senderId } = req.body || {};
    webrtcRooms.delete(GLOBAL_ROOM_ID);
    seenBridgePacketIds.clear();
    publishToServerBridge({
      type: 'hangup',
      senderId: String(senderId || 'caller'),
      role: 'caller',
    });
    return res.json({ ok: true, status: 'idle' });
  });

  // POST /api/voice-call-agent
  // Invokes Gemini with `place_immediate_call` FunctionDeclaration and returns the structured functionCall JSON
  app.post('/api/voice-call-agent', async (req, res) => {
    const { prompt, defaultEmergencyNumber = '82199', customContacts = {} } = req.body || {};
    const userUtterance = typeof prompt === 'string' && prompt.trim() ? prompt.trim() : `Call ${defaultEmergencyNumber} immediately.`;

    let extractedTarget: string | null = null;
    let modelUsed = 'gemini-3.8-flash';

    if (process.env.GEMINI_API_KEY) {
      try {
        const ai = new GoogleGenAI({
          apiKey: process.env.GEMINI_API_KEY,
          httpOptions: {
            headers: {
              'User-Agent': 'aistudio-build',
            },
          },
        });

        const response = await ai.models.generateContent({
          model: 'gemini-3.8-flash',
          contents: userUtterance,
          config: {
            systemInstruction: HANDS_FREE_SYSTEM_INSTRUCTION,
            tools: [{ functionDeclarations: [placeImmediateCallDeclaration] }],
            toolConfig: {
              functionCallingConfig: {
                mode: FunctionCallingConfigMode.ANY,
                allowedFunctionNames: ['place_immediate_call'],
              },
            },
          },
        });

        const fnCall = response.functionCalls?.[0];
        if (fnCall && fnCall.name === 'place_immediate_call' && fnCall.args) {
          const argTarget = (fnCall.args as Record<string, any>).target;
          if (typeof argTarget === 'string' && argTarget.trim()) {
            extractedTarget = argTarget.trim();
          }
        }
      } catch (err: any) {
        console.warn('Gemini function calling fallback triggered:', err?.message || err);
        modelUsed = 'gemini-3.8-flash (offline-failsafe)';
      }
    } else {
      modelUsed = 'gemini-3.8-flash (local-failsafe)';
    }

    if (!extractedTarget) {
      extractedTarget = fallbackExtractTargetFromSpeech(userUtterance, defaultEmergencyNumber);
    }

    // Merge any custom contacts from client
    const resolved = resolveContactTarget(extractedTarget, defaultEmergencyNumber);
    if (
      customContacts &&
      typeof customContacts === 'object' &&
      customContacts[extractedTarget.toLowerCase()]
    ) {
      resolved.resolvedNumber = String(customContacts[extractedTarget.toLowerCase()]);
    }

    const structuredOutput = {
      functionCall: {
        name: 'place_immediate_call',
        args: {
          target: resolved.target,
        },
      },
      resolvedPhoneNumber: resolved.resolvedNumber,
      contactName: resolved.contactName,
      androidIntentJava: `startActivity(new Intent(Intent.ACTION_CALL, Uri.parse("tel:${resolved.resolvedNumber}")));`,
      model: modelUsed,
      systemInstruction: HANDS_FREE_SYSTEM_INSTRUCTION,
      toolSchema: placeImmediateCallDeclaration,
    };

    res.json(structuredOutput);
  });

  const distPath = path.join(__dirname, 'dist');
  const distIndex = path.join(distPath, 'index.html');

  if (fs.existsSync(distIndex)) {
    app.use(
      express.static(distPath, {
        etag: true,
        maxAge: 0,
        setHeaders: (res, filePath) => {
          if (filePath.endsWith('.html')) {
            res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
          }
        },
      })
    );
    app.get('*', (_req, res) => {
      res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
      res.sendFile(distIndex);
    });
  } else {
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        hmr: false,
        watch: null,
      },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`DriveLock Server + Hands-Free Voice Call Agent running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
