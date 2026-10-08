/** 위험도별 사격 배틀 — 포신 이동, 연사, 탄막 회피 */
(function (global) {
  const FIRE_CD = 0.16;
  const PLAYER_BULLET_SPEED = 560;

  const CONFIG = {
    1: {
      time: 14,
      playerHits: 3,
      bulletSpeed: 100,
      mines: [{ hp: 8, r: 20, speed: 110, y: 0.3, fireEvery: 1.65, spread: 1 }],
    },
    2: {
      time: 14,
      playerHits: 3,
      bulletSpeed: 120,
      mines: [{ hp: 12, r: 20, speed: 145, y: 0.3, fireEvery: 1.3, spread: 1 }],
    },
    3: {
      time: 16,
      playerHits: 3,
      bulletSpeed: 130,
      mines: [
        { hp: 8, r: 17, speed: 130, y: 0.26, fireEvery: 1.45, spread: 1 },
        { hp: 8, r: 17, speed: 150, y: 0.4, fireEvery: 1.6, spread: 1 },
      ],
    },
    4: {
      time: 16,
      playerHits: 3,
      bulletSpeed: 150,
      mines: [
        { hp: 10, r: 17, speed: 165, y: 0.26, fireEvery: 1.1, spread: 1 },
        { hp: 10, r: 17, speed: 180, y: 0.4, fireEvery: 1.2, spread: 1 },
      ],
    },
    5: {
      time: 18,
      playerHits: 3,
      bulletSpeed: 155,
      mines: [
        { hp: 8, r: 15, speed: 150, y: 0.22, fireEvery: 1.15, spread: 1 },
        { hp: 8, r: 15, speed: 170, y: 0.34, fireEvery: 1.05, spread: 1 },
        { hp: 8, r: 15, speed: 160, y: 0.46, fireEvery: 1.25, spread: 1 },
      ],
    },
    6: {
      time: 18,
      playerHits: 3,
      bulletSpeed: 175,
      mines: [
        { hp: 10, r: 15, speed: 175, y: 0.22, fireEvery: 0.9, spread: 1 },
        { hp: 10, r: 15, speed: 190, y: 0.34, fireEvery: 0.85, spread: 1 },
        { hp: 10, r: 15, speed: 180, y: 0.46, fireEvery: 0.95, spread: 1 },
      ],
    },
    7: {
      time: 22,
      playerHits: 3,
      bulletSpeed: 160,
      mines: [
        { hp: 28, r: 34, speed: 85, y: 0.26, fireEvery: 0.88, spread: 3, boss: true },
        { hp: 6, r: 14, speed: 155, y: 0.46, fireEvery: 1.4, spread: 1 },
        { hp: 6, r: 14, speed: 165, y: 0.46, fireEvery: 1.55, spread: 1 },
      ],
    },
    8: {
      time: 24,
      playerHits: 3,
      bulletSpeed: 185,
      mines: [
        { hp: 36, r: 36, speed: 100, y: 0.24, fireEvery: 0.62, spread: 3, boss: true },
        { hp: 7, r: 13, speed: 175, y: 0.42, fireEvery: 1.05, spread: 1 },
        { hp: 7, r: 13, speed: 185, y: 0.48, fireEvery: 1.15, spread: 1 },
        { hp: 7, r: 13, speed: 165, y: 0.44, fireEvery: 1.2, spread: 1 },
      ],
    },
  };

  function clampDanger(danger) {
    return Math.max(1, Math.min(8, danger | 0));
  }

  function typeOf(danger) {
    if (danger <= 2) return { key: "snipe", label: "조준 사격", range: "1~2" };
    if (danger <= 4) return { key: "suppress", label: "제압 사격", range: "3~4" };
    if (danger <= 6) return { key: "swarm", label: "포화 사격", range: "5~6" };
    return { key: "boss", label: "보스 사격", range: "7~8" };
  }

  function battleMeta(danger) {
    const info = typeOf(clampDanger(danger));
    const hints = {
      snipe: "마우스로 포신을 움직이고, 클릭이나 Space를 누르고 있으면 발사합니다. 눈을 뜬 지뢰를 맞추세요.",
      suppress: "지뢰가 탄을 쏘기 시작합니다. 좌우로 피하면서 전부 격추하세요.",
      swarm: "여러 지뢰가 동시에 탄을 뿌립니다. 한 기씩 끊어서 맞추세요.",
      boss: "눈이 달린 대형 지뢰입니다. 확산탄을 피하고 본체를 집중 사격하세요.",
    };
    return { key: info.key, label: info.label, hint: hints[info.key] };
  }

  function sfx(name) {
    try {
      if (global.SFX && typeof global.SFX[name] === "function") global.SFX[name]();
    } catch (err) {
      /* ignore */
    }
  }

  function spreadAngles(n) {
    if (n <= 1) return [0];
    if (n === 3) return [-0.48, 0, 0.48];
    const list = [];
    for (let i = 0; i < n; i++) list.push(-0.7 + (1.4 * i) / (n - 1));
    return list;
  }

  function runShooter(stageEl, danger, opts) {
    const cfg = CONFIG[danger];
    const canvas = document.createElement("canvas");
    canvas.className = "shoot-canvas";
    canvas.setAttribute("aria-label", "사격 배틀");
    stageEl.innerHTML = "";
    stageEl.appendChild(canvas);
    const ctx = canvas.getContext("2d");

    const enemies = [];
    const playerBullets = [];
    const enemyBullets = [];
    const particles = [];
    const keys = { left: false, right: false, fire: false };
    const player = { x: 200, y: 260, iframe: 0.4 };

    let viewW = 480;
    let viewH = 300;
    let fireCd = 0;
    let pointerFire = false;
    let hits = 0;
    let timeLeft = cfg.time;
    let shake = 0;
    let muzzle = 0;
    let elapsed = 0;
    let ended = false;
    let destroyed = false;
    let raf = 0;
    let endTimer = 0;
    let progressTick = 0;
    let last = performance.now();
    let heardShot = false;
    let laidOut = false;

    function totalHp() {
      return cfg.mines.reduce(function (sum, mine) {
        return sum + mine.hp;
      }, 0);
    }

    function aliveHp() {
      return enemies.reduce(function (sum, enemy) {
        return sum + (enemy.alive ? enemy.hp : 0);
      }, 0);
    }

    const hpMax = totalHp();
    const maxLives = 3;
    let lifeCount = maxLives;

    function layoutEnemies() {
      const count = cfg.mines.length;
      enemies.length = 0;
      for (let i = 0; i < count; i++) {
        const spec = cfg.mines[i];
        const lane = (i + 1) / (count + 1);
        enemies.push({
          x: viewW * lane,
          y: viewH * spec.y,
          baseY: viewH * spec.y,
          r: spec.r,
          hp: spec.hp,
          maxHp: spec.hp,
          speed: spec.speed,
          dir: i % 2 === 0 ? 1 : -1,
          fireEvery: spec.fireEvery,
          fireCd: 0.7 + i * 0.28,
          spread: spec.spread,
          boss: !!spec.boss,
          alive: true,
          hitFlash: 0,
          phase: Math.random() * Math.PI * 2,
        });
      }
    }

    function resize() {
      const rect = canvas.getBoundingClientRect();
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const w = Math.max(280, rect.width || 480);
      const h = Math.max(240, rect.height || 300);
      const pw = Math.floor(w * dpr);
      const ph = Math.floor(h * dpr);
      if (canvas.width !== pw || canvas.height !== ph) {
        canvas.width = pw;
        canvas.height = ph;
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      viewW = w;
      viewH = h;
      player.y = h - 28;
      player.x = Math.max(20, Math.min(w - 20, player.x));
      if (!laidOut && rect.width >= 200 && rect.height >= 200) {
        laidOut = true;
        player.x = w / 2;
        layoutEnemies();
      }
    }

    function report() {
      if (typeof opts.onProgress === "function") {
        opts.onProgress(hpMax - aliveHp(), hpMax, hits, cfg.playerHits);
      }
    }

    function burst(x, y, color, count, power) {
      for (let i = 0; i < count; i++) {
        const angle = Math.random() * Math.PI * 2;
        const speed = power * (0.4 + Math.random());
        particles.push({
          x: x,
          y: y,
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed,
          life: 0.28 + Math.random() * 0.28,
          max: 0.56,
          color: color,
        });
      }
      if (particles.length > 90) particles.splice(0, particles.length - 90);
    }

    function finish(win) {
      if (ended) return;
      ended = true;
      pointerFire = false;
      keys.fire = false;
      if (win) burst(viewW / 2, viewH * 0.3, "#2ee6d6", 28, 220);
      endTimer = setTimeout(function () {
        if (destroyed) return;
        if (win) {
          if (opts.onWin) opts.onWin();
        } else if (opts.onLose) {
          opts.onLose();
        }
      }, win ? 420 : 260);
    }

    function hurtPlayer() {
      hits += 1;
      lifeCount = Math.max(0, maxLives - hits);
      player.iframe = 0.7;
      shake = 8;
      sfx("playerHit");
      report();
      if (hits >= cfg.playerHits) finish(false);
    }

    function damageEnemy(enemy) {
      enemy.hp -= 1;
      enemy.hitFlash = 0.09;
      burst(enemy.x, enemy.y, "#2ee6d6", 4, 90);
      if (enemy.hp <= 0) {
        enemy.alive = false;
        enemy.hp = 0;
        burst(enemy.x, enemy.y, enemy.boss ? "#f0a040" : "#e83a4a", enemy.boss ? 22 : 12, 180);
        sfx("blast");
      } else {
        sfx("enemyHit");
      }
      report();
    }

    function tryFire() {
      if (ended || fireCd > 0) return;
      fireCd = FIRE_CD;
      muzzle = 0.05;
      playerBullets.push({
        x: player.x,
        y: player.y - 18,
        vy: -PLAYER_BULLET_SPEED,
        r: 3,
      });
      if (!heardShot) heardShot = true;
      sfx("shoot");
    }

    function setX(clientX) {
      const rect = canvas.getBoundingClientRect();
      player.x = Math.max(18, Math.min(viewW - 18, clientX - rect.left));
    }

    function onPointerDown(event) {
      if (ended) return;
      event.preventDefault();
      pointerFire = true;
      setX(event.clientX);
      tryFire();
      if (canvas.setPointerCapture) {
        try {
          canvas.setPointerCapture(event.pointerId);
        } catch (err) {
          /* ignore */
        }
      }
    }

    function onPointerMove(event) {
      if (event.pointerType === "touch" && !pointerFire) return;
      setX(event.clientX);
    }

    function onPointerUp() {
      pointerFire = false;
    }

    function onKeyDown(event) {
      if (event.code === "Space") {
        event.preventDefault();
        if (!event.repeat) keys.fire = true;
      } else if (event.code === "ArrowLeft" || event.code === "KeyA") {
        event.preventDefault();
        keys.left = true;
      } else if (event.code === "ArrowRight" || event.code === "KeyD") {
        event.preventDefault();
        keys.right = true;
      }
    }

    function onKeyUp(event) {
      if (event.code === "Space") keys.fire = false;
      else if (event.code === "ArrowLeft" || event.code === "KeyA") keys.left = false;
      else if (event.code === "ArrowRight" || event.code === "KeyD") keys.right = false;
    }

    function update(dt) {
      elapsed += dt;
      if (laidOut) timeLeft -= dt;
      fireCd = Math.max(0, fireCd - dt);
      if (player.iframe > 0) player.iframe -= dt;
      if (shake > 0) shake = Math.max(0, shake - dt * 28);
      if (muzzle > 0) muzzle -= dt;
      progressTick -= dt;

      if (keys.left) player.x -= 340 * dt;
      if (keys.right) player.x += 340 * dt;
      player.x = Math.max(18, Math.min(viewW - 18, player.x));
      if ((pointerFire || keys.fire) && !ended) tryFire();

      for (let i = 0; i < enemies.length; i++) {
        const enemy = enemies[i];
        if (!enemy.alive) continue;
        enemy.hitFlash = Math.max(0, enemy.hitFlash - dt);
        enemy.x += enemy.dir * enemy.speed * dt;
        const margin = enemy.r + 8;
        if (enemy.x < margin) {
          enemy.x = margin;
          enemy.dir = 1;
        } else if (enemy.x > viewW - margin) {
          enemy.x = viewW - margin;
          enemy.dir = -1;
        }
        enemy.y = enemy.baseY + Math.sin(elapsed * (enemy.boss ? 1.6 : 2.4) + enemy.phase) * (enemy.boss ? 14 : 10);
        if (enemy.fireEvery > 0) {
          enemy.fireCd -= dt;
          if (enemy.fireCd <= 0) {
            enemy.fireCd = enemy.fireEvery;
            const angles = spreadAngles(enemy.spread);
            for (let a = 0; a < angles.length; a++) {
              const angle = angles[a];
              enemyBullets.push({
                x: enemy.x + Math.sin(angle) * (enemy.r + 4),
                y: enemy.y + enemy.r * 0.65,
                vx: Math.sin(angle) * cfg.bulletSpeed,
                vy: Math.cos(angle) * cfg.bulletSpeed,
                r: enemy.boss ? 6 : 5,
              });
            }
          }
        }
      }

      for (let i = playerBullets.length - 1; i >= 0; i--) {
        const bullet = playerBullets[i];
        bullet.y += bullet.vy * dt;
        let keep = bullet.y > -12;
        if (keep) {
          for (let e = 0; e < enemies.length; e++) {
            const enemy = enemies[e];
            if (!enemy.alive) continue;
            const dx = bullet.x - enemy.x;
            const dy = bullet.y - enemy.y;
            const reach = bullet.r + enemy.r;
            if (dx * dx + dy * dy <= reach * reach) {
              damageEnemy(enemy);
              keep = false;
              break;
            }
          }
        }
        if (!keep) playerBullets.splice(i, 1);
      }

      if (player.iframe <= 0 && !ended) {
        for (let i = enemyBullets.length - 1; i >= 0; i--) {
          const bullet = enemyBullets[i];
          bullet.x += bullet.vx * dt;
          bullet.y += bullet.vy * dt;
          const dx = bullet.x - player.x;
          const dy = bullet.y - player.y;
          const reach = bullet.r + 9;
          const off = bullet.y > viewH + 20 || bullet.x < -20 || bullet.x > viewW + 20;
          if (!off && dx * dx + dy * dy <= reach * reach) {
            enemyBullets.splice(i, 1);
            hurtPlayer();
            if (ended) break;
          } else if (off) {
            enemyBullets.splice(i, 1);
          }
        }
      } else {
        for (let i = enemyBullets.length - 1; i >= 0; i--) {
          const bullet = enemyBullets[i];
          bullet.x += bullet.vx * dt;
          bullet.y += bullet.vy * dt;
          if (bullet.y > viewH + 20 || bullet.x < -20 || bullet.x > viewW + 20) enemyBullets.splice(i, 1);
        }
      }

      for (let i = particles.length - 1; i >= 0; i--) {
        const bit = particles[i];
        bit.life -= dt;
        bit.x += bit.vx * dt;
        bit.y += bit.vy * dt;
        if (bit.life <= 0) particles.splice(i, 1);
      }

      if (!ended) {
        if (!laidOut) return;
        const anyAlive = enemies.some(function (enemy) {
          return enemy.alive;
        });
        if (!anyAlive) finish(true);
        else if (timeLeft <= 0) finish(false);
      }

      if (progressTick <= 0) {
        progressTick = 0.2;
        report();
      }
    }

    function drawEye(x, y, radius, look) {
      ctx.beginPath();
      ctx.arc(x, y, radius, 0, Math.PI * 2);
      ctx.fillStyle = "#f4f7fb";
      ctx.fill();
      ctx.beginPath();
      ctx.arc(x + look, y, radius * 0.42, 0, Math.PI * 2);
      ctx.fillStyle = "#141820";
      ctx.fill();
    }

    function drawMine(enemy) {
      const look = Math.max(-enemy.r * 0.12, Math.min(enemy.r * 0.12, (player.x - enemy.x) * 0.08));
      ctx.save();
      ctx.translate(enemy.x, enemy.y);
      ctx.strokeStyle = enemy.boss ? "#f0a040" : "#e83a4a";
      ctx.lineWidth = 2;
      const bolts = enemy.boss ? 6 : 4;
      for (let i = 0; i < bolts; i++) {
        const angle = (Math.PI * 2 * i) / bolts + 0.4;
        ctx.beginPath();
        ctx.moveTo(Math.cos(angle) * enemy.r * 0.72, Math.sin(angle) * enemy.r * 0.72);
        ctx.lineTo(Math.cos(angle) * (enemy.r + 7), Math.sin(angle) * (enemy.r + 7));
        ctx.stroke();
      }
      const body = ctx.createRadialGradient(-enemy.r * 0.35, -enemy.r * 0.4, enemy.r * 0.15, 0, 0, enemy.r);
      if (enemy.hitFlash > 0) {
        body.addColorStop(0, "#ffffff");
        body.addColorStop(1, "#d5dde8");
      } else {
        body.addColorStop(0, "#9aa6ba");
        body.addColorStop(0.42, "#2a3548");
        body.addColorStop(1, "#121826");
      }
      ctx.beginPath();
      ctx.arc(0, 0, enemy.r, 0, Math.PI * 2);
      ctx.fillStyle = body;
      ctx.fill();
      ctx.stroke();
      if (enemy.boss) {
        ctx.beginPath();
        ctx.arc(0, 0, enemy.r + 6, elapsed, elapsed + 1.4);
        ctx.strokeStyle = "rgba(240,160,64,0.8)";
        ctx.stroke();
      }
      const eyeR = enemy.r * (enemy.boss ? 0.2 : 0.24);
      const eyeY = -enemy.r * 0.12;
      drawEye(-enemy.r * 0.32, eyeY, eyeR, look);
      drawEye(enemy.r * 0.32, eyeY, eyeR, look);
      ctx.restore();

      const barW = enemy.r * 2;
      const barX = enemy.x - enemy.r;
      const barY = enemy.y - enemy.r - 12;
      ctx.fillStyle = "rgba(0,0,0,0.45)";
      ctx.fillRect(barX, barY, barW, 4);
      ctx.fillStyle = enemy.boss ? "#f0a040" : "#2ee6d6";
      ctx.fillRect(barX, barY, barW * (enemy.hp / enemy.maxHp), 4);
    }

    function drawHeart(x, y, filled) {
      ctx.save();
      ctx.translate(x, y);
      ctx.beginPath();
      ctx.moveTo(0, 3);
      ctx.bezierCurveTo(0, 1, -1.5, -0.6, -4, -0.6);
      ctx.bezierCurveTo(-7.2, -0.6, -7.2, 2.8, -7.2, 2.8);
      ctx.bezierCurveTo(-7.2, 5.8, -3.4, 8.2, 0, 11.4);
      ctx.bezierCurveTo(3.4, 8.2, 7.2, 5.8, 7.2, 2.8);
      ctx.bezierCurveTo(7.2, 2.8, 7.2, -0.6, 4, -0.6);
      ctx.bezierCurveTo(1.5, -0.6, 0, 1, 0, 3);
      ctx.closePath();
      ctx.fillStyle = filled ? "#ff4b6a" : "rgba(255,75,106,0.16)";
      ctx.fill();
      ctx.lineWidth = 1.2;
      ctx.strokeStyle = filled ? "#ffd0d8" : "rgba(255,75,106,0.4)";
      ctx.stroke();
      ctx.restore();
    }

    function drawLives() {
      const gap = 20;
      for (let i = 0; i < maxLives; i++) {
        const x = viewW - 20 - (maxLives - 1 - i) * gap;
        drawHeart(x, 8, i < lifeCount);
      }
    }

    function draw() {
      resize();
      const ox = shake > 0 ? (Math.random() - 0.5) * shake : 0;
      const oy = shake > 0 ? (Math.random() - 0.5) * shake : 0;
      ctx.clearRect(0, 0, viewW, viewH);
      ctx.fillStyle = "#070b12";
      ctx.fillRect(0, 0, viewW, viewH);
      ctx.save();
      ctx.translate(ox, oy);
      ctx.strokeStyle = "rgba(46,230,214,0.06)";
      ctx.lineWidth = 1;
      for (let x = 0; x < viewW; x += 28) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, viewH);
        ctx.stroke();
      }
      for (let y = 0; y < viewH; y += 28) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(viewW, y);
        ctx.stroke();
      }

      ctx.strokeStyle = "rgba(46,230,214,0.18)";
      ctx.setLineDash([3, 6]);
      ctx.beginPath();
      ctx.moveTo(player.x, 12);
      ctx.lineTo(player.x, player.y - 20);
      ctx.stroke();
      ctx.setLineDash([]);

      for (let i = 0; i < enemyBullets.length; i++) {
        const bullet = enemyBullets[i];
        ctx.beginPath();
        ctx.arc(bullet.x, bullet.y, bullet.r, 0, Math.PI * 2);
        ctx.fillStyle = "#e83a4a";
        ctx.shadowColor = "#e83a4a";
        ctx.shadowBlur = 12;
        ctx.fill();
        ctx.shadowBlur = 0;
      }

      for (let i = 0; i < enemies.length; i++) {
        if (enemies[i].alive) drawMine(enemies[i]);
      }

      for (let i = 0; i < playerBullets.length; i++) {
        const bullet = playerBullets[i];
        ctx.fillStyle = "#2ee6d6";
        ctx.shadowColor = "#2ee6d6";
        ctx.shadowBlur = 10;
        ctx.fillRect(bullet.x - 2, bullet.y - 8, 4, 14);
        ctx.shadowBlur = 0;
      }

      ctx.globalAlpha = player.iframe > 0 && Math.floor(elapsed * 16) % 2 === 0 ? 0.35 : 1;
      ctx.fillStyle = "#16343a";
      ctx.fillRect(player.x - 16, player.y - 6, 32, 12);
      ctx.fillStyle = "#2ee6d6";
      ctx.fillRect(player.x - 3, player.y - 20, 6, 16);
      if (muzzle > 0) {
        ctx.fillStyle = "#f0a040";
        ctx.fillRect(player.x - 2, player.y - 28, 4, 8);
      }
      ctx.globalAlpha = 1;

      for (let i = 0; i < particles.length; i++) {
        const bit = particles[i];
        ctx.globalAlpha = Math.max(0, bit.life / bit.max);
        ctx.fillStyle = bit.color;
        ctx.fillRect(bit.x, bit.y, 3, 3);
      }
      ctx.globalAlpha = 1;

      ctx.fillStyle = "#8b97ad";
      ctx.font = "600 12px Orbitron, sans-serif";
      ctx.textAlign = "left";
      ctx.fillText(Math.max(0, timeLeft).toFixed(1) + "s", 12, 22);
      drawLives();
      if (!heardShot && !ended) {
        ctx.textAlign = "center";
        ctx.fillStyle = "#2ee6d6";
        ctx.fillText("HOLD CLICK / SPACE", viewW / 2, viewH - 48);
      }
      ctx.restore();
    }

    function frame(now) {
      if (destroyed) return;
      const dt = Math.min(0.034, (now - last) / 1000);
      last = now;
      if (!ended) update(dt);
      else {
        for (let i = particles.length - 1; i >= 0; i--) {
          particles[i].life -= dt;
          particles[i].x += particles[i].vx * dt;
          particles[i].y += particles[i].vy * dt;
          if (particles[i].life <= 0) particles.splice(i, 1);
        }
      }
      draw();
      raf = requestAnimationFrame(frame);
    }

    canvas.addEventListener("pointerdown", onPointerDown);
    canvas.addEventListener("pointermove", onPointerMove);
    canvas.addEventListener("pointerup", onPointerUp);
    canvas.addEventListener("pointercancel", onPointerUp);
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    resize();
    report();
    raf = requestAnimationFrame(frame);

    return {
      destroy: function () {
        destroyed = true;
        ended = true;
        clearTimeout(endTimer);
        cancelAnimationFrame(raf);
        canvas.removeEventListener("pointerdown", onPointerDown);
        canvas.removeEventListener("pointermove", onPointerMove);
        canvas.removeEventListener("pointerup", onPointerUp);
        canvas.removeEventListener("pointercancel", onPointerUp);
        window.removeEventListener("keydown", onKeyDown);
        window.removeEventListener("keyup", onKeyUp);
      },
    };
  }

  function startBattle(stageEl, danger, opts) {
    return runShooter(stageEl, clampDanger(danger), opts || {});
  }

  global.BattleAPI = {
    getBattleMeta: battleMeta,
    startBattle: startBattle,
  };
})(window);
