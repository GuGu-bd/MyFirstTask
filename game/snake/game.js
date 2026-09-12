/**
 * 贪吃蛇 - 入口文件
 *
 * 第三阶段：食物与得分系统。
 * Canvas 只负责绘制游戏内容（背景、网格、食物、蛇），
 * 分数、状态与操作提示由 HTML 负责。
 * 自身碰撞、边界结束、最高分与重开留到后续阶段实现。
 */
(function () {
  "use strict";

  // ===== 常量配置 =====
  var CELL_SIZE = 25;                       // 每个格子的像素尺寸
  var GRID_COUNT = 24;                      // 24 x 24 的网格
  var CANVAS_WIDTH = CELL_SIZE * GRID_COUNT;  // 600
  var CANVAS_HEIGHT = CELL_SIZE * GRID_COUNT; // 600
  var TICK_MS = 1000 / 8;                   // 每秒移动 8 格
  var MAX_PENDING_DIRECTIONS = 2;           // 最多缓存两个待执行方向
  var MAX_FRAME_DELTA_MS = 1000;            // 超过该值时视为页面切到后台，丢弃这段时间

  var INITIAL_HEAD = { x: 12, y: 12 };      // 初始蛇头所在格子
  var FOOD_RADIUS_RATIO = 0.32;             // 食物半径相对格子尺寸的比例

  // HUD 状态文案
  var STATUS_TEXT = {
    ready: "准备开始",
    running: "进行中"
  };

  // 颜色与后续替换贴图相关的配置集中在这里
  var COLORS = {
    boardBackground: "#0b1219",
    gridLine: "rgba(255, 255, 255, 0.06)",
    snakeBody: "#34d399",
    snakeHead: "#86efac",
    snakeEye: "#0b1219",
    food: "#f87171"
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
    state: "ready",          // "ready"（静止等待开始） | "running"（按 tick 移动）
    direction: "right",      // 当前生效方向
    pendingDirections: [],   // 待执行方向队列，每个 tick 消费一个
    snake: [],               // 蛇身坐标，索引 0 为蛇头
    food: null,              // 食物坐标，无空格可用时为 null
    foodEaten: 0,            // 已吃到的食物数量，用于计分
    score: 0,                // 当前得分
    accumulator: 0,          // 移动节奏的时间累加器
    lastFrameTime: null,     // 上一帧时间戳
    ui: {                    // HTML 层元素，缺失时只记录错误、不中断游戏
      scoreElement: null,
      statusElement: null,
      hintElement: null
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
   * 重置到初始状态（本阶段只在初始化时调用）。
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
    updateScoreDisplay();
    updateStatusDisplay();
    updateHintVisibility();
  }

  /**
   * 统一切换游戏状态，并同步 HUD 文案与操作提示的显示。
   */
  function setState(nextState) {
    if (game.state === nextState) {
      return;
    }

    game.state = nextState;
    updateStatusDisplay();
    updateHintVisibility();
  }

  function updateScoreDisplay() {
    if (game.ui.scoreElement) {
      game.ui.scoreElement.textContent = String(game.score);
    }
  }

  function updateStatusDisplay() {
    if (game.ui.statusElement) {
      game.ui.statusElement.textContent = STATUS_TEXT[game.state] || "";
    }
  }

  /**
   * 开始前显示操作提示，游戏开始后隐藏。
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
   * 唯一的转向入口：键盘与屏幕按钮都调用它。
   * 反向输入始终忽略；同方向按键在运动中是空操作，在静止时用来启动游戏。
   */
  function setDirection(directionName) {
    if (!DIRECTIONS[directionName]) {
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
   * 前进一格：消费一个待执行方向，生成新蛇头。
   * 吃到食物时蛇尾不弹出（蛇身 +1 节）并加分、重新生成食物；
   * 否则头进尾出，长度保持不变。
   */
  function update() {
    if (game.pendingDirections.length > 0) {
      var nextDirection = game.pendingDirections.shift();
      if (nextDirection !== OPPOSITE_DIRECTION[game.direction]) {
        game.direction = nextDirection;
      }
    }

    var delta = DIRECTIONS[game.direction];
    var head = game.snake[0];

    // 穿墙：坐标在 0 ~ GRID_COUNT - 1 之间循环
    var newHead = {
      x: (head.x + delta.x + GRID_COUNT) % GRID_COUNT,
      y: (head.y + delta.y + GRID_COUNT) % GRID_COUNT
    };

    var ateFood = game.food !== null &&
      newHead.x === game.food.x &&
      newHead.y === game.food.y;

    game.snake.unshift(newHead);

    if (ateFood) {
      game.foodEaten += 1;
      game.score += calculateFoodScore(game.foodEaten);

      // 基于增长后的蛇身重新生成食物，保证不会落在蛇身上
      game.food = createFood();
      updateScoreDisplay();
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
   * 绘制蛇：先画身体，最后画蛇头与眼睛。
   */
  function drawSnake() {
    for (var i = game.snake.length - 1; i >= 1; i--) {
      drawCell(game.snake[i], COLORS.snakeBody);
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
   * 统一绘制入口，后续新增食物、贴图时在此扩展。
   */
  function draw() {
    drawBoard();
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
      game.accumulator += deltaTime;

      while (game.accumulator >= TICK_MS) {
        update();
        game.accumulator -= TICK_MS;
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
   * 键盘输入：WASD 与方向键，仅拦截这些按键的默认行为。
   */
  function handleKeyDown(event) {
    if (event.ctrlKey || event.metaKey || event.altKey) {
      return;
    }

    var key = event.key ? event.key.toLowerCase() : "";
    var directionName = KEY_DIRECTION_MAP[key];

    if (!directionName) {
      return;
    }

    event.preventDefault();
    setDirection(directionName);
  }

  /**
   * 绑定键盘与屏幕方向按钮。
   */
  function bindEvents() {
    document.addEventListener("keydown", handleKeyDown);

    var buttons = document.querySelectorAll("[data-direction]");

    for (var i = 0; i < buttons.length; i++) {
      (function (button) {
        var directionName = button.getAttribute("data-direction");

        button.addEventListener("click", function () {
          setDirection(directionName);
          // 主动失焦，避免按钮保持焦点后空格键重复触发转向
          button.blur();
        });
      })(buttons[i]);
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
          pendingDirections: game.pendingDirections.slice()
        };
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
    game.ui.statusElement = document.getElementById("status-value");
    game.ui.hintElement = document.getElementById("game-hint");

    if (!game.ui.scoreElement || !game.ui.statusElement) {
      console.error("[贪吃蛇] 未找到 HUD 元素（#score-value / #status-value）。");
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
