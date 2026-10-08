/* global SFX, BoardAPI, BattleAPI */
(function () {
  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => [...document.querySelectorAll(sel)];

  const state = {
    diffKey: "intermediate",
    board: null,
    timerId: null,
    startedAt: 0,
    pausedAt: 0,
    pauseAccum: 0,
    battleHandle: null,
    pendingMine: null,
    tutorialMode: false,
    longPressTimer: null,
    touchFlagged: false,
    resultTimer: null,
  };

  const DEFEAT_REVEAL_MS = 1800;

  const RECORD_KEY = "mine-battle-sweep-best";
  const RANK_LIMIT = 5;
  const RECORD_DIFFS = ["beginner", "intermediate", "expert"];
  const ENDING_LABELS = { normal: "노멀", hidden: "히든" };

  function showScreen(id) {
    $$(".screen").forEach((el) => el.classList.remove("active"));
    const target = document.getElementById(id);
    if (target) target.classList.add("active");
  }

  function emptyRecords() {
    return { beginner: [], intermediate: [], expert: [] };
  }

  function cleanRecord(row) {
    if (!row || typeof row.timeMs !== "number" || typeof row.lives !== "number") return null;
    if (!Number.isFinite(row.timeMs) || row.timeMs < 0) return null;
    return {
      timeMs: row.timeMs,
      lives: Math.max(0, Math.min(3, Math.floor(row.lives))),
      ending: row.ending === "hidden" ? "hidden" : "normal",
      playedAt: Number.isFinite(row.playedAt) ? row.playedAt : null,
    };
  }

  function compareRecords(a, b) {
    const aSec = Math.floor(a.timeMs / 1000);
    const bSec = Math.floor(b.timeMs / 1000);
    if (aSec !== bSec) return aSec - bSec;
    return b.lives - a.lives;
  }

  function loadRecords() {
    try {
      const raw = localStorage.getItem(RECORD_KEY);
      if (!raw) return emptyRecords();
      const data = JSON.parse(raw);
      const out = emptyRecords();
      RECORD_DIFFS.forEach(function (key) {
        const value = data && data[key];
        // 예전 버전은 난이도마다 기록 하나를 객체로 저장했다
        const rows = Array.isArray(value) ? value : value ? [value] : [];
        out[key] = rows.map(cleanRecord).filter(Boolean).sort(compareRecords).slice(0, RANK_LIMIT);
      });
      return out;
    } catch (err) {
      return emptyRecords();
    }
  }

  function saveRecords(records) {
    try {
      localStorage.setItem(RECORD_KEY, JSON.stringify(records));
    } catch (err) {
      /* 저장 공간이 막혀 있으면 이번 판 결과만 보여 준다 */
    }
  }

  function commitRecord(diffKey, timeMs, lives, ending) {
    const records = loadRecords();
    const entry = { timeMs: timeMs, lives: lives, ending: ending, playedAt: Date.now() };
    // 정렬은 안정적이라 동점이면 먼저 세운 기록이 위에 남는다
    const ranked = records[diffKey].concat(entry).sort(compareRecords);
    const place = ranked.indexOf(entry) + 1;
    records[diffKey] = ranked.slice(0, RANK_LIMIT);
    if (place <= RANK_LIMIT) saveRecords(records);
    return { rank: place <= RANK_LIMIT ? place : null, best: records[diffKey][0] };
  }

  function formatDate(ms) {
    const d = new Date(ms);
    return `${d.getMonth() + 1}/${d.getDate()}`;
  }

  function renderRanking(diffKey) {
    $$(".rank-tab").forEach((btn) => {
      const on = btn.dataset.diff === diffKey;
      btn.classList.toggle("selected", on);
      btn.setAttribute("aria-selected", String(on));
    });
    const list = loadRecords()[diffKey] || [];
    const el = $("#ranking-list");
    if (!list.length) {
      el.innerHTML = `<li class="rank-empty">아직 기록이 없습니다. 이 난이도를 클리어하면 여기에 남습니다.</li>`;
      return;
    }
    el.innerHTML = list
      .map((row, i) => {
        const date = row.playedAt ? ` · ${formatDate(row.playedAt)}` : "";
        return `<li class="rank-row${i === 0 ? " top" : ""}">
          <span class="rank-no">${i + 1}</span>
          <span class="rank-time">${formatTime(row.timeMs)}</span>
          <span class="rank-meta">라이프 ${row.lives} · ${ENDING_LABELS[row.ending]}${date}</span>
        </li>`;
      })
      .join("");
  }

  function openRanking() {
    renderRanking(state.diffKey);
    showScreen("screen-ranking");
  }

  function formatTime(ms) {
    const s = Math.floor(ms / 1000);
    const m = Math.floor(s / 60);
    const r = s % 60;
    return `${String(m).padStart(2, "0")}:${String(r).padStart(2, "0")}`;
  }

  function updateHud() {
    const b = state.board;
    if (!b) return;
    $("#stat-mines").textContent = String(BoardAPI.remainingMines(b));
    $("#stat-lives").textContent = String(b.lives);
    $("#hud-diff").textContent = b.diff.label;
    if (b.started && !b.over) {
      b.elapsedMs = Date.now() - state.startedAt - state.pauseAccum;
    }
    $("#stat-time").textContent = formatTime(b.elapsedMs || 0);
  }

  function startTimer() {
    stopTimer();
    state.timerId = setInterval(updateHud, 250);
  }

  function stopTimer() {
    if (state.timerId) {
      clearInterval(state.timerId);
      state.timerId = null;
    }
  }

  function cellSizeFor(board) {
    const maxW = Math.min(window.innerWidth - 40, 920);
    const maxH = window.innerHeight - 160;
    const byW = Math.floor(maxW / board.cols) - 2;
    const byH = Math.floor(maxH / board.rows) - 2;
    return Math.max(18, Math.min(36, byW, byH));
  }

  function renderBoard() {
    const board = state.board;
    const el = $("#board");
    const size = cellSizeFor(board);
    el.style.setProperty("--cell-size", `${size}px`);
    el.style.gridTemplateColumns = `repeat(${board.cols}, ${size}px)`;
    el.innerHTML = "";

    for (let r = 0; r < board.rows; r++) {
      for (let c = 0; c < board.cols; c++) {
        const cell = board.cells[r][c];
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "cell";
        btn.dataset.r = String(r);
        btn.dataset.c = String(c);
        btn.setAttribute("role", "gridcell");

        if (cell.exploded) {
          btn.classList.add("open", "exploded");
          btn.textContent = "✱";
          btn.title = "지뢰";
        } else if (cell.cleared) {
          btn.classList.add("open", "mine-cleared");
          btn.textContent = "◇";
          btn.title = "제거된 지뢰";
        } else if (cell.open) {
          btn.classList.add("open");
          if (cell.adjacent > 0) {
            btn.classList.add(`n${cell.adjacent}`);
            btn.textContent = String(cell.adjacent);
          }
        } else if (cell.flagged) {
          btn.classList.add("flagged");
          btn.textContent = "⚑";
        }

        el.appendChild(btn);
      }
    }
    updateHud();
  }

  function cancelPendingResult() {
    clearTimeout(state.resultTimer);
    state.resultTimer = null;
  }

  function beginGame(diffKey) {
    SFX.unlock();
    cancelPendingResult();
    state.diffKey = diffKey || state.diffKey;
    state.board = BoardAPI.createBoard(state.diffKey);
    state.pauseAccum = 0;
    state.startedAt = 0;
    state.tutorialMode = false;
    state.pendingMine = null;
    state.battleHandle?.destroy?.();
    state.battleHandle = null;
    $("#screen-battle").classList.remove("active");
    $("#screen-pause").classList.remove("active");
    showScreen("screen-board");
    $("#board-tip").textContent =
      "안전한 칸을 여세요. 지뢰를 열면 사격전이 시작됩니다. 숫자가 클수록 탄막이 거세지고, 확실한 지뢰는 깃발로 표시해도 됩니다.";
    renderBoard();
    stopTimer();
    updateHud();
  }

  function ensureStarted(r, c) {
    const board = state.board;
    if (!board.minesPlaced) BoardAPI.placeMines(board, r, c);
    if (!board.started) {
      board.started = true;
      state.startedAt = Date.now();
      state.pauseAccum = 0;
      startTimer();
    }
  }

  function afterOpen() {
    const board = state.board;
    if (!board || board.over || !board.minesPlaced) return;

    const flaggedWin = BoardAPI.allMinesFlaggedExactly(board);
    const openedWin = BoardAPI.checkWin(board);

    if (!flaggedWin && !openedWin) return;

    if (flaggedWin && !openedWin) {
      for (const row of board.cells) {
        for (const cell of row) {
          if (!BoardAPI.isActiveMine(cell) && !cell.open) cell.open = true;
        }
      }
    }

    board.won = true;
    board.over = true;
    stopTimer();
    updateHud();
    renderBoard();
    SFX.clear();
    showResult(true);
  }

  function handleMineHit(cell, clueNumber) {
    const board = state.board;
    let danger = BoardAPI.dangerOfMine(board, cell.r, cell.c);
    if (clueNumber) danger = Math.max(danger, clueNumber);
    const meta = BoardAPI.battleTypeForDanger(danger);
    state.pendingMine = { r: cell.r, c: cell.c, danger, type: meta.key };

    SFX.encounter();
    stopTimer();
    state.pausedAt = Date.now();

    $("#battle-danger").textContent = `위험도 ${danger} · ${meta.label}`;
    $("#battle-hint").textContent = BattleAPI.getBattleMeta(danger).hint;
    $("#battle-progress").textContent = "0 / 0";

    $("#screen-board").classList.add("active");
    $("#screen-battle").classList.add("active");

    const stage = $("#battle-stage");
    stage.innerHTML = "";
    stage.classList.remove("flash-ok", "flash-bad");

    state.battleHandle?.destroy?.();
    state.battleHandle = BattleAPI.startBattle(stage, danger, {
      lives: board.lives,
      onProgress(ok, need, fails, failLimit) {
        $("#battle-progress").textContent =
          `격추 ${ok} / ${need}` + (fails != null ? ` · 피격 ${fails}/${failLimit}` : "");
      },
      onWin: () => onBattleWin(),
      onLose: () => onBattleLose(),
    });
  }

  function onBattleWin() {
    const board = state.board;
    const pending = state.pendingMine;
    state.battleHandle?.destroy?.();
    state.battleHandle = null;

    if (pending && !state.tutorialMode) {
      BoardAPI.clearMineAfterBattle(board, pending.r, pending.c);
      board.battlesWon++;
      board.battlesByType[pending.type] = (board.battlesByType[pending.type] || 0) + 1;
      board.maxDangerBeaten = Math.max(board.maxDangerBeaten, pending.danger);
    }

    if (state.tutorialMode) {
      $("#screen-battle").classList.remove("active");
      showScreen("screen-tutorial");
      SFX.clear();
      return;
    }

    state.pendingMine = null;
    $("#screen-battle").classList.remove("active");
    if (state.pausedAt) {
      state.pauseAccum += Date.now() - state.pausedAt;
      state.pausedAt = 0;
    }
    startTimer();
    renderBoard();
    $("#board-tip").textContent = "격추 성공! 지뢰가 소멸했습니다. 계속 탐색하세요.";
    afterOpen();
  }

  function onBattleLose() {
    const board = state.board;
    const pending = state.pendingMine;
    state.battleHandle?.destroy?.();
    state.battleHandle = null;

    if (state.tutorialMode) {
      $("#screen-battle").classList.remove("active");
      showScreen("screen-tutorial");
      SFX.defeat();
      return;
    }

    // 사격전 패배는 한 번으로 탐사 종료. 이긴 칸만 정화되고, 진 칸은 폭발로 남긴다.
    board.lives = 0;
    if (pending) BoardAPI.detonateMineAfterLoss(board, pending.r, pending.c);
    state.pendingMine = null;
    $("#screen-battle").classList.remove("active");

    board.over = true;
    board.won = false;
    BoardAPI.revealAllMines(board);
    freezeElapsed(board);
    stopTimer();
    renderBoard();
    SFX.defeat();
    $("#board-tip").textContent = "사격 실패… 지뢰가 폭발했습니다. 남은 지뢰 위치를 확인하세요.";
    cancelPendingResult();
    state.resultTimer = setTimeout(() => {
      state.resultTimer = null;
      showResult(false);
    }, DEFEAT_REVEAL_MS);
  }

  function openCell(r, c) {
    const board = state.board;
    if (!board || board.over) return;
    const cell = board.cells[r][c];
    if (cell.open || cell.flagged || cell.cleared) return;

    ensureStarted(r, c);

    if (cell.mine) {
      handleMineHit(cell);
      return;
    }

    const opened = BoardAPI.openFlood(board, r, c);
    if (opened.some((x) => x.adjacent > 0)) SFX.number();
    else SFX.open();
    renderBoard();
    afterOpen();
  }

  function flagCell(r, c) {
    const board = state.board;
    if (!board || board.over) return;
    if (BoardAPI.toggleFlag(board, r, c)) {
      SFX.flag();
      renderBoard();
      afterOpen();
    }
  }

  function doChord(r, c) {
    const board = state.board;
    if (!board || board.over || !board.minesPlaced) return;
    const clue = board.cells[r][c].adjacent;
    const { opened, mineHits } = BoardAPI.chordOpen(board, r, c);
    if (mineHits.length) {
      handleMineHit(mineHits[0], clue);
      return;
    }
    if (opened.length) {
      SFX.open();
      renderBoard();
      afterOpen();
    }
  }

  function freezeElapsed(board) {
    if (!state.startedAt) return;
    let paused = state.pauseAccum;
    if (state.pausedAt) paused += Date.now() - state.pausedAt;
    board.elapsedMs = Math.max(0, Date.now() - state.startedAt - paused);
  }

  function showResult(won) {
    const board = state.board;
    const endingEl = $("#result-ending");
    const titleEl = $("#result-title");
    const msgEl = $("#result-msg");
    const nextBtn = $("#btn-next");

    freezeElapsed(board);
    endingEl.classList.remove("bad", "hidden");

    let recordNote = "없음";
    if (!won) {
      const best = loadRecords()[board.diff.key][0];
      if (best) recordNote = formatTime(best.timeMs) + " · 라이프 " + best.lives;
    } else {
      const endingKey =
        board.minesRemovedByBattle >= Math.ceil(board.mines * 0.4) ? "hidden" : "normal";
      const saved = commitRecord(board.diff.key, board.elapsedMs, board.lives, endingKey);
      recordNote =
        formatTime(saved.best.timeMs) +
        " · 라이프 " +
        saved.best.lives +
        (saved.rank ? ` · 이번 기록 ${saved.rank}위` : ` · 이번 기록 ${RANK_LIMIT}위 밖`);
    }

    if (!won) {
      endingEl.textContent = "배드 엔딩";
      endingEl.classList.add("bad");
      titleEl.textContent = "격자 아래 다시 불이 켜진다";
      msgEl.textContent = "치명적 배틀 패배로 탐사가 중단되었습니다. 다시 도전하세요.";
      nextBtn.style.display = "none";
    } else if (board.minesRemovedByBattle >= Math.ceil(board.mines * 0.4)) {
      endingEl.textContent = "히든 엔딩 — 완전 격파";
      endingEl.classList.add("hidden");
      titleEl.textContent = "지뢰 군단의 핵심이 소멸했다";
      msgEl.textContent = "깃발에만 의존하지 않고 정면으로 맞서 이겼습니다. 승리는 선택이었습니다.";
      nextBtn.style.display = board.diff.next ? "" : "none";
    } else {
      endingEl.textContent = "노멀 엔딩 — 전장 안정화";
      titleEl.textContent = "격자가 정화되었다";
      msgEl.textContent = "숫자는 경고였고, 승리는 선택이었다.";
      nextBtn.style.display = board.diff.next ? "" : "none";
    }

    if (!board.diff.next) nextBtn.style.display = "none";

    const typeLabels = { snipe: "조준", suppress: "제압", swarm: "포화", boss: "보스" };
    const typeLine = Object.keys(typeLabels)
      .map((key) => `${typeLabels[key]} ${board.battlesByType[key] || 0}`)
      .join(" · ");

    $("#result-stats").innerHTML = `
      <div class="result-stat">시간<strong>${formatTime(board.elapsedMs)}</strong></div>
      <div class="result-stat">남은 라이프<strong>${board.lives}</strong></div>
      <div class="result-stat">사격 승수<strong>${board.battlesWon}</strong></div>
      <div class="result-stat">사격 제거<strong>${board.minesRemovedByBattle}</strong></div>
      <div class="result-stat wide">사격 기록<strong>${typeLine}</strong></div>
      <div class="result-stat">최고 위험도<strong>${board.maxDangerBeaten || "-"}</strong></div>
      <div class="result-stat">난이도<strong>${board.diff.label}</strong></div>
      <div class="result-stat wide">최고 기록<strong>${recordNote}</strong></div>
    `;

    showScreen("screen-result");
  }

  function pauseGame() {
    if (!$("#screen-board").classList.contains("active")) return;
    if ($("#screen-battle").classList.contains("active")) return;
    if (!state.board || state.board.over) return;
    state.pausedAt = Date.now();
    stopTimer();
    $("#screen-pause").classList.add("active");
    $("#screen-board").classList.add("active");
  }

  function resumeGame() {
    $("#screen-pause").classList.remove("active");
    if (state.pausedAt) {
      state.pauseAccum += Date.now() - state.pausedAt;
      state.pausedAt = 0;
    }
    if (state.board?.started && !state.board.over) startTimer();
    showScreen("screen-board");
  }

  function startTutorialBattle(danger) {
    SFX.unlock();
    state.tutorialMode = true;
    state.pendingMine = {
      r: 0,
      c: 0,
      danger,
      type: BoardAPI.battleTypeForDanger(danger).key,
    };
    const meta = BattleAPI.getBattleMeta(danger);
    $("#battle-danger").textContent = `연습 · 위험도 ${danger} · ${meta.label}`;
    $("#battle-hint").textContent = meta.hint;
    $("#battle-progress").textContent = "0 / 0";
    showScreen("screen-battle");
    const stage = $("#battle-stage");
    stage.innerHTML = "";
    state.battleHandle?.destroy?.();
    state.battleHandle = BattleAPI.startBattle(stage, danger, {
      lives: 3,
      onProgress(ok, need, fails, failLimit) {
        $("#battle-progress").textContent =
          `격추 ${ok} / ${need}` + (fails != null ? ` · 피격 ${fails}/${failLimit}` : "");
      },
      onWin: () => onBattleWin(),
      onLose: () => onBattleLose(),
    });
  }

  function bindBoardEvents() {
    const boardEl = $("#board");
    // 좌클릭(1) + 우클릭(4) 동시 입력으로 코드 열기
    let mouseButtons = 0;
    let chordTriggered = false;

    boardEl.addEventListener("mousedown", (e) => {
      const btn = e.target.closest(".cell");
      if (!btn || !state.board) return;
      mouseButtons |= 1 << e.button;
      const r = Number(btn.dataset.r);
      const c = Number(btn.dataset.c);
      const cell = state.board.cells[r][c];
      // 코드 열기는 열린 숫자 칸에서만 (좌+우 동시 또는 휠 클릭)
      const both = (mouseButtons & 0b101) === 0b101 || e.button === 1;
      if (both && cell.open && cell.adjacent > 0 && !cell.cleared) {
        e.preventDefault();
        chordTriggered = true;
        doChord(r, c);
      }
    });

    boardEl.addEventListener("mouseup", (e) => {
      mouseButtons &= ~(1 << e.button);
      if (mouseButtons === 0) {
        // click/contextmenu가 처리된 뒤에 플래그 해제
        setTimeout(() => {
          chordTriggered = false;
        }, 0);
      }
    });

    boardEl.addEventListener("mouseleave", () => {
      mouseButtons = 0;
    });

    boardEl.addEventListener("click", (e) => {
      const btn = e.target.closest(".cell");
      if (!btn || state.touchFlagged || chordTriggered) return;
      openCell(Number(btn.dataset.r), Number(btn.dataset.c));
    });

    boardEl.addEventListener("contextmenu", (e) => {
      e.preventDefault();
      const btn = e.target.closest(".cell");
      if (!btn || chordTriggered) return;
      flagCell(Number(btn.dataset.r), Number(btn.dataset.c));
    });

    boardEl.addEventListener("dblclick", (e) => {
      const btn = e.target.closest(".cell");
      if (!btn) return;
      doChord(Number(btn.dataset.r), Number(btn.dataset.c));
    });

    boardEl.addEventListener(
      "touchstart",
      (e) => {
        const btn = e.target.closest(".cell");
        if (!btn) return;
        state.touchFlagged = false;
        const r = Number(btn.dataset.r);
        const c = Number(btn.dataset.c);
        state.longPressTimer = setTimeout(() => {
          state.touchFlagged = true;
          flagCell(r, c);
        }, 450);
      },
      { passive: true }
    );

    boardEl.addEventListener(
      "touchend",
      () => {
        clearTimeout(state.longPressTimer);
        setTimeout(() => {
          state.touchFlagged = false;
        }, 50);
      },
      { passive: true }
    );

    boardEl.addEventListener(
      "touchmove",
      () => {
        clearTimeout(state.longPressTimer);
      },
      { passive: true }
    );
  }

  function init() {
    bindBoardEvents();

    $$(".diff-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        $$(".diff-btn").forEach((b) => b.classList.remove("selected"));
        btn.classList.add("selected");
        state.diffKey = btn.dataset.diff;
      });
    });

    $("#btn-start").addEventListener("click", () => beginGame(state.diffKey));
    $("#btn-how").addEventListener("click", () => showScreen("screen-how"));
    $("#btn-tutorial").addEventListener("click", () => showScreen("screen-tutorial"));
    $("#btn-ranking").addEventListener("click", openRanking);
    $$(".rank-tab").forEach((btn) => {
      btn.addEventListener("click", () => renderRanking(btn.dataset.diff));
    });

    $$("[data-back='title']").forEach((btn) => {
      btn.addEventListener("click", () => showScreen("screen-title"));
    });

    $$(".tut-btn").forEach((btn) => {
      btn.addEventListener("click", () => startTutorialBattle(Number(btn.dataset.danger)));
    });

    $("#btn-menu").addEventListener("click", pauseGame);
    $("#btn-restart").addEventListener("click", () => beginGame(state.diffKey));
    $("#btn-resume").addEventListener("click", resumeGame);
    $("#btn-pause-restart").addEventListener("click", () => {
      $("#screen-pause").classList.remove("active");
      beginGame(state.diffKey);
    });
    $("#btn-pause-title").addEventListener("click", () => {
      $("#screen-pause").classList.remove("active");
      stopTimer();
      state.battleHandle?.destroy?.();
      showScreen("screen-title");
    });

    $("#btn-retry").addEventListener("click", () => beginGame(state.diffKey));
    $("#btn-result-title").addEventListener("click", () => {
      cancelPendingResult();
      showScreen("screen-title");
    });
    $("#btn-next").addEventListener("click", () => {
      const next = state.board?.diff?.next;
      if (next) beginGame(next);
    });

    window.addEventListener("keydown", (e) => {
      if (e.key === "r" || e.key === "R") {
        if (
          $("#screen-board").classList.contains("active") &&
          !$("#screen-battle").classList.contains("active")
        ) {
          beginGame(state.diffKey);
        }
      }
      if (e.key === "Escape") {
        if ($("#screen-pause").classList.contains("active")) resumeGame();
        else if (
          $("#screen-board").classList.contains("active") &&
          !$("#screen-battle").classList.contains("active")
        ) {
          pauseGame();
        }
      }
    });

    window.addEventListener("resize", () => {
      if (state.board && $("#screen-board").classList.contains("active")) renderBoard();
    });

    showScreen("screen-title");
  }

  init();
})();
