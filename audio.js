// Gravity Switch 音效：全部用 Web Audio 即時合成，不需要任何音檔
// 對外介面：Sound.unlock() / Sound.music(bool) / Sound.death() / Sound.coin() / Sound.flip() / Sound.land()
//           Sound.toggleMute() / Sound.isMuted() / Sound.setIntensity(0~1)
'use strict';
const Sound = (() => {
  const MUTE_KEY = 'gravitySwitchMuted';
  const BPM = 126, STEP = 60 / BPM / 2;      // 八分音符
  const MUSIC_VOL = 0.2, SFX_VOL = 0.5;

  let ctx = null, master = null, musicBus = null, sfxBus = null, noiseBuf = null;
  let playing = false, timer = 0, nextTime = 0, step = 0, intensity = 0;
  let muted = false;
  try { muted = localStorage.getItem(MUTE_KEY) === '1'; } catch (e) {}

  // 小調五聲音階，數字是半音；每 16 步換一次和弦根音
  const ROOTS = [0, 0, 5, 3];
  const PENTA = [0, 3, 5, 7, 10, 12];
  const BASE = 55;                            // A1
  const midi = n => BASE * Math.pow(2, n / 12);

  function ensure() {
    if (ctx) return ctx;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    try { ctx = new AC(); } catch (e) { return null; }
    master = ctx.createGain(); master.gain.value = muted ? 0 : 1; master.connect(ctx.destination);
    musicBus = ctx.createGain(); musicBus.gain.value = MUSIC_VOL; musicBus.connect(master);
    sfxBus = ctx.createGain(); sfxBus.gain.value = SFX_VOL; sfxBus.connect(master);
    // 雜訊樣本（打擊樂與爆裂音用）
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    return ctx;
  }
  function noise() { const s = ctx.createBufferSource(); s.buffer = noiseBuf; s.loop = true; return s; }

  // ---------- 單音 ----------
  function tone(t, freq, dur, type, vol, bus, glideTo) {
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type; o.frequency.setValueAtTime(freq, t);
    if (glideTo) o.frequency.exponentialRampToValueAtTime(Math.max(20, glideTo), t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(bus || sfxBus);
    o.start(t); o.stop(t + dur + 0.02);
    return o;
  }
  function hit(t, freq, dur, vol, q) {
    const n = noise(), f = ctx.createBiquadFilter(), g = ctx.createGain();
    f.type = 'bandpass'; f.frequency.setValueAtTime(freq, t); f.Q.value = q || 1;
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    n.connect(f); f.connect(g); g.connect(sfxBus);
    n.start(t); n.stop(t + dur + 0.02);
    return f;
  }

  // ---------- 背景音樂：低音 + 琶音 + 打擊，難度越高越密 ----------
  function scheduleStep(t, s) {
    const bar = Math.floor(s / 16) % ROOTS.length, root = ROOTS[bar];
    const beat = s % 16;
    // 低音：每拍
    if (beat % 4 === 0) {
      tone(t, midi(root), 0.26, 'triangle', 0.5, musicBus);
      // 大鼓
      tone(t, 110, 0.16, 'sine', 0.5, musicBus, 40);
    }
    // 琶音：八分音符，強度越高越多音
    const density = 0.45 + intensity * 0.5;
    if (Math.random() < density) {
      const deg = PENTA[(s * 3 + bar) % PENTA.length];
      const oct = 24 + (s % 8 < 4 ? 12 : 0);
      tone(t, midi(root + deg + oct), 0.13, 'square', 0.16 + intensity * 0.1, musicBus);
    }
    // Hi-hat
    if (beat % 2 === 1) hitMusic(t, 7000, 0.04, 0.09 + intensity * 0.06);
    // 反拍小鼓
    if (beat % 8 === 4) hitMusic(t, 1600, 0.12, 0.22, 0.8);
  }
  function hitMusic(t, freq, dur, vol, q) {
    const n = noise(), f = ctx.createBiquadFilter(), g = ctx.createGain();
    f.type = 'bandpass'; f.frequency.value = freq; f.Q.value = q || 1;
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    n.connect(f); f.connect(g); g.connect(musicBus);
    n.start(t); n.stop(t + dur + 0.02);
  }
  function tick() {
    if (!playing || !ctx) return;
    while (nextTime < ctx.currentTime + 0.15) {
      scheduleStep(nextTime, step);
      nextTime += STEP; step++;
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
      return muted;
    },
    // 0~1，越高背景音越密（用分數或難度餵進來）
    setIntensity(v) { intensity = Math.max(0, Math.min(1, v)); },
    music(on) {
      if (!ensure()) return;
      if (on && !playing) {
        playing = true; step = 0; nextTime = ctx.currentTime + 0.08;
        musicBus.gain.setTargetAtTime(MUSIC_VOL, ctx.currentTime, 0.2);
        timer = setInterval(tick, 25);
        tick();
      } else if (!on && playing) {
        playing = false; clearInterval(timer);
      }
    },
    // 死亡：低頻爆裂 + 碎裂雜訊 + 四散的碎片聲，同時把音樂壓低一下
    death() {
      if (!ensure()) return;
      const t = ctx.currentTime;
      tone(t, 260, 0.45, 'square', 0.45, sfxBus, 35);
      tone(t, 130, 0.5, 'sawtooth', 0.3, sfxBus, 28);
      const f = hit(t, 2200, 0.35, 0.7, 1.2);
      f.frequency.exponentialRampToValueAtTime(200, t + 0.35);
      for (let i = 0; i < 8; i++) {
        const dt = 0.03 + Math.random() * 0.3;
        hit(t + dt, 700 + Math.random() * 2600, 0.05 + Math.random() * 0.06, 0.28, 6);
      }
      if (playing) {
        musicBus.gain.setTargetAtTime(MUSIC_VOL * 0.25, t, 0.03);
        musicBus.gain.setTargetAtTime(MUSIC_VOL, t + 0.5, 0.25);
      }
    },
    coin() { if (!ensure()) return; const t = ctx.currentTime; tone(t, 1320, 0.07, 'square', 0.22); tone(t + 0.06, 1980, 0.12, 'square', 0.2); },
    flip(up) { if (!ensure()) return; const t = ctx.currentTime; tone(t, up ? 420 : 700, 0.12, 'triangle', 0.22, sfxBus, up ? 900 : 330); },
    land() { if (!ensure()) return; hit(ctx.currentTime, 400, 0.06, 0.18, 2); },
  };
})();
