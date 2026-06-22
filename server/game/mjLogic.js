// src/utils/mjLogic.js

// 洗牌算法：Fisher-Yates Shuffle
export const shuffle = (tiles) => {
  for (let i = tiles.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [tiles[i], tiles[j]] = [tiles[j], tiles[i]];
  }
  return tiles;
};

// 初始化桃江麻将牌堆 (108张：万筒条，不含风牌)
// 11-19万, 21-29条, 31-39筒
export const initTiles = () => {
  let tiles = [];
  [10, 20, 30].forEach(type => {
    for (let i = 1; i <= 9; i++) {
      for (let j = 0; j < 4; j++) {
        tiles.push(type + i);
      }
    }
  });
  return shuffle(tiles);
};

/**
 * 墙的布局定义（每一面墙从所属玩家的视角）
 *
 * 牌桌布局（屏幕视角，54叠=108张）：
 *   对家(Player 2): stacks 27-40 (墙顶, 14叠)
 *   上家(Player 3): stacks 14-26 (墙左, 13叠)
 *   下家(Player 1): stacks 41-53 (墙右, 13叠)
 *   庄家(Player 0): stacks 0-13  (墙底, 14叠)
 *
 * 玩家顺时针顺序（逆时针出牌）：
 *   Player 0(庄家/下) → Player 1(下家/右) → Player 2(对家/上) → Player 3(上家/左)
 */

/**
 * 墙的配置：每面墙从所属玩家的视角看
 *
 * 关键概念（以该墙主人面朝牌桌中心为准）：
 *   leftSide  = 玩家左手边对应的stack索引
 *   rightSide = 玩家右手边对应的stack索引
 *   leftToRight = stack索引从左手边到右手边的变化方向 (+1递增 / -1递减)
 *
 * 牌桌stack布局（屏幕视角）：
 *   庄家(底/Player 0): stacks 0-13   (14叠，屏幕左→右)
 *   上家(左/Player 3): stacks 14-26  (13叠，屏幕下→上)
 *   对家(顶/Player 2): stacks 27-40  (14叠，屏幕左→右)
 *   下家(右/Player 1): stacks 41-53  (13叠，屏幕下→上)
 */
const WALL_CONFIG = {
  // wallIndex 0: 庄家墙 (底部, stacks 0-13)
  0: {
    stacks: { start: 0, end: 13 },
    // 庄家在屏幕下方，面朝上(北)。左手=西(屏幕左/stack 13)，右手=东(屏幕右/stack 0)
    leftSide: 13,
    rightSide: 0,
    leftToRight: -1, // 左→右: 13→12→...→0 (递减)
  },
  // wallIndex 1: 下家墙 (右侧, stacks 41-53)
  1: {
    stacks: { start: 41, end: 53 },
    // 下家在屏幕右侧，面朝左(西)。左手=南(屏幕下/stack 53)，右手=北(屏幕上/stack 41)
    leftSide: 53,
    rightSide: 41,
    leftToRight: -1, // 左→右: 53→52→...→41 (递减)
  },
  // wallIndex 2: 对家墙 (顶部, stacks 27-40)
  2: {
    stacks: { start: 27, end: 40 },
    // 对家在屏幕上方，面朝下(南)。左手=东(屏幕右/stack 40)，右手=西(屏幕左/stack 27)
    leftSide: 40,
    rightSide: 27,
    leftToRight: -1, // 左→右: 40→39→...→27 (递减)
  },
  // wallIndex 3: 上家墙 (左侧, stacks 14-26)
  3: {
    stacks: { start: 14, end: 26 },
    // 上家在屏幕左侧，面朝右(东)。左手=北(屏幕上/stack 26)，右手=南(屏幕下/stack 14)
    leftSide: 26,
    rightSide: 14,
    leftToRight: -1, // 左→右: 26→25→...→14 (递减)
  },
};

/**
 * 根据骰子点数和庄家位置，计算摸牌起始位置和扳王位置
 *
 * 规则：
 * 1. 从庄家开始数骰子点数和（庄家=1,5,9; 下家=2,6,10; 对家=3,7,11; 上家=4,8,12）
 * 2. 摸牌：数到的那一家的墙，从【右手边】往左数，跳过较小的骰子数（minD）
 *    → drawStack = rightSide + (-leftToRight) * minD
 * 3. 扳王：数到的那一家的【下家】的墙，从【左手边】往右数，数到较大的骰子数（maxD）
 *    → diStack = leftSide + leftToRight * (maxD - 1)
 *
 * 验证示例：骰子3+4=7, minD=3, maxD=4
 *   sum=7→对家(wall 2), 下家=上家(wall 3)
 *   摸牌: wall2 rightSide=27, leftToRight=-1 → 27 + (-(-1))*3 = 30 ✓
 *   扳王: wall3 leftSide=26, leftToRight=-1 → 26 + (-1)*3 = 23 ✓
 *
 * @param {number} d1 - 骰子1的点数 (1-6)
 * @param {number} d2 - 骰子2的点数 (1-6)
 * @param {number} dealerIndex - 庄家索引 (0=我, 1=下家, 2=对家, 3=上家)
 * @returns {{ drawStackIndex: number, diStackIndex: number, drawWallIndex: number, wangWallIndex: number, drawCursorStart: number, diIndex: number }}
 */
export const determineDealPosition = (d1, d2, dealerIndex = 0) => {
  const sum = d1 + d2;
  const minD = Math.min(d1, d2);
  const maxD = Math.max(d1, d2);

  // 从庄家开始数 sum 个位置确定摸牌墙
  const drawWallIndex = (dealerIndex + (sum - 1)) % 4;
  // 扳王在摸牌墙的下家
  const wangWallIndex = (drawWallIndex + 1) % 4;

  const drawWall = WALL_CONFIG[drawWallIndex];
  const wangWall = WALL_CONFIG[wangWallIndex];

  // 摸牌：右手边往左数，跳过 minD 叠
  // 从右往左 = 与 leftToRight 相反的方向
  const drawStackIndex = drawWall.rightSide + (-drawWall.leftToRight) * minD;

  // 扳王：左手边往右数，数到第 maxD 叠
  const diStackIndex = wangWall.leftSide + wangWall.leftToRight * (maxD - 1);

  return {
    drawWallIndex,
    drawStackIndex,
    wangWallIndex,
    diStackIndex,
    drawCursorStart: drawStackIndex * 2,
    diIndex: diStackIndex * 2,
  };
};

/**
 * 获取指定墙索引的所有stack编号（用于渲染）
 */
export const getWallStacks = (wallIndex) => {
  const cfg = WALL_CONFIG[wallIndex];
  const stacks = [];
  const start = cfg.stacks.start;
  const end = cfg.stacks.end;
  if (start <= end) {
    for (let i = start; i <= end; i++) stacks.push(i);
  } else {
    for (let i = start; i >= end; i--) stacks.push(i);
  }
  return stacks;
};
