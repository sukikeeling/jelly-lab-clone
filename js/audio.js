/* ============================================================
 * audio.js — 高质量拟真 ASMR 音效系统（Web Audio 物理拟真合成器 + 真实采样）
 * 拒绝假电音与人机蜂鸣：沉浸式挤压水润声、切开清脆声、回弹 Q 弹啵唧声、
 * 橡皮筋收紧与爆炸声、骰子实心清脆碰撞声
 * ============================================================ */
'use strict';

const JellySound = (() => {
  let enabled = true;
  let volume = 0.8;
  const SAMPLE_FILE = 'audio/jelly-wobble1.mp3';

  let actx = null;
  let sampleBuffer = null;
  let sampleLoading = false;
  let noiseBuffer = null; // 预渲染 2 秒粉红/微泡湿润噪声缓冲

  const rnd = (a, b) => a + Math.random() * (b - a);

  function getAC() {
    if (!actx && (window.AudioContext || window.webkitAudioContext)) {
      actx = new (window.AudioContext || window.webkitAudioContext)();
    }
    if (actx && actx.state === 'suspended') {
      actx.resume().catch(() => {});
    }
    return actx;
  }

  // 预渲染粉红/流体微颗粒噪声缓冲（用于高质量模拟水润、摩擦与水滴）
  function getNoiseBuffer(ctx) {
    if (noiseBuffer) return noiseBuffer;
    const rate = ctx.sampleRate || 44100;
    const len = rate * 2; // 2 秒循环
    const b = ctx.createBuffer(1, len, rate);
    const data = b.getChannelData(0);
    let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
    for (let i = 0; i < len; i++) {
      const white = Math.random() * 2 - 1;
      // 3dB/octave 粉红滤波
      b0 = 0.99886 * b0 + white * 0.0555179;
      b1 = 0.99332 * b1 + white * 0.0750759;
      b2 = 0.96900 * b2 + white * 0.1538520;
      b3 = 0.86650 * b3 + white * 0.3104856;
      b4 = 0.55000 * b4 + white * 0.5329522;
      b5 = -0.7616 * b5 - white * 0.0168980;
      data[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + white * 0.5362) * 0.11;
      b6 = white * 0.115926;
    }
    noiseBuffer = b;
    return noiseBuffer;
  }

  // 预加载真实采样为 AudioBuffer（零延迟、高保真）
  function loadSample() {
    if (sampleBuffer || sampleLoading) return;
    const ctx = getAC();
    if (!ctx) return;
    sampleLoading = true;
    fetch(SAMPLE_FILE)
      .then(res => res.arrayBuffer())
      .then(buf => ctx.decodeAudioData(buf))
      .then(decoded => {
        sampleBuffer = decoded;
        sampleLoading = false;
      })
      .catch(() => {
        sampleLoading = false;
      });
  }

  function playSampleLayer({ rate = 1.0, gain = 0.5, delay = 0 } = {}) {
    if (!enabled) return;
    const ctx = getAC();
    if (!ctx || !sampleBuffer) return;
    try {
      const src = ctx.createBufferSource();
      src.buffer = sampleBuffer;
      src.playbackRate.value = rate;

      const g = ctx.createGain();
      g.gain.value = Math.min(1.0, Math.max(0, volume * gain));

      src.connect(g);
      g.connect(ctx.destination);

      const startTime = ctx.currentTime + Math.max(0, delay);
      src.start(startTime);
    } catch (e) {}
  }

  return {
    unlock() {
      if (!enabled) return;
      const ctx = getAC();
      if (ctx) {
        loadSample();
        getNoiseBuffer(ctx);
      }
    },
    get enabled() { return enabled; },
    setEnabled(v) { enabled = !!v; },
    get volume() { return volume; },
    setVolume(v) { volume = Math.max(0, Math.min(1, v)); },

    /* ============================================================
     * 1. 🫧 UI 轻点温润气泡音 (pop)
     * ============================================================ */
    pop() {
      if (!enabled) return;
      const ctx = getAC(); if (!ctx) return;
      try {
        const now = ctx.currentTime;
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        const filter = ctx.createBiquadFilter();

        const baseF = rnd(520, 640);
        osc.type = 'sine';
        osc.frequency.setValueAtTime(baseF, now);
        osc.frequency.exponentialRampToValueAtTime(baseF * 0.45, now + 0.055);

        filter.type = 'lowpass';
        filter.frequency.setValueAtTime(1400, now);

        gain.gain.setValueAtTime(0.001, now);
        gain.gain.linearRampToValueAtTime(0.22 * volume, now + 0.006);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.055);

        osc.connect(filter);
        filter.connect(gain);
        gain.connect(ctx.destination);

        osc.start(now);
        osc.stop(now + 0.06);
      } catch (e) {}
    },

    /* ============================================================
     * 2. 🍉 沉浸式果冻水润挤压声 (squeeze ASMR)
     * 胶体指缝水声 + 低频软体形变 + 微泡破裂爆汁感
     * ============================================================ */
    squeeze(intensity = 1.0) {
      if (!enabled) return;
      const ctx = getAC(); if (!ctx) return;
      try {
        const now = ctx.currentTime;
        const dur = rnd(0.18, 0.26);

        // A. 低频肉感弹性质感 (Sub-bass plop)
        const subOsc = ctx.createOscillator();
        const subGain = ctx.createGain();
        subOsc.type = 'sine';
        subOsc.frequency.setValueAtTime(rnd(110, 140), now);
        subOsc.frequency.exponentialRampToValueAtTime(rnd(50, 65), now + dur);

        subGain.gain.setValueAtTime(0.001, now);
        subGain.gain.linearRampToValueAtTime(0.32 * volume * intensity, now + 0.015);
        subGain.gain.exponentialRampToValueAtTime(0.0001, now + dur);

        subOsc.connect(subGain);
        subGain.connect(ctx.destination);
        subOsc.start(now);
        subOsc.stop(now + dur);

        // B. 湿润粘稠滑移摩擦声 (Viscous liquid squelch via filtered noise)
        const nb = getNoiseBuffer(ctx);
        if (nb) {
          const noiseSrc = ctx.createBufferSource();
          noiseSrc.buffer = nb;
          noiseSrc.loop = true;

          const bp = ctx.createBiquadFilter();
          bp.type = 'bandpass';
          bp.Q.value = 5.2;
          const centerF = rnd(500, 850);
          bp.frequency.setValueAtTime(centerF, now);
          bp.frequency.exponentialRampToValueAtTime(centerF * 1.5, now + dur * 0.4);
          bp.frequency.exponentialRampToValueAtTime(centerF * 0.6, now + dur);

          const noiseGain = ctx.createGain();
          noiseGain.gain.setValueAtTime(0.001, now);
          noiseGain.gain.linearRampToValueAtTime(0.26 * volume * intensity, now + 0.02);
          noiseGain.gain.exponentialRampToValueAtTime(0.0001, now + dur);

          noiseSrc.connect(bp);
          bp.connect(noiseGain);
          noiseGain.connect(ctx.destination);
          noiseSrc.start(now);
          noiseSrc.stop(now + dur);
        }

        // C. 微气泡破裂水珠声 (Micro bubble pops)
        for (let i = 0; i < 2; i++) {
          const popTime = now + rnd(0.03, 0.12);
          const popOsc = ctx.createOscillator();
          const popGain = ctx.createGain();
          popOsc.type = 'sine';
          const pF = rnd(1200, 1900);
          popOsc.frequency.setValueAtTime(pF, popTime);
          popOsc.frequency.exponentialRampToValueAtTime(pF * 0.5, popTime + 0.02);

          popGain.gain.setValueAtTime(0.001, popTime);
          popGain.gain.linearRampToValueAtTime(0.12 * volume * intensity, popTime + 0.003);
          popGain.gain.exponentialRampToValueAtTime(0.0001, popTime + 0.02);

          popOsc.connect(popGain);
          popGain.connect(ctx.destination);
          popOsc.start(popTime);
          popOsc.stop(popTime + 0.025);
        }

        // 真实采样轻微层叠混响
        playSampleLayer({ rate: rnd(1.15, 1.35), gain: 0.32 * intensity });
      } catch (e) {}
    },

    /* ============================================================
     * 3. 🔪 切开清脆声 (slice ASMR)
     * 极利落破皮高频割裂 + 胶体裂解脆响 + 水润释放
     * ============================================================ */
    slice() {
      if (!enabled) return;
      const ctx = getAC(); if (!ctx) return;
      try {
        const now = ctx.currentTime;

        // A. 锋利刃口破开表皮高频瞬态 (Razor shear highpass burst)
        const nb = getNoiseBuffer(ctx);
        if (nb) {
          const cutNoise = ctx.createBufferSource();
          cutNoise.buffer = nb;
          const hp = ctx.createBiquadFilter();
          hp.type = 'highpass';
          hp.frequency.setValueAtTime(4500, now);
          hp.frequency.exponentialRampToValueAtTime(2500, now + 0.04);

          const cutGain = ctx.createGain();
          cutGain.gain.setValueAtTime(0.001, now);
          cutGain.gain.linearRampToValueAtTime(0.42 * volume, now + 0.004);
          cutGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.045);

          cutNoise.connect(hp);
          hp.connect(cutGain);
          cutGain.connect(ctx.destination);
          cutNoise.start(now);
          cutNoise.stop(now + 0.05);
        }

        // B. 胶体瞬间断裂清脆声 (Body fracture click & snap)
        const snapOsc = ctx.createOscillator();
        const snapGain = ctx.createGain();
        snapOsc.type = 'triangle';
        snapOsc.frequency.setValueAtTime(rnd(950, 1250), now);
        snapOsc.frequency.exponentialRampToValueAtTime(rnd(240, 320), now + 0.06);

        snapGain.gain.setValueAtTime(0.001, now);
        snapGain.gain.linearRampToValueAtTime(0.35 * volume, now + 0.005);
        snapGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.07);

        snapOsc.connect(snapGain);
        snapGain.connect(ctx.destination);
        snapOsc.start(now);
        snapOsc.stop(now + 0.075);

        // C. 水润清爽分离声
        playSampleLayer({ rate: rnd(1.35, 1.6), gain: 0.45 });
      } catch (e) {}
    },

    /* ============================================================
     * 4. 🍮 回弹 Q 弹啵唧声 (boing ASMR)
     * 饱满圆润的变频跃升与微抖衰减，无锯齿波无生硬数字感
     * ============================================================ */
    boing(intensity = 1.0) {
      if (!enabled) return;
      const ctx = getAC(); if (!ctx) return;
      try {
        const now = ctx.currentTime;
        const dur = rnd(0.18, 0.24);

        const osc1 = ctx.createOscillator();
        const osc2 = ctx.createOscillator();
        const gain = ctx.createGain();
        const filter = ctx.createBiquadFilter();

        const baseF = rnd(170, 220);
        const topF = rnd(340, 420);

        osc1.type = 'sine';
        osc1.frequency.setValueAtTime(baseF, now);
        osc1.frequency.exponentialRampToValueAtTime(topF, now + 0.035);
        osc1.frequency.exponentialRampToValueAtTime(baseF * 1.1, now + dur);

        // 柔和 2 次微谐波充盈胶体质感
        osc2.type = 'sine';
        osc2.frequency.setValueAtTime(baseF * 2, now);
        osc2.frequency.exponentialRampToValueAtTime(topF * 2, now + 0.035);
        osc2.frequency.exponentialRampToValueAtTime(baseF * 2.2, now + dur);

        filter.type = 'lowpass';
        filter.frequency.setValueAtTime(750, now);
        filter.Q.value = 4.0;

        gain.gain.setValueAtTime(0.001, now);
        gain.gain.linearRampToValueAtTime(0.36 * volume * intensity, now + 0.015);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + dur);

        osc1.connect(filter);
        osc2.connect(filter);
        filter.connect(gain);
        gain.connect(ctx.destination);

        osc1.start(now);
        osc2.start(now);
        osc1.stop(now + dur);
        osc2.stop(now + dur);

        playSampleLayer({ rate: rnd(1.05, 1.25), gain: 0.35 * intensity });
      } catch (e) {}
    },

    /* ============================================================
     * 5. 🌊 柔韧水波晃动 (wobble ASMR)
     * 纯净深层液体晃荡与水珠微动
     * ============================================================ */
    wobble() {
      if (!enabled) return;
      const ctx = getAC(); if (!ctx) return;
      try {
        const now = ctx.currentTime;
        const dur = 0.35;

        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(140, now);
        osc.frequency.linearRampToValueAtTime(180, now + 0.1);
        osc.frequency.exponentialRampToValueAtTime(95, now + dur);

        gain.gain.setValueAtTime(0.001, now);
        gain.gain.linearRampToValueAtTime(0.28 * volume, now + 0.04);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + dur);

        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(now);
        osc.stop(now + dur);

        playSampleLayer({ rate: rnd(0.88, 1.05), gain: 0.65 });
      } catch (e) {}
    },

    /* ============================================================
     * 6. ➰ 橡皮筋收紧弹拨与勒入声 (twang ASMR)
     * 紧绷橡胶弹响 + 勒进表皮短促摩擦
     * ============================================================ */
    twang() {
      if (!enabled) return;
      const ctx = getAC(); if (!ctx) return;
      try {
        const now = ctx.currentTime;
        const dur = 0.22;

        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        const filter = ctx.createBiquadFilter();

        osc.type = 'triangle';
        const f0 = rnd(360, 440);
        osc.frequency.setValueAtTime(f0, now);
        osc.frequency.exponentialRampToValueAtTime(140, now + dur);

        filter.type = 'bandpass';
        filter.frequency.setValueAtTime(650, now);
        filter.Q.value = 3.5;

        gain.gain.setValueAtTime(0.001, now);
        gain.gain.linearRampToValueAtTime(0.38 * volume, now + 0.008);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + dur);

        osc.connect(filter);
        filter.connect(gain);
        gain.connect(ctx.destination);

        osc.start(now);
        osc.stop(now + dur);

        // 橡胶拉伸微白噪
        const nb = getNoiseBuffer(ctx);
        if (nb) {
          const rSrc = ctx.createBufferSource();
          rSrc.buffer = nb;
          const rFilter = ctx.createBiquadFilter();
          rFilter.type = 'highpass';
          rFilter.frequency.setValueAtTime(1800, now);
          const rGain = ctx.createGain();
          rGain.gain.setValueAtTime(0.18 * volume, now);
          rGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.05);

          rSrc.connect(rFilter);
          rFilter.connect(rGain);
          rGain.connect(ctx.destination);
          rSrc.start(now);
          rSrc.stop(now + 0.055);
        }
      } catch (e) {}
    },

    /* ============================================================
     * 7. 💥 橡皮筋西瓜爆裂/解压飞溅爆炸 (explode / juicy burst ASMR)
     * 橡胶断裂啪响 + 低频果肉轰响 + 大片汁水飞溅
     * ============================================================ */
    explode() {
      if (!enabled) return;
      const ctx = getAC(); if (!ctx) return;
      try {
        const now = ctx.currentTime;

        // A. 啪断脆响 (Sharp snap)
        const snap = ctx.createOscillator();
        const snapG = ctx.createGain();
        snap.type = 'sine';
        snap.frequency.setValueAtTime(1800, now);
        snap.frequency.exponentialRampToValueAtTime(120, now + 0.06);
        snapG.gain.setValueAtTime(0.6 * volume, now);
        snapG.gain.exponentialRampToValueAtTime(0.0001, now + 0.07);
        snap.connect(snapG);
        snapG.connect(ctx.destination);
        snap.start(now);
        snap.stop(now + 0.075);

        // B. 低频果肉冲击重音 (Juicy bass thump)
        const sub = ctx.createOscillator();
        const subG = ctx.createGain();
        sub.type = 'sine';
        sub.frequency.setValueAtTime(95, now);
        sub.frequency.exponentialRampToValueAtTime(32, now + 0.35);
        subG.gain.setValueAtTime(0.65 * volume, now);
        subG.gain.exponentialRampToValueAtTime(0.0001, now + 0.38);
        sub.connect(subG);
        subG.connect(ctx.destination);
        sub.start(now);
        sub.stop(now + 0.4);

        // C. 大量水花飞溅散落 (Splash burst)
        const nb = getNoiseBuffer(ctx);
        if (nb) {
          const spSrc = ctx.createBufferSource();
          spSrc.buffer = nb;
          const spF = ctx.createBiquadFilter();
          spF.type = 'bandpass';
          spF.frequency.setValueAtTime(1600, now);
          spF.frequency.exponentialRampToValueAtTime(700, now + 0.45);
          spF.Q.value = 1.8;

          const spG = ctx.createGain();
          spG.gain.setValueAtTime(0.48 * volume, now + 0.01);
          spG.gain.exponentialRampToValueAtTime(0.0001, now + 0.48);

          spSrc.connect(spF);
          spF.connect(spG);
          spG.connect(ctx.destination);
          spSrc.start(now);
          spSrc.stop(now + 0.5);
        }

        playSampleLayer({ rate: 0.85, gain: 0.8 });
      } catch (e) {}
    },

    /* ============================================================
     * 8. 🎲 骰子清脆实心碰撞声 (thock & rattle)
     * 双共振峰模拟树脂与硬木撞击
     * ============================================================ */
    thock() {
      if (!enabled) return;
      const ctx = getAC(); if (!ctx) return;
      try {
        const now = ctx.currentTime;
        const dur = 0.085;

        // A. 瞬态硬质接触点 (Transient click)
        const clk = ctx.createOscillator();
        const clkG = ctx.createGain();
        clk.type = 'sine';
        clk.frequency.setValueAtTime(2600, now);
        clk.frequency.exponentialRampToValueAtTime(450, now + 0.015);
        clkG.gain.setValueAtTime(0.45 * volume, now);
        clkG.gain.exponentialRampToValueAtTime(0.0001, now + 0.02);
        clk.connect(clkG);
        clkG.connect(ctx.destination);
        clk.start(now);
        clk.stop(now + 0.025);

        // B. 实心箱体共鸣底音 (Body resonance)
        const body = ctx.createOscillator();
        const bodyG = ctx.createGain();
        body.type = 'triangle';
        body.frequency.setValueAtTime(210, now);
        body.frequency.exponentialRampToValueAtTime(75, now + dur);
        bodyG.gain.setValueAtTime(0.4 * volume, now);
        bodyG.gain.exponentialRampToValueAtTime(0.0001, now + dur);
        body.connect(bodyG);
        bodyG.connect(ctx.destination);
        body.start(now);
        body.stop(now + dur + 0.01);
      } catch (e) {}
    },

    rattle(n = 5) {
      if (!enabled) return;
      for (let i = 0; i < n; i++) {
        setTimeout(() => {
          this.thock();
        }, i * (55 + Math.random() * 30));
      }
    },

    /* ============================================================
     * 9. 🥮 模具压印与成型声 (mold ASMR)
     * 温润压下与微弱吸附释放
     * ============================================================ */
    mold() {
      if (!enabled) return;
      const ctx = getAC(); if (!ctx) return;
      try {
        const now = ctx.currentTime;
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(280, now);
        osc.frequency.exponentialRampToValueAtTime(480, now + 0.12);
        osc.frequency.exponentialRampToValueAtTime(320, now + 0.22);

        gain.gain.setValueAtTime(0.001, now);
        gain.gain.linearRampToValueAtTime(0.3 * volume, now + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.24);

        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(now);
        osc.stop(now + 0.25);

        playSampleLayer({ rate: 1.15, gain: 0.3 });
      } catch (e) {}
    },

    /* ============================================================
     * 10. 🔄 翻面 (flip ASMR)
     * ============================================================ */
    flip() {
      if (!enabled) return;
      const ctx = getAC(); if (!ctx) return;
      try {
        const now = ctx.currentTime;
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(210, now);
        osc.frequency.exponentialRampToValueAtTime(360, now + 0.1);
        osc.frequency.exponentialRampToValueAtTime(240, now + 0.2);

        gain.gain.setValueAtTime(0.001, now);
        gain.gain.linearRampToValueAtTime(0.28 * volume, now + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.22);

        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(now);
        osc.stop(now + 0.23);
      } catch (e) {}
    },
  };
})();

window.JellySound = JellySound;
