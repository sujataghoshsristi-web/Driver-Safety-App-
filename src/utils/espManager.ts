/**
 * ESP32-S3, Classic ESP32 & NodeMCU (ESP8266) In-Cab Hardware Sensor Integration
 * Supports:
 * 1. USB Cable (Laptop COM Port & Android USB-OTG): Web Serial API + WebUSB fallback
 * 2. Bluetooth LE (BLE): Nordic UART (6e400001-...) + HM-10/JDY (0xFFE0) with multi-chunk packet reassembly
 * 3. Wi-Fi (SoftAP "DriveLock-ESP" at 192.168.4.1): Built-in HTTP JSON Polling (http://192.168.4.1/telemetry) + WebSocket fallback
 * 4. Interactive Live Test Stream
 */

import { EspSensorPacket, EspConnectionType, EspDeviceType } from '../types/telemetry';

export type PacketCallback = (packet: EspSensorPacket, rawLine: string) => void;
export type StatusCallback = (connected: boolean, message: string) => void;

const NUS_SERVICE_UUID = '6e400001-b5a3-f393-e0a9-e50e24dcca9e';
const NUS_RX_CHAR_UUID = '6e400002-b5a3-f393-e0a9-e50e24dcca9e'; // Write to ESP32-S3
const NUS_TX_CHAR_UUID = '6e400003-b5a3-f393-e0a9-e50e24dcca9e'; // Notify from ESP32-S3
const HM10_SERVICE_UUID = 0xffe0;
const HM10_CHAR_UUID = 0xffe1;

class EspHardwareManager {
  private serialPort: any = null;
  private serialReader: any = null;
  private usbDevice: any = null;
  private usbReadActive: boolean = false;
  private usbEndpointIn: number = 1;
  private usbEndpointOut: number = 1;
  private bleDevice: any = null;
  private bleTxChar: any = null;
  private bleRxChar: any = null;
  private webSocket: WebSocket | null = null;
  private wifiPollInterval: number | null = null;
  private wifiIpAddress: string = '192.168.4.1';
  private simulationInterval: number | null = null;
  private plainTextKnockCount: number = 0;
  public mq3BaselineAdc: number | null = null;
  public mq9BaselineAdc: number | null = null;
  public flameBaselineAdc: number | null = null;
  public knockCountBaseline: number | null = null;
  public isCalibrating: boolean = true;
  private calSamples: { mq3: number[]; mq9: number[] } = {
    mq3: [],
    mq9: [],
  };

  public isConnected: boolean = false;
  public connectionType: EspConnectionType | null = null;
  public deviceType: EspDeviceType = 'esp32s3';

  private onPacketListeners: PacketCallback[] = [];
  private onStatusListeners: StatusCallback[] = [];

  /**
   * Resets and re-calibrates all hardware sensor baselines from the next incoming packets
   * and sends "CAL" command to ESP32-S3 firmware to re-zero hardware baselines.
   */
  public recalibrateBaselines() {
    this.mq3BaselineAdc = null;
    this.mq9BaselineAdc = null;
    this.flameBaselineAdc = 1;
    this.knockCountBaseline = null;
    this.isCalibrating = true;
    this.calSamples = { mq3: [], mq9: [] };
    this.sendCommand('CAL');
  }

  public getBaselines() {
    return {
      isCalibrating: this.isCalibrating,
      mq3BaselineAdc: this.mq3BaselineAdc,
      mq9BaselineAdc: this.mq9BaselineAdc,
      flameBaselineAdc: this.flameBaselineAdc,
    };
  }

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
    if (connected) {
      this.recalibrateBaselines();
    }
    this.onStatusListeners.forEach((cb) => cb(connected, message));
  }

  private notifyPacket(packet: EspSensorPacket, rawLine: string) {
    this.onPacketListeners.forEach((cb) => cb(packet, rawLine));
  }

  /**
   * Parse incoming string packet from ESP32-S3, ESP32, or NodeMCU.
   * Supports:
   *  1. JSON strings: {"bac":0.000,"adc":180,"knock":1,"kc":5,"flame":0,"fadc":1,"gas":20.0,"rly":1}
   *  2. Key-Value CSV strings: BAC:0.00,KNOCK:1,FLAME:0,GAS:24
   *  3. Plain-text Arduino Serial.println() messages
   */
  public parseIncomingLine(line: string): EspSensorPacket | null {
    const trimmed = line.trim();
    if (!trimmed) return null;

    // 1. Try extracting JSON object if present in the line
    const jsonStart = trimmed.indexOf('{');
    const jsonEnd = trimmed.lastIndexOf('}');
    if (jsonStart !== -1 && jsonEnd > jsonStart) {
      try {
        const jsonSlice = trimmed.slice(jsonStart, jsonEnd + 1);
        const obj = JSON.parse(jsonSlice);
        if (obj.status && obj.bac === undefined && obj.knock === undefined) {
          return null;
        }

        const rawMq3Val = obj.adc ?? obj.rawAdc;
        const rawGasVal =
          obj.rawGasAdc !== undefined
            ? Number(obj.rawGasAdc)
            : obj.gasAdc !== undefined
            ? Number(obj.gasAdc)
            : obj.gadc !== undefined
            ? Number(obj.gadc)
            : undefined;
        const rawKnockCount =
          obj.knockCount !== undefined
            ? Number(obj.knockCount)
            : obj.kc !== undefined
            ? Number(obj.kc)
            : obj.taps !== undefined
            ? Number(obj.taps)
            : undefined;

        // Lock initial knock count offset on first packet so old ESP count doesn't false-trigger on connect
        if (rawKnockCount !== undefined && !isNaN(rawKnockCount)) {
          if (this.knockCountBaseline === null || rawKnockCount < this.knockCountBaseline) {
            this.knockCountBaseline = rawKnockCount;
          }
        }
        const calibratedKnockCount =
          rawKnockCount !== undefined && this.knockCountBaseline !== null
            ? Math.max(0, rawKnockCount - this.knockCountBaseline)
            : rawKnockCount;

        // STARTUP AUTO-CALIBRATION FOR ALL SENSORS (First 5 packets lock ambient baseline & suppress false alerts)
        if (this.isCalibrating) {
          if (rawMq3Val !== undefined && !isNaN(Number(rawMq3Val))) {
            this.calSamples.mq3.push(Number(rawMq3Val));
          }
          if (rawGasVal !== undefined && !isNaN(Number(rawGasVal))) {
            this.calSamples.mq9.push(Number(rawGasVal));
          }

          const avg = (arr: number[]) =>
            arr.length > 0 ? Math.round(arr.reduce((a, b) => a + b, 0) / arr.length) : null;

          this.mq3BaselineAdc = avg(this.calSamples.mq3) ?? this.mq3BaselineAdc ?? 180;
          this.mq9BaselineAdc = avg(this.calSamples.mq9) ?? this.mq9BaselineAdc ?? 220;
          this.flameBaselineAdc = 1; // 3-pin IR sensor digital resting state = 1 (HIGH / CLEAR)

          if (this.calSamples.mq3.length >= 4 || this.calSamples.mq9.length >= 4) {
            this.isCalibrating = false;
          }

          // While calibrating startup baseline, return 100% clean/safe values so nothing false-triggers
          return {
            dock: true,
            bac: 0.0,
            rawAdc: rawMq3Val !== undefined ? Number(rawMq3Val) : 180,
            gasPpm: 18.0,
            rawGasAdc: rawGasVal ?? 220,
            knock: false,
            knockCount: 0,
            flame: false,
            flameRawAdc: 1, // 3-Pin Digital IR OUT = 1 (HIGH / SAFE)
            relayState: true,
            timestamp: new Date().toLocaleTimeString(),
          };
        }

        // 1. MQ-3 Alcohol: Only trigger above 0.000% if ADC rises by >= 850 counts above calibrated baseline!
        let bacVal = 0.0;
        if (rawMq3Val !== undefined && this.mq3BaselineAdc !== null) {
          const mq3Delta = Number(rawMq3Val) - this.mq3BaselineAdc;
          if (mq3Delta > 850) {
            bacVal = Number(((mq3Delta - 850) * 0.0001).toFixed(3));
          }
        } else if (obj.bac !== undefined && Number(obj.bac) > 0.04) {
          bacVal = Number(obj.bac);
        }

        // 2. MQ-9 Gas: Only trigger above 18 PPM if ADC rises by >= 800 counts above calibrated baseline!
        let gasVal = 18.0;
        if (rawGasVal !== undefined && this.mq9BaselineAdc !== null) {
          const mq9Delta = Number(rawGasVal) - this.mq9BaselineAdc;
          if (mq9Delta > 800) {
            gasVal = Number((18.0 + (mq9Delta - 800) * 0.1).toFixed(1));
          }
        }

        // 3. Knock / Tap Sensor (KY-031)
        const knockVal =
          obj.knock !== undefined
            ? Boolean(Number(obj.knock))
            : obj.tap !== undefined
            ? Boolean(Number(obj.tap))
            : obj.k !== undefined
            ? Boolean(Number(obj.k))
            : false;

        // 4. 3-Pin IR / Flame Sensor (VCC, GND, OUT):
        // Uses ONLY the digital flame state (never floating analog ADC noise!)
        // Reading is 0 (LOW = IR/Flame Detected) or 1 (HIGH = Safe/Clear)
        const flameVal =
          obj.flame !== undefined
            ? Boolean(Number(obj.flame))
            : obj.fire !== undefined
            ? Boolean(Number(obj.fire))
            : obj.f !== undefined
            ? Boolean(Number(obj.f))
            : false;
        const cleanIrDigitalPin = flameVal ? 0 : 1;

        return {
          dock: true,
          bac: isNaN(bacVal) ? 0 : bacVal,
          rawAdc: rawMq3Val !== undefined ? Number(rawMq3Val) : 180,
          gasPpm: gasVal,
          rawGasAdc: rawGasVal ?? 220,
          knock: knockVal,
          knockCount: calibratedKnockCount,
          flame: flameVal,
          flameRawAdc: cleanIrDigitalPin,
          speed: obj.speed ?? obj.spd ?? obj.s,
          rpm: obj.rpm ?? obj.r,
          gx: obj.gx ?? obj.x,
          gy: obj.gy ?? obj.y,
          gz: obj.gz ?? obj.z,
          volt: obj.volt ?? obj.v ?? 13.8,
          relayState:
            obj.relay !== undefined
              ? Boolean(obj.relay)
              : obj.rly !== undefined
              ? Boolean(obj.rly)
              : true,
          timestamp: new Date().toLocaleTimeString(),
        };
      } catch {
        // Fallback to CSV or plain text
      }
    }

    // 2. Try parsing key-value CSV format: "BAC:0.00,KNOCK:1,FLAME:0,GAS:24"
    if (trimmed.includes(':')) {
      const parts = trimmed.split(',');
      const result: Partial<EspSensorPacket> = {};
      for (const part of parts) {
        const [k, v] = part.split(':').map((s) => s.trim().toUpperCase());
        if (k && v !== undefined) {
          if (k === 'BAC' || k === 'ALC' || k === 'ALCOHOL' || k === 'B') result.bac = parseFloat(v);
          if (k === 'ADC') result.rawAdc = parseInt(v, 10);
          if (k === 'GAS' || k === 'CO' || k === 'G') result.gasPpm = parseFloat(v);
          if (k === 'GASADC' || k === 'GADC') result.rawGasAdc = parseInt(v, 10);
          if (k === 'KNOCK' || k === 'TAP' || k === 'K') {
            result.knock = v === '1' || v === 'TRUE' || v === 'HIGH' || v === 'DETECTED';
          }
          if (k === 'KNOCKS' || k === 'TAPS' || k === 'KC') result.knockCount = parseInt(v, 10);
          if (k === 'FLAME' || k === 'FIRE' || k === 'F') {
            result.flame = v === '1' || v === 'TRUE' || v === 'DETECTED';
          }
          if (k === 'FLAMEADC' || k === 'FADC') result.flameRawAdc = parseInt(v, 10);
          if (k === 'SPD' || k === 'SPEED') result.speed = parseFloat(v);
          if (k === 'RPM') result.rpm = parseInt(v, 10);
          if (k === 'VOLT' || k === 'V') result.volt = parseFloat(v);
          if (k === 'RELAY' || k === 'RLY') result.relayState = v === '1' || v === 'TRUE';
        }
      }
      if (
        result.bac !== undefined ||
        result.gasPpm !== undefined ||
        result.knock !== undefined ||
        result.flame !== undefined ||
        result.knockCount !== undefined
      ) {
        return {
          dock: true,
          bac: result.bac ?? 0,
          rawAdc: result.rawAdc ?? 180,
          gasPpm: result.gasPpm,
          rawGasAdc: result.rawGasAdc,
          knock: result.knock,
          knockCount: result.knockCount,
          flame: result.flame,
          flameRawAdc: result.flameRawAdc,
          speed: result.speed,
          rpm: result.rpm,
          volt: result.volt ?? 13.8,
          relayState: result.relayState ?? true,
          timestamp: new Date().toLocaleTimeString(),
        };
      }
    }

    // 3. Plain-text fallback: If user flashed a custom Arduino sketch printing "Knock", "Tap", "Fire", "Flame"
    const lower = trimmed.toLowerCase();
    if (
      lower.includes('knock') ||
      lower.includes('tap') ||
      lower.includes('vibration') ||
      lower.includes('impact') ||
      lower.includes('shock')
    ) {
      const isNoKnock = lower.includes('no knock') || lower.includes('no tap') || lower.endsWith('0');
      if (!isNoKnock) {
        this.plainTextKnockCount++;
        return {
          dock: true,
          bac: 0,
          knock: true,
          knockCount: this.plainTextKnockCount,
          timestamp: new Date().toLocaleTimeString(),
        };
      }
    }

    if (lower.includes('flame') || lower.includes('fire')) {
      const isNoFlame = lower.includes('no flame') || lower.includes('no fire') || lower.includes('safe');
      return {
        dock: true,
        bac: 0,
        flame: !isNoFlame,
        flameRawAdc: isNoFlame ? 3950 : 200,
        timestamp: new Date().toLocaleTimeString(),
      };
    }

    return null;
  }

  /**
   * 1. Connect via USB Cable (Laptop COM Port via Web Serial OR Android USB-OTG via WebUSB)
   */
  public async connectSerial(baudRate = 115200): Promise<boolean> {
    this.disconnect();

    // Strategy A: Web Serial API (Standard on Laptop Chrome/Edge & Android Chrome)
    if ('serial' in navigator) {
      let portSelected = false;
      try {
        const serial = (navigator as any).serial;
        this.serialPort = await serial.requestPort();
        portSelected = true;
        await this.serialPort.open({ baudRate });

        // Assert DTR/RTS so ESP32-S3 Native USB CDC starts streaming immediately
        try {
          await this.serialPort.setSignals({ dataTerminalReady: true, requestToSend: true });
        } catch {
          // Ignore if driver doesn't need DTR/RTS
        }

        this.connectionType = 'serial';
        this.notifyStatus(true, `Connected via USB Serial (${baudRate} baud)`);
        this.startRawSerialReadLoop();
        return true;
      } catch (err: any) {
        if (err?.name === 'NotFoundError') {
          this.notifyStatus(false, 'No USB COM port selected.');
          return false;
        }
        if (err?.name === 'SecurityError' || (err?.message || '').toLowerCase().includes('permissions policy')) {
          throw new Error(
            'Browser preview iframe blocked USB Serial. Click "OPEN IN NEW TAB FOR USB" to connect your laptop COM port.'
          );
        }
        // If user selected a COM port on laptop, do NOT fall through to WebUSB (which fails on Windows COM ports)
        if (portSelected) {
          throw new Error(
            `Could not open USB COM port (${err?.message || 'Port busy'}). IMPORTANT: Close the Arduino IDE Serial Monitor first so the browser can use the COM port!`
          );
        }
      }
    }

    // Strategy B: WebUSB API (Fallback for Android devices where navigator.serial is absent)
    if ('usb' in navigator) {
      try {
        const usb = (navigator as any).usb;
        const device = await usb.requestDevice({ filters: [] });
        await device.open();
        if (device.configuration === null) {
          await device.selectConfiguration(1);
        }

        let claimedInterface = 0;
        for (const iface of device.configuration.interfaces) {
          const alt = iface.alternates[0];
          const inEp = alt.endpoints.find((e: any) => e.direction === 'in' && e.type === 'bulk');
          const outEp = alt.endpoints.find((e: any) => e.direction === 'out' && e.type === 'bulk');
          if (inEp) {
            claimedInterface = iface.interfaceNumber;
            this.usbEndpointIn = inEp.endpointNumber;
            if (outEp) this.usbEndpointOut = outEp.endpointNumber;
            break;
          }
        }

        await device.claimInterface(claimedInterface);

        try {
          if (device.vendorId === 0x10c4) {
            await device.controlTransferOut({
              requestType: 'vendor',
              recipient: 'interface',
              request: 0x00,
              value: 0x01,
              index: claimedInterface,
            });
            const baudBytes = new Uint32Array([baudRate]);
            await device.controlTransferOut(
              {
                requestType: 'vendor',
                recipient: 'interface',
                request: 0x1e,
                value: 0,
                index: claimedInterface,
              },
              baudBytes.buffer
            );
          } else {
            await device.controlTransferOut({
              requestType: 'class',
              recipient: 'interface',
              request: 0x22,
              value: 0x03,
              index: claimedInterface,
            });
          }
        } catch {
          // Ignore vendor-specific control errors
        }

        this.usbDevice = device;
        this.connectionType = 'serial';
        this.notifyStatus(
          true,
          `Connected via USB (${device.productName || 'ESP32-S3 USB'})`
        );
        this.startWebUsbReadLoop();
        return true;
      } catch (usbErr: any) {
        this.notifyStatus(
          false,
          usbErr.message || 'USB connection cancelled or failed.'
        );
        throw new Error(
          usbErr.message ||
            'USB connection failed. Close Arduino IDE Serial Monitor and check USB cable.'
        );
      }
    }

    throw new Error(
      'Web Serial is not supported in this browser. Please use Chrome or Edge on your laptop.'
    );
  }

  private async startRawSerialReadLoop() {
    try {
      const reader = this.serialPort.readable.getReader();
      this.serialReader = reader;
      const decoder = new TextDecoder('utf-8');
      let buffer = '';

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        if (value) {
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split(/\r?\n/);
          buffer = lines.pop() || '';
          for (const line of lines) {
            const clean = line.trim();
            if (!clean) continue;
            const parsed = this.parseIncomingLine(clean);
            if (parsed) {
              this.notifyPacket(parsed, clean);
            }
          }
        }
      }
    } catch (e: any) {
      if (this.isConnected) {
        this.notifyStatus(false, `USB Serial disconnected: ${e.message}`);
      }
    }
  }

  private async startWebUsbReadLoop() {
    this.usbReadActive = true;
    const decoder = new TextDecoder('utf-8');
    let buffer = '';

    while (this.usbReadActive && this.usbDevice) {
      try {
        const result = await this.usbDevice.transferIn(this.usbEndpointIn, 64);
        if (result && result.data && result.data.byteLength > 0) {
          buffer += decoder.decode(result.data, { stream: true });
          const lines = buffer.split(/\r?\n/);
          buffer = lines.pop() || '';
          for (const line of lines) {
            const clean = line.trim();
            if (!clean) continue;
            const parsed = this.parseIncomingLine(clean);
            if (parsed) {
              this.notifyPacket(parsed, clean);
            }
          }
        }
      } catch (err: any) {
        if (this.usbReadActive) {
          this.notifyStatus(false, `USB disconnected: ${err.message}`);
          this.usbReadActive = false;
        }
        break;
      }
    }
  }

  /**
   * 2. Connect via Web Bluetooth (BLE UART on ESP32-S3 / ESP32 or HM-10 BLE)
   */
  public async connectBle(): Promise<boolean> {
    if (!('bluetooth' in navigator)) {
      throw new Error(
        'Web Bluetooth is not supported in this browser. Please open the app directly in Chrome or Edge.'
      );
    }

    try {
      this.disconnect();
      const bluetooth = (navigator as any).bluetooth;

      this.bleDevice = await bluetooth.requestDevice({
        acceptAllDevices: true,
        optionalServices: [
          NUS_SERVICE_UUID,
          '4fafc201-1fb5-459e-8fcc-c5c9c331914b',
          HM10_SERVICE_UUID,
        ],
      });

      this.bleDevice.addEventListener('gattserverdisconnected', () => {
        if (this.isConnected && this.connectionType === 'ble') {
          this.notifyStatus(false, 'Bluetooth LE device disconnected');
        }
      });

      const server = await this.bleDevice.gatt.connect();

      let service: any = null;
      let txChar: any = null;
      let rxChar: any = null;

      try {
        service = await server.getPrimaryService(NUS_SERVICE_UUID);
        txChar = await service.getCharacteristic(NUS_TX_CHAR_UUID);
        try {
          rxChar = await service.getCharacteristic(NUS_RX_CHAR_UUID);
        } catch {
          rxChar = txChar;
        }
      } catch {
        try {
          service = await server.getPrimaryService(HM10_SERVICE_UUID);
          txChar = await service.getCharacteristic(HM10_CHAR_UUID);
          rxChar = txChar;
        } catch {
          service = await server.getPrimaryService('4fafc201-1fb5-459e-8fcc-c5c9c331914b');
          const chars = await service.getCharacteristics();
          txChar = chars[0];
          rxChar = chars[0];
        }
      }

      this.bleTxChar = txChar;
      this.bleRxChar = rxChar;

      let bleBuffer = '';
      await txChar.startNotifications();
      txChar.addEventListener('characteristicvaluechanged', (event: any) => {
        const value = event.target.value;
        const decoder = new TextDecoder('utf-8');
        bleBuffer += decoder.decode(value, { stream: true });

        while (bleBuffer.includes('\n')) {
          const nlIdx = bleBuffer.indexOf('\n');
          const line = bleBuffer.slice(0, nlIdx).trim();
          bleBuffer = bleBuffer.slice(nlIdx + 1);
          if (line) {
            const parsed = this.parseIncomingLine(line);
            if (parsed) {
              this.notifyPacket(parsed, line);
            }
          }
        }
      });

      this.connectionType = 'ble';
      this.notifyStatus(
        true,
        `Connected via Bluetooth LE to ${this.bleDevice.name || 'DriveLock-S3'}`
      );
      return true;
    } catch (err: any) {
      this.notifyStatus(false, err.message || 'Bluetooth connection failed');
      throw err;
    }
  }

  /**
   * 3. Connect via Wi-Fi (Supports built-in HTTP JSON server on port 80 AND WebSocket on port 81)
   */
  public connectWifi(ip = '192.168.4.1', port = 80): boolean {
    this.disconnect();
    const cleanIp = ip.replace(/^https?:\/\//, '').replace(/^ws:\/\//, '').split('/')[0].split(':')[0];
    this.wifiIpAddress = cleanIp;

    if (port === 80 || port === 8080) {
      this.connectionType = 'wifi';
      this.notifyStatus(true, `Connecting to ESP32-S3 Wi-Fi at http://${cleanIp}:${port}/telemetry ...`);

      let consecutiveFailures = 0;
      const pollEspHttp = async () => {
        try {
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), 1500);
          const response = await fetch(`http://${cleanIp}:${port}/telemetry`, {
            method: 'GET',
            mode: 'cors',
            cache: 'no-store',
            signal: controller.signal,
          });
          clearTimeout(timeoutId);

          const text = await response.text();
          const parsed = this.parseIncomingLine(text);
          if (parsed) {
            consecutiveFailures = 0;
            if (!this.isConnected) {
              this.notifyStatus(true, `Connected to ESP32-S3 Wi-Fi at http://${cleanIp}:${port}`);
            }
            this.notifyPacket(parsed, text.trim());
          }
        } catch {
          consecutiveFailures++;
          if (consecutiveFailures === 3) {
            this.notifyStatus(
              false,
              `Cannot reach http://${cleanIp}:${port}/telemetry. Connect Wi-Fi to "DriveLock-ESP" (Password: 12345678).`
            );
          }
        }
      };

      pollEspHttp();
      this.wifiPollInterval = window.setInterval(pollEspHttp, 250);
      return true;
    }

    try {
      const url = `ws://${cleanIp}:${port}`;
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
        if (this.webSocket) {
          this.webSocket.close();
          this.webSocket = null;
        }
        this.connectWifi(cleanIp, 80);
      };

      this.webSocket.onclose = () => {
        if (this.isConnected && this.connectionType === 'wifi' && !this.wifiPollInterval) {
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
   * 4. Simulated / Test Hardware Stream
   */
  public startSimulatedStream(deviceType: EspDeviceType = 'esp32s3') {
    this.disconnect();
    this.connectionType = 'simulated';
    this.deviceType = deviceType;
    this.notifyStatus(true, `Virtual ${deviceType.toUpperCase()} Stream Connected`);

    let tick = 0;
    this.simulationInterval = window.setInterval(() => {
      tick++;
      const rawPacket: EspSensorPacket = {
        dock: true,
        bac: 0.00,
        rawAdc: 175 + Math.round(Math.random() * 15),
        gasPpm: 22 + Math.round(Math.random() * 8),
        rawGasAdc: 240 + Math.round(Math.random() * 25),
        knock: false,
        knockCount: 0,
        flame: false,
        flameRawAdc: 3920 + Math.round(Math.random() * 60),
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

  public async sendCommand(command: string): Promise<boolean> {
    const formatted = command.endsWith('\n') ? command : `${command}\n`;
    const encoder = new TextEncoder();
    const bytes = encoder.encode(formatted);

    try {
      if (this.serialPort && this.serialPort.writable) {
        const writer = this.serialPort.writable.getWriter();
        await writer.write(bytes);
        writer.releaseLock();
        return true;
      }
      if (this.usbDevice) {
        await this.usbDevice.transferOut(this.usbEndpointOut, bytes);
        return true;
      }
      if (this.bleRxChar) {
        await this.bleRxChar.writeValue(bytes);
        return true;
      }
      if (this.wifiPollInterval) {
        const state = command.includes('1') ? '1' : '0';
        await fetch(`http://${this.wifiIpAddress}/relay?state=${state}`, { mode: 'no-cors' });
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
    this.usbReadActive = false;
    if (this.simulationInterval) {
      clearInterval(this.simulationInterval);
      this.simulationInterval = null;
    }
    if (this.wifiPollInterval) {
      clearInterval(this.wifiPollInterval);
      this.wifiPollInterval = null;
    }
    if (this.serialReader) {
      this.serialReader.cancel().catch(() => {});
      this.serialReader.releaseLock?.();
      this.serialReader = null;
    }
    if (this.serialPort) {
      this.serialPort.close().catch(() => {});
      this.serialPort = null;
    }
    if (this.usbDevice) {
      this.usbDevice.close().catch(() => {});
      this.usbDevice = null;
    }
    if (this.bleDevice && this.bleDevice.gatt && this.bleDevice.gatt.connected) {
      this.bleDevice.gatt.disconnect();
      this.bleDevice = null;
    }
    this.bleTxChar = null;
    this.bleRxChar = null;
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
 * Ready-to-flash Arduino C++ sketches for ESP32-S3, Classic ESP32, and NodeMCU (ESP8266)
 */
export const ARDUINO_SKETCHES: Record<EspDeviceType, string> = {
  esp32s3: `/*
 * ============================================================================
 * DriveLock Industrial Safety — ESP32-S3 ALL-IN-ONE FIRMWARE (INSTANT TAP FIX)
 * ============================================================================
 * Target Board in Arduino IDE: "ESP32S3 Dev Module"
 * REQUIRED Arduino IDE Tools Menu Settings for ESP32-S3:
 *   - USB CDC On Boot:  "Enabled"  (IMPORTANT: Enables Serial over Native USB-C!)
 *   - Partition Scheme: "Huge APP (3MB No OTA/1MB SPIFFS)"
 *
 * IMPORTANT FOR LAPTOP USB CONNECTION:
 *   Close the Arduino IDE Serial Monitor before clicking "CONNECT USB" in the
 *   web app (only one program can open the COM port at a time!).
 *
 * ESP32-S3 SAFE PINOUT (FOR 3-PIN IR SENSOR + KNOCK + ALCOHOL + GAS):
 *   1. Knock / Tap Sensor (3-Pin KY-031): OUT (S) -> GPIO 13 | VCC -> 3.3V/5V | GND -> GND
 *   2. 3-Pin IR / Flame Sensor:           OUT     -> GPIO 14 | VCC -> 3.3V/5V | GND -> GND
 *   3. MQ-3 Alcohol Sensor:               AOUT    -> GPIO 4  | VCC -> 5V      | GND -> GND
 *   4. MQ-9 Gas / CO Sensor:              AOUT    -> GPIO 5  | VCC -> 5V      | GND -> GND
 *   5. 12V Starter Relay:                 IN      -> GPIO 12 | VCC -> 5V      | GND -> GND
 */

#include <WiFi.h>
#include <WebServer.h>
#include <BLEDevice.h>
#include <BLEServer.h>
#include <BLEUtils.h>
#include <BLE2902.h>

// --- ESP32-S3 Dedicated Pin Definitions ---
#define MQ3_PIN        4    // 1. MQ-3 Alcohol Sensor Analog (ESP32-S3 ADC1_CH3)
#define MQ9_PIN        5    // 2. MQ-9 Gas Sensor Analog (ESP32-S3 ADC1_CH4)
#define FLAME_DIG_PIN  14   // 3. 3-Pin IR / Flame Sensor OUT Pin (GPIO 14)
#define FLAME_ALT_PIN  6    // 3b. Alternate pin if 3-Pin IR OUT is plugged into GPIO 6
#define KNOCK_PIN      13   // 4. KY-031 / SW-420 Knock & Tap Sensor Digital Input
#define RELAY_PIN      12   // 5. Starter Immobilizer Relay (HIGH = Armed, LOW = Cut-Off)

const char* AP_SSID = "DriveLock-ESP";
const char* AP_PASS = "12345678";
WebServer server(80);

#define SERVICE_UUID           "6e400001-b5a3-f393-e0a9-e50e24dcca9e"
#define CHARACTERISTIC_UUID_RX "6e400002-b5a3-f393-e0a9-e50e24dcca9e"
#define CHARACTERISTIC_UUID_TX "6e400003-b5a3-f393-e0a9-e50e24dcca9e"

BLEServer* pServer = NULL;
BLECharacteristic* pTxCharacteristic = NULL;
bool bleClientConnected = false;

float bac = 0.00;
int rawAdc = 180;
float gasPpm = 18.0;
int rawGasAdc = 220;
int flameRawAdc = 1; // 1 = HIGH (SAFE/CLEAR), 0 = LOW (IR/FLAME DETECTED)
bool flameDetected = false;
bool currentKnock = false;
bool relayState = true;

int lastKnockPinState = HIGH;
int flameDigBaseline = HIGH;
int flameAltBaseline = HIGH;
int mq3Baseline = 180;
int mq9Baseline = 220;
volatile int knockCount = 0;
volatile bool knockInstantFlag = false;
volatile unsigned long lastKnockIsrUs = 0;
unsigned long knockHoldUntilMs = 0;
unsigned long flameHoldUntilMs = 0;
unsigned long lastTelemetryMs = 0;

// Startup Auto-Calibration: Samples all sensors 16 times over ~400ms to lock ambient baselines!
void calibrateAllSensorsBaseline() {
  long sumMq3 = 0;
  long sumMq9 = 0;
  for (int i = 0; i < 16; i++) {
    sumMq3 += analogRead(MQ3_PIN);
    sumMq9 += analogRead(MQ9_PIN);
    delay(25);
  }
  mq3Baseline = sumMq3 / 16;
  mq9Baseline = sumMq9 / 16;
  lastKnockPinState = digitalRead(KNOCK_PIN);
  flameDigBaseline = digitalRead(FLAME_DIG_PIN);
  flameAltBaseline = digitalRead(FLAME_ALT_PIN);
  knockCount = 0;
  knockInstantFlag = false;
  flameDetected = false;
  currentKnock = false;
}

// 80ms debounce so 1 physical tap = 1 clean count without false noise
void IRAM_ATTR onKnockPulse() {
  unsigned long nowUs = micros();
  if (nowUs - lastKnockIsrUs > 80000) {
    knockCount++;
    knockInstantFlag = true;
    lastKnockIsrUs = nowUs;
  }
}

String buildTelemetryJson() {
  String json = "{";
  json += "\\"bac\\":" + String(bac, 3) + ",";
  json += "\\"adc\\":" + String(rawAdc) + ",";
  json += "\\"knock\\":" + String(currentKnock ? 1 : 0) + ",";
  json += "\\"kc\\":" + String(knockCount) + ",";
  json += "\\"flame\\":" + String(flameDetected ? 1 : 0) + ",";
  json += "\\"fadc\\":" + String(flameDetected ? 0 : 1) + ",";
  json += "\\"gas\\":" + String(gasPpm, 1) + ",";
  json += "\\"gadc\\":" + String(rawGasAdc) + ",";
  json += "\\"rly\\":" + String(relayState ? 1 : 0);
  json += "}";
  return json;
}

void sendBleTelemetry(const String& payload) {
  if (!bleClientConnected || pTxCharacteristic == NULL) return;
  String msg = payload + "\\n";
  int len = msg.length();
  for (int i = 0; i < len; i += 20) {
    String chunk = msg.substring(i, min(i + 20, len));
    pTxCharacteristic->setValue((uint8_t*)chunk.c_str(), chunk.length());
    pTxCharacteristic->notify();
    delay(3);
  }
}

class MyServerCallbacks: public BLEServerCallbacks {
  void onConnect(BLEServer* pServer) { bleClientConnected = true; }
  void onDisconnect(BLEServer* pServer) {
    bleClientConnected = false;
    BLEDevice::startAdvertising();
  }
};

class MyRxCallbacks: public BLECharacteristicCallbacks {
  void onWrite(BLECharacteristic *pCharacteristic) {
    String cmd = String(pCharacteristic->getValue().c_str());
    cmd.trim();
    if (cmd.indexOf("RELAY:1") >= 0) {
      relayState = true;
      digitalWrite(RELAY_PIN, HIGH);
    } else if (cmd.indexOf("RELAY:0") >= 0) {
      relayState = false;
      digitalWrite(RELAY_PIN, LOW);
    } else if (cmd.indexOf("CAL") >= 0) {
      calibrateAllSensorsBaseline();
    }
  }
};

void sendCorsHeaders() {
  server.sendHeader("Access-Control-Allow-Origin", "*");
  server.sendHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  server.sendHeader("Access-Control-Allow-Headers", "*");
  server.sendHeader("Access-Control-Allow-Private-Network", "true");
}

void handleTelemetry() {
  sendCorsHeaders();
  server.send(200, "application/json", buildTelemetryJson());
}

void handleRelay() {
  sendCorsHeaders();
  if (server.hasArg("state")) {
    relayState = (server.arg("state") == "1");
    digitalWrite(RELAY_PIN, relayState ? HIGH : LOW);
  }
  server.send(200, "application/json", buildTelemetryJson());
}

void setup() {
  Serial.begin(115200);
  analogReadResolution(12);

  pinMode(KNOCK_PIN, INPUT_PULLUP);
  pinMode(FLAME_DIG_PIN, INPUT_PULLUP);
  pinMode(FLAME_ALT_PIN, INPUT_PULLUP);
  pinMode(RELAY_PIN, OUTPUT);
  digitalWrite(RELAY_PIN, HIGH);

  // Calibrate ALL sensors baseline at startup
  calibrateAllSensorsBaseline();

  // Trigger on CHANGE with 80ms debounce
  attachInterrupt(digitalPinToInterrupt(KNOCK_PIN), onKnockPulse, CHANGE);

  WiFi.mode(WIFI_AP);
  WiFi.softAP(AP_SSID, AP_PASS);
  server.on("/", HTTP_GET, handleTelemetry);
  server.on("/telemetry", HTTP_GET, handleTelemetry);
  server.on("/relay", HTTP_GET, handleRelay);
  server.begin();

  BLEDevice::init("DriveLock-S3");
  BLEDevice::setMTU(247);
  pServer = BLEDevice::createServer();
  pServer->setCallbacks(new MyServerCallbacks());
  BLEService *pService = pServer->createService(SERVICE_UUID);

  pTxCharacteristic = pService->createCharacteristic(
    CHARACTERISTIC_UUID_TX,
    BLECharacteristic::PROPERTY_NOTIFY | BLECharacteristic::PROPERTY_READ
  );
  pTxCharacteristic->addDescriptor(new BLE2902());

  BLECharacteristic *pRxCharacteristic = pService->createCharacteristic(
    CHARACTERISTIC_UUID_RX,
    BLECharacteristic::PROPERTY_WRITE | BLECharacteristic::PROPERTY_WRITE_NR
  );
  pRxCharacteristic->setCallbacks(new MyRxCallbacks());

  pService->start();
  BLEAdvertising *pAdvertising = BLEDevice::getAdvertising();
  pAdvertising->addServiceUUID(SERVICE_UUID);
  pAdvertising->setScanResponse(true);
  BLEDevice::startAdvertising();
}

void loop() {
  server.handleClient();

  if (Serial.available()) {
    String cmd = Serial.readStringUntil('\\n');
    cmd.trim();
    if (cmd.indexOf("RELAY:1") >= 0) {
      relayState = true;
      digitalWrite(RELAY_PIN, HIGH);
    } else if (cmd.indexOf("RELAY:0") >= 0) {
      relayState = false;
      digitalWrite(RELAY_PIN, LOW);
    } else if (cmd.indexOf("CAL") >= 0) {
      calibrateAllSensorsBaseline();
    }
  }

  // Edge transition check on KNOCK_PIN (never loops if steady!)
  int knockNow = digitalRead(KNOCK_PIN);
  if (knockNow != lastKnockPinState) {
    lastKnockPinState = knockNow;
    unsigned long nowUs = micros();
    if (nowUs - lastKnockIsrUs > 80000) {
      knockCount++;
      knockInstantFlag = true;
      lastKnockIsrUs = nowUs;
    }
  }

  // 3-Pin IR Sensor check with 25ms anti-glitch confirmation
  bool irPinChanged = (digitalRead(FLAME_DIG_PIN) != flameDigBaseline) || (digitalRead(FLAME_ALT_PIN) != flameAltBaseline);
  if (irPinChanged) {
    delay(25);
    if ((digitalRead(FLAME_DIG_PIN) != flameDigBaseline) || (digitalRead(FLAME_ALT_PIN) != flameAltBaseline)) {
      flameHoldUntilMs = millis() + 2000;
    }
  }

  // INSTANT 0ms TRANSMISSION WHEN TAPPED!
  if (knockInstantFlag) {
    knockInstantFlag = false;
    knockHoldUntilMs = millis() + 750;
    currentKnock = true;
    String instantPayload = buildTelemetryJson();
    Serial.println(instantPayload);
    sendBleTelemetry(instantPayload);
  }

  // Regular 4 Hz (250ms) sensor broadcast
  if (millis() - lastTelemetryMs >= 250) {
    lastTelemetryMs = millis();

    rawAdc = analogRead(MQ3_PIN);
    int mq3Delta = max(0, rawAdc - mq3Baseline);
    bac = (mq3Delta <= 850) ? 0.00 : (mq3Delta - 850) * 0.0001;

    currentKnock = (millis() < knockHoldUntilMs);
    flameDetected = (millis() < flameHoldUntilMs);
    flameRawAdc = flameDetected ? 0 : 1;

    if (flameDetected || bac > 0.03 || knockCount >= 4) {
      relayState = false;
      digitalWrite(RELAY_PIN, LOW);
    }

    rawGasAdc = analogRead(MQ9_PIN);
    int mq9Delta = max(0, rawGasAdc - mq9Baseline);
    gasPpm = (mq9Delta <= 800) ? 18.0 : (18.0 + (mq9Delta - 800) * 0.1);

    String payload = buildTelemetryJson();
    Serial.println(payload);
    sendBleTelemetry(payload);
  }
}
`,
  esp32: `/*
 * ============================================================================
 * DriveLock Industrial Safety — CLASSIC ESP32 FIRMWARE (INSTANT TAP FIX)
 * ============================================================================
 * Pinout:
 *   1. MQ-3 Alcohol Sensor:         GPIO 34 (Analog AOUT)
 *   2. Knock / Tap Sensor (KY-031): GPIO 27 (Digital DOUT)
 *   3. Flame Sensor (KY-026 IR):    GPIO 26 (Digital DOUT) & GPIO 32 (Analog AOUT)
 *   4. MQ-9 Gas / CO Sensor:        GPIO 35 (Analog AOUT)
 *   5. 12V Starter Relay:           GPIO 5  (Active HIGH)
 */

#include <WiFi.h>
#include <WebServer.h>
#include <BLEDevice.h>
#include <BLEServer.h>
#include <BLEUtils.h>
#include <BLE2902.h>

#define MQ3_PIN        34
#define KNOCK_PIN      27
#define FLAME_DIG_PIN  26
#define FLAME_ADC_PIN  32
#define MQ9_PIN        35
#define RELAY_PIN      5

const char* AP_SSID = "DriveLock-ESP";
const char* AP_PASS = "12345678";
WebServer server(80);

#define SERVICE_UUID           "6e400001-b5a3-f393-e0a9-e50e24dcca9e"
#define CHARACTERISTIC_UUID_RX "6e400002-b5a3-f393-e0a9-e50e24dcca9e"
#define CHARACTERISTIC_UUID_TX "6e400003-b5a3-f393-e0a9-e50e24dcca9e"

BLEServer* pServer = NULL;
BLECharacteristic* pTxCharacteristic = NULL;
bool bleClientConnected = false;

float bac = 0.00;
int rawAdc = 180;
float gasPpm = 20.0;
int rawGasAdc = 220;
int flameRawAdc = 3950;
bool flameDetected = false;
bool currentKnock = false;
bool relayState = true;
volatile int knockCount = 0;
volatile bool knockInstantFlag = false;
volatile unsigned long lastKnockIsrUs = 0;
unsigned long knockHoldUntilMs = 0;
unsigned long lastTelemetryMs = 0;

void IRAM_ATTR onKnockPulse() {
  unsigned long nowUs = micros();
  if (nowUs - lastKnockIsrUs > 25000) {
    knockCount++;
    knockInstantFlag = true;
    lastKnockIsrUs = nowUs;
  }
}

String buildTelemetryJson() {
  String json = "{";
  json += "\\"bac\\":" + String(bac, 3) + ",";
  json += "\\"adc\\":" + String(rawAdc) + ",";
  json += "\\"knock\\":" + String(currentKnock ? 1 : 0) + ",";
  json += "\\"kc\\":" + String(knockCount) + ",";
  json += "\\"flame\\":" + String(flameDetected ? 1 : 0) + ",";
  json += "\\"fadc\\":" + String(flameRawAdc) + ",";
  json += "\\"gas\\":" + String(gasPpm, 1) + ",";
  json += "\\"gadc\\":" + String(rawGasAdc) + ",";
  json += "\\"rly\\":" + String(relayState ? 1 : 0);
  json += "}";
  return json;
}

void sendBleTelemetry(const String& payload) {
  if (!bleClientConnected || pTxCharacteristic == NULL) return;
  String msg = payload + "\\n";
  int len = msg.length();
  for (int i = 0; i < len; i += 20) {
    String chunk = msg.substring(i, min(i + 20, len));
    pTxCharacteristic->setValue((uint8_t*)chunk.c_str(), chunk.length());
    pTxCharacteristic->notify();
    delay(3);
  }
}

class MyServerCallbacks: public BLEServerCallbacks {
  void onConnect(BLEServer* pServer) { bleClientConnected = true; }
  void onDisconnect(BLEServer* pServer) {
    bleClientConnected = false;
    BLEDevice::startAdvertising();
  }
};

class MyRxCallbacks: public BLECharacteristicCallbacks {
  void onWrite(BLECharacteristic *pCharacteristic) {
    String cmd = String(pCharacteristic->getValue().c_str());
    if (cmd.indexOf("RELAY:1") >= 0) { relayState = true; digitalWrite(RELAY_PIN, HIGH); }
    else if (cmd.indexOf("RELAY:0") >= 0) { relayState = false; digitalWrite(RELAY_PIN, LOW); }
  }
};

void sendCorsHeaders() {
  server.sendHeader("Access-Control-Allow-Origin", "*");
  server.sendHeader("Access-Control-Allow-Private-Network", "true");
}

void handleTelemetry() {
  sendCorsHeaders();
  server.send(200, "application/json", buildTelemetryJson());
}

void setup() {
  Serial.begin(115200);
  pinMode(KNOCK_PIN, INPUT_PULLUP);
  pinMode(FLAME_DIG_PIN, INPUT_PULLUP);
  pinMode(RELAY_PIN, OUTPUT);
  digitalWrite(RELAY_PIN, HIGH);
  attachInterrupt(digitalPinToInterrupt(KNOCK_PIN), onKnockPulse, CHANGE);

  WiFi.mode(WIFI_AP);
  WiFi.softAP(AP_SSID, AP_PASS);
  server.on("/", HTTP_GET, handleTelemetry);
  server.on("/telemetry", HTTP_GET, handleTelemetry);
  server.begin();

  BLEDevice::init("DriveLock-ESP32");
  BLEDevice::setMTU(247);
  pServer = BLEDevice::createServer();
  pServer->setCallbacks(new MyServerCallbacks());
  BLEService *pService = pServer->createService(SERVICE_UUID);
  pTxCharacteristic = pService->createCharacteristic(CHARACTERISTIC_UUID_TX, BLECharacteristic::PROPERTY_NOTIFY | BLECharacteristic::PROPERTY_READ);
  pTxCharacteristic->addDescriptor(new BLE2902());
  BLECharacteristic *pRxCharacteristic = pService->createCharacteristic(CHARACTERISTIC_UUID_RX, BLECharacteristic::PROPERTY_WRITE | BLECharacteristic::PROPERTY_WRITE_NR);
  pRxCharacteristic->setCallbacks(new MyRxCallbacks());
  pService->start();
  BLEDevice::getAdvertising()->addServiceUUID(SERVICE_UUID);
  BLEDevice::startAdvertising();
}

void loop() {
  server.handleClient();
  if (knockInstantFlag) {
    knockInstantFlag = false;
    knockHoldUntilMs = millis() + 750;
    currentKnock = true;
    String instantPayload = buildTelemetryJson();
    Serial.println(instantPayload);
    sendBleTelemetry(instantPayload);
  }
  if (millis() - lastTelemetryMs >= 250) {
    lastTelemetryMs = millis();
    rawAdc = analogRead(MQ3_PIN);
    bac = (rawAdc < 350) ? 0.00 : (rawAdc - 350) * 0.00012;
    currentKnock = (millis() < knockHoldUntilMs);
    flameRawAdc = analogRead(FLAME_ADC_PIN);
    flameDetected = (digitalRead(FLAME_DIG_PIN) == LOW) || (flameRawAdc < 800);
    if (flameDetected || bac > 0.03) { relayState = false; digitalWrite(RELAY_PIN, LOW); }
    rawGasAdc = analogRead(MQ9_PIN);
    gasPpm = (rawGasAdc < 200) ? 18.0 : (18.0 + (rawGasAdc - 200) * 0.12);
    String payload = buildTelemetryJson();
    Serial.println(payload);
    sendBleTelemetry(payload);
  }
}
`,
  nodemcu: `/*
 * ============================================================================
 * DriveLock Industrial Safety — NodeMCU (ESP8266) FIRMWARE (INSTANT TAP FIX)
 * ============================================================================
 */

#include <ESP8266WiFi.h>
#include <ESP8266WebServer.h>

#define MQ3_PIN        A0
#define KNOCK_PIN      4
#define FLAME_PIN      13
#define MQ9_DIGITAL    12
#define RELAY_PIN      5

const char* AP_SSID = "DriveLock-ESP";
const char* AP_PASS = "12345678";
ESP8266WebServer server(80);

float bac = 0.00;
int rawAdc = 110;
float gasPpm = 22.0;
bool currentKnock = false;
bool flameDetected = false;
bool relayState = true;
volatile int knockCount = 0;
volatile bool knockInstantFlag = false;
volatile unsigned long lastKnockIsrUs = 0;
unsigned long knockHoldUntilMs = 0;
unsigned long lastTelemetryMs = 0;

ICACHE_RAM_ATTR void onKnockPulse() {
  unsigned long nowUs = micros();
  if (nowUs - lastKnockIsrUs > 25000) {
    knockCount++;
    knockInstantFlag = true;
    lastKnockIsrUs = nowUs;
  }
}

String buildTelemetryJson() {
  String json = "{";
  json += "\\"bac\\":" + String(bac, 3) + ",";
  json += "\\"adc\\":" + String(rawAdc) + ",";
  json += "\\"knock\\":" + String(currentKnock ? 1 : 0) + ",";
  json += "\\"kc\\":" + String(knockCount) + ",";
  json += "\\"flame\\":" + String(flameDetected ? 1 : 0) + ",";
  json += "\\"gas\\":" + String(gasPpm, 1) + ",";
  json += "\\"rly\\":" + String(relayState ? 1 : 0);
  json += "}";
  return json;
}

void sendCorsHeaders() {
  server.sendHeader("Access-Control-Allow-Origin", "*");
  server.sendHeader("Access-Control-Allow-Private-Network", "true");
}

void handleTelemetry() {
  sendCorsHeaders();
  server.send(200, "application/json", buildTelemetryJson());
}

void setup() {
  Serial.begin(115200);
  pinMode(KNOCK_PIN, INPUT_PULLUP);
  pinMode(FLAME_PIN, INPUT_PULLUP);
  pinMode(MQ9_DIGITAL, INPUT_PULLUP);
  pinMode(RELAY_PIN, OUTPUT);
  digitalWrite(RELAY_PIN, HIGH);
  attachInterrupt(digitalPinToInterrupt(KNOCK_PIN), onKnockPulse, CHANGE);

  WiFi.mode(WIFI_AP);
  WiFi.softAP(AP_SSID, AP_PASS);
  server.on("/", HTTP_GET, handleTelemetry);
  server.on("/telemetry", HTTP_GET, handleTelemetry);
  server.begin();
}

void loop() {
  server.handleClient();
  if (knockInstantFlag) {
    knockInstantFlag = false;
    knockHoldUntilMs = millis() + 750;
    currentKnock = true;
    Serial.println(buildTelemetryJson());
  }
  if (millis() - lastTelemetryMs >= 250) {
    lastTelemetryMs = millis();
    rawAdc = analogRead(MQ3_PIN);
    bac = (rawAdc < 120) ? 0.00 : (rawAdc - 120) * 0.00035;
    currentKnock = (millis() < knockHoldUntilMs);
    flameDetected = (digitalRead(FLAME_PIN) == LOW);
    if (flameDetected || bac > 0.03) { relayState = false; digitalWrite(RELAY_PIN, LOW); }
    bool gasExceeded = (digitalRead(MQ9_DIGITAL) == LOW);
    gasPpm = gasExceeded ? 95.0 : 22.0;
    Serial.println(buildTelemetryJson());
  }
}
`,
};
