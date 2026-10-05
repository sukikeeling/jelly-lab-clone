/* ============================================================
 * audio.js — 真实 ASMR 采样音效（CC0）与 Web Audio 双模合成器
 * 捏=挤压声 / 切=落刀脆裂 / 晃=水波晃动 / 弹=果冻回弹 / 掷=骰子清脆
 * ============================================================ */
'use strict';

const JellySound = (() => {
  let enabled = true;
  let volume = 0.8;
  const cache = {};   // name -> Audio[]
  const POOL = 4;

  const SAMPLE_FILE = 'audio/jelly-wobble1.mp3';

  // Web Audio 上下文与高质量程序化合成（无外部文件依赖保底）
  let actx = null;
  function getAC() {
    if (!actx && (window.AudioContext || window.webkitAudioContext)) {
      actx = new (window.AudioContext || window.webkitAudioContext)();
    }
    if (actx && actx.state === 'suspended') {
      actx.resume().catch(() => {});
    }
    return actx;
  }

  function getSample() {
    if (!cache.sample) {
      cache.sample = [];
      for (let i = 0; i < POOL; i++) {
        const a = new Audio(SAMPLE_FILE);
        a.preload = 'auto';
        cache.sample.push(a);
      }
    }
    return cache.sample.find(a => a.paused) || cache.sample[0];
  }

  function playSample({ rate = 1, gain = 1, delay = 0 } = {}) {
    if (!enabled) return;
    try {
      const a = getSample();
      if (!a) return;
      a.playbackRate = rate;
      a.volume = Math.min(1, Math.max(0, volume * gain));
      a.currentTime = 0;
      if (delay > 0) setTimeout(() => a.play().catch(() => {}), delay * 1000);
      else a.play().catch(() => {});
    } catch (e) {}
  }

  // Web Audio 柔和 ASMR 合成音
  function synthTone(freqStart, freqEnd, duration, type = 'sine', gainVal = 0.3) {
    if (!enabled) return;
    const ctx = getAC();
    if (!ctx) return;
    try {
      const now = ctx.currentTime;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = type;
      osc.frequency.setValueAtTime(freqStart, now);
      osc.frequency.exponentialRampToValueAtTime(Math.max(20, freqEnd), now + duration);

      gain.gain.setValueAtTime(gainVal * volume, now);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(now);
      osc.stop(now + duration);
    } catch (e) {}
  }

  const rnd = (a, b) => a + Math.random() * (b - a);

  return {
    unlock() {
      if (!enabled) return;
      getAC();
      try {
        const a = getSample();
        if (a) {
          a.volume = 0;
          a.play().then(() => a.pause()).catch(() => {});
        }
      } catch (e) {}
    },
    get enabled() { return enabled; },
    setEnabled(v) { enabled = !!v; },
    setVolume(v) { volume = v; },

    // UI 轻点气泡
    pop() {
      synthTone(rnd(500, 650), 220, 0.08, 'sine', 0.25);
    },
    // 捏：史莱姆挤压饱满音
    squeeze(v = 1) {
      synthTone(rnd(180, 240), 90, 0.18, 'triangle', 0.35 * v);
      playSample({ rate: rnd(1.1, 1.4), gain: 0.35 * v });
    },
    // 切：利落落刀破开脆声
    slice() {
      synthTone(800, 160, 0.12, 'sawtooth', 0.3);
      playSample({ rate: rnd(1.3, 1.6), gain: 0.5 });
    },
    // 晃：柔韧水波晃动
    wobble() {
      playSample({ rate: rnd(0.9, 1.1), gain: 0.7 });
    },
    // 弹：Q 弹回弹
    boing(v = 1) {
      synthTone(rnd(240, 320), rnd(440, 520), 0.15, 'sine', 0.35 * v);
      playSample({ rate: rnd(1.0, 1.3), gain: 0.4 * v });
    },
    // 橡皮筋：紧绷与松开
    twang() {
      synthTone(rnd(350, 420), 120, 0.22, 'triangle', 0.4);
    },
    // 骰子摇晃
    rattle(n = 5) {
      for (let i = 0; i < n; i++) {
        setTimeout(() => synthTone(rnd(600, 900), 300, 0.04, 'sine', 0.25), i * 70);
      }
    },
    // 骰子落定
    thock() {
      synthTone(160, 60, 0.1, 'sine', 0.5);
    },
    // 模具成型
    mold() {
      synthTone(320, 560, 0.2, 'sine', 0.3);
      playSample({ rate: 1.2, gain: 0.3 });
    },
    // 翻面
    flip() {
      synthTone(220, 380, 0.18, 'sine', 0.35);
    },
  };
})();

window.JellySound = JellySound;
