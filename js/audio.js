/** Web Audio API — 가벼운 UI/배틀 사운드 */
(function (global) {
  let ctx = null;

  function ensureCtx() {
    if (!ctx) ctx = new (window.AudioContext || window.webkitAudioContext)();
    if (ctx.state === "suspended") ctx.resume();
    return ctx;
  }

  function tone(freq, duration, type, gain, slideTo) {
    duration = duration == null ? 0.08 : duration;
    type = type || "square";
    gain = gain == null ? 0.04 : gain;
    try {
      const ac = ensureCtx();
      const osc = ac.createOscillator();
      const g = ac.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(freq, ac.currentTime);
      if (slideTo != null) {
        osc.frequency.exponentialRampToValueAtTime(Math.max(20, slideTo), ac.currentTime + duration);
      }
      g.gain.setValueAtTime(gain, ac.currentTime);
      g.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + duration);
      osc.connect(g);
      g.connect(ac.destination);
      osc.start();
      osc.stop(ac.currentTime + duration + 0.02);
    } catch (e) {
      /* ignore */
    }
  }

  global.SFX = {
    unlock() {
      ensureCtx();
    },
    open() {
      tone(520, 0.05, "triangle", 0.03);
    },
    flag() {
      tone(280, 0.07, "square", 0.035, 180);
    },
    number() {
      tone(640, 0.06, "sine", 0.03);
    },
    encounter() {
      tone(120, 0.25, "sawtooth", 0.05, 60);
      setTimeout(function () {
        tone(90, 0.2, "square", 0.04);
      }, 80);
    },
    guardOk() {
      tone(880, 0.08, "square", 0.045);
    },
    guardBad() {
      tone(160, 0.15, "sawtooth", 0.05, 80);
    },
    scan() {
      tone(400, 0.12, "sine", 0.03, 900);
    },
    warn() {
      tone(220, 0.12, "square", 0.04);
    },
    clear() {
      [523, 659, 784, 1046].forEach(function (f, i) {
        setTimeout(function () {
          tone(f, 0.12, "triangle", 0.04);
        }, i * 90);
      });
    },
    defeat() {
      tone(180, 0.35, "sawtooth", 0.06, 50);
    },
    weak() {
      tone(990, 0.07, "triangle", 0.04);
    },
    shoot() {
      tone(720, 0.035, "square", 0.02, 280);
    },
    enemyHit() {
      tone(360, 0.04, "square", 0.028);
    },
    playerHit() {
      tone(130, 0.16, "sawtooth", 0.05, 55);
    },
    blast() {
      tone(220, 0.12, "sawtooth", 0.04, 70);
    },
  };
})(window);
