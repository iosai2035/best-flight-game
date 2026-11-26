// Kestrel Ridge — sound: everything is synthesised with WebAudio.
// No audio files: an engine hum (two detuned sawtooths through a low-pass
// filter, pitch and loudness following throttle and RPM), wind noise
// (filtered noise whose level follows airspeed), a ring chime, a touchdown
// thud and a warning beep. Audio starts only after the first user gesture,
// as browsers require; until then the game is silent but fully playable.

export function createAudio() {
  const audio = {
    ctx: null,
    muted: false,
    engineGain: null,
    engineOscA: null,
    engineOscB: null,
    engineFilter: null,
    windGain: null,
    windSource: null,
    started: false,
  };

  audio.ensure = function ensure() {
    if (audio.started) {
      if (audio.ctx && audio.ctx.state === 'suspended') audio.ctx.resume();
      return;
    }
    try {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      const ctx = new Ctx();
      audio.ctx = ctx;

      // Master gain.
      const master = ctx.createGain();
      master.gain.value = audio.muted ? 0 : 0.5;
      master.connect(ctx.destination);
      audio.master = master;

      // Engine: two sawtooths an octave apart, low-passed.
      audio.engineFilter = ctx.createBiquadFilter();
      audio.engineFilter.type = 'lowpass';
      audio.engineFilter.frequency.value = 420;
      audio.engineFilter.Q.value = 2;
      audio.engineGain = ctx.createGain();
      audio.engineGain.gain.value = 0.0;
      audio.engineOscA = ctx.createOscillator();
      audio.engineOscA.type = 'sawtooth';
      audio.engineOscA.frequency.value = 55;
      audio.engineOscB = ctx.createOscillator();
      audio.engineOscB.type = 'sawtooth';
      audio.engineOscB.frequency.value = 110.5;
      const oscBGain = ctx.createGain();
      oscBGain.gain.value = 0.4;
      audio.engineOscA.connect(audio.engineFilter);
      audio.engineOscB.connect(oscBGain);
      oscBGain.connect(audio.engineFilter);
      audio.engineFilter.connect(audio.engineGain);
      audio.engineGain.connect(master);
      audio.engineOscA.start();
      audio.engineOscB.start();

      // Wind: a looped noise buffer through a band-pass filter.
      const length = ctx.sampleRate * 2;
      const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < length; i++) data[i] = Math.random() * 2 - 1;
      audio.windSource = ctx.createBufferSource();
      audio.windSource.buffer = buffer;
      audio.windSource.loop = true;
      const windFilter = ctx.createBiquadFilter();
      windFilter.type = 'bandpass';
      windFilter.frequency.value = 700;
      windFilter.Q.value = 0.6;
      audio.windGain = ctx.createGain();
      audio.windGain.gain.value = 0;
      audio.windSource.connect(windFilter);
      windFilter.connect(audio.windGain);
      audio.windGain.connect(master);
      audio.windSource.start();

      audio.started = true;
    } catch (err) {
      // Audio is a garnish: if the browser refuses, the game still flies.
      audio.started = false;
    }
  };

  // Called every frame: engine pitch follows throttle, wind follows speed,
  // and a stalled wing buffets — a low rumble through the wind filter.
  audio.update = function update(throttle, airspeed, dt, stalled) {
    if (!audio.started || !audio.ctx) return;
    const t = audio.ctx.currentTime;
    const rpm = 52 + throttle * 78;
    audio.engineOscA.frequency.setTargetAtTime(rpm, t, 0.08);
    audio.engineOscB.frequency.setTargetAtTime(rpm * 2.01, t, 0.08);
    audio.engineFilter.frequency.setTargetAtTime(320 + throttle * 900, t, 0.1);
    audio.engineGain.gain.setTargetAtTime(0.05 + throttle * 0.11, t, 0.1);
    const windLevel = Math.min(0.22, Math.max(0, (airspeed - 18) / 90) * 0.22);
    audio.windGain.gain.setTargetAtTime(windLevel + (stalled ? 0.10 : 0), t, 0.15);
  };

  function tone(freq, dur, type, vol, when = 0) {
    if (!audio.started || !audio.ctx) return;
    const ctx = audio.ctx;
    const t0 = ctx.currentTime + when;
    const osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.value = freq;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t0);
    g.gain.linearRampToValueAtTime(vol, t0 + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(g);
    g.connect(audio.master);
    osc.start(t0);
    osc.stop(t0 + dur + 0.05);
  }

  audio.ringChime = function ringChime() {
    tone(880, 0.5, 'sine', 0.22);
    tone(1318, 0.6, 'sine', 0.16, 0.07);
    tone(1760, 0.7, 'sine', 0.10, 0.14);
  };

  audio.fuelChime = function fuelChime() {
    tone(659, 0.35, 'triangle', 0.2);
    tone(988, 0.45, 'triangle', 0.16, 0.08);
  };

  audio.thud = function thud(hard) {
    if (!audio.started || !audio.ctx) return;
    const ctx = audio.ctx;
    const t0 = ctx.currentTime;
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(hard ? 90 : 65, t0);
    osc.frequency.exponentialRampToValueAtTime(32, t0 + 0.25);
    const g = ctx.createGain();
    g.gain.setValueAtTime(hard ? 0.5 : 0.3, t0);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.3);
    osc.connect(g);
    g.connect(audio.master);
    osc.start(t0);
    osc.stop(t0 + 0.35);
  };

  audio.warning = function warning() {
    tone(440, 0.16, 'square', 0.08);
    tone(440, 0.16, 'square', 0.08, 0.22);
  };

  audio.crash = function crash() {
    if (!audio.started || !audio.ctx) return;
    const ctx = audio.ctx;
    const t0 = ctx.currentTime;
    const buffer = ctx.createBuffer(1, ctx.sampleRate * 0.5, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / data.length);
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    const g = ctx.createGain();
    g.gain.value = 0.5;
    src.connect(g);
    g.connect(audio.master);
    src.start(t0);
    tone(70, 0.6, 'sawtooth', 0.25);
  };

  audio.toggleMute = function toggleMute() {
    audio.muted = !audio.muted;
    if (audio.master && audio.ctx) {
      audio.master.gain.setTargetAtTime(audio.muted ? 0 : 0.5, audio.ctx.currentTime, 0.05);
    }
    return audio.muted;
  };

  return audio;
}
