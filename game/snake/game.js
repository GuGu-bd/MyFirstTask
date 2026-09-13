/**
 * 贪吃蛇 - 入口文件
 *
 * v2.4：在 AI 自动游玩（寻路算法见 ai.js）基础上增加设置面板、
 * 新记分制（得分 += 基础分值 × 长度）、最高分与多局战绩（localStorage）。
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
  var BASE_SCORE_VALUE = 10;                // 新记分制的基础分值：得分 += 基础分值 × 长度
  var MAX_RECORDS = 10;                     // 多局战绩最多保留的局数
  var STATS_STORAGE_KEY = "snake.stats.v1"; // 最高分与战绩的 localStorage 键名

  // 画布上的操作提示文案
  var READY_HINT_TEXT = "可通过 WASD、方向键、下方按钮 开始/控制";
  var RESUME_HINT_TEXT = "移动以继续游戏";

  // 主题：界面配色由 style.css 的 [data-theme] 变量负责，这里保存画布配色与浏览器主题色
  var THEME_STORAGE_KEY = "snake.theme.v1";
  var DEFAULT_THEME = "dark";
  var THEMES = {
    dark: {
      metaColor: "#0b1219",
      colorScheme: "dark",
      canvas: {
        boardBackground: "#0b1219",
        gridLine: "rgba(255, 255, 255, 0.06)",
        snakeBody: "#34d399",
        snakeHead: "#86efac",
        snakeTail: "#d1fae5",
        snakeEye: "#0b1219",
        food: "#f87171",
        aiPath: "rgba(125, 211, 252, 0.65)"
      }
    },
    light: {
      metaColor: "#f7fafc",
      colorScheme: "light",
      canvas: {
        boardBackground: "#f7fafc",
        gridLine: "rgba(15, 23, 42, 0.07)",
        snakeBody: "#059669",
        snakeHead: "#047857",
        snakeTail: "#34d399",
        snakeEye: "#f7fafc",
        food: "#dc2626",
        aiPath: "rgba(2, 132, 199, 0.75)"
      }
    },
    pink: {
      metaColor: "#fff5fa",
      colorScheme: "light",
      canvas: {
        boardBackground: "#fff5fa",
        gridLine: "rgba(131, 24, 67, 0.08)",
        snakeBody: "#db2777",
        snakeHead: "#9d174d",
        snakeTail: "#f472b6",
        snakeEye: "#fff5fa",
        food: "#ea580c",
        aiPath: "rgba(124, 58, 237, 0.7)"
      }
    }
  };

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
  // 画布配色：applyTheme() 会按当前主题整体替换
  var COLORS = getThemeCanvasColors(DEFAULT_THEME);

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
    theme: DEFAULT_THEME,    // 当前主题：dark | light | pink
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
    roundActive: false,      // 本局是否真正开始过（用于判断是否记战绩）
    roundRecorded: false,    // 本局是否已经写入战绩，避免重复记录
    roundUsedAi: false,      // 本局是否使用过 AI 模式
    roundUsedPlayer: false,  // 本局是否出现过玩家方向操作
    roundAiAchieved: false,  // 本局 AI 是否达成过 15 个食物的目标
    deathReason: null,       // "wall" | "self"
    accumulator: 0,          // 移动节奏的时间累加器
    lastFrameTime: null,     // 上一帧时间戳
    ui: {                    // HTML 层元素，缺失时只记录错误、不中断游戏
      scoreElement: null,
      highScoreElement: null,
      roundElement: null,
      lengthElement: null,
      statusElement: null,
      hintElement: null,
      settingsButton: null,
      settingsPanel: null,
      settingsCloseButton: null,
      settingsPauseButton: null,
      settingsRestartButton: null,
      settingsRecordsButton: null,
      settingsThemeButton: null,
      gameoverRestartButton: null,
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
      speedSection: null,
      speedSwitch: null,
      speedRange: null,
      speedValueElement: null,
      recordsPanel: null,
      recordsCloseButton: null,
      recordsListElement: null,
      bestRecordElement: null,
      recordsResetButton: null,
      resetConfirmElement: null,
      resetConfirmButton: null,
      resetCancelButton: null,
      themePanel: null,
      themeCloseButton: null
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
   * 计分规则：得分 += 基础分值 × 吃到食物后的长度。
   * 玩家模式与 AI 模式使用同一公式。
   */
  function calculateFoodScore(length) {
    return BASE_SCORE_VALUE * length;
  }

  // ===== 最高分与多局战绩（浏览器原生 localStorage） =====
  var stats = createEmptyStats();

  function createEmptyStats() {
    return {
      highScore: 0,
      completedRounds: 0,
      records: [],
      bestRecord: null
    };
  }

  function loadStats() {
    var raw = null;

    try {
      raw = window.localStorage.getItem(STATS_STORAGE_KEY);
    } catch (error) {
      raw = null;
    }

    if (!raw) {
      stats = createEmptyStats();
      return;
    }

    try {
      var parsed = JSON.parse(raw);

      stats = {
        highScore: Number(parsed.highScore) || 0,
        completedRounds: Number(parsed.completedRounds) || 0,
        records: Array.isArray(parsed.records) ? parsed.records.slice(0, MAX_RECORDS) : [],
        bestRecord: parsed.bestRecord || null
      };
    } catch (error) {
      stats = createEmptyStats();
    }
  }

  function saveStats() {
    try {
      window.localStorage.setItem(STATS_STORAGE_KEY, JSON.stringify(stats));
    } catch (error) {
      console.warn("[贪吃蛇] 无法写入本地存储，最高分与战绩本次不会保留。");
    }
  }

  /**
   * 当前局编号：已记录局数 + 1，刷新页面后继续累加。
   */
  function getRoundNumber() {
    return stats.completedRounds + 1;
  }

  // ===== 主题切换 =====

  /**
   * 取某个主题的画布配色副本；主题名非法时回退深色。
   */
  function getThemeCanvasColors(name) {
    var theme = THEMES[name] ? name : DEFAULT_THEME;
    var source = THEMES[theme].canvas;
    var colors = {};

    for (var key in source) {
      if (Object.prototype.hasOwnProperty.call(source, key)) {
        colors[key] = source[key];
      }
    }

    return colors;
  }

  /**
   * 读取本地保存的原始主题值；读取失败返回 null。
   */
  function getRawSavedTheme() {
    var saved = null;

    try {
      saved = window.localStorage.getItem(THEME_STORAGE_KEY);
    } catch (error) {
      saved = null;
    }

    return saved;
  }

  function saveTheme(name) {
    try {
      window.localStorage.setItem(THEME_STORAGE_KEY, name);
    } catch (error) {
      console.warn("[贪吃蛇] 无法写入主题设置，刷新后会回到默认主题。");
    }
  }

  /**
   * 应用主题：界面配色由 style.css 根据 data-theme 切换，
   * 这里同步画布配色、浏览器主题色与主题面板的选中态。
   */
  function applyTheme(name, options) {
    var theme = THEMES[name] ? name : DEFAULT_THEME;
    var config = THEMES[theme];

    game.theme = theme;
    document.documentElement.setAttribute("data-theme", theme);
    document.documentElement.style.colorScheme = config.colorScheme;

    COLORS = getThemeCanvasColors(theme);

    var meta = document.querySelector('meta[name="theme-color"]');

    if (meta) {
      meta.setAttribute("content", config.metaColor);
    }

    if (!options || options.persist !== false) {
      saveTheme(theme);
    }

    updateThemeOptions();

    // 画布逐帧重绘无法用 CSS 过渡，切换时做一次轻微淡入淡出
    if (options && options.animate && game.canvas) {
      game.canvas.classList.add("is-theme-fading");
      window.setTimeout(function () {
        game.canvas.classList.remove("is-theme-fading");
      }, 200);
    }
  }

  function loadTheme() {
    var saved = getRawSavedTheme();
    var theme = THEMES[saved] ? saved : DEFAULT_THEME;

    applyTheme(theme, { persist: false });

    // 没有设置或数据异常时，把存储规范化为默认深色
    if (saved !== theme) {
      saveTheme(theme);
    }
  }

  /**
   * 刷新主题卡片：当前主题显示“使用中”并高亮。
   */
  function updateThemeOptions() {
    var options = document.querySelectorAll("[data-theme-option]");

    for (var i = 0; i < options.length; i++) {
      var isActive = options[i].getAttribute("data-theme-option") === game.theme;
      var state = options[i].querySelector(".theme-option-state");

      if (isActive) {
        options[i].classList.add("is-active");
      } else {
        options[i].classList.remove("is-active");
      }

      if (state) {
        state.hidden = !isActive;
      }
    }
  }

  function bindThemeOptions() {
    var options = document.querySelectorAll("[data-theme-option]");

    for (var i = 0; i < options.length; i++) {
      (function (option) {
        option.addEventListener("click", function () {
          applyTheme(option.getAttribute("data-theme-option"), {
            persist: true,
            animate: true
          });
        });
      })(options[i]);
    }
  }

  /**
   * 本局模式：只用过 AI → ai，只用过玩家操作 → player，两者都有 → mixed。
   */
  function getRoundMode() {
    if (game.roundUsedAi && game.roundUsedPlayer) {
      return "mixed";
    }

    if (game.roundUsedAi) {
      return "ai";
    }

    return "player";
  }

  function getRoundModeText(mode) {
    if (mode === "ai") {
      return "完全AI";
    }

    if (mode === "mixed") {
      return "混合模式";
    }

    return "玩家";
  }

  /**
   * 本局结果：AI 达标过一律记“挑战成功”；完全AI 未达标记“挑战失败”；
   * 其余情况按死因记撞墙/撞到自己，未死亡就手动重开记“重新开始”。
   */
  function getRoundResultText(manualRestart) {
    if (game.roundAiAchieved) {
      return "挑战成功";
    }

    if (getRoundMode() === "ai") {
      return "挑战失败";
    }

    if (manualRestart) {
      return "重新开始";
    }

    return game.deathReason === "self" ? "撞到自己" : "撞墙";
  }

  /**
   * 记录本局战绩（每局只记录一次）。
   */
  function addRoundRecord(manualRestart) {
    if (!game.roundActive || game.roundRecorded) {
      return;
    }

    game.roundRecorded = true;

    var record = {
      round: getRoundNumber(),
      mode: getRoundMode(),
      score: game.score,
      length: game.snake.length,
      result: getRoundResultText(manualRestart),
      time: Date.now()
    };

    stats.completedRounds += 1;
    stats.records.unshift(record);

    if (stats.records.length > MAX_RECORDS) {
      stats.records = stats.records.slice(0, MAX_RECORDS);
    }

    if (!stats.bestRecord || record.score > stats.bestRecord.score) {
      stats.bestRecord = record;
    }

    saveStats();
    updateRoundDisplay();
    renderRecords();
  }

  /**
   * 加分并即时刷新最高分。
   */
  function applyScore(amount) {
    game.score += amount;
    updateScoreDisplay();

    if (game.score > stats.highScore) {
      stats.highScore = game.score;
      saveStats();
      updateHighScoreDisplay();
    }
  }

  function updateHighScoreDisplay() {
    if (game.ui.highScoreElement) {
      game.ui.highScoreElement.textContent = String(stats.highScore);
    }
  }

  function updateRoundDisplay() {
    if (game.ui.roundElement) {
      game.ui.roundElement.textContent = String(getRoundNumber());
    }
  }

  function getResultClass(result) {
    if (result === "挑战成功") {
      return "record-result--success";
    }

    if (result === "挑战失败") {
      return "record-result--failure";
    }

    return "record-result--neutral";
  }

  /**
   * 生成一条战绩行。
   */
  function createRecordRow(record, isBest) {
    var row = document.createElement("div");
    row.className = "record-row" + (isBest ? " record-row--best" : "");

    var main = document.createElement("div");
    main.className = "record-main";

    var title = document.createElement("span");
    title.className = "record-title";
    title.textContent = (isBest ? "最高分 · " : "") +
      "#" + record.round + "  " + getRoundModeText(record.mode);

    var meta = document.createElement("span");
    meta.className = "record-meta";
    meta.textContent = "得分 " + record.score + " · 长度 " + record.length;

    main.appendChild(title);
    main.appendChild(meta);

    var result = document.createElement("span");
    result.className = "record-result " + getResultClass(record.result);
    result.textContent = record.result;

    row.appendChild(main);
    row.appendChild(result);

    return row;
  }

  /**
   * 渲染战绩面板：最高分局单独置顶，下面列出最近十局。
   */
  function renderRecords() {
    var bestBox = game.ui.bestRecordElement;
    var list = game.ui.recordsListElement;

    if (bestBox) {
      bestBox.innerHTML = "";

      if (stats.bestRecord) {
        bestBox.hidden = false;
        bestBox.appendChild(createRecordRow(stats.bestRecord, true));
      } else {
        bestBox.hidden = true;
      }
    }

    if (!list) {
      return;
    }

    list.innerHTML = "";

    if (stats.records.length === 0) {
      var empty = document.createElement("p");
      empty.className = "record-empty";
      empty.textContent = "暂无游戏战绩";
      list.appendChild(empty);
      return;
    }

    for (var i = 0; i < stats.records.length; i++) {
      list.appendChild(createRecordRow(stats.records[i], false));
    }
  }

  /**
   * 打开设置 / 战绩面板；若游戏正在运行则先自动暂停。
   */
  function openPanel(panelName) {
    if (game.state === "running") {
      game.pendingDirections = [];
      game.accumulator = 0;
      setState("paused");
    }

    closePanel();
    updateSettingsButtons();
    updateSpeedSection();

    if (panelName === "settings" && game.ui.settingsPanel) {
      game.ui.settingsPanel.hidden = false;
    } else if (panelName === "records" && game.ui.recordsPanel) {
      renderRecords();
      game.ui.recordsPanel.hidden = false;
    } else if (panelName === "theme" && game.ui.themePanel) {
      updateThemeOptions();
      game.ui.themePanel.hidden = false;
    }

    updateHintVisibility();
  }

  function closePanel() {
    closeResetConfirm();

    if (game.ui.settingsPanel) {
      game.ui.settingsPanel.hidden = true;
    }

    if (game.ui.recordsPanel) {
      game.ui.recordsPanel.hidden = true;
    }

    if (game.ui.themePanel) {
      game.ui.themePanel.hidden = true;
    }

    updateHintVisibility();
  }

  function isPanelOpen() {
    return (game.ui.settingsPanel && !game.ui.settingsPanel.hidden) ||
      (game.ui.recordsPanel && !game.ui.recordsPanel.hidden) ||
      (game.ui.themePanel && !game.ui.themePanel.hidden);
  }

  function openResetConfirm() {
    if (game.ui.resetConfirmElement) {
      game.ui.resetConfirmElement.hidden = false;
    }
  }

  function closeResetConfirm() {
    if (game.ui.resetConfirmElement) {
      game.ui.resetConfirmElement.hidden = true;
    }
  }

  /**
   * 清空最高分与战绩数据；当前游戏进程与得分不受影响。
   */
  function resetStats() {
    stats = createEmptyStats();

    try {
      window.localStorage.removeItem(STATS_STORAGE_KEY);
    } catch (error) {
      // 无法访问本地存储时忽略，仅影响持久化
    }

    closeResetConfirm();
    updateHighScoreDisplay();
    updateRoundDisplay();
    renderRecords();
  }

  /**
   * 手动重新开始：先按“重新开始”结算本局，再回到初始状态。
   */
  function restartRound() {
    addRoundRecord(true);
    resetGame();
    // 从设置面板触发时顺手关掉面板，回到干净的初始界面
    closePanel();
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
    game.roundActive = false;
    game.roundRecorded = false;
    game.roundUsedAi = false;
    game.roundUsedPlayer = false;
    game.roundAiAchieved = false;
    game.deathReason = null;

    updateFinalScoreDisplays();
    updateRoundDisplay();
    updateUi();
  }

  /**
   * 游戏结束：定格当前画面、写入最终分数、记录本局战绩并切到 over 状态。
   * reason 为 "wall"（撞墙）或 "self"（咬到自己）。
   */
  function gameOver(reason) {
    game.pendingDirections = [];
    game.accumulator = 0;
    game.aiPath = null;
    game.deathReason = reason === "self" ? "self" : "wall";

    // 只有“AI 开局、全程 AI 操控且尚未达成目标”的挑战才算 AI 失败；
    // 达成目标后选择“继续挑战”再死亡，按普通游戏结束处理。
    game.aiResult = (game.mode === "ai" && game.aiQualified && !game.aiAchieved)
      ? "fail"
      : null;

    updateFinalScoreDisplays();
    addRoundRecord(false);
    setState("over");
  }

  /**
   * AI 达成目标：冻结游戏并弹出成功卡片，等待“继续挑战”或“重新开始”。
   */
  function aiWin() {
    game.pendingDirections = [];
    game.accumulator = 0;
    game.aiAchieved = true;
    game.roundAiAchieved = true;
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
    game.roundUsedAi = true;
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
      // 切换过模式即按“混合模式”记录
      game.roundUsedPlayer = true;
    } else {
      game.mode = "ai";
      game.roundUsedAi = true;
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
   * 设置面板里的暂停/继续按钮：
   * 运行中点击为暂停（面板保持打开）；暂停中点击为“继续”，
   * 只关闭面板并保持暂停，等玩家按移动键才真正继续。
   */
  function handleSettingsPauseButton() {
    if (game.state === "running") {
      game.pendingDirections = [];
      game.accumulator = 0;
      setState("paused");
      return;
    }

    if (game.state === "paused") {
      closePanel();
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

    // 第一次真正进入运行状态即视为本局已开始
    if (nextState === "running") {
      game.roundActive = true;
    }

    updateUi();
  }

  /**
   * 统一的 UI 刷新入口：HUD、提示、遮罩卡片与按钮状态。
   */
  function updateUi() {
    updateScoreDisplay();
    updateHighScoreDisplay();
    updateRoundDisplay();
    updateLengthDisplay();
    updateStatusDisplay();
    updateHintVisibility();
    updateOverlayVisibility();
    updateSettingsButtons();
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
   * 画布提示：准备开始显示操作说明；暂停且设置面板已关闭时提示移动继续。
   */
  function updateHintVisibility() {
    var hint = game.ui.hintElement;

    if (!hint) {
      return;
    }

    if (game.state === "ready") {
      hint.textContent = READY_HINT_TEXT;
      hint.classList.remove("is-hidden");
      return;
    }

    if (game.state === "paused" && !isPanelOpen()) {
      hint.textContent = RESUME_HINT_TEXT;
      hint.classList.remove("is-hidden");
      return;
    }

    hint.classList.add("is-hidden");
  }

  /**
   * 暂停与结束两张遮罩卡片按状态互斥显示。
   */
  function updateOverlayVisibility() {
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
   * 设置面板里的暂停/继续与重新开始按钮的可用性与文案。
   */
  function updateSettingsButtons() {
    var button = game.ui.settingsPauseButton;

    if (button) {
      button.disabled = game.state !== "running" && game.state !== "paused";
      button.textContent = PAUSE_BUTTON_TEXT[game.state] || "暂停";
    }

    if (game.ui.settingsRestartButton) {
      // 还在准备开始状态时没有可重开的局
      game.ui.settingsRestartButton.disabled = game.state === "ready";
    }
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

    updateSpeedSection();
    updateSpeedControl();
  }

  /**
   * 加速区块只在 AI 模式运行或暂停时显示（位于设置面板内）。
   */
  function updateSpeedSection() {
    if (!game.ui.speedSection) {
      return;
    }

    var isAi = game.mode === "ai";
    var canToggle = game.state === "running" || game.state === "paused";

    game.ui.speedSection.hidden = !(isAi && canToggle);
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
   * 同步加速开关、倍率滑块与数值标签。
   */
  function updateSpeedControl() {
    if (game.ui.speedSwitch) {
      game.ui.speedSwitch.checked = game.speedBoost;
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
   * 设置加速开关（由拨动开关触发），只在 AI 模式下生效。
   */
  function setSpeedBoost(enabled) {
    if (game.mode !== "ai") {
      updateSpeedControl();
      return;
    }

    game.speedBoost = Boolean(enabled);
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
    if (game.state === "over" || game.state === "ai-win") {
      return;
    }

    // 暂停中：移动键负责恢复游戏
    if (game.state === "paused") {
      resumeGame();

      // AI 接管方向时只恢复，不应用人工方向
      if (game.mode === "ai") {
        return;
      }
    }

    // AI 模式下由 AI 接管方向，人工方向输入完全无效
    if (game.mode === "ai") {
      return;
    }

    // 玩家在玩家模式下操作过方向，本局模式判定会用到
    game.roundUsedPlayer = true;

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
      gameOver("wall");
      return;
    }

    var ateFood = game.food !== null &&
      newHead.x === game.food.x &&
      newHead.y === game.food.y;

    // 自碰判定：不吃食物时尾节会在本 tick 移开，因此排除尾节（允许追尾）
    var collisionCount = ateFood ? game.snake.length : game.snake.length - 1;

    for (var i = 0; i < collisionCount; i++) {
      if (game.snake[i].x === newHead.x && game.snake[i].y === newHead.y) {
        gameOver("self");
        return;
      }
    }

    game.snake.unshift(newHead);

    if (ateFood) {
      game.foodEaten += 1;
      // 新记分制：得分 += 基础分值 × 吃到食物后的长度
      applyScore(calculateFoodScore(game.snake.length));

      // 基于增长后的蛇身重新生成食物，保证不会落在蛇身上
      game.food = createFood();
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

    var key = event.key ? event.key.toLowerCase() : "";

    // 空格键：打开 / 关闭设置面板；焦点在加速开关上时交给开关自身切换
    if (event.code === "Space" || key === " " || key === "spacebar") {
      if (event.target === game.ui.speedSwitch) {
        return;
      }

      event.preventDefault();

      if (isPanelOpen()) {
        closePanel();
      } else {
        openPanel("settings");
      }

      return;
    }

    if (isFormControl(event.target)) {
      return;
    }

    // 面板打开时不做游戏控制（面板内有自己的按钮）
    if (isPanelOpen()) {
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
   * 点击遮罩空白处触发关闭；点击卡片内部不会触发。
   */
  function bindBackdropClick(element, handler) {
    if (!element) {
      return;
    }

    element.addEventListener("click", function (event) {
      if (event.target === element) {
        handler();
      }
    });
  }

  /**
   * 绑定键盘、屏幕方向按钮、面板与各类按钮。
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

    bindClick(game.ui.settingsButton, function () {
      openPanel("settings");
    });
    bindClick(game.ui.settingsCloseButton, closePanel);
    bindClick(game.ui.settingsPauseButton, handleSettingsPauseButton);
    bindClick(game.ui.settingsRestartButton, restartRound);
    bindClick(game.ui.settingsRecordsButton, function () {
      openPanel("records");
    });
    bindClick(game.ui.settingsThemeButton, function () {
      openPanel("theme");
    });
    bindClick(game.ui.themeCloseButton, closePanel);
    bindClick(game.ui.recordsCloseButton, closePanel);
    bindClick(game.ui.recordsResetButton, openResetConfirm);
    bindClick(game.ui.resetCancelButton, closeResetConfirm);
    bindClick(game.ui.resetConfirmButton, resetStats);

    bindClick(game.ui.gameoverRestartButton, restartRound);
    bindClick(game.ui.aiStartButton, startAiChallenge);
    bindClick(game.ui.aiToggleButton, toggleAiMode);
    bindClick(game.ui.aiContinueButton, continueAiChallenge);
    bindClick(game.ui.aiWinRestartButton, restartRound);
    bindClick(game.ui.aiFailRestartButton, restartRound);
    if (game.ui.speedSwitch) {
      game.ui.speedSwitch.addEventListener("change", function () {
        setSpeedBoost(game.ui.speedSwitch.checked);
        // 用指针或键盘切换后主动失焦，避免空格键被开关吃掉
        game.ui.speedSwitch.blur();
      });
    }

    if (game.ui.speedRange) {
      game.ui.speedRange.addEventListener("input", function () {
        setSpeedMultiplier(game.ui.speedRange.value);
      });
    }

    bindBackdropClick(game.ui.settingsPanel, closePanel);
    bindBackdropClick(game.ui.recordsPanel, closePanel);
    bindBackdropClick(game.ui.themePanel, closePanel);
    bindBackdropClick(game.ui.resetConfirmElement, closeResetConfirm);

    bindThemeOptions();
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
          highScore: stats.highScore,
          roundNumber: getRoundNumber(),
          completedRounds: stats.completedRounds,
          recordsCount: stats.records.length,
          roundMode: getRoundMode(),
          roundRecorded: game.roundRecorded,
          theme: game.theme,
          speedMultiplier: game.speedMultiplier,
          speedBoost: game.speedBoost,
          speedMax: MAX_SPEED_MULTIPLIER,
          tickMs: getEffectiveTickMs(),
          tickCount: game.tickCount,
          pendingDirections: game.pendingDirections.slice()
        };
      },

      // 仅供自动化测试使用的钩子，正常玩法不会调用
      forceGameOver: function (reason) {
        gameOver(reason === "self" ? "self" : "wall");
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
    game.ui.highScoreElement = document.getElementById("highscore-value");
    game.ui.roundElement = document.getElementById("round-value");
    game.ui.lengthElement = document.getElementById("length-value");
    game.ui.statusElement = document.getElementById("status-value");
    game.ui.hintElement = document.getElementById("game-hint");
    game.ui.settingsButton = document.getElementById("settings-btn");
    game.ui.settingsPanel = document.getElementById("settings-panel");
    game.ui.settingsCloseButton = document.getElementById("settings-close");
    game.ui.settingsPauseButton = document.getElementById("settings-pause-btn");
    game.ui.settingsRestartButton = document.getElementById("settings-restart-btn");
    game.ui.settingsRecordsButton = document.getElementById("settings-records-btn");
    game.ui.settingsThemeButton = document.getElementById("settings-theme-btn");
    game.ui.gameoverRestartButton = document.getElementById("gameover-restart-btn");
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
    game.ui.speedSection = document.getElementById("speed-section");
    game.ui.speedSwitch = document.getElementById("speed-switch");
    game.ui.speedRange = document.getElementById("speed-range");
    game.ui.speedValueElement = document.getElementById("speed-value");
    game.ui.recordsPanel = document.getElementById("records-panel");
    game.ui.recordsCloseButton = document.getElementById("records-close");
    game.ui.recordsListElement = document.getElementById("records-list");
    game.ui.bestRecordElement = document.getElementById("best-record");
    game.ui.recordsResetButton = document.getElementById("records-reset-btn");
    game.ui.resetConfirmElement = document.getElementById("reset-confirm");
    game.ui.resetConfirmButton = document.getElementById("reset-confirm-btn");
    game.ui.resetCancelButton = document.getElementById("reset-cancel-btn");
    game.ui.themePanel = document.getElementById("theme-panel");
    game.ui.themeCloseButton = document.getElementById("theme-close");

    if (!game.ui.scoreElement || !game.ui.lengthElement || !game.ui.statusElement) {
      console.error("[贪吃蛇] 未找到 HUD 元素（#score-value / #length-value / #status-value）。");
    }

    if (!game.ui.gameoverOverlay) {
      console.error("[贪吃蛇] 未找到结束卡片（#gameover-overlay）。");
    }

    if (!window.SnakeAI) {
      console.error("[贪吃蛇] 未加载 ai.js，AI 模式不可用。");
    }

    if (!game.ui.speedSection || !game.ui.speedRange) {
      console.error("[贪吃蛇] 未找到加速控件（#speed-section / #speed-range）。");
    }

    if (!game.ui.settingsPanel || !game.ui.recordsPanel) {
      console.error("[贪吃蛇] 未找到设置或战绩面板（#settings-panel / #records-panel）。");
    }

    if (!game.ui.themePanel) {
      console.error("[贪吃蛇] 未找到主题面板（#theme-panel）。");
    }

    loadTheme();
    loadStats();
    resetGame();
    bindEvents();
    exposeDebugApi();
    draw();
    startLoop();

    renderRecords();
    console.log("[贪吃蛇] 初始化完成，等待方向输入。");
  }

  document.addEventListener("DOMContentLoaded", init);
})();
