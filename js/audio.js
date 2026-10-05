/* ============================================================
 * audio.js — Web Audio 合成 ASMR 音效
 * 捏=挤压声 / 切=脆裂声 / 晃=水波声 / 弹=Q弹声 / 摇=骰子声
 * ============================================================ */
'use strict';

const JellySound = (() => {
  let ctx = null;
  let master = null;
  let enabled = true;
  let volume = 0.8;

  function ensure() {
    if (ctx) { if (ctx.state === 'suspended') ctx.resume(); return true; }
    try {
      ctx = new (window.AudioContext || window.webkitAudioContext)();
      master = ctx.createGain();
      master.gain.value = volume;
      master.connect(ctx.destination);
      return true;
    } catch (e) { return false; }
  }

  function noiseBuffer(dur) {
    const b = ctx.createBuffer(1, ctx.sampleRate * dur, ctx.sampleRate);
    const d = b.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    return b;
  }

  function playNoise({ dur = 0.2, freq = 800, q = 1, type = 'lowpass', gain = 0.5, slideTo = null, at = 0 }) {
    if (!enabled || !ensure()) return;
    const t = ctx.currentTime + at;
    const src = ctx.createBufferSource();
    src.buffer = noiseBuffer(dur + 0.05);
    const f = ctx.createBiquadFilter();
    f.type = type; f.frequency.setValueAtTime(freq, t); f.Q.value = q;
    if (slideTo) f.frequency.exponentialRampToValueAtTime(Math.max(40, slideTo), t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + 0.015);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f); f.connect(g); g.connect(master);
    src.start(t); src.stop(t + dur + 0.05);
  }

  function playTone({ freq = 440, dur = 0.2, type = 'sine', gain = 0.3, slideTo = null, at = 0 }) {
    if (!enabled || !ensure()) return;
    const t = ctx.currentTime + at;
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(Math.max(20, slideTo), t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(master);
    o.start(t); o.stop(t + dur + 0.05);
  }

  return {
    unlock() { ensure(); },
    get enabled() { return enabled; },
    setEnabled(v) { enabled = !!v; },
    setVolume(v) { volume = v; if (master) master.gain.value = v; },

    // UI 轻点
    pop() { playTone({ freq: 660, slideTo: 880, dur: 0.08, gain: 0.18, type: 'sine' }); },
    // 捏：低频挤压
    squeeze(v = 1) {
      playNoise({ dur: 0.28, freq: 320, slideTo: 120, q: 0.8, gain: 0.4 * v });
      playTone({ freq: 140, slideTo: 70, dur: 0.25, gain: 0.22 * v });
    },
    // 切：脆裂
    slice() {
      playNoise({ dur: 0.12, freq: 3200, slideTo: 900, q: 1.4, type: 'bandpass', gain: 0.5 });
      playTone({ freq: 1900, slideTo: 700, dur: 0.09, gain: 0.16, type: 'triangle' });
    },
    // 晃：水波
    wobble() {
      playTone({ freq: 220, slideTo: 330, dur: 0.35, gain: 0.25 });
      playTone({ freq: 330, slideTo: 180, dur: 0.4, gain: 0.2, at: 0.12 });
      playNoise({ dur: 0.5, freq: 900, slideTo: 400, q: 2, gain: 0.12 });
    },
    // 弹：Q 弹
    boing(v = 1) {
      playTone({ freq: 300, slideTo: 520, dur: 0.16, gain: 0.3 * v, type: 'sine' });
      playTone({ freq: 520, slideTo: 380, dur: 0.14, gain: 0.2 * v, at: 0.1 });
    },
    // 橡皮筋：绷
    twang() {
      playTone({ freq: 180, slideTo: 90, dur: 0.22, gain: 0.3, type: 'sawtooth' });
      playNoise({ dur: 0.1, freq: 1200, q: 3, type: 'bandpass', gain: 0.2 });
    },
    // 骰子摇晃
    rattle(n = 5) {
      for (let i = 0; i < n; i++) {
        playNoise({ dur: 0.05, freq: 2200 + Math.random() * 1500, q: 2, type: 'bandpass', gain: 0.3, at: i * 0.09 });
      }
    },
    // 骰子落定
    thock() {
      playTone({ freq: 240, slideTo: 120, dur: 0.12, gain: 0.4, type: 'triangle' });
      playNoise({ dur: 0.06, freq: 900, q: 1, gain: 0.25 });
    },
    // 模具成型
    mold() {
      playNoise({ dur: 0.3, freq: 500, slideTo: 200, q: 1, gain: 0.3 });
      playTone({ freq: 440, slideTo: 660, dur: 0.2, gain: 0.2, at: 0.15 });
    },
    // 翻面
    flip() {
      playNoise({ dur: 0.25, freq: 700, slideTo: 1400, q: 1.5, gain: 0.22 });
    },
  };
})();

window.JellySound = JellySound;
