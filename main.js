
(() => {
  "use strict";

  const canvas = document.getElementById("game");
  const ctx = canvas.getContext("2d");

  const hpEl = document.getElementById("hp");
  const scoreEl = document.getElementById("score");
  const magicTextEl = document.getElementById("magicText");
  const magicFillEl = document.getElementById("magicFill");
  const difficultyOverlay = document.getElementById("difficultyOverlay");
  const gameOverOverlay = document.getElementById("gameOverOverlay");
  const finalScoreEl = document.getElementById("finalScore");
  const loadingTextEl = document.getElementById("loadingText");
  const restartButton = document.getElementById("restart");

  const W = canvas.width;
  const H = canvas.height;
  const GROUND_Y = 610;

  const DIFFICULTIES = {
    easy:   { hp: 8, enemySpeed: 0.82, spawnScale: 1.28, magicGain: 20, invulnMs: 1500 },
    normal: { hp: 5, enemySpeed: 1.00, spawnScale: 1.00, magicGain: 14, invulnMs: 1200 },
    hard:   { hp: 3, enemySpeed: 1.22, spawnScale: 0.78, magicGain: 10, invulnMs: 900 }
  };

  const HEIGHTS = {
    1: { hitY: 555, baseY: 625 },
    2: { hitY: 365, baseY: 455 },
    3: { hitY: 265, baseY: 350 },
    4: { hitY: 170, baseY: 255 }
  };

  const IMAGE_FILES = {
    neutral: "neutral.webp",
    midStart: "mid_kick_start.webp",
    midHit: "mid_kick_hit.webp",
    lowStart: "low_kick_start.webp",
    lowHit: "low_kick_hit.webp",
    highStart: "mid_kick_start.webp",
    highHit: "high_kick_hit.webp",
    jump: "jump.webp",
    jumpAttackStart: "jump_attack_start.webp",
    jumpAttackHit: "jump_attack_hit.webp",
    landing: "landing.webp",
    magicCharge: "magic_charge.webp",
    magicCast: "magic_cast.webp",
    damage: "damage.webp",
    airMagicStart: "air_magic_start.webp",
    airMagicCast: "air_magic_cast.webp"
  };

  const SPRITE_DRAW = {
    neutral:    { scale: 1.00, x: 0,  y: 0 },
    low:        { scale: 0.98, x: 0,  y: 2 },
    mid:        { scale: 1.00, x: 0,  y: 0 },
    high:       { scale: 1.00, x: 0,  y: 0 },
    jump:       { scale: 0.82, x: 0,  y: -18 },
    jumpAttack: { scale: 0.82, x: 0,  y: -18 },
    airMagic:   { scale: 0.82, x: 0,  y: -18 },
    landing:    { scale: 0.98, x: 0,  y: 2 },
    special:    { scale: 1.00, x: 0,  y: 0 },
    damage:     { scale: 1.00, x: 0,  y: 0 }
  };

  const images = {};
  let loadedImages = 0;
  const totalImages = Object.keys(IMAGE_FILES).length;

  for (const [key, file] of Object.entries(IMAGE_FILES)) {
    const image = new Image();
    image.decoding = "async";
    image.onload = () => loadedImages++;
    image.onerror = () => loadedImages++;
    image.src = new URL(file, document.baseURI).href;
    images[key] = image;
  }

  const input = {
    up: false, down: false, left: false, right: false,
    downLeft: false, downRight: false,
    jump: false, attack: false, special: false
  };

  let game = createMenuState();

  function createMenuState() {
    return {
      started: false,
      running: false,
      difficultyName: "normal",
      difficulty: DIFFICULTIES.normal,
      hp: 5,
      score: 0,
      magic: 0,
      elapsedMs: 0,
      spawnTimerMs: 2000,
      graceMs: 3000,
      facing: 1,
      enemies: [],
      particles: [],
      airMagicProjectile: null,
      airMagicExplosion: null,
      player: createPlayer()
    };
  }

  function createPlayer() {
    return {
      x: W / 2,
      y: GROUND_Y,
      vy: 0,
      grounded: true,
      action: "neutral",
      actionTimerMs: 0,
      attackSerial: 0,
      invulnerableMs: 0,
      magicTimerMs: 0,
      airMagicLaunched: false
    };
  }

  function startGame(difficultyName) {
    const difficulty = DIFFICULTIES[difficultyName];

    game = {
      started: true,
      running: true,
      difficultyName,
      difficulty,
      hp: difficulty.hp,
      score: 0,
      magic: 0,
      elapsedMs: 0,
      spawnTimerMs: 2200,
      graceMs: 3000,
      facing: 1,
      enemies: [],
      particles: [],
      airMagicProjectile: null,
      airMagicExplosion: null,
      player: createPlayer()
    };

    difficultyOverlay.classList.add("hidden");
    gameOverOverlay.classList.add("hidden");
    updateHud();
  }

  function updateHud() {
    hpEl.textContent = game.hp;
    scoreEl.textContent = game.score;
    magicTextEl.textContent = `${Math.floor(game.magic)}%`;
    magicFillEl.style.width = `${game.magic}%`;
  }

  document.querySelectorAll("[data-difficulty]").forEach(button => {
    button.addEventListener("click", () => startGame(button.dataset.difficulty));
  });

  restartButton.addEventListener("click", () => startGame(game.difficultyName));

  function handlePress(key) {
    if (!game.running) return;

    const player = game.player;

    if (key === "left" || key === "downLeft") game.facing = -1;
    if (key === "right" || key === "downRight") game.facing = 1;

    if (key === "jump" && player.grounded && !["special", "damage"].includes(player.action)) {
      player.grounded = false;
      player.vy = input.up ? -1080 : -860;
      player.action = "jump";
      player.actionTimerMs = 0;
      return;
    }

    if (key === "attack" && !["special", "damage"].includes(player.action)) {
      if (!player.grounded) {
        const downwardMagicRequested =
          input.down || input.downLeft || input.downRight;

        if (
          downwardMagicRequested &&
          game.magic >= 50 &&
          player.action !== "airMagic"
        ) {
          game.magic -= 50;
          player.action = "airMagic";
          player.actionTimerMs = 0;
          player.airMagicLaunched = false;
          player.vy = 0;
          player.invulnerableMs = Math.max(player.invulnerableMs, 520);
          game.airMagicProjectile = null;
          game.airMagicExplosion = null;
          createBurst(player.x, player.y - 120, 24);
          updateHud();
        } else {
          player.action = "jumpAttack";
          player.actionTimerMs = 0;
          player.attackSerial++;
        }
      } else if (player.action === "neutral") {
        const lowRequested = input.down || input.downLeft || input.downRight;
        player.action = input.up ? "high" : lowRequested ? "low" : "mid";
        player.actionTimerMs = 0;
        player.attackSerial++;
      }
      return;
    }

    if (key === "special" && game.magic >= 100 && player.magicTimerMs <= 0) {
      game.magic = 0;
      player.magicTimerMs = 4200;
      player.action = "special";
      player.actionTimerMs = 0;
      createBurst(W / 2, H / 2, 90);
      updateHud();
    }
  }

  document.querySelectorAll("[data-input]").forEach(button => {
    const key = button.dataset.input;

    const press = event => {
      event.preventDefault();
      if (!input[key]) handlePress(key);
      input[key] = true;
      button.classList.add("active");
    };

    const release = event => {
      event.preventDefault();
      input[key] = false;
      button.classList.remove("active");
    };

    button.addEventListener("pointerdown", press);
    button.addEventListener("pointerup", release);
    button.addEventListener("pointercancel", release);
    button.addEventListener("pointerleave", release);
  });

  function spawnEnemy() {
    const side = Math.random() < 0.5 ? -1 : 1;
    const roll = Math.random();

    let enemy;

    if (roll < 0.20) {
      enemy = { type: "strawberry", height: 1, speed: 115, score: 120, color: "#ff477e" };
    } else if (roll < 0.40) {
      enemy = {
        type: "melon", height: 1, speed: 92, score: 145, color: "#9fe870",
        bouncing: true, minHeight: 1, maxHeight: 2,
        phase: Math.random() * Math.PI * 2
      };
    } else if (roll < 0.60) {
      enemy = { type: "grape", height: 2, speed: 102, score: 155, color: "#9a5de2" };
    } else if (roll < 0.77) {
      enemy = { type: "lemon", height: 2, speed: 112, score: 165, color: "#ffd84b" };
    } else if (roll < 0.92) {
      enemy = { type: "pineapple", height: 3, speed: 108, score: 190, color: "#ffb739" };
    } else {
      enemy = { type: "watermelon", height: 4, speed: 103, score: 240, color: "#56c96f" };
    }

    enemy.speed *= game.difficulty.enemySpeed;

    const lane = HEIGHTS[enemy.height];

    game.enemies.push({
      ...enemy,
      side,
      x: side < 0 ? -90 : W + 90,
      y: lane.baseY,
      hitY: lane.hitY,
      dead: false,
      lastHitSerial: -1
    });
  }

  function updateBouncingEnemy(enemy, dt) {
    if (!enemy.bouncing) return;

    enemy.phase += 0.0038 * dt;
    const wave = (Math.sin(enemy.phase) + 1) / 2;

    const low = HEIGHTS[enemy.minHeight];
    const high = HEIGHTS[enemy.maxHeight];

    enemy.hitY = low.hitY + (high.hitY - low.hitY) * wave;
    enemy.y = low.baseY + (high.baseY - low.baseY) * wave;
    enemy.height = wave < 0.5 ? 1 : 2;
  }

  function attackHeight() {
    const action = game.player.action;
    if (action === "low") return 1;
    if (action === "mid") return 2;
    if (action === "high") return 3;
    if (action === "jumpAttack") return 4;
    return 0;
  }

  function attackIsActive() {
    const player = game.player;

    if (["low", "mid", "high"].includes(player.action)) {
      return player.actionTimerMs >= 110 && player.actionTimerMs <= 250;
    }

    if (player.action === "jumpAttack") {
      return player.actionTimerMs >= 80 && player.actionTimerMs <= 320;
    }

    return false;
  }

  function defeatEnemy(enemy, grantMagic) {
    if (enemy.dead) return;

    enemy.dead = true;
    game.score += enemy.score;

    if (grantMagic) {
      game.magic = Math.min(100, game.magic + game.difficulty.magicGain);
    }

    createBurst(enemy.x, enemy.y - 50, 12);
    updateHud();
  }

  function createBurst(x, y, count) {
    for (let i = 0; i < count; i++) {
      game.particles.push({
        x, y,
        vx: (Math.random() - 0.5) * 450,
        vy: -Math.random() * 380,
        lifeMs: 500 + Math.random() * 600,
        size: 3 + Math.random() * 7,
        hue: Math.random() * 360
      });
    }
  }

  function testAttackHits() {
    if (!attackIsActive()) return;

    const player = game.player;
    const horizontalRange = player.action === "jumpAttack" ? 345 : 285;
    let hitCount = 0;

    for (const enemy of game.enemies) {
      const enemyDirection = enemy.x < player.x ? -1 : 1;

      if (
        enemy.dead ||
        enemyDirection !== game.facing ||
        enemy.lastHitSerial === player.attackSerial
      ) {
        continue;
      }

      const horizontalMatch = Math.abs(enemy.x - player.x) <= horizontalRange;

      let verticalMatch;

      if (player.action === "jumpAttack") {
        // During a jump kick, the foot travels through multiple lanes.
        // Any enemy whose visible hit point is close to the current foot height can be hit.
        const airKickY = player.y - 185;
        verticalMatch = Math.abs(enemy.hitY - airKickY) <= 115;
      } else {
        const height = attackHeight();
        const attackY = HEIGHTS[height].hitY;
        verticalMatch = Math.abs(enemy.hitY - attackY) <= 75;
      }

      if (horizontalMatch && verticalMatch) {
        enemy.lastHitSerial = player.attackSerial;
        defeatEnemy(enemy, true);
        hitCount++;

        const maxHits = player.action === "jumpAttack" ? 5 : 2;
        if (hitCount >= maxHits) break;
      }
    }
  }

  function update(dt) {
    if (!game.running) return;

    const player = game.player;

    game.elapsedMs += dt;
    game.graceMs = Math.max(0, game.graceMs - dt);

    player.actionTimerMs += dt;
    player.invulnerableMs = Math.max(0, player.invulnerableMs - dt);

    // Holding left/right or a diagonal moves the heroine slightly.
    // Movement is limited to the center area to preserve the two-sided defense style.
    if (
      player.magicTimerMs <= 0 &&
      !["damage", "airMagic"].includes(player.action)
    ) {
      const moveLeft = input.left || input.downLeft;
      const moveRight = input.right || input.downRight;
      const moveDirection = (moveRight ? 1 : 0) - (moveLeft ? 1 : 0);

      if (moveDirection !== 0) {
        game.facing = moveDirection;
        const moveSpeed = player.grounded ? 112 : 70;
        player.x += moveDirection * moveSpeed * dt / 1000;
        player.x = Math.max(W * 0.32, Math.min(W * 0.68, player.x));
      }
    }

    if (!player.grounded) {
      if (player.action === "airMagic" && player.actionTimerMs < 350) {
        // Briefly hover while charging and releasing the downward spell.
        player.vy = 0;

        if (player.actionTimerMs >= 175 && !player.airMagicLaunched) {
          player.airMagicLaunched = true;
          game.airMagicProjectile = {
            x: player.x,
            y: player.y - 92,
            vy: 1180,
            radius: 34,
            active: true
          };
          createBurst(player.x, player.y - 80, 18);
        }
      } else {
        player.vy += 2150 * dt / 1000;
        player.y += player.vy * dt / 1000;
      }

      if (player.y >= GROUND_Y) {
        player.y = GROUND_Y;
        player.vy = 0;
        player.grounded = true;
        player.action = "landing";
        player.actionTimerMs = 0;
        player.airMagicLaunched = false;
      }
    }

    if (["low", "mid", "high"].includes(player.action) && player.actionTimerMs > 390) {
      player.action = "neutral";
      player.actionTimerMs = 0;
    }

    if (player.action === "landing" && player.actionTimerMs > 170) {
      player.action = "neutral";
      player.actionTimerMs = 0;
    }

    if (player.action === "airMagic" && player.actionTimerMs > 390) {
      player.action = "jump";
      player.actionTimerMs = 0;
    }

    if (player.action === "damage" && player.actionTimerMs > 300) {
      player.action = player.grounded ? "neutral" : "jump";
      player.actionTimerMs = 0;
    }

    if (player.magicTimerMs > 0) {
      player.magicTimerMs -= dt;
      player.action = "special";

      if (player.actionTimerMs > 250) {
        for (const enemy of game.enemies) {
          if (!enemy.dead) defeatEnemy(enemy, false);
        }

        if (Math.random() < 0.45) {
          createBurst(W / 2, H / 2, 12);
        }
      }

      if (player.magicTimerMs <= 0) {
        player.action = "neutral";
        player.actionTimerMs = 0;
      }
    }

    if (game.airMagicProjectile?.active) {
      const projectile = game.airMagicProjectile;
      projectile.y += projectile.vy * dt / 1000;

      if (Math.random() < 0.72) {
        game.particles.push({
          x: projectile.x + (Math.random() - 0.5) * 26,
          y: projectile.y + (Math.random() - 0.5) * 20,
          vx: (Math.random() - 0.5) * 80,
          vy: -80 - Math.random() * 150,
          lifeMs: 280 + Math.random() * 260,
          size: 3 + Math.random() * 7,
          hue: 185 + Math.random() * 35
        });
      }

      if (projectile.y >= GROUND_Y - 10) {
        projectile.active = false;
        game.airMagicExplosion = {
          x: projectile.x,
          y: GROUND_Y - 10,
          timerMs: 620,
          durationMs: 620
        };

        let defeated = 0;
        for (const enemy of game.enemies) {
          if (enemy.dead) continue;

          const horizontallyBelow =
            Math.abs(enemy.x - projectile.x) <= 205;
          const withinBlastHeight =
            Math.abs(enemy.hitY - (GROUND_Y - 115)) <= 300;

          if (horizontallyBelow && withinBlastHeight) {
            defeatEnemy(enemy, false);
            defeated++;
          }
        }

        createBurst(projectile.x, GROUND_Y - 45, 56);
        if (defeated > 0) {
          game.score += Math.max(0, defeated - 1) * 25;
          updateHud();
        }
      }
    }

    if (game.airMagicExplosion) {
      game.airMagicExplosion.timerMs -= dt;
      if (game.airMagicExplosion.timerMs <= 0) {
        game.airMagicExplosion = null;
      }
    }

    testAttackHits();

    game.spawnTimerMs -= dt;

    if (game.spawnTimerMs <= 0) {
      spawnEnemy();
      game.spawnTimerMs = (
        Math.max(700, 1350 - game.elapsedMs * 0.010) +
        Math.random() * 480
      ) * game.difficulty.spawnScale;
    }

    for (const enemy of game.enemies) {
      if (enemy.dead) continue;

      updateBouncingEnemy(enemy, dt);
      enemy.x += -enemy.side * enemy.speed * dt / 1000;

      const touchingPlayer = Math.abs(enemy.x - player.x) < 48;

      if (touchingPlayer) {
        if (player.magicTimerMs > 0 || player.action === "airMagic") {
          defeatEnemy(enemy, false);
        } else if (game.graceMs <= 0 && player.invulnerableMs <= 0) {
          player.invulnerableMs = game.difficulty.invulnMs;
          player.action = "damage";
          player.actionTimerMs = 0;
          game.hp--;
          enemy.dead = true;

          createBurst(player.x, player.y - 100, 14);
          updateHud();

          if (game.hp <= 0) {
            endGame();
            return;
          }
        }
      }
    }

    game.enemies = game.enemies.filter(
      enemy => !enemy.dead && enemy.x > -180 && enemy.x < W + 180
    );

    for (const particle of game.particles) {
      particle.lifeMs -= dt;
      particle.vy += 650 * dt / 1000;
      particle.x += particle.vx * dt / 1000;
      particle.y += particle.vy * dt / 1000;
    }

    game.particles = game.particles.filter(particle => particle.lifeMs > 0);
  }

  function endGame() {
    if (!game.running) return;

    game.running = false;
    finalScoreEl.textContent = `SCORE ${game.score}`;
    gameOverOverlay.classList.remove("hidden");
  }

  function drawBackground() {
    const gradient = ctx.createLinearGradient(0, 0, 0, H);
    gradient.addColorStop(0, "#94e1ff");
    gradient.addColorStop(0.58, "#eefcff");
    gradient.addColorStop(0.59, "#a4e77e");
    gradient.addColorStop(1, "#4eb96c");

    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, W, H);

    ctx.fillStyle = "rgba(255,255,255,.7)";
    for (let i = 0; i < 7; i++) {
      ctx.beginPath();
      ctx.arc(120 + i * 190, 120 + (i % 2) * 45, 55, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.fillStyle = "#c9a9ff";
    ctx.fillRect(540, 170, 200, 240);

    ctx.fillStyle = "#9a77dd";
    for (let i = 0; i < 4; i++) {
      ctx.fillRect(560 + i * 45, 120 - (i % 2) * 35, 28, 90);
    }
  }

  function drawEnemy(enemy) {
    ctx.save();
    ctx.translate(enemy.x, enemy.y);
    ctx.scale(enemy.side * 0.88, 0.88);

    ctx.fillStyle = enemy.color;
    ctx.strokeStyle = "rgba(83,48,92,.55)";
    ctx.lineWidth = 5;

    if (enemy.type === "strawberry") {
      ctx.beginPath();
      ctx.arc(0, -48, 34, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();

      ctx.fillStyle = "#4fa84f";
      for (let i = -1; i <= 1; i++) {
        ctx.beginPath();
        ctx.moveTo(i * 12, -78);
        ctx.lineTo(i * 12 - 10, -96);
        ctx.lineTo(i * 12 + 10, -84);
        ctx.fill();
      }

    } else if (enemy.type === "melon" || enemy.type === "watermelon") {
      const radius = enemy.type === "melon" ? 40 : 44;

      ctx.beginPath();
      ctx.arc(0, -48, radius, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();

      ctx.strokeStyle = "#4fa965";
      ctx.lineWidth = 3;
      for (let i = -26; i <= 26; i += 13) {
        ctx.beginPath();
        ctx.moveTo(i, -82);
        ctx.lineTo(-i, -14);
        ctx.stroke();
      }

    } else if (enemy.type === "grape") {
      for (let row = 0; row < 3; row++) {
        for (let col = 0; col < 3 - row; col++) {
          ctx.beginPath();
          ctx.arc((col - (2 - row) / 2) * 26, -90 + row * 26, 16, 0, Math.PI * 2);
          ctx.fill();
          ctx.stroke();
        }
      }

    } else if (enemy.type === "lemon") {
      ctx.beginPath();
      ctx.ellipse(0, -52, 44, 30, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();

    } else {
      ctx.beginPath();
      ctx.ellipse(0, -55, 40, 48, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    }

    ctx.fillStyle = "#3a244d";
    ctx.beginPath();
    ctx.arc(-13, -55, 6, 0, Math.PI * 2);
    ctx.arc(13, -55, 6, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();
  }

  function currentPlayerImage() {
    const player = game.player;

    if (player.action === "jump") return images.jump;

    if (player.action === "jumpAttack") {
      return player.actionTimerMs < 120
        ? images.jumpAttackStart
        : images.jumpAttackHit;
    }

    if (player.action === "airMagic") {
      return player.actionTimerMs < 175
        ? images.airMagicStart
        : images.airMagicCast;
    }

    if (player.action === "special") {
      return player.actionTimerMs < 650
        ? images.magicCharge
        : images.magicCast;
    }

    if (player.action === "damage") return images.damage;

    if (player.action === "landing") return images.landing;

    if (player.action === "low") {
      return player.actionTimerMs < 145 || player.actionTimerMs > 275
        ? images.lowStart
        : images.lowHit;
    }

    if (player.action === "mid") {
      return player.actionTimerMs < 105 || player.actionTimerMs > 250
        ? images.midStart
        : images.midHit;
    }

    if (player.action === "high") {
      return player.actionTimerMs < 150 || player.actionTimerMs > 295
        ? images.highStart
        : images.highHit;
    }

    return images.neutral;
  }

  function drawPlayer() {
    const player = game.player;
    const image = currentPlayerImage();

    ctx.save();
    ctx.translate(player.x, player.y);
    ctx.scale(game.facing, 1);

    if (
      player.invulnerableMs > 0 &&
      Math.floor(player.invulnerableMs / 80) % 2 === 0
    ) {
      ctx.globalAlpha = 0.35;
    }

    if (image && image.complete && image.naturalWidth > 0) {
      const draw = SPRITE_DRAW[player.action] || SPRITE_DRAW.neutral;
      const drawSize = 500 * draw.scale;
      ctx.drawImage(
        image,
        -drawSize / 2 + draw.x,
        -drawSize + draw.y,
        drawSize,
        drawSize
      );
    } else {
      ctx.fillStyle = "#fff";
      ctx.fillRect(-30, -150, 60, 130);
    }

    ctx.restore();
  }

  function draw() {
    drawBackground();

    for (const enemy of game.enemies) {
      drawEnemy(enemy);
    }

    drawPlayer();

    if (game.airMagicProjectile?.active) {
      const projectile = game.airMagicProjectile;
      const pulse = 0.75 + Math.sin(game.elapsedMs * 0.025) * 0.18;

      const glow = ctx.createRadialGradient(
        projectile.x,
        projectile.y,
        3,
        projectile.x,
        projectile.y,
        58
      );
      glow.addColorStop(0, "rgba(255,255,255,.98)");
      glow.addColorStop(.28, "rgba(112,225,255,.95)");
      glow.addColorStop(.65, "rgba(37,127,255,.56)");
      glow.addColorStop(1, "rgba(37,127,255,0)");

      ctx.fillStyle = glow;
      ctx.beginPath();
      ctx.arc(projectile.x, projectile.y, 58 * pulse, 0, Math.PI * 2);
      ctx.fill();

      ctx.strokeStyle = "rgba(210,250,255,.82)";
      ctx.lineWidth = 5;
      ctx.beginPath();
      ctx.arc(projectile.x, projectile.y, 27 * pulse, 0, Math.PI * 2);
      ctx.stroke();

      const beam = ctx.createLinearGradient(
        projectile.x,
        projectile.y - 135,
        projectile.x,
        projectile.y + 10
      );
      beam.addColorStop(0, "rgba(130,225,255,0)");
      beam.addColorStop(1, "rgba(130,225,255,.60)");
      ctx.fillStyle = beam;
      ctx.fillRect(projectile.x - 12, projectile.y - 135, 24, 145);
    }

    if (game.airMagicExplosion) {
      const explosion = game.airMagicExplosion;
      const progress =
        1 - explosion.timerMs / explosion.durationMs;
      const radius = 45 + progress * 210;
      const alpha = Math.max(0, 1 - progress);

      const blast = ctx.createRadialGradient(
        explosion.x,
        explosion.y,
        4,
        explosion.x,
        explosion.y,
        radius
      );
      blast.addColorStop(0, `rgba(255,255,255,${.98 * alpha})`);
      blast.addColorStop(.22, `rgba(103,232,255,${.88 * alpha})`);
      blast.addColorStop(.58, `rgba(36,113,255,${.50 * alpha})`);
      blast.addColorStop(1, "rgba(25,70,255,0)");

      ctx.fillStyle = blast;
      ctx.beginPath();
      ctx.arc(explosion.x, explosion.y, radius, Math.PI, Math.PI * 2);
      ctx.fill();

      for (let ring = 0; ring < 3; ring++) {
        ctx.strokeStyle =
          `rgba(178,244,255,${alpha * (0.75 - ring * 0.18)})`;
        ctx.lineWidth = 9 - ring * 2;
        ctx.beginPath();
        ctx.ellipse(
          explosion.x,
          explosion.y,
          radius * (0.55 + ring * 0.18),
          radius * (0.14 + ring * 0.035),
          0,
          0,
          Math.PI * 2
        );
        ctx.stroke();
      }
    }

    for (const particle of game.particles) {
      ctx.fillStyle = `hsl(${particle.hue} 90% 65%)`;
      ctx.beginPath();
      ctx.arc(particle.x, particle.y, particle.size, 0, Math.PI * 2);
      ctx.fill();
    }

    if (game.started && game.graceMs > 0) {
      ctx.fillStyle = "rgba(255,255,255,.88)";
      ctx.font = "900 46px sans-serif";
      ctx.textAlign = "center";
      ctx.fillText("READY!", W / 2, 95);
    }

    if (game.player.magicTimerMs > 0) {
      const t = game.player.magicTimerMs;
      const pulse = 0.5 + 0.5 * Math.sin(game.elapsedMs * 0.018);

      // Darken the field so the spell reads clearly.
      ctx.fillStyle = "rgba(43,20,82,.42)";
      ctx.fillRect(0, 0, W, H);

      // Large rotating magic circle.
      ctx.save();
      ctx.translate(game.player.x, game.player.y - 120);
      ctx.rotate(game.elapsedMs * 0.0025);
      ctx.strokeStyle = `rgba(132,230,255,${0.55 + pulse * 0.35})`;
      ctx.lineWidth = 8;
      ctx.beginPath();
      ctx.arc(0, 0, 125 + pulse * 18, 0, Math.PI * 2);
      ctx.stroke();

      ctx.strokeStyle = `rgba(255,112,220,${0.45 + pulse * 0.35})`;
      ctx.lineWidth = 5;
      ctx.beginPath();
      for (let i = 0; i < 8; i++) {
        const a = i * Math.PI / 4;
        const x1 = Math.cos(a) * 55;
        const y1 = Math.sin(a) * 55;
        const x2 = Math.cos(a + Math.PI / 3) * 112;
        const y2 = Math.sin(a + Math.PI / 3) * 112;
        if (i === 0) ctx.moveTo(x1, y1);
        ctx.lineTo(x2, y2);
      }
      ctx.closePath();
      ctx.stroke();
      ctx.restore();

      // Rainbow shockwaves.
      for (let i = 0; i < 4; i++) {
        const radius = 120 + ((game.elapsedMs * 0.35 + i * 150) % 520);
        ctx.strokeStyle = `hsla(${(game.elapsedMs * 0.12 + i * 80) % 360},95%,68%,${0.42 - radius / 1500})`;
        ctx.lineWidth = 16 - i * 2;
        ctx.beginPath();
        ctx.arc(game.player.x, game.player.y - 120, radius, 0, Math.PI * 2);
        ctx.stroke();
      }

      // Falling stars and crystal streaks.
      for (let i = 0; i < 18; i++) {
        const sx = (i * 83 + game.elapsedMs * 0.42) % (W + 180) - 90;
        const sy = (i * 137 + game.elapsedMs * 0.65) % (H + 220) - 110;

        ctx.save();
        ctx.translate(sx, sy);
        ctx.rotate(-0.75);
        ctx.fillStyle = `hsla(${(i * 47 + game.elapsedMs * 0.15) % 360},95%,70%,.86)`;
        ctx.beginPath();
        ctx.moveTo(0, -18);
        ctx.lineTo(6, -5);
        ctx.lineTo(20, 0);
        ctx.lineTo(6, 5);
        ctx.lineTo(0, 18);
        ctx.lineTo(-6, 5);
        ctx.lineTo(-20, 0);
        ctx.lineTo(-6, -5);
        ctx.closePath();
        ctx.fill();

        ctx.fillStyle = "rgba(255,255,255,.42)";
        ctx.fillRect(-85, -3, 70, 6);
        ctx.restore();
      }

      // Bright center flash.
      const glow = ctx.createRadialGradient(
        game.player.x,
        game.player.y - 120,
        10,
        game.player.x,
        game.player.y - 120,
        340
      );
      glow.addColorStop(0, "rgba(255,255,255,.95)");
      glow.addColorStop(.22, "rgba(255,218,110,.65)");
      glow.addColorStop(.48, "rgba(255,112,220,.36)");
      glow.addColorStop(1, "rgba(120,210,255,0)");
      ctx.fillStyle = glow;
      ctx.fillRect(0, 0, W, H);

      ctx.fillStyle = "#fff";
      ctx.font = "900 58px sans-serif";
      ctx.textAlign = "center";
      ctx.shadowColor = "#7a3bd6";
      ctx.shadowBlur = 18;
      ctx.fillText("RAINBOW FRUIT STORM!", W / 2, 92);
      ctx.shadowBlur = 0;
    }

    loadingTextEl.textContent =
      loadedImages < totalImages
        ? `キャラクターを読み込み中 ${loadedImages}/${totalImages}`
        : "準備完了";
  }

  let previousTime = performance.now();

  function frame(now) {
    const dt = Math.min(34, now - previousTime);
    previousTime = now;

    if (game.started) {
      update(dt);
    }

    draw();
    requestAnimationFrame(frame);
  }

  updateHud();
  requestAnimationFrame(frame);
})();
