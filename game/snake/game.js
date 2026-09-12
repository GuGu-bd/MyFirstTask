/**
 * 贪吃蛇 - 入口文件
 *
 * 当前阶段只负责页面初始化，不包含蛇移动、食物、碰撞等游戏逻辑。
 */
(function () {
  "use strict";

  // Canvas 逻辑尺寸（与 index.html 中的 width/height 保持一致）
  var CANVAS_WIDTH = 600;
  var CANVAS_HEIGHT = 600;

  // 全局状态占位，后续实现游戏逻辑时使用
  var game = {
    canvas: null,
    ctx: null,
    width: CANVAS_WIDTH,
    height: CANVAS_HEIGHT,
    running: false
  };

  /**
   * 初始化函数：获取 Canvas 与 2D 绘图上下文，准备游戏画布。
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

    // TODO: 后续在此处实现蛇的移动、食物生成、碰撞检测等游戏逻辑
    console.log("[贪吃蛇] 初始化完成，等待实现游戏逻辑。");
  }

  document.addEventListener("DOMContentLoaded", init);
})();
