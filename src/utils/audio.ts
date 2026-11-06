/**
 * Web Audio API synthesizer for industrial cab sounds.
 * Delivers realistic tactile feedback: heavy solenoid ignition relays,
 * oversized PIN keypad clicks, warning beeps, and emergency sirens.
 */

class CabAudioEngine {
  private ctx: AudioContext | null = null;
  public isMuted: boolean = false;

  private init() {
    if (!this.ctx && typeof window !== 'undefined') {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (AudioCtx) {
        this.ctx = new AudioCtx();
      }
    }
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }
  }

  /**
   * Mechanical tactile keypress thud for 64px PIN keys
   */
  public playKeyClick() {
    if (this.isMuted) return;
    try {
      this.init();
      if (!this.ctx) return;

      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();

      osc.type = 'triangle';
      osc.frequency.setValueAtTime(140, this.ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(45, this.ctx.currentTime + 0.04);

      gain.gain.setValueAtTime(0.3, this.ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.045);

      osc.connect(gain);
      gain.connect(this.ctx.destination);

      osc.start();
      osc.stop(this.ctx.currentTime + 0.05);

      // Trigger browser vibration if supported
      if ('vibrate' in navigator) {
        navigator.vibrate(12);
      }
    } catch {
      // AudioContext policy fallback
    }
  }

  /**
   * Heavy industrial ignition relay solenoid clunk (Unlock or Lock event)
   */
  public playRelaySolenoid(isEngaging: boolean) {
    if (this.isMuted) return;
    try {
      this.init();
      if (!this.ctx) return;

      const t = this.ctx.currentTime;
      const osc = this.ctx.createOscillator();
      const noise = this.ctx.createOscillator();
      const gain = this.ctx.createGain();

      // Solenoid mechanical thud
      osc.type = 'square';
      osc.frequency.setValueAtTime(isEngaging ? 80 : 60, t);
      osc.frequency.exponentialRampToValueAtTime(isEngaging ? 180 : 35, t + 0.12);

      noise.type = 'sine';
      noise.frequency.setValueAtTime(isEngaging ? 320 : 210, t);
      noise.frequency.exponentialRampToValueAtTime(60, t + 0.14);

      gain.gain.setValueAtTime(0.4, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.15);

      osc.connect(gain);
      noise.connect(gain);
      gain.connect(this.ctx.destination);

      osc.start(t);
      noise.start(t);
      osc.stop(t + 0.16);
      noise.stop(t + 0.16);

      if ('vibrate' in navigator) {
        navigator.vibrate([40, 20, 40]);
      }
    } catch {
      // AudioContext policy fallback
    }
  }

  /**
   * Warning chime / Immobilizer alert buzzer
   */
  public playWarningBuzzer() {
    if (this.isMuted) return;
    try {
      this.init();
      if (!this.ctx) return;

      const t = this.ctx.currentTime;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();

      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(660, t);
      osc.frequency.setValueAtTime(880, t + 0.08);

      gain.gain.setValueAtTime(0.2, t);
      gain.gain.setValueAtTime(0.25, t + 0.08);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.22);

      osc.connect(gain);
      gain.connect(this.ctx.destination);

      osc.start(t);
      osc.stop(t + 0.24);

      if ('vibrate' in navigator) {
        navigator.vibrate([60, 40, 60]);
      }
    } catch {
      // AudioContext policy fallback
    }
  }

  /**
   * Safety Pass / Verification chime
   */
  public playSuccessChime() {
    if (this.isMuted) return;
    try {
      this.init();
      if (!this.ctx) return;

      const t = this.ctx.currentTime;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(523.25, t); // C5
      osc.frequency.setValueAtTime(659.25, t + 0.1); // E5
      osc.frequency.setValueAtTime(783.99, t + 0.2); // G5

      gain.gain.setValueAtTime(0.25, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.45);

      osc.connect(gain);
      gain.connect(this.ctx.destination);

      osc.start(t);
      osc.stop(t + 0.46);

      if ('vibrate' in navigator) {
        navigator.vibrate(50);
      }
    } catch {
      // AudioContext policy fallback
    }
  }

  /**
   * Emergency SOS beacon sound
   */
  public playEmergencyAlarm() {
    if (this.isMuted) return;
    try {
      this.init();
      if (!this.ctx) return;

      const t = this.ctx.currentTime;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();

      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(900, t);
      osc.frequency.linearRampToValueAtTime(450, t + 0.25);
      osc.frequency.linearRampToValueAtTime(900, t + 0.5);

      gain.gain.setValueAtTime(0.35, t);
      gain.gain.exponentialRampToValueAtTime(0.01, t + 0.55);

      osc.connect(gain);
      gain.connect(this.ctx.destination);

      osc.start(t);
      osc.stop(t + 0.56);

      if ('vibrate' in navigator) {
        navigator.vibrate([100, 50, 100, 50, 100]);
      }
    } catch {
      // AudioContext policy fallback
    }
  }
}

export const cabAudio = new CabAudioEngine();
