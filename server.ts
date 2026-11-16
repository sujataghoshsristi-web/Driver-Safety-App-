import express from 'express';
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

  app.use(express.json());

  // ============================================================================
  // REAL TWO-WAY WEBRTC VOICE CALL SIGNALING SERVER (Driver <-> Other Person)
  // ============================================================================
  interface WebRtcRoom {
    roomId: string;
    status: 'ringing' | 'connected' | 'ended';
    callerContext?: Record<string, any>;
    offer: RTCSessionDescriptionInit | null;
    answer: RTCSessionDescriptionInit | null;
    callerCandidates: RTCIceCandidateInit[];
    calleeCandidates: RTCIceCandidateInit[];
    updatedAt: number;
  }

  const webrtcRooms = new Map<string, WebRtcRoom>();

  // Clean up stale rooms older than 10 minutes
  setInterval(() => {
    const now = Date.now();
    for (const [key, room] of webrtcRooms.entries()) {
      if (now - room.updatedAt > 10 * 60 * 1000) {
        webrtcRooms.delete(key);
      }
    }
  }, 60_000);

  // GET /api/webrtc/room/:roomId — Poll room state (offer, answer, ICE candidates, status)
  app.get('/api/webrtc/room/:roomId', (req, res) => {
    const roomId = (req.params.roomId || '82199').replace(/[^0-9+*#a-zA-Z_-]/g, '') || '82199';
    const room = webrtcRooms.get(roomId);
    if (!room) {
      return res.json({ status: 'idle', roomId });
    }
    return res.json(room);
  });

  // POST /api/webrtc/offer — Caller (Driver Cab) posts WebRTC SDP Offer to start a real 2-way voice call
  app.post('/api/webrtc/offer', (req, res) => {
    const { roomId: rawRoomId, offer, callerContext } = req.body || {};
    const roomId = String(rawRoomId || '82199').replace(/[^0-9+*#a-zA-Z_-]/g, '') || '82199';
    if (!offer) {
      return res.status(400).json({ error: 'Missing WebRTC offer' });
    }
    const room: WebRtcRoom = {
      roomId,
      status: 'ringing',
      callerContext: callerContext || {},
      offer,
      answer: null,
      callerCandidates: [],
      calleeCandidates: [],
      updatedAt: Date.now(),
    };
    webrtcRooms.set(roomId, room);
    return res.json({ ok: true, room });
  });

  // POST /api/webrtc/answer — Callee (Other Person / Receiver) posts WebRTC SDP Answer
  app.post('/api/webrtc/answer', (req, res) => {
    const { roomId: rawRoomId, answer } = req.body || {};
    const roomId = String(rawRoomId || '82199').replace(/[^0-9+*#a-zA-Z_-]/g, '') || '82199';
    const room = webrtcRooms.get(roomId);
    if (!room) {
      return res.status(404).json({ error: 'Call room not found' });
    }
    room.answer = answer;
    room.status = 'connected';
    room.updatedAt = Date.now();
    return res.json({ ok: true, room });
  });

  // POST /api/webrtc/candidate — Exchange ICE candidates between Caller and Callee
  app.post('/api/webrtc/candidate', (req, res) => {
    const { roomId: rawRoomId, role, candidate } = req.body || {};
    const roomId = String(rawRoomId || '82199').replace(/[^0-9+*#a-zA-Z_-]/g, '') || '82199';
    const room = webrtcRooms.get(roomId);
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

  // POST /api/webrtc/hangup — End the active call in a room
  app.post('/api/webrtc/hangup', (req, res) => {
    const { roomId: rawRoomId } = req.body || {};
    const roomId = String(rawRoomId || '82199').replace(/[^0-9+*#a-zA-Z_-]/g, '') || '82199';
    webrtcRooms.delete(roomId);
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

  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`DriveLock Server + Hands-Free Voice Call Agent running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
