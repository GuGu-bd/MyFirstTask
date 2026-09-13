/**
 * 贪吃蛇 - 入口文件
 *
 * v2.1：在 v1.0 正式版基础上增加 AI 自动游玩（寻路算法见 ai.js）。
 * Canvas 只负责绘制游戏内容（背景、网格、食物、蛇），
 * 分数、长度、状态、按钮与遮罩卡片全部由 HTML 负责。
 */
(function () {
  "use strict";

  // ===== 常量配置 =====
  var CELL_SIZE = 25;                       // 每个格子的像素尺寸
  var GRID_COUNT = 24;                      // 24 x 24 的网格
  var CANVAS_WIDTH = CELL_SIZE * GRID_COUNT;  // 600
  var CANVAS_HEIGHT = CELL_SIZE * GRID_COUNT; // 600
  var BASE_TICK_MS = 1000 / 8;              // 基础节拍：每秒移动 8 格
  var MIN_SPEED_MULTIPLIER = 1;             // AI 加速倍率下限
  var MAX_SPEED_MULTIPLIER = 10;            // AI 加速倍率上限（每 1 倍一档）
  var MAX_TICKS_PER_FRAME = 20;             // 同一帧内最多补算的 tick 数
  var MAX_PENDING_DIRECTIONS = 2;           // 最多缓存两个待执行方向
  var MAX_FRAME_DELTA_MS = 1000;            // 超过该值时视为页面切到后台，丢弃这段时间

  var INITIAL_HEAD = { x: 12, y: 12 };      // 初始蛇头所在格子
  var FOOD_RADIUS_RATIO = 0.32;             // 食物半径相对格子尺寸的比例
  var AI_GOAL = 15;                         // AI 挑战目标：连续吃满 15 个食物

  // HUD 状态文案
  var STATUS_TEXT = {
    ready: "准备开始",
    running: "进行中",
    paused: "已暂停",
    over: "游戏结束",
    "ai-win": "AI挑战成功"
  };

  // 暂停按钮文案
  var PAUSE_BUTTON_TEXT = {
    running: "暂停",
    paused: "继续游戏"
  };

  // 颜色与后续替换贴图相关的配置集中在这里
  var COLORS = {
    boardBackground: "#0b1219",
    gridLine: "rgba(255, 255, 255, 0.06)",
    snakeBody: "#34d399",
    snakeHead: "#86efac",
    snakeTail: "#d1fae5",
    snakeEye: "#0b1219",
    food: "#f87171",
    aiPath: "rgba(125, 211, 252, 0.65)"
  };

  // 四个方向对应的坐标增量（x 向右、y 向下）
  var DIRECTIONS = {
    up: { x: 0, y: -1 },
    down: { x: 0, y: 1 },
    left: { x: -1, y: 0 },
    right: { x: 1, y: 0 }
  };

  // 每个方向的反方向，用于阻止 180° 回头
  var OPPOSITE_DIRECTION = {
    up: "down",
    down: "up",
    left: "right",
    right: "left"
  };

  // 键盘按键（小写）到方向的映射：WASD 与方向键等价
  var KEY_DIRECTION_MAP = {
    w: "up",
    a: "left",
    s: "down",
    d: "right",
    arrowup: "up",
    arrowleft: "left",
    arrowdown: "down",
    arrowright: "right"
  };

  // ===== 游戏状态 =====
  var game = {
    canvas: null,
    ctx: null,
    state: "ready",          // "ready" | "running" | "paused" | "over"
    direction: "right",      // 当前生效方向
    pendingDirections: [],   // 待执行方向队列，每个 tick 消费一个
    snake: [],               // 蛇身坐标，索引 0 为蛇头
    food: null,              // 食物坐标，无空格可用时为 null
    foodEaten: 0,            // 已吃到的食物数量，用于计分
    score: 0,                // 当前得分
    mode: "player",          // "player" | "ai"
    aiProgress: 0,           // AI 模式下吃到的食物数量
    aiQualified: false,      // 是否具备 AI 挑战资格（AI 开局且全程由 AI 操控）
    aiAchieved: false,       // 是否已经达成过 15 个食物的目标
    aiPath: null,            // AI 当前规划路径，用于虚线绘制
    aiResult: null,          // null | "success" | "fail"
    speedMultiplier: 1,      // AI 加速倍率（1 ~ 10），重新开始后保留
    speedBoost: false,       // AI 加速开关，重新开始后保留
    tickCount: 0,            // 累计执行的 tick 数，供调试与自动化验证
    accumulator: 0,          // 移动节奏的时间累加器
    lastFrameTime: null,     // 上一帧时间戳
    ui: {                    // HTML 层元素，缺失时只记录错误、不中断游戏
      scoreElement: null,
      lengthElement: null,
      statusElement: null,
      hintElement: null,
      pauseButton: null,
      resumeButton: null,
      pauseRestartButton: null,
      gameoverRestartButton: null,
      pauseOverlay: null,
      gameoverOverlay: null,
      finalScoreElement: null,
      aiProgressElement: null,
      aiStartButton: null,
      aiToggleButton: null,
      aiWinOverlay: null,
      aiFailOverlay: null,
      aiWinScoreElement: null,
      aiFailScoreElement: null,
      aiContinueButton: null,
      aiWinRestartButton: null,
      aiFailRestartButton: null,
      speedControl: null,
      speedButton: null,
      speedRange: null,
      speedValueElement: null
    }
  };

  /**
   * 生成初始蛇：长度 3，水平摆放，蛇头在 (12, 12)，朝向为右。
   */
  function createInitialSnake() {
    return [
      { x: INITIAL_HEAD.x, y: INITIAL_HEAD.y },
      { x: INITIAL_HEAD.x - 1, y: INITIAL_HEAD.y },
      { x: INITIAL_HEAD.x - 2, y: INITIAL_HEAD.y }
    ];
  }

  /**
   * 在空格中随机生成一个食物；蛇占满全屏时返回 null，避免死循环。
   */
  function createFood() {
    var occupied = {};

    for (var i = 0; i < game.snake.length; i++) {
      occupied[game.snake[i].x + "," + game.snake[i].y] = true;
    }

    var candidates = [];

    for (var y = 0; y < GRID_COUNT; y++) {
      for (var x = 0; x < GRID_COUNT; x++) {
        if (!occupied[x + "," + y]) {
          candidates.push({ x: x, y: y });
        }
      }
    }

    if (candidates.length === 0) {
      return null;
    }

    return candidates[Math.floor(Math.random() * candidates.length)];
  }

  /**
   * 计分规则：第 n 个食物得 n 分。
   * 后续要换成更复杂的算法时，只需修改这个函数。
   */
  function calculateFoodScore(eatenCount) {
    return eatenCount;
  }

  /**
   * 重置到初始状态，可重复调用（初始化与“重新开始”共用）。
   */
  function resetGame() {
    game.snake = createInitialSnake();
    game.direction = "right";
    game.pendingDirections = [];
    game.state = "ready";
    game.accumulator = 0;
    game.foodEaten = 0;
    game.score = 0;
    game.food = createFood();
    game.mode = "player";
    game.aiProgress = 0;
    game.aiQualified = false;
    game.aiAchieved = false;
    game.aiPath = null;
    game.aiResult = null;

    updateFinalScoreDisplays();
    updateUi();
  }

  /**
   * 游戏结束：定格当前画面、写入最终分数并切到 over 状态。
   */
  function gameOver() {
    game.pendingDirections = [];
    game.accumulator = 0;
    game.aiPath = null;

    // 只有“AI 开局、全程 AI 操控且尚未达成目标”的挑战才算 AI 失败；
    // 达成目标后选择“继续挑战”再死亡，按普通游戏结束处理。
    game.aiResult = (game.mode === "ai" && game.aiQualified && !game.aiAchieved)
      ? "fail"
      : null;

    updateFinalScoreDisplays();
    setState("over");
  }

  /**
   * AI 达成目标：冻结游戏并弹出成功卡片，等待“继续挑战”或“重新开始”。
   */
  function aiWin() {
    game.pendingDirections = [];
    game.accumulator = 0;
    game.aiAchieved = true;
    game.aiResult = "success";
    updateFinalScoreDisplays();
    setState("ai-win");
  }

  /**
   * 把最终分数写入三张结算卡片。
   */
  function updateFinalScoreDisplays() {
    var scoreText = String(game.score);

    if (game.ui.finalScoreElement) {
      game.ui.finalScoreElement.textContent = scoreText;
    }

    if (game.ui.aiWinScoreElement) {
      game.ui.aiWinScoreElement.textContent = scoreText;
    }

    if (game.ui.aiFailScoreElement) {
      game.ui.aiFailScoreElement.textContent = scoreText;
    }
  }

  /**
   * 开始 AI 挑战：从干净状态进入 AI 模式并立即自动开局。
   */
  function startAiChallenge() {
    if (game.state !== "ready") {
      return;
    }

    resetGame();
    game.mode = "ai";
    game.aiQualified = true;
    game.aiProgress = 0;
    game.aiPath = null;
    game.aiResult = null;
    setState("running");
  }

  /**
   * 在玩家模式与 AI 模式之间切换。
   * 一旦切到玩家模式即失去 AI 挑战资格，之后死亡按普通流程结算。
   */
  function toggleAiMode() {
    if (game.state !== "running" && game.state !== "paused") {
      return;
    }

    if (game.mode === "ai") {
      game.mode = "player";
      game.aiQualified = false;
      game.aiPath = null;
    } else {
      game.mode = "ai";
    }

    updateUi();
  }

  /**
   * 达成目标后继续挑战：关闭成功卡片让 AI 继续，进度继续累加。
   */
  function continueAiChallenge() {
    if (game.state !== "ai-win") {
      return;
    }

    game.aiResult = null;
    game.pendingDirections = [];
    game.accumulator = 0;
    setState("running");
  }

  /**
   * 每个移动 tick 调用一次 AI，把决策结果放进待执行方向队列。
   * 只向 ai.js 传递只读快照，AI 不直接修改游戏状态。
   */
  function applyAiDecision() {
    if (!window.SnakeAI) {
      return;
    }

    var snapshot = {
      gridCount: GRID_COUNT,
      direction: game.direction,
      food: game.food ? { x: game.food.x, y: game.food.y } : null,
      snake: game.snake.map(function (cell) {
        return { x: cell.x, y: cell.y };
      })
    };

    var decision = window.SnakeAI.decide(snapshot);

    if (!decision || !DIRECTIONS[decision.direction]) {
      game.aiPath = null;
      return;
    }

    game.aiPath = decision.path || null;
    game.pendingDirections = [decision.direction];
  }

  /**
   * 暂停 / 继续切换，只在运行中与已暂停状态之间生效。
   */
  function togglePause() {
    if (game.state === "running") {
      game.pendingDirections = [];
      game.accumulator = 0;
      setState("paused");
    } else if (game.state === "paused") {
      resumeGame();
    }
  }

  /**
   * 恢复游戏：只把状态切回运行中，不改变当前方向。
   */
  function resumeGame() {
    if (game.state !== "paused") {
      return;
    }

    game.pendingDirections = [];
    game.accumulator = 0;
    setState("running");
  }

  /**
   * 统一切换游戏状态，并同步所有 HTML UI。
   */
  function setState(nextState) {
    if (game.state === nextState) {
      return;
    }

    game.state = nextState;
    updateUi();
  }

  /**
   * 统一的 UI 刷新入口：HUD、提示、遮罩卡片与按钮状态。
   */
  function updateUi() {
    updateScoreDisplay();
    updateLengthDisplay();
    updateStatusDisplay();
    updateHintVisibility();
    updateOverlayVisibility();
    updatePauseButton();
    updateDirectionButtons();
    updateAiControls();
  }

  function updateScoreDisplay() {
    if (game.ui.scoreElement) {
      game.ui.scoreElement.textContent = String(game.score);
    }
  }

  function updateLengthDisplay() {
    if (game.ui.lengthElement) {
      game.ui.lengthElement.textContent = String(game.snake.length);
    }
  }

  function updateStatusDisplay() {
    if (game.ui.statusElement) {
      game.ui.statusElement.textContent = (game.state === "running" && game.mode === "ai")
        ? "AI进行中"
        : (STATUS_TEXT[game.state] || "");
    }
  }

  /**
   * 操作提示只在准备开始状态显示。
   */
  function updateHintVisibility() {
    if (!game.ui.hintElement) {
      return;
    }

    if (game.state === "ready") {
      game.ui.hintElement.classList.remove("is-hidden");
    } else {
      game.ui.hintElement.classList.add("is-hidden");
    }
  }

  /**
   * 暂停与结束两张遮罩卡片按状态互斥显示。
   */
  function updateOverlayVisibility() {
    if (game.ui.pauseOverlay) {
      game.ui.pauseOverlay.hidden = game.state !== "paused";
    }

    if (game.ui.gameoverOverlay) {
      // 普通结束才显示；AI 挑战失败由专用卡片承担
      game.ui.gameoverOverlay.hidden = game.state !== "over" || game.aiResult !== null;
    }

    if (game.ui.aiWinOverlay) {
      game.ui.aiWinOverlay.hidden = game.state !== "ai-win";
    }

    if (game.ui.aiFailOverlay) {
      game.ui.aiFailOverlay.hidden = !(game.state === "over" && game.aiResult === "fail");
    }
  }

  /**
   * 暂停按钮只在运行中与已暂停时可用，文案随状态切换。
   */
  function updatePauseButton() {
    var button = game.ui.pauseButton;

    if (!button) {
      return;
    }

    button.disabled = game.state !== "running" && game.state !== "paused";
    button.textContent = PAUSE_BUTTON_TEXT[game.state] || "暂停";
  }

  /**
   * AI 接管方向、游戏结束或 AI 成功冻结时，禁用屏幕方向按钮。
   */
  function updateDirectionButtons() {
    var buttons = document.querySelectorAll("[data-direction]");
    var disabled = game.mode === "ai" ||
      game.state === "over" ||
      game.state === "ai-win";

    for (var i = 0; i < buttons.length; i++) {
      buttons[i].disabled = disabled;
    }
  }

  /**
   * AI 相关 UI：进度显示、开始按钮、模式切换按钮的可用性与高亮、加速控件。
   */
  function updateAiControls() {
    var isAi = game.mode === "ai";
    var canToggle = game.state === "running" || game.state === "paused";

    if (game.ui.aiProgressElement) {
      game.ui.aiProgressElement.hidden = !isAi;
      game.ui.aiProgressElement.textContent = "AI 进度 " + game.aiProgress + " / " + AI_GOAL;
    }

    if (game.ui.aiStartButton) {
      game.ui.aiStartButton.hidden = game.state !== "ready";
    }

    if (game.ui.aiToggleButton) {
      // 按钮常驻显示，只有运行中与已暂停时可点，其余状态置灰
      game.ui.aiToggleButton.disabled = !canToggle;

      if (isAi) {
        game.ui.aiToggleButton.classList.add("is-active");
      } else {
        game.ui.aiToggleButton.classList.remove("is-active");
      }

      game.ui.aiToggleButton.setAttribute("aria-pressed", isAi ? "true" : "false");
    }

    // 加速控件只在 AI 模式运行或暂停时出现
    if (game.ui.speedControl) {
      game.ui.speedControl.hidden = !(isAi && canToggle);
    }

    updateSpeedControl();
  }

  /**
   * 当前有效节拍：只有 AI 模式下开启加速时才提速，玩家模式始终是基础节拍。
   */
  function getEffectiveTickMs() {
    var boosted = game.mode === "ai" && game.speedBoost;
    var multiplier = boosted ? game.speedMultiplier : 1;

    return BASE_TICK_MS / multiplier;
  }

  function formatMultiplier(value) {
    return String(Math.round(value * 10) / 10);
  }

  /**
   * 同步加速按钮文案、高亮、倍率滑块与数值标签。
   */
  function updateSpeedControl() {
    var isActive = game.speedBoost;

    if (game.ui.speedButton) {
      game.ui.speedButton.textContent = "加速 x" +
        formatMultiplier(isActive ? game.speedMultiplier : 1);

      if (isActive) {
        game.ui.speedButton.classList.add("is-active");
      } else {
        game.ui.speedButton.classList.remove("is-active");
      }

      game.ui.speedButton.setAttribute("aria-pressed", isActive ? "true" : "false");
    }

    if (game.ui.speedValueElement) {
      game.ui.speedValueElement.textContent = formatMultiplier(game.speedMultiplier) + "x";
    }

    if (game.ui.speedRange) {
      game.ui.speedRange.value = String(game.speedMultiplier);
    }
  }

  /**
   * 改变节拍后重置累加器与计时基准，避免从慢切快时一次性连跳多格。
   */
  function resetTickPhase() {
    game.accumulator = 0;
    game.lastFrameTime = null;
  }

  /**
   * 切换加速开关，只在 AI 模式下生效。
   */
  function toggleSpeedBoost() {
    if (game.mode !== "ai") {
      return;
    }

    game.speedBoost = !game.speedBoost;
    resetTickPhase();
    updateSpeedControl();
  }

  /**
   * 调整加速倍率（1 ~ 4，步进 0.5）。
   */
  function setSpeedMultiplier(value) {
    var multiplier = Number(value);

    if (isNaN(multiplier)) {
      return;
    }

    game.speedMultiplier = Math.min(MAX_SPEED_MULTIPLIER,
      Math.max(MIN_SPEED_MULTIPLIER, multiplier));
    resetTickPhase();
    updateSpeedControl();
  }

  /**
   * 唯一的转向入口：键盘与屏幕按钮都调用它。
   * 反向输入始终忽略；同方向按键在运动中是空操作，在静止时用来启动游戏。
   */
  function setDirection(directionName) {
    if (!DIRECTIONS[directionName]) {
      return;
    }

    // 游戏结束后完全禁止控制
    if (game.state === "over") {
      return;
    }

    // AI 成功冻结时同样不接受控制
    if (game.state === "ai-win") {
      return;
    }

    // AI 模式下由 AI 接管方向，人工方向输入完全无效
    if (game.mode === "ai") {
      return;
    }

    // 暂停中：任意方向输入只用于恢复游戏，不改变方向
    if (game.state === "paused") {
      resumeGame();
      return;
    }

    // 以队列中最后一个待执行方向为基准，避免同一 tick 内连按被误判为反向
    var baseDirection = game.pendingDirections.length > 0
      ? game.pendingDirections[game.pendingDirections.length - 1]
      : game.direction;

    // 反向输入忽略；静止时按下反方向键也不会启动游戏
    if (directionName === OPPOSITE_DIRECTION[baseDirection]) {
      return;
    }

    // 与当前方向相同：运动中是重复按键，忽略；静止时直接开始移动
    if (directionName === baseDirection) {
      if (game.state === "ready") {
        setState("running");
      }
      return;
    }

    if (game.pendingDirections.length >= MAX_PENDING_DIRECTIONS) {
      return;
    }

    game.pendingDirections.push(directionName);

    // 首次合法输入才真正开始移动
    if (game.state === "ready") {
      setState("running");
    }
  }

  /**
   * 前进一格：消费一个待执行方向，先做撞墙与自碰判定，再移动。
   * 吃到食物时蛇尾不弹出（蛇身 +1 节）并加分、重新生成食物；
   * 否则头进尾出，长度保持不变。
   */
  function update() {
    game.tickCount += 1;

    if (game.pendingDirections.length > 0) {
      var nextDirection = game.pendingDirections.shift();
      if (nextDirection !== OPPOSITE_DIRECTION[game.direction]) {
        game.direction = nextDirection;
      }
    }

    var delta = DIRECTIONS[game.direction];
    var head = game.snake[0];
    var newHead = { x: head.x + delta.x, y: head.y + delta.y };

    // 撞墙判定：越界即死亡，蛇头停在最后一个合法格
    if (newHead.x < 0 || newHead.x >= GRID_COUNT ||
        newHead.y < 0 || newHead.y >= GRID_COUNT) {
      gameOver();
      return;
    }

    var ateFood = game.food !== null &&
      newHead.x === game.food.x &&
      newHead.y === game.food.y;

    // 自碰判定：不吃食物时尾节会在本 tick 移开，因此排除尾节（允许追尾）
    var collisionCount = ateFood ? game.snake.length : game.snake.length - 1;

    for (var i = 0; i < collisionCount; i++) {
      if (game.snake[i].x === newHead.x && game.snake[i].y === newHead.y) {
        gameOver();
        return;
      }
    }

    game.snake.unshift(newHead);

    if (ateFood) {
      game.foodEaten += 1;
      game.score += calculateFoodScore(game.foodEaten);

      // 基于增长后的蛇身重新生成食物，保证不会落在蛇身上
      game.food = createFood();
      updateScoreDisplay();
      updateLengthDisplay();

      if (game.mode === "ai") {
        game.aiProgress += 1;
        updateAiControls();

        // 达到目标即结束挑战
        if (game.aiQualified && !game.aiAchieved && game.aiProgress >= AI_GOAL) {
          aiWin();
          return;
        }
      }
    } else {
      game.snake.pop();
    }
  }

  /**
   * 绘制背景与网格线。
   */
  function drawBoard() {
    var ctx = game.ctx;

    ctx.fillStyle = COLORS.boardBackground;
    ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

    ctx.strokeStyle = COLORS.gridLine;
    ctx.lineWidth = 1;

    for (var i = 1; i < GRID_COUNT; i++) {
      var position = i * CELL_SIZE + 0.5;

      ctx.beginPath();
      ctx.moveTo(position, 0);
      ctx.lineTo(position, CANVAS_HEIGHT);
      ctx.stroke();

      ctx.beginPath();
      ctx.moveTo(0, position);
      ctx.lineTo(CANVAS_WIDTH, position);
      ctx.stroke();
    }
  }

  /**
   * 绘制单个格子（留 2px 内边距，让网格清晰可辨）。
   */
  function drawCell(cell, color) {
    var ctx = game.ctx;
    var padding = 2;

    ctx.fillStyle = color;
    ctx.fillRect(
      cell.x * CELL_SIZE + padding,
      cell.y * CELL_SIZE + padding,
      CELL_SIZE - padding * 2,
      CELL_SIZE - padding * 2
    );
  }

  // 颜色解析结果缓存，避免每帧重复解析同一个十六进制颜色
  var COLOR_CACHE = {};

  function parseHexColor(hex) {
    if (COLOR_CACHE[hex]) {
      return COLOR_CACHE[hex];
    }

    var color = {
      r: parseInt(hex.substr(1, 2), 16),
      g: parseInt(hex.substr(3, 2), 16),
      b: parseInt(hex.substr(5, 2), 16)
    };

    COLOR_CACHE[hex] = color;
    return color;
  }

  /**
   * 按比例混合两个十六进制颜色：ratio 为 0 时是 colorA，为 1 时是 colorB。
   */
  function mixColor(colorA, colorB, ratio) {
    var from = parseHexColor(colorA);
    var to = parseHexColor(colorB);
    var t = Math.max(0, Math.min(1, ratio));

    return "rgb(" +
      Math.round(from.r + (to.r - from.r) * t) + ", " +
      Math.round(from.g + (to.g - from.g) * t) + ", " +
      Math.round(from.b + (to.b - from.b) * t) + ")";
  }

  /**
   * 蛇身逐节取色：颈部（索引 1）为基础绿，尾节为浅薄荷色，中间线性过渡。
   */
  function getSnakeBodyColor(index, length) {
    var span = length - 2;
    var ratio = span > 0 ? (index - 1) / span : 0;

    return mixColor(COLORS.snakeBody, COLORS.snakeTail, ratio);
  }

  /**
   * 在蛇头上绘制朝向侧的两只小眼睛，方便看出当前朝向。
   */
  function drawSnakeEyes(cell) {
    var ctx = game.ctx;
    var delta = DIRECTIONS[game.direction];
    var centerX = cell.x * CELL_SIZE + CELL_SIZE / 2;
    var centerY = cell.y * CELL_SIZE + CELL_SIZE / 2;
    var forwardOffset = 5;
    var sideOffset = 5;
    var eyeSize = 4;

    // 垂直于前进方向的偏移量
    var sideX = delta.y;
    var sideY = delta.x;

    var eyeX = [
      centerX + delta.x * forwardOffset + sideX * sideOffset,
      centerX + delta.x * forwardOffset - sideX * sideOffset
    ];
    var eyeY = [
      centerY + delta.y * forwardOffset + sideY * sideOffset,
      centerY + delta.y * forwardOffset - sideY * sideOffset
    ];

    ctx.fillStyle = COLORS.snakeEye;
    for (var i = 0; i < 2; i++) {
      ctx.fillRect(eyeX[i] - eyeSize / 2, eyeY[i] - eyeSize / 2, eyeSize, eyeSize);
    }
  }

  /**
   * 绘制蛇：身体由颈部到尾节逐节变浅，最后画蛇头与眼睛。
   */
  function drawSnake() {
    var length = game.snake.length;

    for (var i = length - 1; i >= 1; i--) {
      drawCell(game.snake[i], getSnakeBodyColor(i, length));
    }

    drawCell(game.snake[0], COLORS.snakeHead);
    drawSnakeEyes(game.snake[0]);
  }

  /**
   * 绘制食物：在格子中心画一个实心圆。
   * 颜色与半径比例集中在常量区，后续可替换为贴图。
   */
  function drawFood() {
    if (!game.food) {
      return;
    }

    var ctx = game.ctx;
    var centerX = game.food.x * CELL_SIZE + CELL_SIZE / 2;
    var centerY = game.food.y * CELL_SIZE + CELL_SIZE / 2;
    var radius = CELL_SIZE * FOOD_RADIUS_RATIO;

    ctx.fillStyle = COLORS.food;
    ctx.beginPath();
    ctx.arc(centerX, centerY, radius, 0, Math.PI * 2);
    ctx.fill();
  }

  /**
   * 绘制 AI 规划路径：从蛇头沿规划点连成虚线。
   * 已经走过的规划点会先跳过，避免虚线滞后一格。
   */
  function drawAiPath() {
    if (game.mode !== "ai" || !game.aiPath || game.aiPath.length === 0) {
      return;
    }

    var ctx = game.ctx;
    var head = game.snake[0];
    var startIndex = 0;

    while (startIndex < game.aiPath.length &&
           game.aiPath[startIndex].x === head.x &&
           game.aiPath[startIndex].y === head.y) {
      startIndex += 1;
    }

    if (startIndex >= game.aiPath.length) {
      return;
    }

    ctx.save();
    ctx.setLineDash([6, 6]);
    ctx.lineWidth = 2;
    ctx.strokeStyle = COLORS.aiPath;
    ctx.beginPath();
    ctx.moveTo(head.x * CELL_SIZE + CELL_SIZE / 2, head.y * CELL_SIZE + CELL_SIZE / 2);

    for (var i = startIndex; i < game.aiPath.length; i++) {
      ctx.lineTo(
        game.aiPath[i].x * CELL_SIZE + CELL_SIZE / 2,
        game.aiPath[i].y * CELL_SIZE + CELL_SIZE / 2
      );
    }

    ctx.stroke();
    ctx.restore();
  }

  /**
   * 统一绘制入口，后续新增食物、贴图时在此扩展。
   */
  function draw() {
    drawBoard();
    drawAiPath();
    drawFood();
    drawSnake();
  }

  /**
   * 主循环：用 requestAnimationFrame + 时间累加器控制移动节奏。
   */
  function loop(timestamp) {
    if (game.lastFrameTime === null) {
      game.lastFrameTime = timestamp;
    }

    var deltaTime = timestamp - game.lastFrameTime;
    game.lastFrameTime = timestamp;

    // 页面切回前台或时间异常时，丢弃这段间隔，避免一次移动多格
    if (deltaTime < 0 || deltaTime > MAX_FRAME_DELTA_MS) {
      deltaTime = 0;
    }

    if (game.state === "running") {
      var tickMs = getEffectiveTickMs();
      var ticksThisFrame = 0;
      game.accumulator += deltaTime;

      while (game.accumulator >= tickMs) {
        if (game.mode === "ai") {
          applyAiDecision();
        }

        update();
        game.accumulator -= tickMs;
        ticksThisFrame += 1;

        // 死亡后立即停止本次循环内继续推进
        if (game.state !== "running") {
          game.accumulator = 0;
          break;
        }

        // 卡顿或标签页切回时最多补算固定次数，避免一帧内跑几十步
        if (ticksThisFrame >= MAX_TICKS_PER_FRAME) {
          game.accumulator = 0;
          break;
        }
      }
    } else {
      game.accumulator = 0;
    }

    draw();
    window.requestAnimationFrame(loop);
  }

  function startLoop() {
    game.lastFrameTime = null;
    window.requestAnimationFrame(loop);
  }

  /**
   * 判断事件是否来自表单控件（倍率滑块、按钮等）。
   * 焦点在控件上时把按键交给控件自身处理，避免方向键被游戏拦截。
   */
  function isFormControl(element) {
    if (!element || !element.tagName) {
      return false;
    }

    var tagName = element.tagName.toLowerCase();

    return tagName === "input" || tagName === "textarea" ||
      tagName === "select" || tagName === "button";
  }

  /**
   * 键盘输入：WASD 与方向键，仅拦截这些按键的默认行为。
   */
  function handleKeyDown(event) {
    if (event.ctrlKey || event.metaKey || event.altKey) {
      return;
    }

    if (isFormControl(event.target)) {
      return;
    }

    var key = event.key ? event.key.toLowerCase() : "";

    // 空格键：暂停 / 继续
    if (event.code === "Space" || key === " " || key === "spacebar") {
      event.preventDefault();
      togglePause();
      return;
    }

    var directionName = KEY_DIRECTION_MAP[key];

    if (!directionName) {
      return;
    }

    event.preventDefault();
    setDirection(directionName);
  }

  /**
   * 给按钮绑定点击事件，点击后主动失焦，
   * 避免按钮保持焦点后空格键既触发暂停又重复激活按钮。
   */
  function bindClick(element, handler) {
    if (!element) {
      return;
    }

    element.addEventListener("click", function () {
      handler();
      element.blur();
    });
  }

  /**
   * 绑定键盘、屏幕方向按钮与暂停/重新开始按钮。
   */
  function bindEvents() {
    document.addEventListener("keydown", handleKeyDown);

    var buttons = document.querySelectorAll("[data-direction]");

    for (var i = 0; i < buttons.length; i++) {
      (function (button) {
        var directionName = button.getAttribute("data-direction");

        bindClick(button, function () {
          setDirection(directionName);
        });
      })(buttons[i]);
    }

    bindClick(game.ui.pauseButton, togglePause);
    bindClick(game.ui.resumeButton, resumeGame);
    bindClick(game.ui.pauseRestartButton, resetGame);
    bindClick(game.ui.gameoverRestartButton, resetGame);
    bindClick(game.ui.aiStartButton, startAiChallenge);
    bindClick(game.ui.aiToggleButton, toggleAiMode);
    bindClick(game.ui.aiContinueButton, continueAiChallenge);
    bindClick(game.ui.aiWinRestartButton, resetGame);
    bindClick(game.ui.aiFailRestartButton, resetGame);
    bindClick(game.ui.speedButton, toggleSpeedBoost);

    if (game.ui.speedRange) {
      game.ui.speedRange.addEventListener("input", function () {
        setSpeedMultiplier(game.ui.speedRange.value);
      });
    }
  }

  /**
   * 只读调试接口，供自动化验证与后续调试使用，不参与游戏逻辑。
   */
  function exposeDebugApi() {
    window.__snakeDebug = {
      getState: function () {
        var head = game.snake[0];

        return {
          state: game.state,
          direction: game.direction,
          head: { x: head.x, y: head.y },
          snakeLength: game.snake.length,
          snake: game.snake.map(function (cell) {
            return { x: cell.x, y: cell.y };
          }),
          food: game.food ? { x: game.food.x, y: game.food.y } : null,
          foodEaten: game.foodEaten,
          score: game.score,
          mode: game.mode,
          aiQualified: game.aiQualified,
          aiAchieved: game.aiAchieved,
          aiProgress: game.aiProgress,
          aiGoal: AI_GOAL,
          aiPath: game.aiPath
            ? game.aiPath.map(function (cell) {
                return { x: cell.x, y: cell.y };
              })
            : null,
          aiResult: game.aiResult,
          speedMultiplier: game.speedMultiplier,
          speedBoost: game.speedBoost,
          speedMax: MAX_SPEED_MULTIPLIER,
          tickMs: getEffectiveTickMs(),
          tickCount: game.tickCount,
          pendingDirections: game.pendingDirections.slice()
        };
      },

      // 仅供自动化测试使用的钩子，正常玩法不会调用
      forceGameOver: function () {
        gameOver();
      }
    };
  }

  /**
   * 初始化函数：获取 Canvas 与 2D 绘图上下文，准备游戏画布与输入。
   */
  function init() {
    var canvas = document.getElementById("game-canvas");

    if (!canvas) {
      console.error("[贪吃蛇] 未找到 #game-canvas，初始化失败。");
      return;
    }

    var ctx = canvas.getContext("2d");

    if (!ctx) {
      console.error("[贪吃蛇] 当前浏览器不支持 Canvas 2D 上下文。");
      return;
    }

    canvas.width = CANVAS_WIDTH;
    canvas.height = CANVAS_HEIGHT;

    game.canvas = canvas;
    game.ctx = ctx;
    game.ui.scoreElement = document.getElementById("score-value");
    game.ui.lengthElement = document.getElementById("length-value");
    game.ui.statusElement = document.getElementById("status-value");
    game.ui.hintElement = document.getElementById("game-hint");
    game.ui.pauseButton = document.getElementById("pause-btn");
    game.ui.resumeButton = document.getElementById("resume-btn");
    game.ui.pauseRestartButton = document.getElementById("pause-restart-btn");
    game.ui.gameoverRestartButton = document.getElementById("gameover-restart-btn");
    game.ui.pauseOverlay = document.getElementById("pause-overlay");
    game.ui.gameoverOverlay = document.getElementById("gameover-overlay");
    game.ui.finalScoreElement = document.getElementById("final-score-value");
    game.ui.aiProgressElement = document.getElementById("ai-progress");
    game.ui.aiStartButton = document.getElementById("ai-start-btn");
    game.ui.aiToggleButton = document.getElementById("ai-toggle-btn");
    game.ui.aiWinOverlay = document.getElementById("aiwin-overlay");
    game.ui.aiFailOverlay = document.getElementById("aifail-overlay");
    game.ui.aiWinScoreElement = document.getElementById("aiwin-score");
    game.ui.aiFailScoreElement = document.getElementById("aifail-score");
    game.ui.aiContinueButton = document.getElementById("ai-continue-btn");
    game.ui.aiWinRestartButton = document.getElementById("aiwin-restart-btn");
    game.ui.aiFailRestartButton = document.getElementById("aifail-restart-btn");
    game.ui.speedControl = document.getElementById("speed-control");
    game.ui.speedButton = document.getElementById("speed-btn");
    game.ui.speedRange = document.getElementById("speed-range");
    game.ui.speedValueElement = document.getElementById("speed-value");

    if (!game.ui.scoreElement || !game.ui.lengthElement || !game.ui.statusElement) {
      console.error("[贪吃蛇] 未找到 HUD 元素（#score-value / #length-value / #status-value）。");
    }

    if (!game.ui.pauseOverlay || !game.ui.gameoverOverlay) {
      console.error("[贪吃蛇] 未找到遮罩卡片（#pause-overlay / #gameover-overlay）。");
    }

    if (!window.SnakeAI) {
      console.error("[贪吃蛇] 未加载 ai.js，AI 模式不可用。");
    }

    if (!game.ui.speedControl || !game.ui.speedRange) {
      console.error("[贪吃蛇] 未找到加速控件（#speed-control / #speed-range）。");
    }

    resetGame();
    bindEvents();
    exposeDebugApi();
    draw();
    startLoop();

    console.log("[贪吃蛇] 初始化完成，等待方向输入。");
  }

  document.addEventListener("DOMContentLoaded", init);
})();
