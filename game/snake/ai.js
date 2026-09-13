/**
 * 贪吃蛇 AI - 独立寻路模块（v2.1）
 *
 * 设计原则：
 * - 纯计算：只读取传入的只读快照，不访问 DOM、不修改游戏状态；
 * - 对外只暴露一个接口 window.SnakeAI.decide(snapshot) → { direction, path }。
 *
 * 算法流程：
 * 1. BFS 求蛇头到食物的最短路（蛇身视为障碍，尾节视为可通过）；
 * 2. 沿最短路逐步推演，按蛇身随时间的真实变化检查每一步是否合法；
 * 3. 模拟吃到食物后的状态，做“尾可达性”安全校验；
 * 4. 路径不可用或食物不可达时改用保命策略：选择可达空间最大、
 *    尽量能追到自己尾巴的合法方向，而不是硬往危险位置走。
 */
(function () {
  "use strict";

  var DIRECTIONS = {
    up: { x: 0, y: -1 },
    down: { x: 0, y: 1 },
    left: { x: -1, y: 0 },
    right: { x: 1, y: 0 }
  };

  var DIRECTION_NAMES = ["up", "right", "down", "left"];

  var OPPOSITE_DIRECTION = {
    up: "down",
    down: "up",
    left: "right",
    right: "left"
  };

  var DEFAULT_GRID_COUNT = 24;

  function cellKey(x, y) {
    return x + "," + y;
  }

  function isInside(x, y, gridCount) {
    return x >= 0 && x < gridCount && y >= 0 && y < gridCount;
  }

  function cloneSnake(snake) {
    var copy = [];

    for (var i = 0; i < snake.length; i++) {
      copy.push({ x: snake[i].x, y: snake[i].y });
    }

    return copy;
  }

  function directionFromStep(from, to) {
    for (var i = 0; i < DIRECTION_NAMES.length; i++) {
      var name = DIRECTION_NAMES[i];
      var delta = DIRECTIONS[name];

      if (from.x + delta.x === to.x && from.y + delta.y === to.y) {
        return name;
      }
    }

    return null;
  }

  /**
   * 判断蛇头走到 next 是否合法。
   * ateFood 为 true 时这一步会吃到食物、尾节不会移开，因此尾格也算障碍。
   */
  function isStepSafe(snake, next, ateFood, gridCount) {
    if (!isInside(next.x, next.y, gridCount)) {
      return false;
    }

    var limit = ateFood ? snake.length : snake.length - 1;

    for (var i = 0; i < limit; i++) {
      if (snake[i].x === next.x && snake[i].y === next.y) {
        return false;
      }
    }

    return true;
  }

  /**
   * 沿路径逐步推演蛇身变化，返回 { ok, snake, ateFood }。
   * 这是“蛇身会不断变化、路径可能失效”的精确校验。
   */
  function simulatePath(snake, path, food, gridCount) {
    var virtualSnake = cloneSnake(snake);
    var ateFood = false;

    for (var i = 0; i < path.length; i++) {
      var next = path[i];
      var willEat = !ateFood && food !== null &&
        next.x === food.x && next.y === food.y;

      if (!isStepSafe(virtualSnake, next, willEat, gridCount)) {
        return { ok: false, snake: null, ateFood: ateFood };
      }

      virtualSnake.unshift({ x: next.x, y: next.y });

      if (willEat) {
        ateFood = true;
      } else {
        virtualSnake.pop();
      }
    }

    return { ok: true, snake: virtualSnake, ateFood: ateFood };
  }

  /**
   * BFS 求蛇头到目标格的最短路，返回不含蛇头的坐标数组；不可达返回 null。
   * 蛇身视为障碍，但尾节视为可通过——蛇头走到那里时尾巴通常已经移开，
   * 最终是否真的安全由 simulatePath 逐步确认。
   */
  function findShortestPath(snake, target, gridCount) {
    var head = snake[0];
    var startKey = cellKey(head.x, head.y);
    var targetKey = cellKey(target.x, target.y);
    var blocked = {};
    var i;

    for (i = 1; i < snake.length - 1; i++) {
      blocked[cellKey(snake[i].x, snake[i].y)] = true;
    }

    var cameFrom = {};
    cameFrom[startKey] = startKey;
    var queue = [head];
    var cursor = 0;

    while (cursor < queue.length) {
      var current = queue[cursor];
      cursor += 1;

      if (current.x === target.x && current.y === target.y) {
        break;
      }

      for (i = 0; i < DIRECTION_NAMES.length; i++) {
        var delta = DIRECTIONS[DIRECTION_NAMES[i]];
        var nextX = current.x + delta.x;
        var nextY = current.y + delta.y;

        if (!isInside(nextX, nextY, gridCount)) {
          continue;
        }

        var nextKey = cellKey(nextX, nextY);

        if (cameFrom[nextKey] !== undefined || blocked[nextKey]) {
          continue;
        }

        cameFrom[nextKey] = cellKey(current.x, current.y);
        queue.push({ x: nextX, y: nextY });
      }
    }

    if (cameFrom[targetKey] === undefined) {
      return null;
    }

    var path = [];
    var key = targetKey;

    while (key !== startKey) {
      var parts = key.split(",");
      path.unshift({ x: Number(parts[0]), y: Number(parts[1]) });
      key = cameFrom[key];
    }

    return path;
  }

  /**
   * 洪水填充：蛇头能到达的空格数量，用于保命时评估“活动空间”。
   */
  function countFreeSpace(snake, gridCount) {
    var blocked = {};
    var i;

    for (i = 0; i < snake.length; i++) {
      blocked[cellKey(snake[i].x, snake[i].y)] = true;
    }

    var head = snake[0];
    var visited = {};
    visited[cellKey(head.x, head.y)] = true;

    var queue = [head];
    var cursor = 0;
    var count = 0;

    while (cursor < queue.length) {
      var current = queue[cursor];
      cursor += 1;

      for (i = 0; i < DIRECTION_NAMES.length; i++) {
        var delta = DIRECTIONS[DIRECTION_NAMES[i]];
        var nextX = current.x + delta.x;
        var nextY = current.y + delta.y;

        if (!isInside(nextX, nextY, gridCount)) {
          continue;
        }

        var nextKey = cellKey(nextX, nextY);

        if (visited[nextKey] || blocked[nextKey]) {
          continue;
        }

        visited[nextKey] = true;
        count += 1;
        queue.push({ x: nextX, y: nextY });
      }
    }

    return count;
  }

  /**
   * 尾可达性：蛇头能否沿空格走到自己的尾巴（尾格视为可通行）。
   * 能追到尾巴意味着蛇身不会被自己围死，是“吃完后仍能活下去”的核心判据。
   */
  function canReachTail(snake, gridCount) {
    if (snake.length < 2) {
      return true;
    }

    var head = snake[0];
    var tail = snake[snake.length - 1];
    var blocked = {};
    var i;

    for (i = 1; i < snake.length - 1; i++) {
      blocked[cellKey(snake[i].x, snake[i].y)] = true;
    }

    var visited = {};
    visited[cellKey(head.x, head.y)] = true;

    var queue = [head];
    var cursor = 0;

    while (cursor < queue.length) {
      var current = queue[cursor];
      cursor += 1;

      if (current.x === tail.x && current.y === tail.y) {
        return true;
      }

      for (i = 0; i < DIRECTION_NAMES.length; i++) {
        var delta = DIRECTIONS[DIRECTION_NAMES[i]];
        var nextX = current.x + delta.x;
        var nextY = current.y + delta.y;

        if (!isInside(nextX, nextY, gridCount)) {
          continue;
        }

        var nextKey = cellKey(nextX, nextY);

        if (visited[nextKey] || blocked[nextKey]) {
          continue;
        }

        visited[nextKey] = true;
        queue.push({ x: nextX, y: nextY });
      }
    }

    return false;
  }

  /**
   * 保命策略：在所有合法方向里挑一个最可能活下去的。
   * 评分优先级：能追到自己尾巴 > 可达空间大 > 保持当前方向（避免抖动）。
   */
  function chooseSurvivalStep(snake, gridCount, currentDirection) {
    var head = snake[0];
    var best = null;

    for (var i = 0; i < DIRECTION_NAMES.length; i++) {
      var name = DIRECTION_NAMES[i];

      if (name === OPPOSITE_DIRECTION[currentDirection]) {
        continue;
      }

      var delta = DIRECTIONS[name];
      var next = { x: head.x + delta.x, y: head.y + delta.y };

      if (!isStepSafe(snake, next, false, gridCount)) {
        continue;
      }

      var virtualSnake = cloneSnake(snake);
      virtualSnake.unshift(next);
      virtualSnake.pop();

      var reachTail = canReachTail(virtualSnake, gridCount);
      var space = countFreeSpace(virtualSnake, gridCount);
      var score = (reachTail ? 100000 : 0) + space + (name === currentDirection ? 1 : 0);

      if (best === null || score > best.score) {
        best = { direction: name, next: next, score: score };
      }
    }

    return best;
  }

  /**
   * 对外接口：根据只读快照给出下一步方向与展示用的规划路径。
   * snapshot：{ gridCount, snake, food, direction }
   */
  function decide(snapshot) {
    if (!snapshot || !snapshot.snake || snapshot.snake.length === 0) {
      return null;
    }

    var gridCount = snapshot.gridCount || DEFAULT_GRID_COUNT;
    var snake = snapshot.snake;
    var food = snapshot.food || null;
    var currentDirection = snapshot.direction || "right";
    var head = snake[0];

    // 第一优先级：能安全地吃到食物
    if (food) {
      var path = findShortestPath(snake, food, gridCount);

      if (path && path.length > 0) {
        var firstStep = directionFromStep(head, path[0]);

        if (firstStep !== null && firstStep !== OPPOSITE_DIRECTION[currentDirection]) {
          var simulation = simulatePath(snake, path, food, gridCount);

          // 吃完后仍能追到自己的尾巴，才认为这条路线安全
          if (simulation.ok && canReachTail(simulation.snake, gridCount)) {
            return { direction: firstStep, path: path };
          }
        }
      }
    }

    // 兜底：保命，绝不主动撞墙或撞自己
    var survival = chooseSurvivalStep(snake, gridCount, currentDirection);

    if (survival !== null) {
      return { direction: survival.direction, path: [survival.next] };
    }

    return { direction: currentDirection, path: null };
  }

  window.SnakeAI = {
    decide: decide
  };
})();
