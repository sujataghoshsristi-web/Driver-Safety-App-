/**
 * ESP32 & NodeMCU (ESP8266) In-Cab Hardware Sensor Integration
 * Supports:
 * 1. Web Serial API (USB-OTG cable from ESP32/NodeMCU to phone/tablet)
 * 2. Web Bluetooth API (BLE UART on ESP32)
 * 3. Local Wi-Fi WebSocket (In-Cab Hotspot / Access Point)
 * 4. Interactive Live Test Stream & Custom Payload Injector
 */

import { EspSensorPacket, EspConnectionType, EspDeviceType } from '../types/telemetry';

export type PacketCallback = (packet: EspSensorPacket, rawLine: string) => void;
export type StatusCallback = (connected: boolean, message: string) => void;

class EspHardwareManager {
  private serialPort: any = null;
  private serialReader: any = null;
  private bleDevice: any = null;
  private bleCharacteristic: any = null;
  private webSocket: WebSocket | null = null;
  private simulationInterval: number | null = null;

  public isConnected: boolean = false;
  public connectionType: EspConnectionType | null = null;
  public deviceType: EspDeviceType = 'esp32';

  private onPacketListeners: PacketCallback[] = [];
  private onStatusListeners: StatusCallback[] = [];

  public subscribePacket(cb: PacketCallback) {
    this.onPacketListeners.push(cb);
    return () => {
      this.onPacketListeners = this.onPacketListeners.filter((l) => l !== cb);
    };
  }

  public subscribeStatus(cb: StatusCallback) {
    this.onStatusListeners.push(cb);
    return () => {
      this.onStatusListeners = this.onStatusListeners.filter((l) => l !== cb);
    };
  }

  private notifyStatus(connected: boolean, message: string) {
    this.isConnected = connected;
    this.onStatusListeners.forEach((cb) => cb(connected, message));
  }

  private notifyPacket(packet: EspSensorPacket, rawLine: string) {
    this.onPacketListeners.forEach((cb) => cb(packet, rawLine));
  }

  /**
   * Parse incoming string packet from ESP32 or NodeMCU.
   * Handles JSON strings: {"dock":1,"bac":0.00,"rpm":1650,...}
   * or key-value CSV strings: DOCK:1,BAC:0.00,RPM:1650,...
   */
  public parseIncomingLine(line: string): EspSensorPacket | null {
    const trimmed = line.trim();
    if (!trimmed) return null;

    // Try parsing as JSON first
    if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
      try {
        const obj = JSON.parse(trimmed);
        const dockVal = obj.dock !== undefined ? Boolean(obj.dock) : Boolean(obj.d);
        const bacVal = Number(obj.bac ?? obj.b ?? 0);
        const gasVal = obj.gas !== undefined ? Number(obj.gas) : obj.gasPpm !== undefined ? Number(obj.gasPpm) : obj.co !== undefined ? Number(obj.co) : undefined;
        const rawGasVal = obj.rawGasAdc !== undefined ? Number(obj.rawGasAdc) : obj.gasAdc !== undefined ? Number(obj.gasAdc) : undefined;
        return {
          dock: dockVal,
          bac: isNaN(bacVal) ? 0 : bacVal,
          rawAdc: obj.adc ?? obj.rawAdc ?? (bacVal > 0 ? 1200 : 180),
          gasPpm: gasVal !== undefined && !isNaN(gasVal) ? Math.max(0, gasVal) : undefined,
          rawGasAdc: rawGasVal,
          speed: obj.speed ?? obj.spd ?? obj.s,
          rpm: obj.rpm ?? obj.r,
          gx: obj.gx ?? obj.x,
          gy: obj.gy ?? obj.y,
          gz: obj.gz ?? obj.z,
          volt: obj.volt ?? obj.v,
          relayState: obj.relay ?? obj.rly,
          timestamp: new Date().toLocaleTimeString(),
        };
      } catch {
        // Fallback to CSV
      }
    }

    // Try parsing key-value CSV format: "DOCK:1,BAC:0.00,GAS:24,RPM:1500"
    if (trimmed.includes(':') && (trimmed.includes(',') || !trimmed.includes('{'))) {
      const parts = trimmed.split(',');
      const result: Partial<EspSensorPacket> = {};
      for (const part of parts) {
        const [k, v] = part.split(':').map((s) => s.trim().toUpperCase());
        if (k && v !== undefined) {
          if (k === 'DOCK' || k === 'D') result.dock = v === '1' || v === 'TRUE';
          if (k === 'BAC' || k === 'B') result.bac = parseFloat(v);
          if (k === 'ADC') result.rawAdc = parseInt(v, 10);
          if (k === 'GAS' || k === 'CO' || k === 'G') result.gasPpm = parseFloat(v);
          if (k === 'GASADC' || k === 'GADC') result.rawGasAdc = parseInt(v, 10);
          if (k === 'SPD' || k === 'SPEED') result.speed = parseFloat(v);
          if (k === 'RPM') result.rpm = parseInt(v, 10);
          if (k === 'GX') result.gx = parseFloat(v);
          if (k === 'GY') result.gy = parseFloat(v);
          if (k === 'GZ') result.gz = parseFloat(v);
          if (k === 'VOLT' || k === 'V') result.volt = parseFloat(v);
          if (k === 'RELAY' || k === 'RLY') result.relayState = v === '1';
        }
      }
      if (result.dock !== undefined || result.bac !== undefined || result.gasPpm !== undefined) {
        return {
          dock: result.dock ?? false,
          bac: result.bac ?? 0,
          rawAdc: result.rawAdc ?? 180,
          gasPpm: result.gasPpm,
          rawGasAdc: result.rawGasAdc,
          speed: result.speed,
          rpm: result.rpm,
          gx: result.gx,
          gy: result.gy,
          gz: result.gz,
          volt: result.volt,
          relayState: result.relayState,
          timestamp: new Date().toLocaleTimeString(),
        };
      }
    }

    return null;
  }

  /**
   * 1. Connect via Web Serial API (USB-OTG Cable)
   */
  public async connectSerial(baudRate = 115200): Promise<boolean> {
    if (!('serial' in navigator)) {
      throw new Error('Web Serial API is not supported in this browser. Please use Chrome, Edge, or Android Chrome.');
    }

    try {
      this.disconnect();
      const serial = (navigator as any).serial;
      this.serialPort = await serial.requestPort();
      await this.serialPort.open({ baudRate });

      this.connectionType = 'serial';
      this.notifyStatus(true, `Connected to USB Serial port at ${baudRate} baud`);

      this.startSerialReadLoop();
      return true;
    } catch (err: any) {
      this.notifyStatus(false, err.message || 'Serial connection cancelled or failed');
      return false;
    }
  }

  private async startSerialReadLoop() {
    try {
      const textDecoder = new TextDecoderStream();
      const readableStreamClosed = this.serialPort.readable.pipeTo(textDecoder.writable);
      const reader = textDecoder.readable.getReader();
      this.serialReader = reader;

      let buffer = '';
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        if (value) {
          buffer += value;
          const lines = buffer.split('\n');
          buffer = lines.pop() || '';
          for (const line of lines) {
            const parsed = this.parseIncomingLine(line);
            if (parsed) {
              this.notifyPacket(parsed, line);
            }
          }
        }
      }
    } catch (e: any) {
      if (this.isConnected) {
        this.notifyStatus(false, `Serial disconnected: ${e.message}`);
      }
    }
  }

  /**
   * 2. Connect via Web Bluetooth (BLE UART on ESP32)
   */
  public async connectBle(): Promise<boolean> {
    if (!('bluetooth' in navigator)) {
      throw new Error('Web Bluetooth is not supported on this browser or platform.');
    }

    try {
      this.disconnect();
      const bluetooth = (navigator as any).bluetooth;
      this.bleDevice = await bluetooth.requestDevice({
        filters: [{ namePrefix: 'ESP32' }, { namePrefix: 'DriveLock' }, { namePrefix: 'NODEMCU' }],
        optionalServices: [
          '6e400001-b5a3-f393-e0a9-e50e24dcca9e', // Nordic UART Service UUID
          '4fafc201-1fb5-459e-8fcc-c5c9c331914b', // Custom ESP32 telemetry UUID
        ],
      });

      const server = await this.bleDevice.gatt.connect();
      // Try to find UART service
      let service: any;
      try {
        service = await server.getPrimaryService('6e400001-b5a3-f393-e0a9-e50e24dcca9e');
      } catch {
        service = await server.getPrimaryService('4fafc201-1fb5-459e-8fcc-c5c9c331914b');
      }

      // TX characteristic (device to browser)
      const rxChar = await service.getCharacteristic('6e400003-b5a3-f393-e0a9-e50e24dcca9e');
      await rxChar.startNotifications();
      rxChar.addEventListener('characteristicvaluechanged', (event: any) => {
        const value = event.target.value;
        const decoder = new TextDecoder('utf-8');
        const str = decoder.decode(value);
        const parsed = this.parseIncomingLine(str);
        if (parsed) {
          this.notifyPacket(parsed, str);
        }
      });

      this.connectionType = 'ble';
      this.notifyStatus(true, `Connected via BLE to ${this.bleDevice.name || 'ESP32'}`);
      return true;
    } catch (err: any) {
      this.notifyStatus(false, err.message || 'BLE connection failed');
      return false;
    }
  }

  /**
   * 3. Connect via Local Wi-Fi WebSocket (ESP32 / NodeMCU In-Cab AP)
   */
  public connectWifi(ip = '192.168.4.1', port = 81): boolean {
    this.disconnect();
    try {
      const url = `ws://${ip}:${port}`;
      this.webSocket = new WebSocket(url);

      this.webSocket.onopen = () => {
        this.connectionType = 'wifi';
        this.notifyStatus(true, `Connected to ESP Wi-Fi WebSocket at ${url}`);
      };

      this.webSocket.onmessage = (event) => {
        const parsed = this.parseIncomingLine(event.data);
        if (parsed) {
          this.notifyPacket(parsed, event.data);
        }
      };

      this.webSocket.onerror = () => {
        this.notifyStatus(false, `WebSocket connection to ${url} failed. Check IP & Wi-Fi.`);
      };

      this.webSocket.onclose = () => {
        if (this.isConnected) {
          this.notifyStatus(false, 'ESP Wi-Fi WebSocket disconnected');
        }
      };

      return true;
    } catch (err: any) {
      this.notifyStatus(false, err.message || 'Wi-Fi connection error');
      return false;
    }
  }

  /**
   * 4. Simulated / Test Hardware Stream (for development without physical board plugged in)
   */
  public startSimulatedStream(deviceType: EspDeviceType = 'esp32') {
    this.disconnect();
    this.connectionType = 'simulated';
    this.deviceType = deviceType;
    this.notifyStatus(true, `Virtual ${deviceType.toUpperCase()} Stream Connected`);

    let tick = 0;
    this.simulationInterval = window.setInterval(() => {
      tick++;
      // Generate packet with slight variations
      const rawPacket: EspSensorPacket = {
        dock: true,
        bac: 0.00,
        rawAdc: 175 + Math.round(Math.random() * 15),
        gasPpm: 22 + Math.round(Math.random() * 8), // Standard safe CO/gas ppm (ambient < 30 PPM)
        rawGasAdc: 240 + Math.round(Math.random() * 25),
        speed: 40 + Math.round(Math.sin(tick / 5) * 6),
        rpm: 1600 + Math.round(Math.sin(tick / 5) * 150),
        gx: Number(((Math.random() - 0.5) * 0.06).toFixed(2)),
        gy: Number(((Math.random() - 0.5) * 0.04).toFixed(2)),
        gz: Number((1.01 + Math.random() * 0.04).toFixed(2)),
        volt: Number((13.8 + (Math.random() - 0.5) * 0.1).toFixed(2)),
        relayState: true,
        timestamp: new Date().toLocaleTimeString(),
      };

      const rawJson = JSON.stringify(rawPacket);
      this.notifyPacket(rawPacket, rawJson);
    }, 400);
  }

  /**
   * Send control command back to ESP32 / NodeMCU (e.g. to open/close physical relay or calibrate)
   */
  public async sendCommand(command: string): Promise<boolean> {
    const formatted = command.endsWith('\n') ? command : `${command}\n`;
    try {
      if (this.serialPort && this.serialPort.writable) {
        const textEncoder = new TextEncoder();
        const writer = this.serialPort.writable.getWriter();
        await writer.write(textEncoder.encode(formatted));
        writer.releaseLock();
        return true;
      }
      if (this.webSocket && this.webSocket.readyState === WebSocket.OPEN) {
        this.webSocket.send(formatted);
        return true;
      }
      return false;
    } catch {
      return false;
    }
  }

  public disconnect() {
    if (this.simulationInterval) {
      clearInterval(this.simulationInterval);
      this.simulationInterval = null;
    }
    if (this.serialReader) {
      this.serialReader.cancel().catch(() => {});
      this.serialReader = null;
    }
    if (this.serialPort) {
      this.serialPort.close().catch(() => {});
      this.serialPort = null;
    }
    if (this.bleDevice && this.bleDevice.gatt && this.bleDevice.gatt.connected) {
      this.bleDevice.gatt.disconnect();
      this.bleDevice = null;
    }
    if (this.webSocket) {
      this.webSocket.close();
      this.webSocket = null;
    }
    this.connectionType = null;
    this.notifyStatus(false, 'Disconnected');
  }
}

export const espManager = new EspHardwareManager();

/**
 * Ready-to-flash Arduino C++ sketches for ESP32 and NodeMCU
 */
export const ARDUINO_SKETCHES = {
  esp32: `/*
 * DriveLock Industrial Safety - ESP32 In-Cab Multi-Sensor Telemetry
 * Target: DOIT ESP32 DEVKIT V1 / ESP32-WROOM-32
 * Sensors & Pinout:
 *  - MQ-3 Alcohol Sensor: GPIO 34 (ADC1_CH6)
 *  - MQ-9 CO / Flammable Gas Sensor: GPIO 35 (ADC1_CH7)
 *  - Magnetic Dock Reed Switch: GPIO 4 (INPUT_PULLUP)
 *  - 12V Starter Immobilizer Relay: GPIO 5 (Active HIGH)
 *  - Status LED: GPIO 2
 *  - Serial Baud: 115200 (USB-OTG to Android)
 */

#define MQ3_PIN        34   // Alcohol sensor analog input
#define MQ9_PIN        35   // MQ-9 Gas & Carbon Monoxide analog input
#define DOCK_PIN       4    // Magnetic cradle reed switch (GND when docked)
#define RELAY_PIN      5    // Starter immobilizer relay
#define LED_PIN        2    // Status indicator LED

float bac = 0.00;
float gasPpm = 20.0;
bool isDocked = false;
bool relayState = false;

void setup() {
  Serial.begin(115200);
  pinMode(DOCK_PIN, INPUT_PULLUP);
  pinMode(RELAY_PIN, OUTPUT);
  pinMode(LED_PIN, OUTPUT);
  digitalWrite(RELAY_PIN, LOW); // Fail-safe default: immobilizer armed
}

void loop() {
  // 1. Read Magnetic Dock Switch (LOW = Magnet Near = Docked)
  isDocked = (digitalRead(DOCK_PIN) == LOW);

  // 2. Read MQ-3 Alcohol Sensor (0 - 4095)
  int rawAdc = analogRead(MQ3_PIN);
  if (rawAdc < 350) {
    bac = 0.00;
  } else {
    bac = (rawAdc - 350) * 0.00012;
  }

  // 3. Read MQ-9 Carbon Monoxide & Flammable Gas Sensor (0 - 4095)
  int rawGasAdc = analogRead(MQ9_PIN);
  // Calibration: baseline ambient CO is ~150-250 ADC (approx 15-25 PPM)
  // High CO / exhaust leak pushes ADC > 600 (> 50 PPM threshold)
  if (rawGasAdc < 200) {
    gasPpm = 18.0;
  } else {
    gasPpm = 18.0 + (rawGasAdc - 200) * 0.12;
  }

  // 4. Listen for relay control commands from DriveLock Android App
  if (Serial.available()) {
    String cmd = Serial.readStringUntil('\\n');
    cmd.trim();
    if (cmd == "RELAY:1") {
      relayState = true;
      digitalWrite(RELAY_PIN, HIGH);
      digitalWrite(LED_PIN, HIGH);
    } else if (cmd == "RELAY:0") {
      relayState = false;
      digitalWrite(RELAY_PIN, LOW);
      digitalWrite(LED_PIN, LOW);
    }
  }

  // 5. Send JSON packet to Android over USB-OTG / BLE
  Serial.print("{\\"dock\\":");
  Serial.print(isDocked ? 1 : 0);
  Serial.print(",\\"bac\\":");
  Serial.print(bac, 3);
  Serial.print(",\\"gas\\":");
  Serial.print(gasPpm, 1);
  Serial.print(",\\"rawAdc\\":");
  Serial.print(rawAdc);
  Serial.print(",\\"rawGasAdc\\":");
  Serial.print(rawGasAdc);
  Serial.print(",\\"volt\\":13.8");
  Serial.print(",\\"relay\\":");
  Serial.print(relayState ? 1 : 0);
  Serial.println("}");

  delay(250); // 4 Hz transmission rate
}
`,
  nodemcu: `/*
 * DriveLock Industrial Safety - NodeMCU (ESP8266) Firmware
 * Features:
 *  - MQ-3 Alcohol Sensor on A0 (Analog 0-1023)
 *  - MQ-9 Gas Sensor Digital Alarm on Pin D6 (GPIO 12)
 *  - Magnetic Dock Reed Switch on Pin D5 (GPIO 14)
 *  - Starter Immobilizer Relay on Pin D1 (GPIO 5)
 */

#define MQ3_PIN        A0   // Analog 0 (0-1023)
#define MQ9_DIGITAL    12   // NodeMCU Pin D6 (MQ-9 digital comparator threshold)
#define DOCK_PIN       14   // NodeMCU Pin D5 (Reed Switch)
#define RELAY_PIN      5    // NodeMCU Pin D1 (Starter Relay)

float bac = 0.00;
float gasPpm = 22.0;
bool isDocked = false;
bool relayState = false;

void setup() {
  Serial.begin(115200);
  pinMode(DOCK_PIN, INPUT_PULLUP);
  pinMode(MQ9_DIGITAL, INPUT_PULLUP);
  pinMode(RELAY_PIN, OUTPUT);
  digitalWrite(RELAY_PIN, LOW); // Safe default: ignition cut-off
}

void loop() {
  isDocked = (digitalRead(DOCK_PIN) == LOW);

  // Read MQ-3 Alcohol
  int rawAdc = analogRead(MQ3_PIN);
  if (rawAdc < 120) {
    bac = 0.00;
  } else {
    bac = (rawAdc - 120) * 0.00035;
  }

  // Read MQ-9 Gas Alert (LOW indicates gas threshold exceeded on comparator)
  bool gasExceeded = (digitalRead(MQ9_DIGITAL) == LOW);
  gasPpm = gasExceeded ? 95.0 : 22.0;

  if (Serial.available()) {
    String cmd = Serial.readStringUntil('\\n');
    cmd.trim();
    if (cmd == "RELAY:1") {
      relayState = true;
      digitalWrite(RELAY_PIN, HIGH);
    } else if (cmd == "RELAY:0") {
      relayState = false;
      digitalWrite(RELAY_PIN, LOW);
    }
  }

  Serial.print("{\\"dock\\":");
  Serial.print(isDocked ? 1 : 0);
  Serial.print(",\\"bac\\":");
  Serial.print(bac, 3);
  Serial.print(",\\"gas\\":");
  Serial.print(gasPpm, 1);
  Serial.print(",\\"rawAdc\\":");
  Serial.print(rawAdc);
  Serial.print(",\\"volt\\":13.8");
  Serial.print(",\\"relay\\":");
  Serial.print(relayState ? 1 : 0);
  Serial.println("}");

  delay(250);
}
`,
};
