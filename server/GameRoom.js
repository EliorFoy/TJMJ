// server/GameRoom.js — 多人房间状态机
import { v4 as uuid } from 'uuid';
import { initTiles, determineDealPosition } from './game/mjLogic.js';
import { calculateWang, is258 } from './game/constants.js';
import { HuCalculator } from './game/HuCalculator.js';
import { RuleChecker } from './game/RuleChecker.js';

export class GameRoom {
  constructor(roomId, onDestroy) {
    this.id = roomId;
    this.players = [];       // [{ ws, name, avatar, score, ready }]
    this.observers = [];     // 观战者 ws 列表
    this.state = 'LOBBY';    // LOBBY | PLAYING | SETTLEMENT
    this.onDestroy = onDestroy;
    this.dealerIndex = 0;    // 庄家
    this.roundNumber = 1;
    this.totalScores = [0, 0, 0, 0];

    // 游戏运行时状态
    this.wallTiles = [];
    this.drawCursor = 0;
    this.deckRemaining = 108;
    this.diIndex = -1;
    this.diTile = null;
    this.wangTile = null;
    this.dice = [1, 1];
    this.hands = [[], [], [], []];
    this.discards = [];
    this.exposed = [[], [], [], []];
    this.currentPlayerIndex = 0;
    this.lastDiscard = null;      // { tile, fromPlayer }
    this.pendingActions = null;   // { actions: {...}, deadline }
    this.actionResponded = 0;
    this.actionResults = [];
  }

  addObserver(ws) {
    this.observers.push(ws);
    console.log(`[服务器] 观战者加入房间 ${this.id}`);
    // 立刻发送当前状态
    const obsMsg = this.buildObserverState();
    if (ws.readyState === 1) ws.send(JSON.stringify(obsMsg));
  }

  buildObserverState() {
    return {
      type: 'game_state',
      currentPlayer: this.currentPlayerIndex,
      discards: this.discards,
      exposed: this.exposed,
      diTile: this.diTile,
      diIndex: this.diIndex,
      wangTile: this.wangTile,
      dice: this.dice,
      deckRemaining: this.deckRemaining,
      wallTiles: this.wallTiles,
      tileCounts: this.hands.map(h => h.length),
      hands: this.hands.map(h => [...h]),
      scores: this.players.map(p => p.score),
      lastDiscard: this.lastDiscard,
    };
  }

  addPlayer(ws, name, avatar) {
    if (this.players.length >= 4) return -1;
    const idx = this.players.length;
    const player = {
      id: idx,
      ws, name, avatar,
      score: 0,
      ready: false,
      connected: true,
    };
    this.players.push(player);
    return idx; // 返回座位号 0/1/2/3
  }

  removePlayer(ws) {
    const idx = this.players.findIndex(p => p.ws === ws);
    if (idx >= 0) {
      this.players[idx].connected = false;
      // 如果还没开始，直接移除
      if (this.state === 'LOBBY') {
        this.players.splice(idx, 1);
      }
    }
    if (this.players.every(p => !p.connected)) {
      this.onDestroy(this.id);
    }
    return idx;
  }

  // 广播给所有人
  broadcast(msg) {
    const data = JSON.stringify(msg);
    this.players.forEach(p => {
      if (p.ws.readyState === 1) p.ws.send(data);
    });
  }

  // 发给指定玩家
  sendTo(playerIndex, msg) {
    const p = this.players[playerIndex];
    if (!p) { console.log(`[服务器] sendTo(${playerIndex}): 玩家不存在`); return; }
    if (p.ws.readyState !== 1) { console.log(`[服务器] sendTo(${playerIndex}): ws状态=${p.ws.readyState}`); return; }
    try {
      p.ws.send(JSON.stringify(msg));
    } catch(e) {
      console.log(`[服务器] sendTo(${playerIndex}): 发送失败 ${e.message}`);
    }
  }

  // === 游戏开始 ===
  startGame() {
    if (this.players.length < 4) return;
    this.state = 'PLAYING';
    this.hands = [[], [], [], []];
    this.discards = [];
    this.exposed = [[], [], [], []];
    this.pendingActions = null;

    const deck = initTiles();
    this.wallTiles = [...deck];
    this.deckRemaining = 108;

    const d1 = Math.floor(Math.random() * 6) + 1;
    const d2 = Math.floor(Math.random() * 6) + 1;
    this.dice = [d1, d2];

    const dealPos = determineDealPosition(d1, d2, this.dealerIndex);
    this.drawCursor = dealPos.drawCursorStart;
    this.diIndex = dealPos.diIndex;
    this.diTile = this.wallTiles[this.diIndex];
    this.wangTile = calculateWang(this.diTile);

    // 发牌
    for (let i = 0; i < 53; i++) {
      let tile = this.physicalDraw();
      let player = Math.floor(i / 4) % 4;
      if (i >= 48) player = i - 48;
      if (i === 52) player = 0;
      this.hands[player].push(tile);
    }
    this.hands.forEach(h => h.sort((a, b) => a - b));
    this.currentPlayerIndex = 0;

    // 通知每个人他的牌和王
    this.players.forEach((_, i) => {
      this.sendTo(i, {
        type: 'game_start',
        hand: this.hands[i],
        wangTile: this.wangTile,
        diTile: this.diTile,
        diIndex: this.diIndex,
        dice: this.dice,
        dealerIndex: this.dealerIndex,
        currentPlayer: this.currentPlayerIndex,
        roundNumber: this.roundNumber,
        wallTiles: this.wallTiles,
        tileCounts: this.hands.map(h => h.length),
        players: this.playersInfo(),
      });
    });

    // 广播公共状态 + 通知庄家出牌
    this.broadcastPublic();
    this.sendTo(0, { type: 'your_turn', playerIndex: 0 });
  }

  physicalDraw() {
    if (this.drawCursor === this.diIndex) this.drawCursor = (this.drawCursor + 1) % 108;
    const tile = this.wallTiles[this.drawCursor];
    this.wallTiles[this.drawCursor] = null;
    this.drawCursor = (this.drawCursor + 1) % 108;
    this.deckRemaining--;
    return tile;
  }

  // === 玩家操作 ===
  handleDiscard(playerIndex, tile) {
    console.log(`[服务器] handleDiscard: p${playerIndex} tile=${tile} curP=${this.currentPlayerIndex} pending=${!!this.pendingActions} handLen=${this.hands[playerIndex]?.length}`);
    if (playerIndex !== this.currentPlayerIndex) { console.log('[服务器] 不是你的回合!'); return; }
    if (this.pendingActions) { console.log('[服务器] 有待处理动作!'); return; }

    const hand = this.hands[playerIndex];
    const idx = hand.indexOf(tile);
    console.log(`[服务器] hand中查找${tile}: idx=${idx}, hand前5=[${hand.slice(0,5)}]`);
    if (idx === -1) { console.log('[服务器] 手牌中找不到该牌!'); return; }

    hand.splice(idx, 1); // 不排序，保持新牌在最右侧
    this.discards.push({ value: tile, from: playerIndex });
    this.lastDiscard = { tile, fromPlayer: playerIndex };
    console.log(`[服务器] 玩家${playerIndex} 打出 ${tile}, 弃牌池共 ${this.discards.length} 张`);
    this.broadcastPublic(); // 立即同步弃牌

    // 检查其他人能否拦截
    this.checkIntercepts(playerIndex, tile);
  }

  handleDraw(playerIndex) {
    if (playerIndex !== this.currentPlayerIndex) return;
    if (this.deckRemaining <= 4) {
      this.endRound(-1); // 流局
      return;
    }
    const tile = this.physicalDraw();
    this.hands[playerIndex].push(tile);
    this.hands[playerIndex].sort((a, b) => a - b);

    this.sendTo(playerIndex, { type: 'drew_tile', tile });
    this.broadcastPublic();

    // 自摸检测
    const huCheck = HuCalculator.checkHu(this.hands[playerIndex], this.wangTile, this.diTile, false);
    if (huCheck.canHu) {
      this.sendTo(playerIndex, { type: 'can_zimo', result: huCheck });
    }
  }

  handleAction(playerIndex, actionType, combo = null) {
    try {
      console.log(`[服务器] handleAction: p${playerIndex} ${actionType} combo=${combo} pending=${!!this.pendingActions}`);
      if (!this.pendingActions) return;
      const pa = this.pendingActions;
      if (!pa.actions || !pa.actions[actionType]) { console.log('[服务器] 无效操作'); return; }

      pa.actionResponded++;
      pa.actionResults.push({ player: playerIndex, action: actionType, combo });

      if (actionType === 'hu') {
        this.endRound(playerIndex);
        return;
      }

      // 等所有人回应后再结算
      if (pa.actionResponded >= pa.responderCount) {
        this.resolveActions();
      }
    } catch(e) {
      console.log('[服务器] handleAction错误:', e.message);
    }
  }

  handlePass(playerIndex) {
    if (!this.pendingActions) return;
    const pa = this.pendingActions;
    pa.actionResponded++;
    if (pa.actionResponded >= pa.responderCount) {
      this.resolveActions();
    }
  }

  // 检查吃碰杠胡拦截
  checkIntercepts(discarderIndex, targetTile) {
    const actions = { hu: [], gang: [], peng: [], chi: null };
    let chiCombos = null;

    for (let i = 1; i <= 3; i++) {
      const p = (discarderIndex + i) % 4;
      const hand = this.hands[p];

      const huCheck = HuCalculator.checkHu([...hand, targetTile], this.wangTile, this.diTile, false);
      if (huCheck.canHu && huCheck.canCatchCannon) actions.hu.push(p);
      if (RuleChecker.canMingGang(hand, targetTile, this.wangTile)) actions.gang.push(p);
      if (RuleChecker.canPeng(hand, targetTile)) actions.peng.push(p);
      if (i === 1) {
        const combos = RuleChecker.canChi(hand, targetTile);
        if (combos) { actions.chi = p; chiCombos = combos; }
      }
    }

    const hasActions = actions.hu.length > 0 || actions.gang.length > 0 || actions.peng.length > 0 || actions.chi !== null;

    if (!hasActions) {
      this.nextTurn();
      return;
    }

    // 通知相关玩家可选操作
    const relevantPlayers = new Set();
    actions.hu.forEach(p => relevantPlayers.add(p));
    actions.gang.forEach(p => relevantPlayers.add(p));
    actions.peng.forEach(p => relevantPlayers.add(p));
    if (actions.chi !== null) relevantPlayers.add(actions.chi);

    const responderCount = relevantPlayers.size;
    this.pendingActions = { actions, actionResponded: 0, actionResults: [], responderCount };

    relevantPlayers.forEach(p => {
      this.sendTo(p, {
        type: 'action_prompt',
        targetTile,
        fromPlayer: discarderIndex,
        canHu: actions.hu.includes(p),
        canGang: actions.gang.includes(p),
        canPeng: actions.peng.includes(p),
        canChi: actions.chi === p,
        chiCombinations: actions.chi === p ? chiCombos : null,
      });
    });

    // 其他人等待
    this.players.forEach((_, i) => {
      if (!relevantPlayers.has(i)) {
        this.sendTo(i, { type: 'waiting_action', targetTile, fromPlayer: discarderIndex });
      }
    });
  }

  resolveActions() {
    if (!this.pendingActions) return;
    const pa = this.pendingActions;
    const { actions, actionResults } = pa;
    this.pendingActions = null;

    // 优先级：胡 > 杠 > 碰 > 吃
    const huResult = actionResults.find(r => r.action === 'hu' && actions.hu.includes(r.player));
    if (huResult) {
      this.endRound(huResult.player);
      return;
    }

    const gangResult = actionResults.find(r => r.action === 'gang' && actions.gang.includes(r.player));
    if (gangResult) {
      this.executeGang(gangResult.player, this.lastDiscard.tile);
      return;
    }

    console.log(`[服务器] resolveActions: results=${JSON.stringify(actionResults)} actions=${JSON.stringify(actions)}`);
    const pengResult = actionResults.find(r => r.action === 'peng' && actions.peng.includes(r.player));
    if (pengResult) {
      console.log(`[服务器] 执行碰: p${pengResult.player} tile=${this.lastDiscard?.tile}`);
      this.executePeng(pengResult.player, this.lastDiscard.tile);
      return;
    }

    const chiResult = actionResults.find(r => r.action === 'chi' && actions.chi === r.player);
    if (chiResult) {
      this.executeChi(chiResult.player, this.lastDiscard.tile, chiResult.combo);
      return;
    }

    this.nextTurn();
  }

  executePeng(playerIndex, tile) {
    const hand = this.hands[playerIndex];
    for (let i = 0; i < 2; i++) hand.splice(hand.indexOf(tile), 1);
    this.discards.pop();
    this.exposed[playerIndex].push({ type: 'peng', tiles: [tile, tile, tile] });
    this.currentPlayerIndex = playerIndex;
    this.broadcastPublic();
  }

  executeGang(playerIndex, tile) {
    const hand = this.hands[playerIndex];
    for (let i = 0; i < 3; i++) hand.splice(hand.indexOf(tile), 1);
    this.discards.pop();
    this.exposed[playerIndex].push({ type: 'minggang', tiles: [tile, tile, tile, tile] });
    this.currentPlayerIndex = playerIndex;
    this.broadcastPublic();
    // 杠后补牌
    if (this.deckRemaining > 4) {
      const newTile = this.physicalDraw();
      this.hands[playerIndex].push(newTile);
      this.hands[playerIndex].sort((a, b) => a - b);
      this.sendTo(playerIndex, { type: 'drew_tile', tile: newTile });
    }
  }

  executeChi(playerIndex, tile, combo) {
    const hand = this.hands[playerIndex];
    console.log(`[服务器] executeChi: p${playerIndex} tile=${tile} combo=[${combo}] hand=[${hand}]`);
    if (!combo || combo.length !== 2) { console.log('[服务器] chi combo无效'); return; }
    for (const t of combo) {
      const idx = hand.indexOf(t);
      if (idx === -1) { console.log(`[服务器] chi失败: 手牌中无${t}`); return; }
      hand.splice(idx, 1);
    }
    this.discards.pop();
    const chiTiles = [combo[0], tile, combo[1]].sort((a, b) => a - b);
    this.exposed[playerIndex].push({ type: 'chi', tiles: chiTiles });
    this.currentPlayerIndex = playerIndex;
    this.broadcastPublic();
  }

  nextTurn() {
    this.currentPlayerIndex = (this.currentPlayerIndex + 1) % 4;
    this.lastDiscard = null;
    this.broadcastPublic();
    // 通知当前玩家摸牌
    const cp = this.currentPlayerIndex;
    this.sendTo(cp, { type: 'your_turn', playerIndex: cp });
    if (this.deckRemaining <= 4) {
      this.endRound(-1);
      return;
    }
    const tile = this.physicalDraw();
    this.hands[cp].push(tile); // 不排序，新牌留在最右侧
    this.sendTo(cp, { type: 'drew_tile', tile });
    this.broadcastPublic();
  }

  endRound(winnerIndex) {
    this.state = 'SETTLEMENT';
    // winnerIndex === -1 表示流局
    this.broadcast({
      type: 'round_end',
      winnerIndex,
      hands: this.hands,
      totalScores: this.totalScores,
      roundNumber: this.roundNumber,
    });

    // 自动下一局
    setTimeout(() => {
      if (this.roundNumber >= 4) {
        this.broadcast({ type: 'game_end', totalScores: this.totalScores, players: this.playersInfo() });
        this.state = 'LOBBY';
        this.players = [];  // 清空玩家，准备下一轮测试
        return;
      }
      this.roundNumber++;
      this.dealerIndex = (this.dealerIndex + 1) % 4;
      this.startGame();
    }, 5000);
  }

  // === 状态广播 ===
  broadcastPublic() {
    const online = this.players.filter(p => p.ws.readyState === 1).length;
    console.log(`[服务器] 广播状态: ${online}/${this.players.length} 在线 + ${this.observers.length}观战, 弃牌${this.discards.length}张`);
    this.players.forEach((_, i) => {
      this.sendTo(i, {
        type: 'game_state',
        currentPlayer: this.currentPlayerIndex,
        discards: this.discards,
        exposed: this.exposed,
        yourExposed: this.exposed[i],
        diTile: this.diTile,
        diIndex: this.diIndex,
        wangTile: this.wangTile,
        dice: this.dice,
        deckRemaining: this.deckRemaining,
        wallTiles: this.wallTiles,
        tileCounts: this.hands.map(h => h.length),
        hand: this.hands[i],
        scores: this.players.map(p => p.score),
        lastDiscard: this.lastDiscard,
        pendingActions: !!this.pendingActions,
      });
    });
    // 广播给观战者
    const obsMsg = this.buildObserverState();
    this.observers.forEach(ws => {
      if (ws.readyState === 1) ws.send(JSON.stringify(obsMsg));
    });
  }

  playersInfo() {
    return this.players.map((p, i) => ({
      id: i,
      name: p.name,
      avatar: p.avatar,
      score: p.score,
      connected: p.connected,
    }));
  }
}
