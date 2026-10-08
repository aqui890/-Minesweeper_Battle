/** 지뢰찾기 보드 로직 */
(function (global) {
  const DIFFICULTIES = {
    beginner: { key: "beginner", label: "초급", rows: 9, cols: 9, mines: 10, next: "intermediate" },
    intermediate: {
      key: "intermediate",
      label: "중급",
      rows: 16,
      cols: 16,
      mines: 40,
      next: "expert",
    },
    expert: { key: "expert", label: "고급", rows: 16, cols: 30, mines: 99, next: null },
  };

  const DIRS = [
    [-1, -1],
    [-1, 0],
    [-1, 1],
    [0, -1],
    [0, 1],
    [1, -1],
    [1, 0],
    [1, 1],
  ];

  function createBoard(diffKey) {
    const diff = DIFFICULTIES[diffKey] || DIFFICULTIES.intermediate;
    const rows = diff.rows;
    const cols = diff.cols;
    const mines = diff.mines;
    const cells = [];

    for (let r = 0; r < rows; r++) {
      const row = [];
      for (let c = 0; c < cols; c++) {
        row.push({
          r: r,
          c: c,
          mine: false,
          open: false,
          flagged: false,
          adjacent: 0,
          cleared: false,
          exploded: false,
        });
      }
      cells.push(row);
    }

    return {
      diff: diff,
      rows: rows,
      cols: cols,
      mines: mines,
      cells: cells,
      minesPlaced: false,
      started: false,
      over: false,
      won: false,
      lives: 3,
      flags: 0,
      battlesWon: 0,
      battlesByType: { snipe: 0, suppress: 0, swarm: 0, boss: 0 },
      minesRemovedByBattle: 0,
      maxDangerBeaten: 0,
      elapsedMs: 0,
    };
  }

  function inBounds(board, r, c) {
    return r >= 0 && c >= 0 && r < board.rows && c < board.cols;
  }

  function neighbors(board, r, c) {
    const list = [];
    for (let i = 0; i < DIRS.length; i++) {
      const nr = r + DIRS[i][0];
      const nc = c + DIRS[i][1];
      if (inBounds(board, nr, nc)) list.push(board.cells[nr][nc]);
    }
    return list;
  }

  function placeMines(board, safeR, safeC) {
    const total = board.rows * board.cols;
    const forbidden = {};
    forbidden[safeR + "," + safeC] = true;
    const around = neighbors(board, safeR, safeC);
    for (let i = 0; i < around.length; i++) {
      forbidden[around[i].r + "," + around[i].c] = true;
    }

    let placed = 0;
    while (placed < board.mines) {
      const idx = Math.floor(Math.random() * total);
      const r = Math.floor(idx / board.cols);
      const c = idx % board.cols;
      const key = r + "," + c;
      if (forbidden[key] || board.cells[r][c].mine) continue;
      board.cells[r][c].mine = true;
      placed++;
    }

    for (let r = 0; r < board.rows; r++) {
      for (let c = 0; c < board.cols; c++) {
        const cell = board.cells[r][c];
        if (cell.mine) {
          cell.adjacent = 0;
          continue;
        }
        cell.adjacent = neighbors(board, r, c).filter(function (n) {
          return n.mine;
        }).length;
      }
    }

    board.minesPlaced = true;
  }

  /** 플레이어가 본 숫자 중 가장 큰 값이 위험도다. 아직 숫자를 못 봤으면 붙어 있는 숫자 전체를 쓴다. */
  function dangerOfMine(board, r, c) {
    const around = neighbors(board, r, c);
    let openedMax = 0;
    let anyMax = 0;
    let touchingMines = 0;
    for (let i = 0; i < around.length; i++) {
      const n = around[i];
      if (n.mine && !n.cleared) {
        touchingMines++;
        continue;
      }
      if (n.adjacent > anyMax) anyMax = n.adjacent;
      if (n.open && n.adjacent > openedMax) openedMax = n.adjacent;
    }
    const chosen = openedMax > 0 ? openedMax : Math.max(anyMax, touchingMines);
    return Math.max(1, Math.min(8, chosen || 1));
  }

  function battleTypeForDanger(danger) {
    if (danger <= 2) return { key: "snipe", label: "조준 사격", range: "1~2" };
    if (danger <= 4) return { key: "suppress", label: "제압 사격", range: "3~4" };
    if (danger <= 6) return { key: "swarm", label: "포화 사격", range: "5~6" };
    return { key: "boss", label: "보스 사격", range: "7~8" };
  }

  function remainingMines(board) {
    let activeMines = 0;
    let flags = 0;
    for (let r = 0; r < board.rows; r++) {
      for (let c = 0; c < board.cols; c++) {
        const cell = board.cells[r][c];
        // 배틀 제거·폭발 처리된 칸은 더 이상 남은 지뢰가 아님
        if (cell.mine && !cell.cleared) activeMines++;
        if (cell.flagged && !cell.open) flags++;
      }
    }
    board.flags = flags;
    return Math.max(0, activeMines - flags);
  }

  function openFlood(board, r, c) {
    const opened = [];
    const stack = [[r, c]];
    while (stack.length) {
      const cur = stack.pop();
      const cell = board.cells[cur[0]][cur[1]];
      if (cell.open || cell.flagged || cell.cleared || cell.mine) continue;
      cell.open = true;
      opened.push(cell);
      if (cell.adjacent === 0) {
        const around = neighbors(board, cur[0], cur[1]);
        for (let i = 0; i < around.length; i++) {
          const n = around[i];
          if (!n.open && !n.flagged && !n.mine) stack.push([n.r, n.c]);
        }
      }
    }
    return opened;
  }

  /** 깃발 + 배틀로 제거된 지뢰 칸을 합산 (표시 숫자는 유지) */
  function satisfiedMineMarkers(around) {
    return around.filter(function (n) {
      return n.flagged || n.cleared;
    }).length;
  }

  function chordOpen(board, r, c) {
    const cell = board.cells[r][c];
    if (!cell.open || cell.adjacent <= 0) return { opened: [], mineHits: [] };

    const around = neighbors(board, r, c);
    if (satisfiedMineMarkers(around) !== cell.adjacent) return { opened: [], mineHits: [] };

    const opened = [];
    const mineHits = [];
    for (let i = 0; i < around.length; i++) {
      const n = around[i];
      if (n.open || n.flagged || n.cleared) continue;
      if (n.mine) mineHits.push(n);
      else Array.prototype.push.apply(opened, openFlood(board, n.r, n.c));
    }
    return { opened: opened, mineHits: mineHits };
  }

  function isActiveMine(cell) {
    return cell.mine && !cell.cleared;
  }

  function checkWin(board) {
    // 활성 지뢰가 아닌 모든 칸이 열려 있으면 클리어
    for (let r = 0; r < board.rows; r++) {
      for (let c = 0; c < board.cols; c++) {
        const cell = board.cells[r][c];
        if (isActiveMine(cell)) continue;
        if (!cell.open) return false;
      }
    }
    return board.minesPlaced;
  }

  function allMinesFlaggedExactly(board) {
    if (!board.minesPlaced) return false;
    let active = 0;
    for (let r = 0; r < board.rows; r++) {
      for (let c = 0; c < board.cols; c++) {
        const cell = board.cells[r][c];
        if (isActiveMine(cell)) {
          active++;
          if (!cell.flagged) return false;
        } else if (cell.flagged && !cell.open) {
          return false;
        }
      }
    }
    // 깃발로 클리어하려면 표시할 활성 지뢰가 1개 이상 있어야 함
    // (전부 배틀/폭발로 제거된 경우엔 안전 칸을 모두 열어야 함 → checkWin)
    return active > 0;
  }

  function toggleFlag(board, r, c) {
    const cell = board.cells[r][c];
    if (cell.open || cell.cleared) return false;
    cell.flagged = !cell.flagged;
    return true;
  }

  function clearMineAfterBattle(board, r, c) {
    const cell = board.cells[r][c];
    cell.mine = false;
    cell.cleared = true;
    cell.open = true;
    cell.flagged = false;
    cell.exploded = false;
    // 주변 숫자(adjacent)는 최초 공개 시점 그대로 유지
    board.minesRemovedByBattle++;
  }

  /** 배틀 패배 시 지뢰 폭발·제거 (라이프 소모). 빨간 별 칸으로 남기지 않음 */
  function detonateMineAfterLoss(board, r, c) {
    const cell = board.cells[r][c];
    cell.mine = false;
    cell.cleared = true;
    cell.open = true;
    cell.flagged = false;
    cell.exploded = false;
  }

  /** 게임오버 시 남은 지뢰 공개 */
  function revealAllMines(board) {
    for (let r = 0; r < board.rows; r++) {
      for (let c = 0; c < board.cols; c++) {
        const cell = board.cells[r][c];
        if (isActiveMine(cell)) {
          cell.open = true;
          cell.exploded = true;
          cell.flagged = false;
        }
      }
    }
  }

  global.BoardAPI = {
    DIFFICULTIES: DIFFICULTIES,
    createBoard: createBoard,
    placeMines: placeMines,
    dangerOfMine: dangerOfMine,
    battleTypeForDanger: battleTypeForDanger,
    remainingMines: remainingMines,
    openFlood: openFlood,
    chordOpen: chordOpen,
    checkWin: checkWin,
    allMinesFlaggedExactly: allMinesFlaggedExactly,
    toggleFlag: toggleFlag,
    clearMineAfterBattle: clearMineAfterBattle,
    detonateMineAfterLoss: detonateMineAfterLoss,
    revealAllMines: revealAllMines,
    isActiveMine: isActiveMine,
  };
})(window);
