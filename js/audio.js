/* ============================================================
 * audio.js — 真实 ASMR 采样音效（CC0，Freesound）
 * 捏=史莱姆挤压 / 切=西瓜刀切 / 晃=果冻晃动 / 弹=果冻揉捏
 *
 * 音源（CC0，可商用，无需署名）：
 * - jelly-wobble1/2.mp3: "Jelly Wobbling on Plate" by lolamadeus
 *   https://freesound.org/people/lolamadeus/sounds/181914/
 * - jelly-mangle.mp3: "Jelly Mangling on Plate" by lolamadeus
 * - jelly-fall1/2.mp3: "Jelly Falling Onto Plate" by lolamadeus
 * - melon-stab.mp3: "J's Meaty Stab" (stabbing watermelon) by justjenah
 *   https://freesound.org/people/justjenah/sounds/752346/
 * - slime-squish.mp3: "Blood Gore Slime Squish" by EminYILDIRIM
 *   https://freesound.org/people/EminYILDIRIM/sounds/535354/
 * - slime-noise.mp3: "slime noise" by jtap97
 *   https://freesound.org/people/jtap97/sounds/448893/
 * ============================================================ */
'use strict';

const JellySound = (() => {
  let enabled = true;
  let volume = 0.8;
  const cache = {};   // name -> Audio[]
  const POOL = 4;

  const FILES = {
    wobble1: 'audio/jelly-wobble1.mp3',
    wobble2: 'audio/jelly-wobble2.mp3',
    mangle:  'audio/jelly-mangle.mp3',
    fall1:   'audio/jelly-fall1.mp3',
    fall2:   'audio/jelly-fall2.mp3',
    stab:    'audio/melon-stab.mp3',
    squish:  'audio/slime-squish.mp3',
    snoise:  'audio/slime-noise.mp3',
  };

  function get(name) {
    if (!cache[name]) {
      cache[name] = [];
      for (let i = 0; i < POOL; i++) {
        const a = new Audio(FILES[name]);
        a.preload = 'auto';
        cache[name].push(a);
      }
    }
    // 找一个空闲的
    const pool = cache[name];
    return pool.find(a => a.paused) || pool[0];
  }

  function play(name, { rate = 1, gain = 1, delay = 0 } = {}) {
    if (!enabled) return;
    try {
      const a = get(name);
      a.playbackRate = rate;
      a.volume = Math.min(1, volume * gain);
      a.currentTime = 0;
      if (delay > 0) setTimeout(() => a.play().catch(() => {}), delay * 1000);
      else a.play().catch(() => {});
    } catch (e) {}
  }

  const rnd = (a, b) => a + Math.random() * (b - a);

  return {
    unlock() {
      // 预加载：播一次静音以解锁移动端音频
      if (!enabled) return;
      try {
        const a = get('wobble1');
        a.volume = 0; a.play().then(() => a.pause()).catch(() => {});
      } catch (e) {}
    },
    get enabled() { return enabled; },
    setEnabled(v) { enabled = !!v; },
    setVolume(v) { volume = v; },

    // UI 轻点
    pop() { play('fall1', { rate: 1.8, gain: 0.5 }); },
    // 捏：史莱姆挤压
    squeeze(v = 1) {
      play('squish', { rate: rnd(0.85, 1.15), gain: 0.7 * v });
      play('mangle', { rate: rnd(0.9, 1.2), gain: 0.4 * v, delay: 0.05 });
    },
    // 切：刀切西瓜
    slice() {
      play('stab', { rate: rnd(0.95, 1.1), gain: 0.8 });
    },
    // 晃：果冻晃动
    wobble() {
      play(Math.random() < 0.5 ? 'wobble1' : 'wobble2', { rate: rnd(0.9, 1.1), gain: 0.7 });
    },
    // 弹：Q 弹
    boing(v = 1) {
      play('mangle', { rate: rnd(1.1, 1.4), gain: 0.6 * v });
      play('wobble1', { rate: rnd(1.2, 1.5), gain: 0.3 * v, delay: 0.08 });
    },
    // 橡皮筋：绷
    twang() {
      play('snoise', { rate: rnd(0.7, 0.9), gain: 0.6 });
      play('squish', { rate: 1.3, gain: 0.3, delay: 0.05 });
    },
    // 骰子摇晃
    rattle(n = 5) {
      for (let i = 0; i < n; i++) {
        play('fall1', { rate: rnd(1.4, 1.8), gain: 0.5, delay: i * 0.09 });
      }
    },
    // 骰子落定
    thock() {
      play('fall2', { rate: rnd(0.9, 1.1), gain: 0.8 });
    },
    // 模具成型
    mold() {
      play('snoise', { rate: rnd(0.8, 1.0), gain: 0.5 });
      play('squish', { rate: 0.8, gain: 0.4, delay: 0.15 });
    },
    // 翻面
    flip() {
      play('wobble2', { rate: 1.2, gain: 0.5 });
    },
  };
})();

window.JellySound = JellySound;
