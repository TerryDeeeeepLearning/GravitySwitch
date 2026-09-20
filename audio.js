// Gravity Switch 音效：全部用 Web Audio 即時合成，不需要任何音檔
// 對外介面：Sound.unlock() / Sound.music(bool) / Sound.death() / Sound.coin() / Sound.flip() / Sound.land()
//           Sound.toggleMute() / Sound.isMuted() / Sound.setIntensity(0~1)
'use strict';
const Sound = (() => {
  const MUTE_KEY = 'gravitySwitchMuted';
  const BPM = 128, STEP = 60 / BPM / 2;      // 八分音符
  const MUSIC_VOL = 0.5, SFX_VOL = 0.5;
  const BASE = 55;                            // A1
  const hz = n => BASE * Math.pow(2, n / 12);

  const TRACK_VOL = 0.35;                     // 指定關卡用的 mp3 音量

  let ctx = null, master = null, musicBus = null, musicFilter = null, sfxBus = null, noiseBuf = null;
  let playing = false, timer = 0, nextTime = 0, step = 0, intensity = 0;
  let muted = false, coinStreak = 0, lastCoinAt = 0;
  // 音檔音軌（HTMLAudio，不走 Web Audio，這樣在 file:// 下也能播）
  let trackEl = null, trackSrc = null, synthWanted = false;
  const trackCache = new Map();
  try { muted = localStorage.getItem(MUTE_KEY) === '1'; } catch (e) {}

  // ---------- 編曲素材 ----------
  // 和弦進行（相對於主音的半音），每小節換一個
  const PROGS = [
    [0, 0, 8, 5],
    [0, 5, 3, 7],
    [0, -2, 3, 5],
    [0, 8, 5, 3],
  ];
  const PENTA = [0, 3, 5, 7, 10, 12, 15];     // 小調五聲音階
  // 主旋律：16 步，-1 = 休止，其餘是音階級數
  const LEADS = [
    [0, -1, 2, -1, 4, -1, 2, -1, 3, -1, 2, -1, 0, -1, -1, -1],
    [0, 2, 4, 2, 5, 4, 2, 0, 4, 5, 6, 5, 4, 2, 0, -1],
    [4, -1, 3, 4, -1, 2, -1, 0, 2, -1, 4, -1, 5, 4, 2, -1],
    [0, 0, -1, 3, 3, -1, 5, -1, 4, 4, -1, 2, -1, 0, -1, -1],
    [6, 5, 4, 3, 2, 3, 4, 5, 6, 5, 4, 2, 0, 2, 4, 5],
  ];
  const BASSES = [
    [1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0],
    [1, 0, 1, 0, 0, 1, 0, 0, 1, 0, 1, 0, 0, 1, 0, 1],
    [1, 0, 0, 1, 0, 0, 1, 0, 1, 0, 0, 1, 0, 1, 0, 0],
  ];
  const KICKS = [
    [1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 1, 0],
    [1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0],
    [1, 0, 0, 1, 0, 0, 1, 0, 1, 0, 0, 0, 1, 0, 0, 1],
  ];
  const HATS = [
    [0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1],
    [0, 1, 1, 1, 0, 1, 0, 1, 0, 1, 1, 1, 0, 1, 1, 1],
    [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
  ];
  // 段落：每 8 小節換一次，決定用哪組素材與厚度
  let section = { lead: 0, bass: 0, kick: 0, hat: 0, prog: 0, pad: false, octave: false };
  function newSection(bar) {
    const hot = intensity > 0.45, hotter = intensity > 0.75;
    section = {
      prog: (Math.random() * PROGS.length) | 0,
      lead: hotter ? 4 : hot ? 1 + ((Math.random() * 3) | 0) : (Math.random() * 3) | 0,
      bass: hot ? 1 + ((Math.random() * 2) | 0) : 0,
      kick: hotter ? 2 : hot ? 1 : 0,
      hat: hotter ? 2 : hot ? 1 : 0,
      pad: bar > 0 && Math.random() < 0.6,
      octave: hot && Math.random() < 0.6,
    };
  }

  function ensure() {
    if (ctx) return ctx;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    try { ctx = new AC(); } catch (e) { return null; }
    master = ctx.createGain(); master.gain.value = muted ? 0 : 1; master.connect(ctx.destination);
    musicFilter = ctx.createBiquadFilter(); musicFilter.type = 'lowpass';
    musicFilter.frequency.value = 2400; musicFilter.Q.value = 0.7; musicFilter.connect(master);
    musicBus = ctx.createGain(); musicBus.gain.value = MUSIC_VOL; musicBus.connect(musicFilter);
    sfxBus = ctx.createGain(); sfxBus.gain.value = SFX_VOL; sfxBus.connect(master);
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    newSection(0);
    return ctx;
  }
  function noise() { const s = ctx.createBufferSource(); s.buffer = noiseBuf; s.loop = true; return s; }

  // ---------- 基本音色 ----------
  function tone(t, freq, dur, type, vol, bus, glideTo, detune) {
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type; o.frequency.setValueAtTime(freq, t);
    if (detune) o.detune.value = detune;
    if (glideTo) o.frequency.exponentialRampToValueAtTime(Math.max(20, glideTo), t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.006);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(bus || sfxBus);
    o.start(t); o.stop(t + dur + 0.02);
    return o;
  }
  // 帶濾波包絡的撥奏音，比純方波有個性
  function pluck(t, freq, dur, vol, bus, type) {
    const o = ctx.createOscillator(), f = ctx.createBiquadFilter(), g = ctx.createGain();
    o.type = type || 'square'; o.frequency.value = freq;
    f.type = 'lowpass'; f.Q.value = 6;
    f.frequency.setValueAtTime(Math.min(9000, freq * 7), t);
    f.frequency.exponentialRampToValueAtTime(Math.max(200, freq * 1.6), t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.005);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(f); f.connect(g); g.connect(bus || musicBus);
    o.start(t); o.stop(t + dur + 0.02);
  }
  function burstNoise(t, freq, dur, vol, q, bus, type, glideTo) {
    const n = noise(), f = ctx.createBiquadFilter(), g = ctx.createGain();
    f.type = type || 'bandpass'; f.frequency.setValueAtTime(freq, t); f.Q.value = q || 1;
    if (glideTo) f.frequency.exponentialRampToValueAtTime(glideTo, t + dur);
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    n.connect(f); f.connect(g); g.connect(bus || sfxBus);
    n.start(t); n.stop(t + dur + 0.02);
    return f;
  }

  // ---------- 背景音樂 ----------
  function scheduleStep(t, s) {
    const bar = Math.floor(s / 16), beat = s % 16;
    if (beat === 0 && bar % 8 === 0) newSection(bar);
    const root = PROGS[section.prog][bar % 4];
    const fill = bar % 8 === 7 && beat >= 12;          // 每 8 小節最後半拍加過門

    // 低音
    if (BASSES[section.bass][beat]) {
      tone(t, hz(root + 12), 0.22, 'triangle', 0.5, musicBus);
      tone(t, hz(root), 0.26, 'sine', 0.35, musicBus);
    }
    // 大鼓 / 小鼓
    if (KICKS[section.kick][beat] && !fill) tone(t, 120, 0.15, 'sine', 0.6, musicBus, 42);
    if (beat % 8 === 4) burstNoise(t, 1500, 0.13, 0.25, 0.9, musicBus);
    if (fill) burstNoise(t, 1200 + (beat - 12) * 400, 0.09, 0.3, 1.2, musicBus);
    // Hi-hat
    if (HATS[section.hat][beat]) burstNoise(t, 8000, beat % 4 === 2 ? 0.07 : 0.035, 0.09 + intensity * 0.05, 1, musicBus, 'highpass');
    // 主旋律
    const deg = LEADS[section.lead][beat];
    if (deg >= 0) {
      const n = root + PENTA[deg % PENTA.length] + 36;
      pluck(t, hz(n), 0.16, 0.2 + intensity * 0.08, musicBus);
      if (section.octave && beat % 4 === 0) pluck(t, hz(n + 12), 0.12, 0.1, musicBus, 'sawtooth');
    }
    // 和弦鋪底：每小節開頭
    if (section.pad && beat === 0) {
      [0, 3, 7].forEach((iv, i) => tone(t, hz(root + iv + 24), 1.6, 'sawtooth', 0.075, musicBus, 0, i * 6 - 6));
    }
    // 濾波器隨小節緩緩開合，聽起來有呼吸感
    if (beat === 0 && musicFilter) {
      const target = 1500 + intensity * 2600 + (bar % 4) * 260;
      musicFilter.frequency.setTargetAtTime(target, t, 0.7);
    }
  }
  function tick() {
    if (!playing || !ctx) return;
    while (nextTime < ctx.currentTime + 0.15) { scheduleStep(nextTime, step); nextTime += STEP; step++; }
  }
  function startSynth(on) {
    if (!ensure()) return;
    if (on && !playing) {
      playing = true; step = 0; nextTime = ctx.currentTime + 0.08;
      newSection(0);
      musicBus.gain.setTargetAtTime(MUSIC_VOL, ctx.currentTime, 0.2);
      timer = setInterval(tick, 25);
      tick();
    } else if (!on && playing) {
      playing = false; clearInterval(timer);
    }
  }

  return {
    unlock() {
      const c = ensure();
      if (c && c.state === 'suspended') c.resume();
      return !!c;
    },
    isMuted: () => muted,
    toggleMute() {
      muted = !muted;
      try { localStorage.setItem(MUTE_KEY, muted ? '1' : '0'); } catch (e) {}
      if (master) master.gain.setTargetAtTime(muted ? 0 : 1, ctx.currentTime, 0.02);
      if (trackEl) trackEl.volume = muted ? 0 : TRACK_VOL;
      return muted;
    },
    setIntensity(v) { intensity = Math.max(0, Math.min(1, v)); },

    music(on) {
      synthWanted = on;
      if (on && trackSrc) return;               // 有 mp3 在播的時候，合成音樂讓位
      startSynth(on);
    },

    // 指定關卡的 mp3：Sound.track('cool.mp3') 開始，Sound.track(null) 停止
    track(src) {
      if (src === trackSrc) return;
      if (trackEl) { trackEl.pause(); try { trackEl.currentTime = 0; } catch (e) {} trackEl = null; }
      trackSrc = src || null;
      if (!trackSrc) { startSynth(synthWanted); return; }   // 停止 mp3 → 回到合成音樂
      startSynth(false);                                     // 播 mp3 → 關掉合成音樂
      let el = trackCache.get(src);
      if (!el) {
        el = new Audio(src);
        el.loop = true; el.preload = 'auto';
        // 載不到（檔案沒上傳、檔名大小寫不符…）就退回合成音樂，並在主控台留線索
        el.addEventListener('error', () => {
          if (typeof console !== 'undefined') console.warn('[Sound] 載入音檔失敗：', src, '→ 改用合成音樂');
          if (trackSrc === src) { trackSrc = null; trackEl = null; startSynth(synthWanted); }
        });
        trackCache.set(src, el);
      }
      el.volume = muted ? 0 : TRACK_VOL;
      try { el.currentTime = 0; } catch (e) {}
      const pr = el.play();
      if (pr && pr.catch) pr.catch(() => {});                // 自動播放被擋時不要吵
      trackEl = el;
    },
    trackPlaying: () => trackSrc,

    // 死亡：低頻爆裂 + 碎裂雜訊 + 玻璃破碎 + 四散碎片
    death() {
      if (!ensure()) return;
      const t = ctx.currentTime;
      coinStreak = 0;
      // 撞擊：低頻下滑
      tone(t, 260, 0.45, 'square', 0.4, sfxBus, 35);
      tone(t, 130, 0.5, 'sawtooth', 0.28, sfxBus, 28);
      const f = burstNoise(t, 2200, 0.35, 0.55, 1.2);
      f.frequency.exponentialRampToValueAtTime(200, t + 0.35);
      // 玻璃破裂：高頻「啪」一聲
      burstNoise(t, 6500, 0.05, 0.5, 0.7, sfxBus, 'highpass');
      // 玻璃碎片：非諧和的高頻共振，長短不一
      const shards = [2450, 3180, 3870, 4720, 5310, 6280, 7150, 8400];
      for (let i = 0; i < shards.length; i++) {
        const dt = Math.random() * 0.22;
        const dur = 0.12 + Math.random() * 0.35;
        tone(t + dt, shards[i] * (0.96 + Math.random() * 0.08), dur, 'sine', 0.06 + Math.random() * 0.05, sfxBus);
      }
      // 碎片彈跳落地：細碎的高頻雜訊，散布在 0.6 秒內
      for (let i = 0; i < 14; i++) {
        const dt = 0.02 + Math.random() * 0.6;
        burstNoise(t + dt, 3000 + Math.random() * 5000, 0.02 + Math.random() * 0.05,
          0.16 * (1 - dt / 0.8), 8, sfxBus, 'bandpass');
      }
      if (playing) {
        musicBus.gain.setTargetAtTime(MUSIC_VOL * 0.25, t, 0.03);
        musicBus.gain.setTargetAtTime(MUSIC_VOL, t + 0.5, 0.25);
      }
    },

    // 連續吃到會一路升高，斷了就重來
    coin() {
      if (!ensure()) return;
      const t = ctx.currentTime;
      if (t - lastCoinAt > 2.5) coinStreak = 0;
      lastCoinAt = t;
      const up = Math.min(coinStreak, 7) * 2;
      coinStreak++;
      pluck(t, hz(60 + up), 0.09, 0.3, sfxBus);
      pluck(t + 0.05, hz(67 + up), 0.14, 0.26, sfxBus);
    },
    // 每次音高、音色略有不同，不會聽膩
    flip(up) {
      if (!ensure()) return;
      const t = ctx.currentTime, r = Math.random();
      const base = (up ? 380 : 680) * (0.94 + Math.random() * 0.12);
      tone(t, base, 0.13, r < 0.5 ? 'triangle' : 'sine', 0.2, sfxBus, up ? base * 2.2 : base * 0.48);
      burstNoise(t, up ? 1400 : 900, 0.09, 0.07, 1.4, sfxBus, 'bandpass', up ? 3200 : 500);
    },
    land() { if (!ensure()) return; burstNoise(ctx.currentTime, 320 + Math.random() * 160, 0.05, 0.12, 2); },
  };
})();
