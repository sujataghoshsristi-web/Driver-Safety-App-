/**
 * Global Cross-IP Real-Time Voice, Signaling & GPS Bus (MQTT-over-WSS)
 *
 * Connects Phone (IP #1, Mobile Data / Wi-Fi / APK / ais-pre) and Laptop (IP #2, Wi-Fi / ais-dev / ais-pre)
 * directly over secure WebSockets (port 443 / 8084 / 8884) so 2-way voice and live GPS work instantly
 * even when Phone and Laptop are on different networks, different IPs, or different app URLs.
 */

export interface CrossIpBusPacket {
  id: string;
  type: 'ring' | 'answer' | 'hangup' | 'audio' | 'gps' | 'ping';
  roomId: string;
  senderId: string;
  role: 'caller' | 'callee';
  pcm16?: string;
  sampleRate?: number;
  location?: {
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
  };
  ts: number;
}

type PacketHandler = (packet: CrossIpBusPacket) => void;

const GLOBAL_ROOM_ID = 'DRIVELOCK_DISPATCH';
const GLOBAL_TOPIC = `drivelock_v2_voice_room/${GLOBAL_ROOM_ID}`;

const WSS_BROKERS = [
  'wss://broker.emqx.io:8084/mqtt',
  'wss://test.mosquitto.org:8081',
];

function encodeRemainingLength(len: number): number[] {
  const out: number[] = [];
  let x = len;
  do {
    let encodedByte = x % 128;
    x = Math.floor(x / 128);
    if (x > 0) {
      encodedByte |= 128;
    }
    out.push(encodedByte);
  } while (x > 0);
  return out;
}

function decodeRemainingLength(
  bytes: Uint8Array,
  startOffset: number
): { value: number; nextOffset: number } {
  let multiplier = 1;
  let value = 0;
  let idx = startOffset;
  let encodedByte = 0;
  do {
    if (idx >= bytes.length) {
      return { value: -1, nextOffset: bytes.length };
    }
    encodedByte = bytes[idx++];
    value += (encodedByte & 127) * multiplier;
    multiplier *= 128;
  } while ((encodedByte & 128) !== 0);
  return { value, nextOffset: idx };
}

function buildMqttConnectPacket(clientId: string): ArrayBuffer {
  const encoder = new TextEncoder();
  const idBytes = encoder.encode(clientId);
  const varHeader = [0x00, 0x04, 0x4d, 0x51, 0x54, 0x54, 0x04, 0x02, 0x00, 0x3c];
  const payload = [
    (idBytes.length >> 8) & 0xff,
    idBytes.length & 0xff,
    ...Array.from(idBytes),
  ];
  const remLen = varHeader.length + payload.length;
  return new Uint8Array([0x10, ...encodeRemainingLength(remLen), ...varHeader, ...payload])
    .buffer as ArrayBuffer;
}

function buildMqttSubscribePacket(topic: string, packetId: number = 1): ArrayBuffer {
  const encoder = new TextEncoder();
  const topicBytes = encoder.encode(topic);
  const varHeader = [(packetId >> 8) & 0xff, packetId & 0xff];
  const payload = [
    (topicBytes.length >> 8) & 0xff,
    topicBytes.length & 0xff,
    ...Array.from(topicBytes),
    0x00, // QoS 0
  ];
  const remLen = varHeader.length + payload.length;
  return new Uint8Array([0x82, ...encodeRemainingLength(remLen), ...varHeader, ...payload])
    .buffer as ArrayBuffer;
}

function buildMqttPublishPacket(topic: string, jsonString: string): ArrayBuffer {
  const encoder = new TextEncoder();
  const topicBytes = encoder.encode(topic);
  const payloadBytes = encoder.encode(jsonString);
  const remLen = 2 + topicBytes.length + payloadBytes.length;
  const remLenBytes = encodeRemainingLength(remLen);
  const out = new Uint8Array(1 + remLenBytes.length + remLen);
  let offset = 0;
  out[offset++] = 0x30; // PUBLISH QoS 0
  for (const b of remLenBytes) {
    out[offset++] = b;
  }
  out[offset++] = (topicBytes.length >> 8) & 0xff;
  out[offset++] = topicBytes.length & 0xff;
  out.set(topicBytes, offset);
  offset += topicBytes.length;
  out.set(payloadBytes, offset);
  return out.buffer as ArrayBuffer;
}

class CrossIpVoiceBus {
  private sockets: Map<string, WebSocket> = new Map();
  private connectedBrokers: Set<string> = new Set();
  private handlers: Set<PacketHandler> = new Set();
  private seenPacketIds: Set<string> = new Set();
  private readonly senderId: string;
  private keepAliveTimer: number | null = null;
  private reconnectTimer: number | null = null;
  private decoder = new TextDecoder();

  constructor() {
    let savedId = '';
    if (typeof window !== 'undefined') {
      try {
        savedId = window.localStorage.getItem('drivelock_device_sender_id') || '';
        if (!savedId) {
          savedId = `dl_${Math.random().toString(36).slice(2, 10)}_${Date.now().toString(36)}`;
          window.localStorage.setItem('drivelock_device_sender_id', savedId);
        }
      } catch (e) {}
    }
    this.senderId =
      savedId || `dl_${Math.random().toString(36).slice(2, 10)}_${Date.now().toString(36)}`;
    if (typeof window !== 'undefined') {
      this.connectAll();
      this.keepAliveTimer = window.setInterval(() => {
        this.sendPingToBrokers();
      }, 20000);
      this.reconnectTimer = window.setInterval(() => {
        if (this.connectedBrokers.size < WSS_BROKERS.length) {
          this.connectAll();
        }
      }, 5000);
    }
  }

  public getSenderId(): string {
    return this.senderId;
  }

  public isConnected(): boolean {
    return this.connectedBrokers.size > 0;
  }

  public setRoomId(_roomId: string) {
    // All devices share GLOBAL_TOPIC ('drivelock_v2_voice_room/DRIVELOCK_DISPATCH')
  }

  private connectAll() {
    if (typeof WebSocket === 'undefined') return;
    for (const brokerUrl of WSS_BROKERS) {
      const existing = this.sockets.get(brokerUrl);
      if (
        existing &&
        (existing.readyState === WebSocket.OPEN || existing.readyState === WebSocket.CONNECTING)
      ) {
        continue;
      }
      this.connectBroker(brokerUrl);
    }
  }

  private connectBroker(brokerUrl: string) {
    try {
      const ws = new WebSocket(brokerUrl, 'mqtt');
      ws.binaryType = 'arraybuffer';
      this.sockets.set(brokerUrl, ws);

      ws.onopen = () => {
        try {
          const clientId = `${this.senderId}_${Math.random().toString(36).slice(2, 6)}`;
          ws.send(buildMqttConnectPacket(clientId));
        } catch (e) {}
      };

      ws.onmessage = (event) => {
        if (!(event.data instanceof ArrayBuffer)) return;
        const bytes = new Uint8Array(event.data);
        let offset = 0;

        while (offset < bytes.length) {
          const firstByte = bytes[offset];
          const packetType = firstByte & 0xf0;
          const { value: remLen, nextOffset } = decodeRemainingLength(bytes, offset + 1);
          if (remLen < 0 || nextOffset + remLen > bytes.length) {
            break;
          }
          const packetEnd = nextOffset + remLen;

          if (packetType === 0x20) {
            // CONNACK -> subscribe to universal dispatch topic
            this.connectedBrokers.add(brokerUrl);
            try {
              ws.send(buildMqttSubscribePacket(GLOBAL_TOPIC, 1));
            } catch (e) {}
          } else if (packetType === 0x30) {
            // PUBLISH
            const qos = (firstByte >> 1) & 0x03;
            const topicLen = (bytes[nextOffset] << 8) | bytes[nextOffset + 1];
            let payloadStart = nextOffset + 2 + topicLen;
            if (qos > 0) {
              payloadStart += 2;
            }
            if (payloadStart <= packetEnd) {
              try {
                const jsonStr = this.decoder.decode(bytes.subarray(payloadStart, packetEnd));
                const parsed = JSON.parse(jsonStr) as CrossIpBusPacket;
                this.handleIncomingPacket(parsed);
              } catch (e) {}
            }
          }

          offset = packetEnd;
        }
      };

      ws.onerror = () => {
        this.connectedBrokers.delete(brokerUrl);
      };

      ws.onclose = () => {
        this.connectedBrokers.delete(brokerUrl);
        this.sockets.delete(brokerUrl);
      };
    } catch (e) {}
  }

  private sendPingToBrokers() {
    const ping = new Uint8Array([0xc0, 0x00]).buffer as ArrayBuffer;
    for (const [url, ws] of this.sockets.entries()) {
      if (ws.readyState === WebSocket.OPEN && this.connectedBrokers.has(url)) {
        try {
          ws.send(ping);
        } catch (e) {}
      }
    }
  }

  private handleIncomingPacket(packet: CrossIpBusPacket) {
    if (!packet || !packet.id || packet.senderId === this.senderId) return;
    if (this.seenPacketIds.has(packet.id)) return;
    this.seenPacketIds.add(packet.id);
    if (this.seenPacketIds.size > 500) {
      const first = this.seenPacketIds.values().next().value;
      if (first) this.seenPacketIds.delete(first);
    }
    this.handlers.forEach((fn) => fn(packet));
  }

  public publish(
    partial: Omit<CrossIpBusPacket, 'id' | 'senderId' | 'ts' | 'roomId'> & {
      id?: string;
      roomId?: string;
    }
  ): string {
    const packetId =
      partial.id || `${this.senderId}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    this.seenPacketIds.add(packetId);

    const packet: CrossIpBusPacket = {
      ...partial,
      roomId: GLOBAL_ROOM_ID,
      id: packetId,
      senderId: this.senderId,
      ts: Date.now(),
    };

    const mqttBytes = buildMqttPublishPacket(GLOBAL_TOPIC, JSON.stringify(packet));

    for (const [url, ws] of this.sockets.entries()) {
      if (ws.readyState === WebSocket.OPEN && this.connectedBrokers.has(url)) {
        try {
          ws.send(mqttBytes);
        } catch (e) {}
      }
    }
    return packetId;
  }

  public subscribe(handler: PacketHandler): () => void {
    this.handlers.add(handler);
    return () => {
      this.handlers.delete(handler);
    };
  }
}

export const crossIpVoiceBus = new CrossIpVoiceBus();
