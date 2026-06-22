<template>
  <div class="app-container">
    <audio ref="bgMusic" loop src="/TJMJ/bgm.mp3" preload="auto"></audio>

    <div id="game-wrapper">
      <div class="mahjong-desk" :class="{ 'in-menu': isInMenu }">

        <!-- BGM / 语音 / 聊天 控制（游戏区域内部） -->
        <div class="top-controls">
          <button class="ctrl-btn" @click="toggleMusic" :title="musicPlaying ? '暂停音乐' : '播放音乐'">{{ musicPlaying ? '🔊' : '🔇' }}</button>
          <button class="ctrl-btn mic-btn" @click="toggleMic" :title="micEnabled ? '关闭麦克风' : '打开麦克风'">
            <span class="mic-icon">{{ micEnabled ? '🎙️' : '🔕' }}</span>
            <span class="mic-bars" v-if="micEnabled">
              <span v-for="n in 5" :key="n" class="mic-bar" :class="{ active: micLevel >= n * 20 }"></span>
            </span>
          </button>
          <button class="ctrl-btn" @click="toggleChat" title="聊天">{{ showChatInput ? '💬' : '💭' }}</button>
        </div>

        <!-- 聊天消息气泡 -->
        <div class="chat-bubbles" v-if="chatMessages.length > 0">
          <div v-for="m in chatMessages" :key="m.id" class="chat-bubble" :class="{ 'chat-self': m.from === myPlayerIndexForChat }">
            <span class="chat-name">{{ m.fromName }}</span>
            <span class="chat-text">{{ m.text }}</span>
          </div>
        </div>
        
        <!-- 自动连接中 -->
        <div class="ready-overlay" v-if="autoConnecting">
          <h2>🀄 正在加入房间 {{ multiState.joinInput }}...</h2>
        </div>

        <!-- 模式选择 -->
        <div class="mode-select-overlay" v-if="isInMenu">
          <div class="mode-dialog">
            <h2>桃江麻将</h2>
            <div class="mode-anime">
              <span class="anime-emoji a1">🫣</span>
              <span class="anime-emoji a2">✋</span>
              <span class="anime-emoji a3">💃</span>
              <span class="anime-emoji a4">🕺</span>
              <span class="anime-emoji a5">🎵</span>
              <span class="anime-emoji a6">✨</span>
            </div>
            <button class="mode-btn" @click="enterGame('single')">单人模式</button>
            <button class="mode-btn" @click="enterGame('multi')">联机模式</button>
            <button class="mode-btn test-mode-btn" @click="enterGame('test')" :disabled="isMobileDevice" :title="isMobileDevice ? '测试模式仅支持电脑端' : ''">测试模式</button>
            <button class="mode-btn" @click="enterGame('spectate')">观战模式</button>
          </div>
        </div>

        <!-- 观战模式：输入房间号 -->
        <div class="ready-overlay" v-if="gameState.gamePhase === 'WAITING' && gameMode === 'spectate' && !netState.roomId">
          <div class="lobby-dialog">
            <h2>观战模式</h2>
            <input v-model="spectateRoomInput" placeholder="输入4位房间号" class="lobby-input room-code" maxlength="4" @input="spectateRoomInput = spectateRoomInput.replace(/[^0-9]/g,''); if(spectateRoomInput.length===4) joinSpectate()" />
            <button class="lobby-btn join" @click="joinSpectate" :disabled="spectateRoomInput.length !== 4">观战</button>
            <div v-if="multiState.error" class="lobby-error">{{ multiState.error }}</div>
            <button class="lobby-back" @click="backToMenu()">← 返回</button>
          </div>
        </div>

        <!-- 联机大厅 -->
        <div class="ready-overlay" v-if="gameState.gamePhase === 'WAITING' && gameMode === 'multi'">
          <div v-if="!netState.roomId" class="lobby-dialog">
            <h2>联机大厅</h2>
            <input v-model="multiState.playerName" placeholder="你的昵称" class="lobby-input" maxlength="8" />
            <button class="lobby-btn create" @click="createRoom" :disabled="multiState.creating">
              {{ multiState.creating ? '创建中...' : '创建房间' }}
            </button>
            <input v-model="multiState.joinInput" placeholder="输入4位房间号加入" class="lobby-input room-code" maxlength="4" @keyup="onJoinKeyup" />
            <button class="lobby-btn join" @click="joinRoom" :disabled="multiState.joining || multiState.joinInput.length !== 4">
              {{ multiState.joining ? '加入中...' : '加入房间' }}
            </button>
            <div v-if="multiState.error" class="lobby-error">{{ multiState.error }}</div>
            <button class="lobby-back" @click="backToMenu()">← 返回</button>
          </div>

          <div v-else class="lobby-dialog">
            <h2>房间 {{ netState.roomId }}</h2>
            <div class="room-players">
              <div v-for="(p, i) in netState.players" :key="i" class="room-player">
                <span>{{ p.name || '等待中...' }}</span>
                <span v-if="p.connected" class="ready-badge">已连接</span>
              </div>
              <div v-for="n in (4 - netState.players.length)" :key="'empty'+n" class="room-player empty">
                <span>虚位以待...</span>
              </div>
            </div>
            <div class="lobby-info">邀请朋友输入房间号加入，4人到齐后自动开始</div>
            <button class="lobby-back" @click="leaveRoom(); backToMenu()">← 离开房间</button>
          </div>
        </div>

        <!-- 单人模式准备 -->
        <div class="ready-overlay" v-if="gameState.gamePhase === 'WAITING' && gameMode === 'single' && netState.roomId">
          <!-- 已通过handleReady自动开始 -->
        </div>

        <div class="walls-container" v-show="gameState.gamePhase === 'PLAYING' || gameState.gamePhase === 'SETTLEMENT'">
          <div class="wall wall-top"><div v-for="n in 14" :key="'top'+n" class="wall-stack-wrapper h-stack"><img v-if="gameState.wallTiles[(27 + n - 1) * 2 + 1]" :src="getImg('3d/back_3.png')" class="stack-bottom h-bg" /><img v-if="gameState.wallTiles[(27 + n - 1) * 2]" :src="getImg('3d/back_3.png')" class="stack-top h-bg" /><img v-if="gameState.diIndex === (27 + n - 1) * 2" :src="getImg(`tiles/${gameState.diTile}.png`)" class="stack-top di-face h-face" /></div></div>
          <div class="wall wall-left"><div v-for="n in 13" :key="'left'+n" class="wall-stack-wrapper v-stack"><img v-if="gameState.wallTiles[(26 - (n - 1)) * 2 + 1]" :src="getImg('3d/back_4.png')" class="stack-bottom v-bg" /><img v-if="gameState.wallTiles[(26 - (n - 1)) * 2]" :src="getImg('3d/back_4.png')" class="stack-top v-bg" /><img v-if="gameState.diIndex === (26 - (n - 1)) * 2" :src="getImg(`tiles/${gameState.diTile}.png`)" class="stack-top di-face v-face" /></div></div>
          <div class="wall wall-right"><div v-for="n in 13" :key="'right'+n" class="wall-stack-wrapper v-stack"><img v-if="gameState.wallTiles[(41 + n - 1) * 2 + 1]" :src="getImg('3d/back_2.png')" class="stack-bottom v-bg" /><img v-if="gameState.wallTiles[(41 + n - 1) * 2]" :src="getImg('3d/back_2.png')" class="stack-top v-bg" /><img v-if="gameState.diIndex === (41 + n - 1) * 2" :src="getImg(`tiles/${gameState.diTile}.png`)" class="stack-top di-face v-face" /></div></div>
          <div class="wall wall-bottom"><div v-for="n in 14" :key="'bottom'+n" class="wall-stack-wrapper h-stack"><img v-if="gameState.wallTiles[(13 - (n - 1)) * 2 + 1]" :src="getImg('3d/back_1.png')" class="stack-bottom h-bg" /><img v-if="gameState.wallTiles[(13 - (n - 1)) * 2]" :src="getImg('3d/back_1.png')" class="stack-top h-bg" /><img v-if="gameState.diIndex === (13 - (n - 1)) * 2" :src="getImg(`tiles/${gameState.diTile}.png`)" class="stack-top di-face h-face" /></div></div>
        </div>

        <div class="player-top" v-if="gameState.gamePhase === 'PLAYING' || gameState.gamePhase === 'SETTLEMENT'">
          <div class="avatar-box" :class="{ 'active-glow': gameState.currentPlayerIndex === seat(2) }">
            <img :src="getImg(`avatars/${gameState.players[seat(2)].avatar}.png`)" class="avatar-img clickable" @click.stop="openEmojiPicker(seat(2))" />
            <span class="name">{{ gameState.players[seat(2)].name }}<span class="ting-badge" v-if="gameState.npcFirstTurnTing[seat(2)]">听</span></span>
            <span class="score clickable" :class="gameState.players[seat(2)].score >= 0 ? 'score-up' : 'score-down'" @click.stop="openNumpad(seat(2))">{{ gameState.players[seat(2)].score >= 0 ? '+' : '' }}{{ gameState.players[seat(2)].score }}</span>
          </div>
          <div class="cards-container-top">
             <div class="npc-exposed top-exposed" v-if="gameState.exposed[seat(2)].length > 0">
                <div v-for="(t, i) in getFlatExposed(seat(2))" :key="i" class="rotator-top">
                    <img :src="getImg('3d/lay_1.png')" class="center-tile-bg" />
                    <img :src="getImg(`tiles/${t}.png`)" class="center-tile-face" />
                </div>
             </div>
             <div class="hand-tiles-top"><img v-for="n in gameState.npcTileCounts[seat(2)]" :key="n" :src="getImg('3d/hand_3.png')" class="tile-back-top" /></div>
          </div>
        </div>

        <div class="player-left" v-if="gameState.gamePhase === 'PLAYING' || gameState.gamePhase === 'SETTLEMENT'">
          <div class="avatar-box" :class="{ 'active-glow': gameState.currentPlayerIndex === seat(3) }">
            <img :src="getImg(`avatars/${gameState.players[seat(3)].avatar}.png`)" class="avatar-img clickable" @click.stop="openEmojiPicker(seat(3))" />
            <span class="name">{{ gameState.players[seat(3)].name }}<span class="ting-badge" v-if="gameState.npcFirstTurnTing[seat(3)]">听</span></span>
            <span class="score clickable" :class="gameState.players[seat(3)].score >= 0 ? 'score-up' : 'score-down'" @click.stop="openNumpad(seat(3))">{{ gameState.players[seat(3)].score >= 0 ? '+' : '' }}{{ gameState.players[seat(3)].score }}</span>
          </div>
          <div class="cards-container-side">
             <div class="npc-exposed left-exposed" v-if="gameState.exposed[seat(3)].length > 0">
                <div v-for="(t, i) in getFlatExposed(seat(3))" :key="i" class="npc-exposed-wrapper-side">
                    <div class="rotator rotator-left">
                       <img :src="getImg('3d/lay_1.png')" class="center-tile-bg" />
                       <img :src="getImg(`tiles/${t}.png`)" class="center-tile-face" />
                    </div>
                </div>
             </div>
             <div class="hand-tiles-left"><img v-for="n in gameState.npcTileCounts[seat(3)]" :key="n" :src="getImg('3d/hand_4.png')" class="tile-back-side" /></div>
          </div>
        </div>

        <div class="player-right" v-if="gameState.gamePhase === 'PLAYING' || gameState.gamePhase === 'SETTLEMENT'">
          <div class="cards-container-side">
             <div class="hand-tiles-right"><img v-for="n in gameState.npcTileCounts[seat(1)]" :key="n" :src="getImg('3d/hand_2.png')" class="tile-back-side" /></div>
             <div class="npc-exposed right-exposed" v-if="gameState.exposed[seat(1)].length > 0">
                <div v-for="(t, i) in getFlatExposed(seat(1))" :key="i" class="npc-exposed-wrapper-side">
                    <div class="rotator rotator-right">
                       <img :src="getImg('3d/lay_1.png')" class="center-tile-bg" />
                       <img :src="getImg(`tiles/${t}.png`)" class="center-tile-face" />
                    </div>
                </div>
             </div>
          </div>
          <div class="avatar-box" :class="{ 'active-glow': gameState.currentPlayerIndex === seat(1) }">
            <img :src="getImg(`avatars/${gameState.players[seat(1)].avatar}.png`)" class="avatar-img clickable" @click.stop="openEmojiPicker(seat(1))" />
            <span class="name">{{ gameState.players[seat(1)].name }}<span class="ting-badge" v-if="gameState.npcFirstTurnTing[seat(1)]">听</span></span>
            <span class="score clickable" :class="gameState.players[seat(1)].score >= 0 ? 'score-up' : 'score-down'" @click.stop="openNumpad(seat(1))">{{ gameState.players[seat(1)].score >= 0 ? '+' : '' }}{{ gameState.players[seat(1)].score }}</span>
          </div>
        </div>

        <div class="player-bottom" v-if="gameState.gamePhase === 'PLAYING' || gameState.gamePhase === 'SETTLEMENT'">
          <div class="avatar-box" :class="{ 'active-glow': gameState.currentPlayerIndex === seat(0) }">
            <img :src="getImg(`avatars/${gameState.players[seat(0)].avatar}.png`)" class="avatar-img clickable" @click.stop="openEmojiPicker(seat(0))" />
            <span class="name">{{ gameMode === 'spectate' ? gameState.players[spectateView].name : gameState.players[seat(0)].name }}<span v-if="gameMode === 'spectate'" style="font-size:9px;color:#ffd700;"> (观战)</span></span>
            <span class="score clickable" :class="gameState.players[seat(0)].score >= 0 ? 'score-up' : 'score-down'" @click.stop="openNumpad(seat(0))">{{ gameState.players[seat(0)].score >= 0 ? '+' : '' }}{{ gameState.players[seat(0)].score }}</span>
          </div>
          
          <div class="hand-tiles-bottom">
            <div class="exposed-area" v-if="getMyExposed().length > 0">
               <div v-for="(group, gIndex) in getMyExposed()" :key="'exp'+gIndex" class="exposed-group">
                  <div v-for="(tile, tIndex) in group.tiles" :key="'expt'+tIndex" class="center-tile-wrapper exposed-tile">
                     <img :src="getImg(group.type === 'angang' && tIndex < 3 ? '3d/back_1.png' : '3d/lay_1.png')" class="center-tile-bg" />
                     <img v-if="group.type !== 'angang' || tIndex === 3" :src="getImg(`tiles/${tile}.png`)" class="center-tile-face" />
                  </div>
               </div>
            </div>

            <div v-for="(tile, index) in gameState.handTiles" :key="index" class="hand-tile-wrapper" :class="{ 'selected': gameState.selectedTileIndex === index, 'new-drawn-tile': isNewDrawnTile(index), 'dragging': dragIndex === index, 'drag-over': dragOverIndex === index }" draggable="true" @click="onTapTile(index)" @dragstart="onDragStart(index, $event)" @dragover.prevent="onDragOver(index)" @dragleave="onDragLeave(index)" @drop="onDrop(index)" @dragend="onDragEnd" @touchstart.prevent="onTouchStart(index, $event)" @touchmove.prevent="onTouchMove($event)" @touchend.prevent="onTouchEnd">
              <img :src="getImg('3d/hand_1.png')" class="tile-bg" />
              <img :src="getImg(`tiles/${tile}.png`)" class="tile-face" />
            </div>
          </div>
        </div>

        <!-- 局数显示 -->
        <div class="round-badge" v-show="gameState.gamePhase === 'PLAYING'">第 {{ gameState.roundNumber }}/16 局</div>

        <div class="center-area" v-show="gameState.gamePhase === 'PLAYING'">
          <div class="dice-circle">
            <img :src="getImg(`dice/${gameState.dice[0]}.png`)" class="dice" />
            <img :src="getImg(`dice/${gameState.dice[1]}.png`)" class="dice" />
          </div>
          <!-- 扎鸟展示牌 -->
          <div class="zha-niao-display" v-if="gameState.zhaNiaoResult && gameState.zhaNiaoResult.niaoTile">
            <img :src="getImg('3d/lay_1.png')" class="niao-bg" />
            <img :src="getImg(`tiles/${gameState.zhaNiaoResult.niaoTile}.png`)" class="niao-face" />
            <span class="niao-label">{{ gameState.zhaNiaoResult.type }}</span>
          </div>
          <div class="discard-pool">
            <div v-for="(item, index) in gameState.discards" :key="index" 
                 class="center-tile-wrapper"
                 :style="{ gridRow: getDiscardGridPos(index).row, gridColumn: getDiscardGridPos(index).col }">
               <img :src="getImg('3d/lay_1.png')" class="center-tile-bg" />
               <img :src="getImg(`tiles/${item.value}.png`)" class="center-tile-face" />
            </div>
          </div>
        </div>

        <!-- 地胡带拖选择弹窗 -->
        <div class="dihu-choice-overlay" v-if="gameState.pendingDiHuChoice">
          <div class="dihu-dialog">
            <h3>🀄 地胡！</h3>
            <p>你有3张地牌，请选择：</p>
            <button class="dihu-btn direct" @click="handleDiHuDirect">直接胡 (2倍/6分)</button>
            <button class="dihu-btn drag" @click="handleDiHuDrag">带拖 (3倍/9分)</button>
          </div>
        </div>

        <!-- 手动结算界面 -->
        <div class="settlement-overlay" v-if="settlement.active && settlement.winnerIndex >= 0">
          <div class="settlement-panel">
            <h3>💰 手动结算</h3>
            <p>{{ gameState.players[settlement.winnerIndex]?.name }} 胡牌！</p>
            <div class="settlement-row" v-for="(p, idx) in gameState.players" :key="'pay'+idx">
              <span class="settlement-name">{{ p.name }}</span>
              <span v-if="idx === settlement.winnerIndex" class="settlement-winner">🎉 赢家</span>
              <template v-else>
                <button class="settlement-pay-btn" @click="openNumpad(idx)">
                  {{ settlement.payments[idx] > 0 ? '已付 '+settlement.payments[idx]+' 分' : '点击支付' }}
                </button>
                <button class="settlement-confirm-btn" @click="confirmPayment(idx)"
                  :disabled="settlement.payments[idx] <= 0">
                  {{ settlement.confirmed[idx] ? '✓ 已确认' : '确认' }}
                </button>
              </template>
            </div>
            <button class="btn-ready" @click="nextRoundOrFinish"
              :disabled="![0,1,2,3].every(i => i === settlement.winnerIndex || settlement.confirmed[i])">
              继续
            </button>
          </div>
        </div>

        <!-- 数字键盘 -->
        <div class="numpad-overlay" v-if="settlement.numpadFor >= 0" @click.stop>
          <div class="numpad-panel">
            <span class="numpad-close" @click="settlement.numpadFor = -1">✕</span>
            <h4>支付给 {{ gameState.players[settlement.numpadFor]?.name || '' }}</h4>
            <div class="numpad-display">{{ settlement.numpadValue || '0' }}</div>
            <div class="numpad-grid">
              <button v-for="n in [1,2,3,4,5,6,7,8,9,'C',0,'✓']" :key="n"
                class="numpad-key" :class="{ 'numpad-clear': n==='C', 'numpad-ok': n==='✓' }"
                @click="n==='C' ? settlement.numpadValue='' : n==='✓' ? numpadConfirm() : numpadInput(n)">{{ n }}</button>
            </div>
          </div>
        </div>

        <!-- 亮牌展示（胡牌后显示四家手牌） -->
        <div class="showdown-overlay" v-if="gameState.showdownHands && (gameState.gamePhase === 'WAITING' || gameState.gamePhase === 'SETTLEMENT')">
          <div class="showdown-panel">
            <h3>🏆 本局结果</h3>
            <div class="showdown-row" v-for="(p, idx) in gameState.players" :key="idx">
              <span class="showdown-name">{{ p.name }}</span>
              <span class="showdown-tiles">
                <span v-for="t in gameState.showdownHands[idx]" :key="t" class="showdown-tile-wrapper">
                  <img :src="getImg('3d/lay_1.png')" class="showdown-tile-bg" />
                  <img :src="getImg(`tiles/${t}.png`)" class="showdown-tile-face" />
                </span>
              </span>
              <span class="showdown-score" :class="p.score >= 0 ? 'score-up' : 'score-down'">{{ p.score >= 0 ? '+' : '' }}{{ p.score }}</span>
            </div>
            <div class="showdown-round">第 {{ gameState.roundNumber }}/16 局 | 累计总分</div>
            <div class="showdown-cumulative">
              <span v-for="(p, idx) in gameState.players" :key="'cum'+idx" style="margin:0 8px;">
                {{ p.name }}: {{ p.score }}
              </span>
            </div>
            <button class="btn-ready" @click="nextRoundOrFinish">{{ gameState.roundNumber >= 16 ? '🏆 查看最终排名' : '▶ 下一局' }}</button>
          </div>
        </div>

        <!-- 表情选择器 -->
        <div class="emoji-picker" v-if="emojiPicker.target !== null" v-show="gameState.gamePhase === 'PLAYING'">
          <span v-for="e in emojis" :key="e.icon" class="emoji-option" @click="sendEmoji(e.icon)">{{ e.icon }}</span>
          <span class="emoji-option emoji-cancel" @click="emojiPicker.target = null">✕</span>
        </div>

        <!-- 飞行表情动画 -->
        <span v-for="(fly, i) in flyingEmojis" :key="'fly'+i" class="flying-emoji"
              :style="{ '--tx': fly.tx + 'px', '--ty': fly.ty + 'px' }">{{ fly.icon }}</span>

        <div class="action-buttons" v-show="gameState.gamePhase === 'PLAYING'">
          <!-- 吃牌多选：显示所有可选吃法 -->
          <template v-if="actionState.canChi && actionState.chiCombinations.length > 1">
            <div v-for="(combo, idx) in actionState.chiCombinations" :key="'chi'+idx"
                 class="action-btn chi active" @click="handleChiWithCombo(combo)">
              吃{{ getChiLabel(combo) }}
            </div>
          </template>
          <div v-else class="action-btn chi" :class="{ 'active': actionState.canChi }" @click="handleChi">吃</div>
          <div class="action-btn peng" :class="{ 'active': actionState.canPeng }" @click="handlePeng">碰</div>
          <div class="action-btn gang" :class="{ 'active': actionState.canGang }" @click="handleGang">杠</div>
          <div class="action-btn hu" :class="{ 'active': actionState.canHu || (gameState.currentPlayerIndex === 0 && gameState.handTiles.length % 3 === 2) }" @click="handleHu">胡</div>
          <div class="action-btn pass active" v-if="actionState.isWaiting" @click="passAction">过</div>
        </div>

      </div>
    </div>
  </div>
</template>

<script setup>
import { reactive, ref, onMounted, watch } from 'vue';
import { initTiles, determineDealPosition } from './utils/mjLogic.js';
import { calculateWang } from './core/constants.js';
import { HuCalculator } from './core/HuCalculator.js';
import { RuleChecker } from './core/RuleChecker.js';
import { NpcStrategy } from './ai/NpcStrategy.js';
import { speak, playDong, playWin } from './utils/speech.js';
import { connect, send, on, off, netState, disconnect } from './network/client.js';

// 【核心解法】动态读取环境路径，彻底消灭 404！
const getImg = (path) => {
  return `${import.meta.env.BASE_URL}images/${path}`;
};

const generateRandomAvatars = () => {
  let arr = [];
  while(arr.length < 4) {
    let r = Math.floor(Math.random() * 70) + 1;
    if(!arr.includes(r)) arr.push(r);
  }
  return arr;
};
const initialAvatars = generateRandomAvatars();

const gameState = reactive({
  gamePhase: 'WAITING', 
  readyStatus: [false, false, false, false], 
  wallTiles: Array(108).fill(null), drawCursor: 0, deckRemaining: 108,
  handTiles: [], selectedTileIndex: -1, discards: [], 
  currentPlayerIndex: 0,
  npcHands: [[], [], [], []], npcTileCounts: [13, 13, 13, 13],
  npcFirstTurnTing: [false, false, false, false], // 起手报听标记
  exposed: [[], [], [], []],
  dice: [1, 1], diTile: null, wangTile: null, diIndex: -1,
  pendingDiHuChoice: null, // 地胡带拖选择: { handTiles, result }
  zhaNiaoResult: null, // 扎鸟结果展示
  showdownHands: null, // 胡牌后亮出四家手牌
  roundNumber: 1, // 当前局数 (1-16)
  totalScores: [0, 0, 0, 0], // 累计总分
  dealerIndex: 0,  // 当前庄家
  roundHistory: [], // 每局记录
  players: [
    { name: '我', avatar: `${initialAvatars[0]}.表情包`, score: 0 },
    { name: 'NPC1', avatar: `${initialAvatars[1]}.表情包`, score: 0 },
    { name: 'NPC2', avatar: `${initialAvatars[2]}.表情包`, score: 0 },
    { name: 'NPC3', avatar: `${initialAvatars[3]}.表情包`, score: 0 }
  ]
});

const bgMusic = ref(null);
const musicPlaying = ref(false);

// 尝试自动播放 BGM（需要用户交互，浏览器会拒绝纯自动播放）
const tryAutoPlay = () => {
  const audio = bgMusic.value;
  if (!audio || musicPlaying.value) return;
  audio.play().then(() => {
    musicPlaying.value = true;
  }).catch(() => {
    // 浏览器阻止自动播放，等用户交互后再试
  });
};

const toggleMusic = () => {
  const audio = bgMusic.value;
  if (!audio) return;
  if (musicPlaying.value) {
    audio.pause();
    musicPlaying.value = false;
  } else {
    audio.play().then(() => {
      musicPlaying.value = true;
    }).catch(() => {});
  }
};

// 回合计时器
let turnTimer = null;
const startTurnTimer = () => {
  clearTimeout(turnTimer);
  if (gameMode.value === 'spectate') return;
  turnTimer = setTimeout(() => {
    // 允许出牌：3n+2(刚摸牌) 或 3n(刚吃碰完)
    const canDiscard = gameState.handTiles.length % 3 === 2 || gameState.handTiles.length % 3 === 0;
    if (isMyTurn() && canDiscard && !actionState.isWaiting) {
      const randomIdx = Math.floor(Math.random() * gameState.handTiles.length);
      gameState.selectedTileIndex = randomIdx;
      playTile(randomIdx);
    }
  }, 20000);
};
const gameMode = ref('single'); // 'single' | 'multi' | 'spectate'
// 是否在主菜单（控制移动端 CSS 旋转：菜单竖屏，其余横屏）
const isInMenu = ref(true);
// 是否移动端（禁用测试模式）
const isMobileDevice = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
const spectateView = ref(0); // 观战视角 (0=我, 1=下家, 2=对家, 3=上家)
const multiState = reactive({
  roomId: '',
  joinInput: '',
  creating: false,
  joining: false,
  error: '',
  playerName: 'NPC' + Math.floor(Math.random() * 90 + 10),
});
const dragIndex = ref(-1);    // 正在被拖拽的牌的索引
const dragOverIndex = ref(-1); // 拖拽悬停的目标索引

// 表情互动
const emojis = [
  { icon: '🌹' }, { icon: '💩' }, { icon: '🥚' }, { icon: '💣' }, { icon: '💵' }
];
const emojiPicker = reactive({ target: null });
const flyingEmojis = ref([]);
let emojiId = 0;

const openEmojiPicker = (playerIndex) => {
  // 观战模式：点击头像切换视角
  if (gameMode.value === 'spectate') {
    switchSpectateView(playerIndex);
    return;
  }
  // 再点同一个头像 → 关闭
  emojiPicker.target = emojiPicker.target === playerIndex ? null : playerIndex;
};

const sendEmoji = (icon) => {
  const target = emojiPicker.target;
  emojiPicker.target = null;
  if (target === null) return;

  // 💵 钞票 = 真给1分
  if (icon === '💵') {
    const myIdx = mySeat();
    if (target !== myIdx) {
      gameState.players[target].score += 1;
      gameState.players[myIdx].score -= 1;
      if (gameMode.value === 'multi' && netState.roomId) {
        send({ type: 'pay', to: target, amount: 1 });
      }
    }
  }

  // 联机模式：发送表情到服务器
  if (gameMode.value === 'multi' && netState.roomId) {
    multiEmoji(icon, target);
  }

  // 计算目标头像在牌桌上的大致位置（相对于牌桌中心）
  const desk = document.querySelector('.mahjong-desk');
  if (!desk) return;
  const deskRect = desk.getBoundingClientRect();
  // 从玩家底部中心发出
  const fromX = deskRect.width / 2;
  const fromY = deskRect.height - 60;
  // 目标位置（近似）
  const targetPos = { 1: [deskRect.width - 40, deskRect.height / 2], 2: [deskRect.width / 2, 40], 3: [40, deskRect.height / 2] };
  const [tox, toy] = targetPos[target] || [deskRect.width / 2, 40];

  const id = ++emojiId;
  flyingEmojis.value.push({ id, icon, tx: tox - fromX, ty: toy - fromY, fromX, fromY });
  setTimeout(() => {
    flyingEmojis.value = flyingEmojis.value.filter(f => f.id !== id);
  }, 800);
};

const actionState = reactive({
  isWaiting: false, targetTile: null, sourceIndex: -1,
  canChi: false, chiCombinations: [], canPeng: false, canGang: false, canHu: false
});

const getDiscardGridPos = (index) => {
  // 12列×6行网格，中央留空给骰子
  let gridSpots = [];
  for (let r = 1; r <= 6; r++) {
     for (let c = 1; c <= 12; c++) {
        // 中间6格留给骰子圈 (行3-4, 列5-8)
        if ((r === 3 || r === 4) && (c >= 5 && c <= 8)) continue;
        gridSpots.push({ row: r, col: c });
     }
  }
  if (index < gridSpots.length) return gridSpots[index];
  // 溢出时放到外围行
  return { row: 6, col: (index % 12) + 1 };
};

const getFlatExposed = (pIndex) => {
  let flat = [];
  gameState.exposed[pIndex].forEach(group => flat.push(...group.tiles));
  return flat;
};

// 生成吃牌按钮标签（如 "23"、"35"、"56"）
const getChiLabel = (combo) => {
  return `${combo[0] % 10}${combo[1] % 10}`;
};

const handleReady = () => {
  if (gameMode.value === 'single' || gameMode.value === 'spectate') {
    gameState.readyStatus[0] = true;
    [1, 2, 3].forEach(i => {
      setTimeout(() => {
        gameState.readyStatus[i] = true;
        if (gameState.readyStatus.every(r => r)) setTimeout(startRound, 800);
      }, Math.random() * 1500 + 500);
    });
  }
};

// ============ 移动端横屏/全屏控制 ============
const lockLandscape = async () => {
  try {
    if (screen.orientation && screen.orientation.lock) {
      await screen.orientation.lock('landscape');
    }
  } catch (e) {
    // 部分浏览器不支持，静默失败，CSS fallback 兜底
  }
};

const unlockOrientation = () => {
  try {
    if (screen.orientation && screen.orientation.unlock) {
      screen.orientation.unlock();
    }
  } catch (e) {}
};

const requestFullscreen = async () => {
  try {
    const el = document.documentElement;
    if (el.requestFullscreen) {
      await el.requestFullscreen();
    } else if (el.webkitRequestFullscreen) {
      await el.webkitRequestFullscreen();
    }
  } catch (e) {
    // 静默失败
  }
};

const exitFullscreen = () => {
  try {
    if (document.fullscreenElement) {
      document.exitFullscreen();
    } else if (document.webkitFullscreenElement) {
      document.webkitExitFullscreen();
    }
  } catch (e) {}
};

// 进入游戏模式：设置模式 + 横屏锁定 + 全屏
const enterGame = (mode) => {
  gameMode.value = mode;
  isInMenu.value = false; // 离开主菜单立即触发 CSS 横屏旋转
  updateGameScale(); // 计算手机端缩放比
  tryAutoPlay(); // 利用用户点击手势启动 BGM
  lockLandscape();
  requestFullscreen();
  if (mode === 'single') {
    handleReady();
  } else if (mode === 'test') {
    openTestMode();
  } else if (mode === 'spectate') {
    // 观战模式打开后等用户输入房间号
  }
  // multi 模式：显示联机大厅，用户自行操作
};

// 返回主菜单：解锁方向 + 退出全屏 + 恢复竖屏
const backToMenu = () => {
  gameMode.value = 'single';
  isInMenu.value = true;
  unlockOrientation();
  exitFullscreen();
  updateGameScale(); // 恢复桌面缩放
  // 清理语音连接
  closeAllPeerConnections();
};

// ============ 动态缩放（桌面 + 手机通用）============
const updateGameScale = () => {
  const desk = document.querySelector('.mahjong-desk');
  if (!desk) return;
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const isPortrait = vw < vh && vw <= 1024;

  if (isPortrait && !isInMenu.value) {
    // 手机竖屏游戏：fixed 居中 + rotate + scale
    const s = Math.min(vw / 533, vh / 960);
    desk.style.position = 'fixed';
    desk.style.top = '50%';
    desk.style.left = '50%';
    desk.style.marginLeft = '-480px';
    desk.style.marginTop = '-266.5px';
    desk.style.transform = `rotate(90deg) scale(${s})`;
    desk.style.transformOrigin = 'center center';
  } else if (isPortrait) {
    // 手机竖屏主菜单：恢复正常流
    desk.style.position = '';
    desk.style.top = '';
    desk.style.left = '';
    desk.style.marginLeft = '';
    desk.style.marginTop = '';
    desk.style.transform = '';
    desk.style.transformOrigin = '';
  } else {
    // 桌面：等比缩放铺满（不溢出）
    desk.style.position = '';
    desk.style.top = '';
    desk.style.left = '';
    desk.style.marginLeft = '';
    desk.style.marginTop = '';
    const s = Math.min(vw / 960, vh / 533) * 0.85;
    desk.style.transform = `scale(${s})`;
    desk.style.transformOrigin = 'center center';
  }
};
window.addEventListener('resize', updateGameScale);
window.addEventListener('orientationchange', () => setTimeout(updateGameScale, 400));

// ============ 文字聊天 ============
const showChatInput = ref(false);
const chatText = ref('');
const chatInputRef = ref(null);
const chatMessages = ref([]); // { id, from, fromName, text }
let chatMsgId = 0;
const myPlayerIndexForChat = ref(-1);

const toggleChat = () => {
  showChatInput.value = !showChatInput.value;
  if (showChatInput.value) {
    setTimeout(() => chatInputRef.value?.focus(), 100);
  }
};

const sendChat = () => {
  const text = chatText.value.trim();
  if (!text) { showChatInput.value = false; return; }
  // 本地消息
  const msg = { id: ++chatMsgId, from: myPlayerIndexForChat.value, fromName: multiState.playerName || '我', text };
  addChatMessage(msg);
  // 发送到服务器
  if (netState.roomId) {
    send({ type: 'chat', text, fromName: multiState.playerName });
  }
  chatText.value = '';
  showChatInput.value = false;
};

const addChatMessage = (msg) => {
  chatMessages.value.push(msg);
  setTimeout(() => {
    chatMessages.value = chatMessages.value.filter(m => m.id !== msg.id);
  }, 5000);
};

// ============ WebRTC 语音 ============
const micEnabled = ref(false);
const micLevel = ref(0); // 0-100 音量百分比
const localStream = ref(null);
const peerConnections = new Map(); // playerIndex → RTCPeerConnection
let audioContext = null;
let analyserNode = null;
let micLevelTimer = null;

const rtcConfig = {
  iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]
};

// 启动音量监测
const startMicLevelMonitor = (stream) => {
  try {
    if (!audioContext) audioContext = new (window.AudioContext || window.webkitAudioContext)();
    analyserNode = audioContext.createAnalyser();
    analyserNode.fftSize = 256;
    const source = audioContext.createMediaStreamSource(stream);
    source.connect(analyserNode);
    const dataArray = new Uint8Array(analyserNode.frequencyBinCount);
    const tick = () => {
      if (!micEnabled.value) { micLevel.value = 0; return; }
      analyserNode.getByteFrequencyData(dataArray);
      const avg = dataArray.reduce((a, b) => a + b, 0) / dataArray.length;
      micLevel.value = Math.min(100, Math.round(avg * 2));
      micLevelTimer = requestAnimationFrame(tick);
    };
    tick();
  } catch (e) { /* 静默 */ }
};

const stopMicLevelMonitor = () => {
  if (micLevelTimer) { cancelAnimationFrame(micLevelTimer); micLevelTimer = null; }
  micLevel.value = 0;
};

const toggleMic = async () => {
  if (micEnabled.value) {
    // 关闭麦克风
    localStream.value?.getAudioTracks().forEach(t => t.enabled = false);
    micEnabled.value = false;
    stopMicLevelMonitor();
  } else {
    try {
      if (!localStream.value) {
        localStream.value = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
        startMicLevelMonitor(localStream.value);
      }
      localStream.value.getAudioTracks().forEach(t => t.enabled = true);
      micEnabled.value = true;
      startMicLevelMonitor(localStream.value);
      if (netState.roomId) {
        setupVoiceWithRoom();
      }
    } catch (e) {
      console.log('麦克风权限被拒绝:', e);
    }
  }
};

const setupVoiceWithRoom = async () => {
  if (!localStream.value) return;
  const myIdx = netState.playerIndex;
  myPlayerIndexForChat.value = myIdx;
  netState.players.forEach((p, i) => {
    if (i !== myIdx && !peerConnections.has(i)) {
      createPeerConnection(i);
    }
  });
};

const createPeerConnection = (targetIdx) => {
  const pc = new RTCPeerConnection(rtcConfig);
  peerConnections.set(targetIdx, pc);

  // 添加本地音频流
  localStream.value?.getTracks().forEach(track => {
    pc.addTrack(track, localStream.value);
  });

  pc.onicecandidate = (e) => {
    if (e.candidate) {
      send({ type: 'webrtc_ice', to: targetIdx, data: e.candidate });
    }
  };

  pc.ontrack = (e) => {
    // 远端音频自动播放
    const audio = new Audio();
    audio.srcObject = e.streams[0];
    audio.play().catch(() => {});
  };

  // 创建 offer（发起方）
  pc.createOffer().then(offer => {
    pc.setLocalDescription(offer);
    send({ type: 'webrtc_offer', to: targetIdx, data: offer });
  }).catch(console.error);
};

const handleWebrtcSignal = (msg) => {
  const { type, from, data } = msg;
  let pc = peerConnections.get(from);

  if (type === 'webrtc_offer') {
    if (!pc) {
      pc = new RTCPeerConnection(rtcConfig);
      peerConnections.set(from, pc);
      localStream.value?.getTracks().forEach(track => {
        pc.addTrack(track, localStream.value);
      });
      pc.onicecandidate = (e) => {
        if (e.candidate) send({ type: 'webrtc_ice', to: from, data: e.candidate });
      };
      pc.ontrack = (e) => {
        const audio = new Audio();
        audio.srcObject = e.streams[0];
        audio.play().catch(() => {});
      };
    }
    pc.setRemoteDescription(new RTCSessionDescription(data));
    pc.createAnswer().then(answer => {
      pc.setLocalDescription(answer);
      send({ type: 'webrtc_answer', to: from, data: answer });
    }).catch(console.error);
  } else if (type === 'webrtc_answer') {
    if (pc) pc.setRemoteDescription(new RTCSessionDescription(data)).catch(console.error);
  } else if (type === 'webrtc_ice') {
    if (pc && data) pc.addIceCandidate(new RTCIceCandidate(data)).catch(console.error);
  }
};

const closeAllPeerConnections = () => {
  peerConnections.forEach(pc => pc.close());
  peerConnections.clear();
};

const spectateRoomInput = ref('');

const openTestMode = () => {
  window.open('/TJMJ/test.html?v=3', '_blank');
};

// 自动加入逻辑（URL参数）
const autoConnecting = ref(false);
onMounted(async () => {
  updateGameScale();
  const params = new URLSearchParams(location.search);
  const autoJoin = params.get('auto_join');
  if (autoJoin) {
    gameMode.value = 'multi';
    isInMenu.value = false;
    lockLandscape();
    autoConnecting.value = true;
    multiState.playerName = params.get('name') || '测试玩家';
    multiState.joinInput = autoJoin;
    try { await joinRoom(); } catch(e) {}
    autoConnecting.value = false;
  }
});

const startSpectate = () => {
  gameMode.value = 'spectate';
  spectateView.value = 0;
};

const joinSpectate = async () => {
  if (spectateRoomInput.value.length !== 4) return;
  try {
    await connect();
    setupNetworkListeners();
    send({ type: 'join_spectate', roomId: spectateRoomInput.value });
  } catch(e) {
    multiState.error = '连接失败';
  }
};

// 切换观战视角
const switchSpectateView = (viewIdx) => {
  if (gameMode.value !== 'spectate') return;
  spectateView.value = viewIdx;
  gameState.handTiles = [...(gameState.npcHands[viewIdx] || [])];
};

// === 联机模式 ===
const createRoom = async () => {
  multiState.creating = true;
  multiState.error = '';
  try {
    await connect();
    setupNetworkListeners();
    send({ type: 'create_room', name: multiState.playerName, avatar: gameState.players[0].avatar });
  } catch (e) {
    multiState.error = '连接服务器失败，请确认服务器已启动';
  }
  multiState.creating = false;
};

const onJoinKeyup = () => {
  // 只保留数字，满4位自动加入
  multiState.joinInput = multiState.joinInput.replace(/[^0-9]/g, '');
  if (multiState.joinInput.length >= 4) {
    multiState.joinInput = multiState.joinInput.slice(0, 4);
    joinRoom();
  }
};

const joinRoom = async () => {
  if (multiState.joinInput.length !== 4) return;
  multiState.joining = true;
  multiState.error = '';
  try {
    await connect();
    setupNetworkListeners();
    send({ type: 'join_room', roomId: multiState.joinInput, name: multiState.playerName, avatar: gameState.players[0].avatar });
  } catch (e) {
    multiState.error = '连接服务器失败';
  }
  multiState.joining = false;
};

const leaveRoom = () => {
  disconnect();
  netState.roomId = null;
};

const setupNetworkListeners = () => {
  on('room_created', (msg) => {
    multiState.roomId = msg.roomId;
    gameState.readyStatus[0] = true;
    myPlayerIndexForChat.value = msg.playerIndex;
    if (micEnabled.value) setupVoiceWithRoom();
  });

  on('room_joined', (msg) => {
    multiState.roomId = msg.roomId;
    gameState.readyStatus[0] = true;
    myPlayerIndexForChat.value = msg.playerIndex;
    // 如果麦克风已开，建立语音连接
    if (micEnabled.value) setupVoiceWithRoom();
  });

  on('room_players', (msg) => {
    console.log('[联机] room_players:', msg.players.map(p => p.name));
    msg.players.forEach((p, i) => {
      gameState.players[i].name = p.name || gameState.players[i].name;
      gameState.players[i].avatar = p.avatar || gameState.players[i].avatar;
      gameState.players[i].score = p.score != null ? p.score : gameState.players[i].score;
    });
    // 更新语音连接（新人加入时自动建连）
    if (micEnabled.value && netState.roomId) {
      setTimeout(() => setupVoiceWithRoom(), 500);
    }
  });

  on('error', (msg) => {
    multiState.error = msg.message;
  });

  on('spectate_joined', (msg) => {
    netState.roomId = msg.roomId;
    gameState.gamePhase = 'PLAYING';
    gameState.players = msg.players.map((p, i) => ({
      name: p.name, avatar: p.avatar, score: p.score,
    }));
  });

  on('game_start', (msg) => {
    gameState.gamePhase = 'PLAYING';
    gameState.discards = [];
    gameState.exposed = [[], [], [], []];
    gameState.handTiles = msg.hand;
    gameState.wangTile = msg.wangTile;
    gameState.diTile = msg.diTile;
    gameState.diIndex = msg.diIndex;
    gameState.dice = msg.dice;
    gameState.currentPlayerIndex = msg.currentPlayer;
    gameState.roundNumber = msg.roundNumber;
    gameState.deckRemaining = 108;
    gameState.wallTiles = msg.wallTiles || [];
    gameState.npcTileCounts = msg.tileCounts || [13, 13, 13, 13];
    // 更新所有玩家昵称和头像
    if (msg.players) msg.players.forEach((p, i) => {
      gameState.players[i].name = p.name || gameState.players[i].name;
      gameState.players[i].avatar = p.avatar || gameState.players[i].avatar;
    });
  });

  on('game_state', (msg) => {
    gameState.currentPlayerIndex = msg.currentPlayer;
    gameState.discards = msg.discards || [];
    gameState.exposed = msg.exposed || [[],[],[],[]];
    gameState.diTile = msg.diTile;
    gameState.diIndex = msg.diIndex;
    gameState.wangTile = msg.wangTile;
    gameState.dice = msg.dice;
    gameState.deckRemaining = msg.deckRemaining;
    gameState.wallTiles = msg.wallTiles || [];
    gameState.npcTileCounts = msg.tileCounts || [13, 13, 13, 13];
    // 没有待处理动作时重置按钮（由服务器控制，不自动超时）
    // 观战模式：显示所有玩家手牌
    if (gameMode.value === 'spectate' && msg.hands) {
      gameState.npcHands = msg.hands;
      gameState.handTiles = [...(msg.hands[spectateView.value] || [])];
    } else {
      // 保留手动排序：只增删，不动已有顺序
      if (msg.hand && msg.hand.length > 0) {
        const oldTiles = [...gameState.handTiles];
        const serverTiles = msg.hand;
        const removed = oldTiles.filter(t => !serverTiles.includes(t));
        const added = serverTiles.filter(t => !oldTiles.includes(t));
        let merged = oldTiles.filter(t => serverTiles.includes(t));
        added.forEach(t => merged.push(t)); // 新牌放最右
        // 只有牌数变化时才更新（避免覆盖拖拽排序）
        if (removed.length > 0 || added.length > 0) {
          gameState.handTiles = merged;
        }
      } else {
        gameState.handTiles = msg.hand || [];
      }
    }
  });

  on('your_turn', (msg) => {
    gameState.currentPlayerIndex = msg.playerIndex ?? 0;
  });

  on('drew_tile', (msg) => {
    gameState.handTiles.push(msg.tile); // 放最右边，不排序
    actionState.canGang = false;
  });

  on('action_prompt', (msg) => {
    actionState.sourceIndex = msg.fromPlayer;
    actionState.targetTile = msg.targetTile;
    actionState.canHu = msg.canHu;
    actionState.canGang = msg.canGang;
    actionState.canPeng = msg.canPeng;
    actionState.canChi = msg.canChi;
    actionState.chiCombinations = msg.chiCombinations || [];
    actionState.isWaiting = true;
  });

  on('waiting_action', (msg) => {
    actionState.isWaiting = false;
  });

  on('round_end', (msg) => {
    gameState.gamePhase = 'WAITING';
    gameState.showdownHands = msg.hands;
    gameState.players.forEach((p, i) => { p.score = msg.totalScores?.[i] || 0; });
    gameState.roundNumber = msg.roundNumber;
  });

  on('emoji_from', (msg) => {
    const desk = document.querySelector('.mahjong-desk');
    if (!desk) return;
    const rect = desk.getBoundingClientRect();
    const pos = [
      [rect.width / 2, rect.height - 60],   // 0=我(底)
      [rect.width - 40, rect.height / 2],   // 1=下家(右)
      [rect.width / 2, 40],                 // 2=对家(顶)
      [40, rect.height / 2],                // 3=上家(左)
    ];
    const [fromX, fromY] = pos[msg.from] || pos[0];
    const [tox, toy] = pos[msg.to] || pos[2];
    const id = ++emojiId;
    flyingEmojis.value.push({ id, icon: msg.icon, tx: tox - fromX, ty: toy - fromY, fromX, fromY });
    setTimeout(() => { flyingEmojis.value = flyingEmojis.value.filter(f => f.id !== id); }, 800);
  });

  on('score_update', (msg) => {
    if (msg.scores) msg.scores.forEach((s, i) => { gameState.players[i].score = s; });
  });

  on('disconnected', () => {
    gameState.gamePhase = 'WAITING';
    netState.roomId = null;
    alert('与服务器断开连接');
  });

  // === 聊天消息 ===
  on('chat', (msg) => {
    addChatMessage({ id: ++chatMsgId, from: msg.from, fromName: msg.fromName, text: msg.text });
  });

  // === WebRTC 语音信令 ===
  on('webrtc_offer', (msg) => handleWebrtcSignal(msg));
  on('webrtc_answer', (msg) => handleWebrtcSignal(msg));
  on('webrtc_ice', (msg) => handleWebrtcSignal(msg));
};

// 联机模式下发送操作
const multiDiscard = (tile) => send({ type: 'discard', tile });
const multiAction = (action, combo) => send({ type: 'action', action, combo });
const multiPass = () => send({ type: 'pass' });
const multiEmoji = (icon, target) => send({ type: 'emoji', icon, target });

// 下一局或结束
// 防御性分数保存（跨局不丢失）
let _savedScores = null;

const nextRoundOrFinish = () => {
  gameState.showdownHands = null;
  settlement.active = false;
  settlement.payments = [0, 0, 0, 0];
  settlement.confirmed = [false, false, false, false];
  gameState.zhaNiaoResult = null;
  if (gameState.roundNumber >= 16) {
    const summary = gameState.players.map((p, i) =>
      `${p.name}: ${p.score} 分`
    ).join('\n');
    alert(`🏆 16局结束！最终排名：\n${summary}`);
    gameState.roundNumber = 1;
    gameState.totalScores = [0, 0, 0, 0];
    gameState.players.forEach(p => p.score = 0);
    gameState.readyStatus = [false, false, false, false];
    gameState.dealerIndex = 0;
    gameState.gamePhase = 'WAITING';
    _savedScores = null;
    return;
  }
  // 保存本轮结束后的分数
  _savedScores = gameState.players.map(p => p.score);
  gameState.roundNumber++;
  gameState.dealerIndex = settlement.winnerIndex >= 0 ? settlement.winnerIndex : (gameState.dealerIndex + 1) % 4;
  if (gameMode.value === 'single') {
    gameState.gamePhase = 'WAITING';
    setTimeout(() => handleReady(), 200);
  }
};

const startRound = () => {
  // 防御性恢复跨局分数
  if (_savedScores) {
    _savedScores.forEach((s, i) => { gameState.players[i].score = s; });
    _savedScores = null;
  }

  actionState.isWaiting = false;
  actionState.targetTile = null;
  actionState.canChi = actionState.canPeng = actionState.canGang = actionState.canHu = false;

  gameState.gamePhase = 'PLAYING';
  gameState.readyStatus = [false, false, false, false];
  gameState.discards = [];
  gameState.exposed = [[], [], [], []];
  gameState.npcFirstTurnTing = [false, false, false, false];
  gameState.pendingDiHuChoice = null;
  gameState.zhaNiaoResult = null;
  
  const deck = initTiles();
  gameState.wallTiles = [...deck];
  gameState.deckRemaining = 108;

  const d1 = Math.floor(Math.random() * 6) + 1;
  const d2 = Math.floor(Math.random() * 6) + 1;
  gameState.dice = [d1, d2];

  // 使用正确的桃江麻将规则计算摸牌起始位置和扳王位置
  const dealPos = determineDealPosition(d1, d2, gameState.dealerIndex);
  gameState.drawCursor = dealPos.drawCursorStart;
  gameState.diIndex = dealPos.diIndex;
  gameState.diTile = gameState.wallTiles[gameState.diIndex];
  gameState.wangTile = calculateWang(gameState.diTile);

  gameState.handTiles = []; gameState.npcHands = [[], [], [], []];
  
  for(let i=0; i<53; i++) {
    let tile = physicalDraw();
    let player = Math.floor(i / 4) % 4; 
    if (i >= 48) player = i - 48; 
    if (i === 52) player = 0;     
    if (player === 0) { gameState.handTiles.push(tile); gameState.npcHands[0].push(tile); }
    else gameState.npcHands[player].push(tile);
  }
  
  gameState.handTiles.sort((a,b)=>a-b);
  gameState.npcHands.forEach(hand => hand.sort((a,b)=>a-b));
  gameState.npcTileCounts = [13, 13, 13, 13];
  gameState.currentPlayerIndex = 0;
  // 观战模式：初始视角
  if (gameMode.value === 'spectate') {
    gameState.handTiles = [...(gameState.npcHands[spectateView.value] || [])];
  }

  // 【起手胡/起手报听检测】
  // 庄家(玩家)14张：检查起手胡
  const dealerCheck = HuCalculator.checkFirstTurn(gameState.handTiles, gameState.wangTile, true);
  if (dealerCheck.canFirstTurnHu) {
    gameState.players[0].score += dealerCheck.score;
    gameState.gamePhase = 'WAITING';
    alert(`【起手胡！】庄家14张直接胡牌！(${dealerCheck.type}) 得 ${dealerCheck.score} 分！`);
    return;
  }
  // 闲家(NPC)13张：检查起手报听
  for (let p = 1; p <= 3; p++) {
    const ftCheck = HuCalculator.checkFirstTurn(gameState.npcHands[p], gameState.wangTile, false);
    if (ftCheck.canFirstTurnTing) {
      gameState.npcFirstTurnTing[p] = true;
      console.log(`【起手报听】${gameState.players[p].name} 起手听牌！`);
    }
  }
};

const physicalDraw = () => {
  if (gameState.drawCursor === gameState.diIndex) gameState.drawCursor = (gameState.drawCursor + 1) % 108;
  const tile = gameState.wallTiles[gameState.drawCursor];
  gameState.wallTiles[gameState.drawCursor] = null; 
  gameState.drawCursor = (gameState.drawCursor + 1) % 108; 
  gameState.deckRemaining--;
  return tile;
};

const isNewDrawnTile = (index) => index === gameState.handTiles.length - 1 && gameState.handTiles.length % 3 === 2;

const drawTile = (playerIndex) => {
  if (gameMode.value === 'multi') return; // 联机模式由服务器控制
  if (gameState.deckRemaining <= 4) {
    // 还剩2叠(4张)时流局
    gameState.showdownHands = [
      [...gameState.handTiles],
      [...gameState.npcHands[1]],
      [...gameState.npcHands[2]],
      [...gameState.npcHands[3]],
    ];
    gameState.gamePhase = 'WAITING';
    alert("🀄 牌山只剩4张，流局！本局无人胡牌。");
    return;
  }
  const newTile = physicalDraw();
  if (playerIndex === 0) {
    gameState.handTiles.push(newTile);
    actionState.canGang = RuleChecker.canAnGang(gameState.handTiles, gameState.wangTile).length > 0;
  } else {
    gameState.npcHands[playerIndex].push(newTile);
    gameState.npcTileCounts[playerIndex] = gameState.npcHands[playerIndex].length;
    const delay = gameMode.value === 'spectate' ? 300 : 1000;
    setTimeout(() => npcPlayPhase(playerIndex), delay);
  }
};

const isMyTurn = () => {
  if (gameMode.value === 'multi') return gameState.currentPlayerIndex === netState.playerIndex;
  return gameState.currentPlayerIndex === 0;
};

const getMyExposed = () => {
  const idx = gameMode.value === 'multi' ? netState.playerIndex : 0;
  return gameState.exposed[idx] || [];
};

// 根据当前玩家座位，把绝对座位映射到显示方位
const mySeat = () => gameMode.value === 'multi' ? netState.playerIndex : 0;
const seat = (dir) => (mySeat() + dir) % 4; // dir: 0=自己 1=下家 2=对家 3=上家

const onTapTile = (index) => {
  if (gameState.selectedTileIndex === index) {
    // 允许出牌：3n+2(刚摸牌) 或 3n(刚吃碰完)
    const canDiscard = gameState.handTiles.length % 3 === 2 || gameState.handTiles.length % 3 === 0;
    if (isMyTurn() && canDiscard && !actionState.isWaiting) {
      playTile(index);
    }
  } else {
    gameState.selectedTileIndex = index;
  }
};

// === 手牌拖拽排序 ===
const onDragStart = (index, e) => {
  dragIndex.value = index;
  e.dataTransfer.effectAllowed = 'move';
  e.dataTransfer.setData('text/plain', index);
};

const onDragOver = (index) => {
  if (dragIndex.value === -1 || dragIndex.value === index) return;
  dragOverIndex.value = index;
  // 实时交换
  const tiles = gameState.handTiles;
  const dragged = tiles[dragIndex.value];
  tiles.splice(dragIndex.value, 1);
  tiles.splice(index, 0, dragged);
  dragIndex.value = index;
  // 同步更新选中索引
  if (gameState.selectedTileIndex === dragIndex.value) gameState.selectedTileIndex = index;
};

const onDragLeave = (index) => {
  if (dragOverIndex.value === index) dragOverIndex.value = -1;
};

const onDrop = (index) => {
  dragOverIndex.value = -1;
  dragIndex.value = -1;
};

const onDragEnd = () => {
  dragIndex.value = -1;
  dragOverIndex.value = -1;
};

// ============ 手机端触摸拖拽手牌 ============
let touchActive = false;
const onTouchStart = (index, e) => {
  touchActive = true;
  dragIndex.value = index;
};
const onTouchMove = (e) => {
  if (!touchActive || dragIndex.value === -1) return;
  const touch = e.touches[0];
  const tiles = document.querySelectorAll('.hand-tile-wrapper');
  let target = dragIndex.value;
  tiles.forEach((el, i) => {
    const r = el.getBoundingClientRect();
    if (touch.clientX >= r.left && touch.clientX <= r.right &&
        touch.clientY >= r.top && touch.clientY <= r.bottom) {
      target = i;
    }
  });
  if (target !== dragIndex.value && target >= 0 && target < gameState.handTiles.length) {
    const tilesArr = gameState.handTiles;
    const dragged = tilesArr[dragIndex.value];
    tilesArr.splice(dragIndex.value, 1);
    tilesArr.splice(target, 0, dragged);
    dragIndex.value = target;
    if (gameState.selectedTileIndex === dragIndex.value) gameState.selectedTileIndex = target;
  }
};
const onTouchEnd = () => {
  touchActive = false;
  dragIndex.value = -1;
  dragOverIndex.value = -1;
};

const playTile = (index) => {
  const val = gameState.handTiles[index];
  gameState.handTiles.splice(index, 1);
  gameState.handTiles.sort((a, b) => a - b);
  gameState.selectedTileIndex = -1;
  clearTimeout(turnTimer);
  playDong();
  if (gameMode.value === 'multi') {
    gameState.discards.push({ value: val }); // 本地先显示
    multiDiscard(val);
  } else {
    gameState.discards.push({ value: val });
    handleTileDiscarded(0, val);
  }
};

const npcPlayPhase = (playerIndex) => {
  let hand = gameState.npcHands[playerIndex];
  // 使用AI策略选择要打出的牌
  const strategy = new NpcStrategy(hand, gameState.wangTile, gameState.exposed[playerIndex], gameState.discards, gameState.deckRemaining);
  const tileToPlay = strategy.chooseDiscard();
  if (tileToPlay === null) {
    // fallback: random
    hand.splice(Math.floor(Math.random() * hand.length), 1)[0];
    gameState.discards.push({ value: tileToPlay || hand[0] });
  } else {
    hand.splice(hand.indexOf(tileToPlay), 1);
    gameState.discards.push({ value: tileToPlay });
  }
  gameState.npcTileCounts[playerIndex] = hand.length;
  playDong();
  // 观战模式：同步视角
  if (gameMode.value === 'spectate') {
    gameState.handTiles = [...(gameState.npcHands[spectateView.value] || [])];
  }
  handleTileDiscarded(playerIndex, tileToPlay);
};

const handleTileDiscarded = (sourceIndex, targetTile) => {
  if (gameMode.value === 'multi') return; // 联机模式由服务器处理
  let intercepts = { hu: [], gang: [], peng: [], chi: [] };
  actionState.chiCombinations = [];

  for(let i=1; i<=3; i++) {
    let p = (sourceIndex + i) % 4;
    let hand = (p === 0) ? gameState.handTiles : gameState.npcHands[p];

    const huCheck = HuCalculator.checkHu([...hand, targetTile], gameState.wangTile, gameState.diTile, false);
	    // 有癞子不能抓炮，只有 canCatchCannon 的玩家才能拦截别人打出的牌
	    if (huCheck.canHu && huCheck.canCatchCannon) intercepts.hu.push(p);
    if (RuleChecker.canMingGang(hand, targetTile, gameState.wangTile)) intercepts.gang.push(p);
    if (RuleChecker.canPeng(hand, targetTile)) intercepts.peng.push(p);

    if (i === 1) { 
       let combos = RuleChecker.canChi(hand, targetTile);
       if (combos) {
          intercepts.chi.push(p);
          if (p === 0) actionState.chiCombinations = combos;
       }
    }
  }

  if (intercepts.hu.length > 0) {
    if (intercepts.hu.includes(0)) return promptPlayerAction(sourceIndex, targetTile, { canHu: true });
    else return executeNpcAction(intercepts.hu[0], 'hu', targetTile, sourceIndex);
  }
  if (intercepts.gang.length > 0) {
    if (intercepts.gang.includes(0)) return promptPlayerAction(sourceIndex, targetTile, { canGang: true });
    else return executeNpcAction(intercepts.gang[0], 'gang', targetTile, sourceIndex);
  }
  if (intercepts.peng.length > 0) {
    if (intercepts.peng.includes(0)) return promptPlayerAction(sourceIndex, targetTile, { canPeng: true });
    else return executeNpcAction(intercepts.peng[0], 'peng', targetTile, sourceIndex);
  }
  if (intercepts.chi.length > 0) {
    if (intercepts.chi.includes(0)) return promptPlayerAction(sourceIndex, targetTile, { canChi: true });
    else return executeNpcAction(intercepts.chi[0], 'chi', targetTile, sourceIndex);
  }

  nextTurn();
};

const promptPlayerAction = (sourceIndex, targetTile, actions) => {
  actionState.sourceIndex = sourceIndex;
  actionState.targetTile = targetTile;
  actionState.canHu = !!actions.canHu;
  actionState.canGang = !!actions.canGang;
  actionState.canPeng = !!actions.canPeng;
  actionState.canChi = !!actions.canChi;
  actionState.isWaiting = true;
};

const executeNpcAction = (npcIndex, actionType, targetTile, discarderIndex = -1) => {
  setTimeout(() => {
    let hand = gameState.npcHands[npcIndex];
    if (actionType === 'hu') {
       const scoreRes = HuCalculator.checkHu([...hand, targetTile], gameState.wangTile, gameState.diTile, false);
       speak('hu');
       finalizeHu(npcIndex, scoreRes, false, discarderIndex >= 0 ? discarderIndex : npcIndex);
    } else if (actionType === 'gang') {
       // 【抢杠检测】NPC明杠前检查是否有人能胡
       const robbers = checkRobGang(npcIndex, targetTile);
       if (robbers.length > 0) {
         const robber = robbers[0];
         const robberName = robber.player === 0 ? '你' : gameState.players[robber.player].name;
         gameState.players[npcIndex].score -= robber.score;
         gameState.players[robber.player].score += robber.score;
         gameState.gamePhase = 'WAITING';
         alert(`【抢杠！】${robberName} 抢杠胡了！(${robber.type}) 得 ${robber.score} 分！\n${gameState.players[npcIndex].name}(杠牌者)赔 ${robber.score} 分。`);
         return;
       }
       for(let i=0; i<3; i++) hand.splice(hand.indexOf(targetTile), 1);
       gameState.discards.pop();
       gameState.exposed[npcIndex].push({ type: 'minggang', tiles: [targetTile, targetTile, targetTile, targetTile] });
       gameState.npcTileCounts[npcIndex] = hand.length;
       gameState.currentPlayerIndex = npcIndex;
       speak('gang');
       setTimeout(() => npcPlayPhase(npcIndex), 800);
    } else if (actionType === 'peng') {
       // 使用AI策略决定是否碰
       const strategy = new NpcStrategy(hand, gameState.wangTile, gameState.exposed[npcIndex], gameState.discards, gameState.deckRemaining);
       if (!strategy.shouldPeng(targetTile)) {
         nextTurn(); return; // AI选择不碰
       }
       for(let i=0; i<2; i++) hand.splice(hand.indexOf(targetTile), 1);
       gameState.discards.pop();
       gameState.exposed[npcIndex].push({ type: 'peng', tiles: [targetTile, targetTile, targetTile] });
       gameState.npcTileCounts[npcIndex] = hand.length;
       gameState.currentPlayerIndex = npcIndex;
       speak('peng');
       setTimeout(() => npcPlayPhase(npcIndex), 800);
    } else if (actionType === 'chi') {
       let combos = RuleChecker.canChi(hand, targetTile);
       // 使用AI策略选择最优吃法
       const strategy = new NpcStrategy(hand, gameState.wangTile, gameState.exposed[npcIndex], gameState.discards, gameState.deckRemaining);
       let combo = strategy.shouldChi(combos, targetTile) || combos[0];
       combo.forEach(t => hand.splice(hand.indexOf(t), 1));
       gameState.discards.pop();
       gameState.exposed[npcIndex].push({ type: 'chi', tiles: [combo[0], targetTile, combo[1]].sort((a,b)=>a-b) });
       gameState.npcTileCounts[npcIndex] = hand.length;
       gameState.currentPlayerIndex = npcIndex;
       speak('chi');
       setTimeout(() => npcPlayPhase(npcIndex), 800);
    }
  }, 600); 
};

const handlePeng = () => {
  if (!actionState.canPeng) return;
  const target = actionState.targetTile;
  if (gameMode.value === 'multi') {
    multiAction('peng');
    actionState.isWaiting = false;
    return;
  }
  for(let i=0; i<2; i++) gameState.handTiles.splice(gameState.handTiles.indexOf(target), 1);
  gameState.discards.pop();
  gameState.exposed[0].push({ type: 'peng', tiles: [target, target, target] });
  actionState.isWaiting = false;
  gameState.currentPlayerIndex = 0;
  speak('peng');
};

const handleChi = () => {
  // 单一吃法时直接调用
  if (!actionState.canChi) return;
  handleChiWithCombo(actionState.chiCombinations[0]);
};

const handleChiWithCombo = (combo) => {
  if (gameMode.value === 'multi') {
    multiAction('chi', combo);
    actionState.isWaiting = false;
    return;
  }
  const target = actionState.targetTile;
  combo.forEach(t => gameState.handTiles.splice(gameState.handTiles.indexOf(t), 1));
  gameState.discards.pop();
  gameState.exposed[0].push({ type: 'chi', tiles: [combo[0], target, combo[1]].sort((a,b)=>a-b) });
  actionState.isWaiting = false;
  actionState.canChi = false;
  gameState.currentPlayerIndex = 0;
  speak('chi');
};

// 抢杠检测：明杠时检查其他玩家是否能胡此牌（抢杠无视王限制）
const checkRobGang = (gangPlayerIndex, gangTile) => {
  const robbers = [];
  for (let i = 1; i <= 3; i++) {
    const p = (gangPlayerIndex + i) % 4;
    const hand = (p === 0) ? gameState.handTiles : gameState.npcHands[p];
    const huCheck = HuCalculator.checkHu([...hand, gangTile], gameState.wangTile, gameState.diTile, false);
    // 抢杠无视王限制（canCatchCannon 不适用）
    if (huCheck.canHu) robbers.push({ player: p, type: huCheck.type, score: huCheck.score });
  }
  return robbers;
};

const handleGang = () => {
  if (!actionState.canGang) return;
  if (gameMode.value === 'multi') {
    multiAction('gang');
    actionState.isWaiting = false;
    return;
  }
  let gangTile = null; let type = '';
  if (actionState.isWaiting && actionState.targetTile) {
    gangTile = actionState.targetTile; type = 'minggang';

    // 【抢杠检测】明杠前检查是否有人能胡此牌
    const robbers = checkRobGang(0, gangTile);
    if (robbers.length > 0) {
      // 有人抢杠！杠牌者全赔给抢杠者
      const robber = robbers[0]; // 按逆时针优先
      const robberName = robber.player === 0 ? '我' : gameState.players[robber.player].name;
      gameState.players[0].score -= robber.score;
      gameState.players[robber.player].score += robber.score;
      actionState.isWaiting = false;
      actionState.canGang = false;
      gameState.gamePhase = 'WAITING';
      alert(`【抢杠！】${robberName} 抢杠胡了！(${robber.type}) 得 ${robber.score} 分！\n你(杠牌者)赔 ${robber.score} 分。`);
      return;
    }

    for(let i=0; i<3; i++) gameState.handTiles.splice(gameState.handTiles.indexOf(gangTile), 1);
    gameState.discards.pop();
    gameState.exposed[0].push({ type, tiles: [gangTile, gangTile, gangTile, gangTile] });
  } else {
    const gangTiles = RuleChecker.canAnGang(gameState.handTiles, gameState.wangTile); gangTile = gangTiles[0]; type = 'angang';
    for(let i=0; i<4; i++) gameState.handTiles.splice(gameState.handTiles.indexOf(gangTile), 1);
    gameState.exposed[0].push({ type, tiles: [gangTile, gangTile, gangTile, gangTile] });
  }
  actionState.isWaiting = false;
  gameState.currentPlayerIndex = 0;
  speak(type === 'angang' ? 'angang' : 'minggang');
  alert(`触发${type === 'angang' ? '暗杠' : '明杠'}！\n重新掷骰子摸牌。`);
  drawTile(0);
};

const passAction = () => {
  actionState.isWaiting = false;
  actionState.canChi = actionState.canPeng = actionState.canGang = actionState.canHu = false;
  if (gameMode.value === 'multi') { multiPass(); return; }
  nextTurn();
};

// === 手动结算系统 ===
const settlement = reactive({
  active: false,
  winnerIndex: -1,
  payments: [0, 0, 0, 0],
  confirmed: [false, false, false, false],
  numpadFor: -1,
  numpadValue: '',
});

const confirmPayment = (idx) => {
  if (settlement.payments[idx] > 0) settlement.confirmed[idx] = true;
};

const openNumpad = (playerIndex) => {
  if (playerIndex === mySeat()) return; // 不能给自己付
  settlement.numpadFor = playerIndex;
  settlement.numpadValue = '';
};

const numpadInput = (digit) => {
  settlement.numpadValue += String(digit);
};

const numpadConfirm = () => {
  const val = parseInt(settlement.numpadValue) || 0;
  const payer = settlement.numpadFor;
  const myIdx = mySeat();
  if (payer >= 0 && val > 0 && payer !== myIdx) {
    // 如果结算中，必须付给赢家；否则自由选择
    const toIdx = settlement.active ? settlement.winnerIndex : payer;
    if (toIdx !== myIdx) {
      gameState.players[toIdx].score += val;
      gameState.players[myIdx].score -= val;
      if (gameMode.value === 'multi') send({ type: 'pay', to: toIdx, amount: val });
      if (settlement.active) settlement.payments[myIdx] = val;
    }
  }
  settlement.numpadFor = -1;
  settlement.numpadValue = '';
};

// 扎鸟（中马）：胡牌后翻下一张牌，根据个位数翻倍（仅用于展示，不计分）
const zhaNiao = (winnerIndex) => {
  // 从牌墙摸下一张（本该下家摸的牌）
  if (gameState.deckRemaining <= 0) return { niaoTile: null, multipliers: [1, 1, 1, 1] };
  const niaoTile = physicalDraw();
  const digit = niaoTile % 10;
  const multipliers = [1, 1, 1, 1];

  // 扎鸟规则：庄家1/5/9全中，下家2/6，对家3/7，上家4/8
  if (digit === 1 || digit === 5 || digit === 9) {
    multipliers[0] = 2; multipliers[1] = 2; multipliers[2] = 2; multipliers[3] = 2;
    gameState.zhaNiaoResult = { niaoTile, type: '全中', pos: 'all' };
  } else if (digit === 2 || digit === 6) {
    multipliers[(winnerIndex + 1) % 4] = 2;
    gameState.zhaNiaoResult = { niaoTile, type: '下家中', pos: (winnerIndex + 1) % 4 };
  } else if (digit === 3 || digit === 7) {
    multipliers[(winnerIndex + 2) % 4] = 2;
    gameState.zhaNiaoResult = { niaoTile, type: '对家中', pos: (winnerIndex + 2) % 4 };
  } else if (digit === 4 || digit === 8) {
    multipliers[(winnerIndex + 3) % 4] = 2;
    gameState.zhaNiaoResult = { niaoTile, type: '上家中', pos: (winnerIndex + 3) % 4 };
  } else {
    gameState.zhaNiaoResult = { niaoTile, type: '未中', pos: null };
  }
  return { niaoTile, multipliers };
};

// 执行玩家胡牌结算
const executePlayerHu = (handToCheck, isSelfDraw, discarderIndex = -1) => {
  const isFirst = gameState.deckRemaining >= 54;
  const result = HuCalculator.checkHu(handToCheck, gameState.wangTile, gameState.diTile, isFirst);

  if (!result.canHu) {
    alert("系统判定没胡！");
    return;
  }

  // 地胡带拖：弹出选择
  if (result.canDrag && isSelfDraw) {
    gameState.pendingDiHuChoice = { handTiles: [...handToCheck], result };
    return;
  }

  finalizeHu(0, result, isSelfDraw, discarderIndex);
};

// 最终结算胡牌
// sourceDiscarderIndex: 抓炮时打出牌的人的index（自摸时为 -1）
const finalizeHu = (playerIndex, huResult, isSelfDraw, sourceDiscarderIndex = -1) => {
  // 扎鸟（仅展示，不计分）
  zhaNiao(playerIndex);
  const niaoInfo = gameState.zhaNiaoResult;

  // 保存亮牌数据
  gameState.showdownHands = [
    [...gameState.handTiles],
    [...gameState.npcHands[1]],
    [...gameState.npcHands[2]],
    [...gameState.npcHands[3]],
  ];

  // 音效
  playWin();
  speak(isSelfDraw ? 'zimo' : 'hu');

  // 启动手动结算
  settlement.active = true;
  settlement.winnerIndex = playerIndex;
  settlement.payments = [0, 0, 0, 0];
  settlement.confirmed = [false, false, false, false];
  // NPC自动支付随机金额并确认
  setTimeout(() => {
    [0,1,2,3].forEach(i => {
      if (i !== playerIndex && gameMode.value === 'single') {
        settlement.payments[i] = Math.floor(Math.random() * 10) + 1;
        gameState.players[playerIndex].score += settlement.payments[i];
        gameState.players[i].score -= settlement.payments[i];
        settlement.confirmed[i] = true;
      }
    });
  }, 1500);

  // 展��扎鸟信息
  let msg = `${gameState.players[playerIndex].name} 胡牌了！(${huResult.type})`;
  if (niaoInfo && niaoInfo.niaoTile) {
    msg += `\n🀄 扎鸟：${niaoInfo.niaoTile % 10} → ${niaoInfo.type}`;
  }
  msg += `\n请其他玩家点击赢家分数，手动输入支付金额`;

  gameState.pendingDiHuChoice = null;
  gameState.gamePhase = 'SETTLEMENT';
};

const handleHu = () => {
  if (!actionState.canHu && !(isMyTurn() && gameState.handTiles.length % 3 === 2)) return;

  if (gameMode.value === 'multi') {
    multiAction('hu');
    actionState.isWaiting = false;
    return;
  }

  let handToCheck = [...gameState.handTiles];
  const isSelfDraw = !actionState.isWaiting || !actionState.targetTile;
  const discarderIndex = !isSelfDraw ? actionState.sourceIndex : -1;
  if (!isSelfDraw) handToCheck.push(actionState.targetTile);

  // 地胡带拖选择中...
  if (gameState.pendingDiHuChoice) return;

  executePlayerHu(handToCheck, isSelfDraw, discarderIndex);
  actionState.isWaiting = false;
};

// 地胡带拖：用户选择直接胡
const handleDiHuDirect = () => {
  if (!gameState.pendingDiHuChoice) return;
  const { handTiles, result } = gameState.pendingDiHuChoice;
  // 直接胡：使用原始结果（canDrag被设为false防止递归）
  const directResult = { ...result, canDrag: false, score: 6, type: "地胡" };
  finalizeHu(0, directResult, true);
};

// 地胡带拖：用户选择带拖（3张地牌用作一句话 = 3倍）
const handleDiHuDrag = () => {
  if (!gameState.pendingDiHuChoice) return;
  const dragResult = { canHu: true, type: "地胡带拖", score: 9, hasWang: false, canCatchCannon: true, canDrag: false };
  finalizeHu(0, dragResult, true);
};

const nextTurn = () => {
  actionState.isWaiting = false;
  actionState.canChi = actionState.canPeng = actionState.canGang = actionState.canHu = false;
  gameState.currentPlayerIndex = (gameState.currentPlayerIndex + 1) % 4;
  startTurnTimer();
  const delay = gameMode.value === 'spectate' ? 150 : 500;
  setTimeout(() => drawTile(gameState.currentPlayerIndex), delay);
};
</script>

<style scoped>
/* 基础容器 */
.app-container { display: flex; justify-content: center; align-items: center; width: 100vw; height: 100vh; background-color: #000; overflow: hidden; user-select: none; -webkit-user-select: none; }
body { overflow: hidden; margin: 0; }
.mahjong-desk * { cursor: default; }
input, button, .clickable, .action-btn.active, .emoji-option { cursor: pointer; }

/* The wrapper that handles the rotation */
#game-wrapper {
  display: flex;
  justify-content: center;
  align-items: center;
  width: 100%;
  height: 100%;
}

/* 麻将桌：固定尺寸，通过 transform scale 适配屏幕 */
.mahjong-desk { position: relative; width: 960px; height: 533px; background-color: #215c32; overflow: hidden; box-shadow: 0 0 30px #000; color: white; border: 4px solid #1a472a; border-radius: 10px; }

/* 准备遮罩层 */
.ready-overlay { position: absolute; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.8); display: flex; flex-direction: column; justify-content: center; align-items: center; z-index: 999; }
.ready-players { display: flex; gap: 40px; margin: 30px 0; }
.ready-player { display: flex; flex-direction: column; align-items: center; position: relative; }
.ready-avatar { width: 60px; height: 60px; border-radius: 10px; border: 3px solid #555; transition: 0.3s; }
.ready-avatar.is-ready { border-color: #4CAF50; box-shadow: 0 0 15px #4CAF50; }
.ready-badge { position: absolute; bottom: 20px; background: #4CAF50; color: white; padding: 2px 8px; border-radius: 10px; font-size: 12px; font-weight: bold; }
.btn-ready { padding: 12px 40px; font-size: 20px; font-weight: bold; background: linear-gradient(145deg, #ffcc00, #ff9900); border: none; border-radius: 30px; cursor: pointer; color: white; box-shadow: 0 4px 15px rgba(255,153,0,0.5); transition: 0.2s; }
.btn-ready:active { transform: scale(0.95); }

/* 模式选择 + 联机大厅 */
.mode-select-overlay { position: absolute; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.85); display: flex; justify-content: center; align-items: center; z-index: 999; }
.mode-dialog { text-align: center; color: white; position: relative; overflow: hidden; }
.mode-dialog h2 { font-size: 36px; margin-bottom: 30px; color: #ffd700; }
.mode-dialog { transform: scale(1.1); }
.mode-btn { display: block; width: 260px; margin: 12px auto; padding: 14px; font-size: 18px; font-weight: bold; border: 2px solid #555; border-radius: 16px; cursor: pointer; background: rgba(255,255,255,0.1); color: white; transition: 0.2s; }
.mode-btn:hover { background: rgba(255,255,255,0.2); border-color: #ffd700; }
.mode-btn:active { background: rgba(255,255,255,0.3); transform: scale(0.95); }
.mode-btn:disabled { background: rgba(255,255,255,0.03); border-color: #333; color: #555; cursor: not-allowed; }

/* 移动端主菜单：竖屏大字大按钮 */
@media screen and (max-width: 1024px) and (orientation: portrait) {
  .mode-select-overlay {
    /* 主菜单不旋转，正常竖屏显示 */
  }
  .mode-dialog {
    transform: none;
    padding: 20px;
  }
  .mode-dialog h2 {
    font-size: 48px;
    margin-bottom: 40px;
  }
  .mode-btn {
    width: 80vw;
    max-width: 360px;
    padding: 18px;
    font-size: 22px;
    margin: 16px auto;
    border-radius: 20px;
  }
  .anime-emoji {
    font-size: 48px;
  }
}

/* 赛博动画 */
.mode-anime { display: flex; justify-content: center; gap: 12px; margin-bottom: 20px; }
.anime-emoji { font-size: 36px; display: inline-block; animation: cyberDance 1.5s ease-in-out infinite; }
.anime-emoji.a1 { animation-delay: 0s; }
.anime-emoji.a2 { animation-delay: 0.2s; }
.anime-emoji.a3 { animation-delay: 0.4s; }
.anime-emoji.a4 { animation-delay: 0.6s; }
.anime-emoji.a5 { animation-delay: 0.8s; }
.anime-emoji.a6 { animation-delay: 1.0s; }
@keyframes cyberDance {
  0%, 100% { transform: translateY(0) scale(1); opacity: 0.8; }
  25%  { transform: translateY(-12px) scale(1.2); opacity: 1; }
  50%  { transform: translateY(0) scale(0.9) rotate(-5deg); opacity: 0.7; }
  75%  { transform: translateY(-8px) scale(1.15) rotate(5deg); opacity: 1; }
}

.lobby-dialog { text-align: center; color: white; padding: 20px; }
.lobby-dialog h2 { font-size: 22px; margin-bottom: 18px; color: #ffd700; }
.lobby-input { display: block; width: 220px; margin: 10px auto; padding: 10px 14px; font-size: 16px; border: 2px solid #555; border-radius: 10px; background: rgba(255,255,255,0.1); color: white; text-align: center; outline: none; }
.lobby-input:focus { border-color: #ffd700; }
.lobby-input.room-code { font-size: 24px; letter-spacing: 8px; text-transform: uppercase; }
.lobby-btn { display: block; width: 250px; margin: 10px auto; padding: 12px; font-size: 16px; font-weight: bold; border: none; border-radius: 12px; cursor: pointer; color: white; transition: 0.2s; }
.lobby-btn.create { background: linear-gradient(145deg, #4CAF50, #2E7D32); }
.lobby-btn.join { background: linear-gradient(145deg, #2196F3, #1565C0); }
.lobby-btn:disabled { opacity: 0.4; cursor: default; }
.lobby-divider { margin: 16px 0; color: #888; font-size: 14px; }
.lobby-error { color: #f44336; margin: 8px 0; font-size: 14px; }
.lobby-back { margin-top: 16px; background: none; border: none; color: #999; cursor: pointer; font-size: 14px; }
.lobby-info { color: #aaa; font-size: 13px; margin: 10px 0; }
.room-players { display: flex; flex-direction: column; gap: 8px; margin: 15px 0; }
.room-player { display: flex; justify-content: space-between; align-items: center; padding: 8px 16px; background: rgba(255,255,255,0.08); border-radius: 8px; font-size: 15px; }
.room-player.empty { color: #666; }

/* 牌墙 */
.walls-container { position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); width: 55%; height: 50%; pointer-events: none; z-index: 1;}
.wall { position: absolute; display: flex; }

/* 对家牌堆位置调整区 */
.wall-top { top: -8px; left: 50%; transform: translateX(-50%); }
.wall-bottom { bottom: -30px; left: 50%; transform: translateX(-50%); }
.wall-left { top: 45%; left: -10px; transform: translateY(-50%); flex-direction: column; }
.wall-right { top: 45%; right: -10px; transform: translateY(-50%); flex-direction: column; }
.wall-stack-wrapper { position: relative; }
.h-stack { width: 24px; height: 34px; margin: -1px; }
.v-stack { width: 34px; height: 24px; margin: -1px; }
.stack-bottom { position: absolute; top: 0; left: 0; }
.stack-top { position: absolute; top: -10px; left: 0; z-index: 2; }
.h-bg { width: 24px; height: 34px; }
.v-bg { width: 34px; height: 24px; }

/* 扳王 UI 调整区 */
.di-face { background: white; border: 1px solid #ccc; border-radius: 2px; box-shadow: 0 0px 0px rgba(0,0,0,0.6); z-index: 5;}
.h-face { top: -11px; left: 2px; width: 18px; height: 25px; }
.v-face { top: -15px; left: 7px; width: 18px; height: 28px; transform: rotate(-90deg); }

/* 头像与分数板 — 紧凑排列 */
.avatar-box { display: flex; flex-direction: column; align-items: center; width: 50px; z-index: 10; transition: 0.3s; opacity: 0.7; line-height: 1.1; }
.avatar-img { width: 38px; height: 38px; border-radius: 8px; border: 2px solid #444; background: #fff; }
.active-glow { opacity: 1; transform: scale(1.05); }
.active-glow .avatar-img { border-color: #ffd700; box-shadow: 0 0 12px #ffd700; }
.name { font-size: 11px; margin-top: 1px; text-shadow: 1px 1px 2px #000; line-height: 1.2; }
.ting-badge { display: inline-block; background: #ff5722; color: white; font-size: 9px; padding: 0px 3px; border-radius: 6px; margin-left: 2px; vertical-align: middle; font-weight: bold; }
.score { font-size: 13px; font-weight: bold; margin-top: 0px; text-shadow: 1px 1px 2px #000; line-height: 1.2; }
.score-up { color: #4CAF50; }
.score-down { color: #F44336; }

/* 亮牌展示面板 */
.showdown-overlay { position: absolute; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.85); display: flex; justify-content: center; align-items: center; z-index: 1000; }
.showdown-panel { background: #1a3a1a; border: 3px solid #ffd700; border-radius: 12px; padding: 15px 25px; text-align: center; color: white; max-width: 90%; }
.showdown-panel h3 { color: #ffd700; margin: 0 0 10px; font-size: 18px; }
.showdown-row { display: flex; align-items: center; gap: 10px; margin: 6px 0; background: rgba(255,255,255,0.1); padding: 4px 8px; border-radius: 6px; }
.showdown-name { font-size: 13px; font-weight: bold; min-width: 40px; }
.showdown-tiles { display: flex; gap: 2px; flex-wrap: wrap; flex: 1; }
.showdown-tile-wrapper { position: relative; width: 24px; height: 34px; display: inline-block; }
.showdown-tile-bg { position: absolute; width: 100%; height: 100%; z-index: 0; }
.showdown-tile-face { position: absolute; top: 2px; left: calc(50% + 65px); transform: translateX(-50%); width: 19px; height: 26px; z-index: 2; }
.showdown-score { font-size: 14px; font-weight: bold; min-width: 45px; text-align: right; }
.showdown-round { font-size: 13px; margin: 8px 0; color: #aaa; }

/* 局数角标 */
.round-badge { position: absolute; top: 8px; right: 12px; background: rgba(0,0,0,0.5); color: #ffd700; padding: 2px 10px; border-radius: 10px; font-size: 13px; font-weight: bold; z-index: 50; }

/* === 排版容器：解决重叠问题 === */
.cards-container-top { display: flex; flex-direction: column; align-items: center; gap: 8px; }
.cards-container-side { display: flex; flex-direction: row; align-items: center; gap: 15px; }

.player-top { position: absolute; top: 15px; left: 50%; transform: translateX(-50%); display: flex; align-items: center; gap: 15px; }
.player-left { position: absolute; left: 15px; top: 50%; transform: translateY(-50%); display: flex; flex-direction: column; align-items: center; gap: 10px; }
.player-right { position: absolute; right: 15px; top: 50%; transform: translateY(-50%); display: flex; flex-direction: column; align-items: center; gap: 10px; }

.hand-tiles-right, .hand-tiles-left { display: flex; flex-direction: column; gap: -5px; }
.tile-back-side { width: 18px; height: 28px; margin-top: -10px; } 
.tile-back-top { width: 26px; height: 36px; margin-left: 0px; }

/* === 极致精简且带 3D 旋转的 NPC 副露区 === */
.npc-exposed { display: flex; gap: 1px; } 
.left-exposed, .right-exposed { flex-direction: column; }

/* 为顶家压缩一下横向吃碰的空间 */
.rotator-top { position: relative; width: 24px; height: 34px; }
.rotator-top .center-tile-bg { width: 100%; height: 100%; position: absolute; top:0; left:0; }
.rotator-top .center-tile-face { position: absolute; top: 1px; left: 50%; transform: translateX(-50%); width: 18px; height: 26px; z-index: 2; }

/* 侧边容器：专门用来旋转而不破坏布局 */
.npc-exposed-wrapper-side { width: 34px; height: 24px; position: relative; display: flex; justify-content: center; align-items: center; }
.rotator { width: 24px; height: 34px; position: relative; } 
.rotator-left { transform: rotate(-90deg); }  /* 上家 */
.rotator-right { transform: rotate(90deg); }  /* 下家 */
.rotator .center-tile-bg { width: 100%; height: 100%; position: absolute; top:0; left:0; }
.rotator .center-tile-face { position: absolute; top: 1px; left: 50%; transform: translateX(-50%); width: 18px; height: 26px; z-index: 2; }


/* 我的手牌区 */
.player-bottom { position: absolute; bottom: 15px; left: 50%; transform: translateX(-50%); display: flex; align-items: flex-end; gap: 15px; z-index: 20; }
.hand-tiles-bottom { display: flex; align-items: flex-end; height: 75px; }

.exposed-area { display: flex; gap: 8px; margin-right: 15px; }
.exposed-group { display: flex; gap: 2px; border-radius: 5px; }
.exposed-tile { width: 34px; height: 48px; }
.exposed-tile .center-tile-face { top: 2px; left: 50%; width: 28px; height: 28px; transform: translateX(-50%); }

.hand-tile-wrapper { position: relative; width: 44px; height: 64px; cursor: pointer; transition: 0.2s; margin-left: 0.5px; }
.hand-tile-wrapper:first-child { margin-left: 0; }
.hand-tile-wrapper.selected { transform: translateY(-15px); }
.hand-tile-wrapper.dragging { opacity: 0.4; transform: scale(0.9); }
.hand-tile-wrapper.drag-over { border-left: 3px solid #ffd700; }
.new-drawn-tile { margin-left: 12px !important; }

.tile-bg { position: absolute; top: 0; left: 0; width: 100%; height: 100%; z-index: 1; }
.tile-face { position: absolute; top: 12px; left: 50%; transform: translateX(-50%); width: 36px; height: 48px; z-index: 2; }

/* 表情选择器 */
.emoji-picker { position: absolute; bottom: 130px; left: 50%; transform: translateX(-50%); display: flex; gap: 8px; z-index: 200; background: rgba(0,0,0,0.85); padding: 8px 16px; border-radius: 24px; border: 1px solid rgba(255,255,255,0.2); }
.emoji-option { font-size: 28px; cursor: pointer; transition: 0.2s; user-select: none; }
.emoji-option:hover { transform: scale(1.3); }
.emoji-cancel { font-size: 16px; color: #999; margin-left: 4px; }

/* 飞行表情动画 */
.flying-emoji { position: absolute; bottom: 60px; left: 50%; font-size: 32px; z-index: 300; pointer-events: none; animation: emojiFly 0.7s ease-in forwards; }
@keyframes emojiFly {
  0%   { transform: translate(0, 0) scale(0.5); opacity: 1; }
  50%  { transform: translate(calc(var(--tx) * 0.5), calc(var(--ty) * 0.5)) scale(1.3); opacity: 1; }
  100% { transform: translate(var(--tx), var(--ty)) scale(0.8); opacity: 0; }
}

/* 头像可点击提示 */
.avatar-img.clickable { cursor: pointer; }
.avatar-img.clickable:hover { transform: scale(1.15); filter: brightness(1.2); transition: 0.2s; }

/* 动作按钮 */
.action-buttons { position: absolute; bottom: 85px; right: 10%; display: flex; gap: 5px; z-index: 100; }
.action-btn { width: 44px; height: 44px; border-radius: 50%; background: #555; border: 2px solid #333; color: #aaa; display: flex; justify-content: center; align-items: center; font-weight: bold; font-size: 16px; transition: 0.3s; }
.action-btn.active { background: linear-gradient(145deg, #ffcc00, #ff9900); border-color: #fff; color: #fff; cursor: pointer; box-shadow: 0 4px 10px rgba(255,215,0,0.5); }
.action-btn.active:active { transform: scale(0.9); }
.action-btn.pass.active { background: linear-gradient(145deg, #66bb6a, #43a047); } 

/* 中央区域：骰子+弃牌池 — 调 top 的百分比整体上下移动 */
.center-area { position: absolute; top: 52%; left: 50%; transform: translate(-50%, -50%); width: 340px; height: 230px; z-index: 2; }
.dice-circle { position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); width: 64px; height: 64px; border: 2px solid rgba(255, 215, 0, 0.6); border-radius: 50%; display: flex; justify-content: center; align-items: center; gap: 4px; background: rgba(0,0,0,0.4); z-index: 10; }
.dice { width: 18px; height: 18px; }

/* 扎鸟展示 */
.zha-niao-display { position: absolute; top: 5px; right: -40px; z-index: 10; display: flex; flex-direction: column; align-items: center; }
.niao-bg { width: 28px; height: 40px; }
.niao-face { position: absolute; top: 1px; width: 22px; height: 30px; z-index: 2; }
.niao-label { font-size: 10px; color: #ffd700; font-weight: bold; text-shadow: 0 0 5px #000; margin-top: 2px; white-space: nowrap; }

/* 弃牌池：10列网格，带背景防重叠 */
.discard-pool { position: absolute; top: 0; left: 0; width: 100%; height: 100%; z-index: 5; display: grid; grid-template-columns: repeat(12, 26px); grid-template-rows: repeat(6, 38px); gap: 1px; justify-content: center; align-content: center; }
.center-tile-wrapper { position: relative; width: 28px; height: 38px; z-index: 1; }
.center-tile-bg { position: absolute; width: 100%; height: 100%; z-index: 0; }
.center-tile-face { position: absolute; top: 3px; left: 50%; transform: translateX(-50%); width: 22px; height: 28px; z-index: 2; }
/* 重叠的牌增加z-index和阴影 */
.center-tile-wrapper:nth-child(n+15) { z-index: 3; }
.center-tile-wrapper:nth-child(n+25) { z-index: 4; }
.center-tile-wrapper:nth-child(n+35) { z-index: 5; }
.center-tile-wrapper:nth-child(n+45) { z-index: 6; }

/* =========================================================
   响应式适配：桌面端直接显示，移动端自动缩放
   ========================================================= */
/* 手机/平板：全屏显示 */
@media screen and (max-width: 1024px) {
  #game-wrapper {
    width: 100vw;
    height: 100vh;
    overflow: hidden;
  }
}

/* 手机竖屏：JS 动态控制 transform，CSS 只负责布局容器 */
@media screen and (max-width: 1024px) and (orientation: portrait) {
  .mahjong-desk:not(.in-menu) {
    /* transform 由 updateGameScale() 直接设置 */
  }
}

/* 手动结算 */
.settlement-overlay { position: absolute; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.85); display: flex; justify-content: center; align-items: center; z-index: 1000; }
.settlement-panel { background: #1a3a1a; border: 3px solid #ffd700; border-radius: 12px; padding: 20px; text-align: center; color: white; min-width: 280px; }
.settlement-panel h3 { color: #ffd700; margin: 0 0 10px; }
.settlement-row { display: flex; align-items: center; justify-content: space-between; gap: 10px; margin: 6px 0; padding: 6px 10px; background: rgba(255,255,255,0.1); border-radius: 8px; }
.settlement-name { font-size: 14px; font-weight: bold; }
.settlement-winner { color: #ffd700; font-size: 14px; }
.settlement-pay-btn { padding: 6px 14px; font-size: 13px; background: linear-gradient(145deg, #ff9800, #f57c00); border: none; border-radius: 8px; color: white; cursor: pointer; font-weight: bold; }
.settlement-confirm-btn { padding: 6px 10px; font-size: 12px; background: #555; border: 1px solid #888; border-radius: 8px; color: white; cursor: pointer; margin-left: 4px; }
.settlement-confirm-btn:disabled { opacity: 0.3; cursor: default; }

/* 数字键盘 */
.numpad-overlay { position: absolute; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.9); display: flex; justify-content: center; align-items: center; z-index: 1001; }
.numpad-panel { background: #222; border: 2px solid #ffd700; border-radius: 12px; padding: 16px; text-align: center; color: white; position: relative; }
.numpad-close { position: absolute; top: 6px; right: 10px; font-size: 18px; color: #999; cursor: pointer; }
.numpad-close:hover { color: #fff; }
.numpad-panel h4 { margin: 0 0 8px; color: #ffd700; }
.numpad-display { font-size: 28px; font-weight: bold; margin: 8px 0; padding: 6px 20px; background: #111; border-radius: 8px; min-width: 100px; }
.numpad-grid { display: grid; grid-template-columns: repeat(3, 56px); gap: 6px; justify-content: center; }
.numpad-key { width: 56px; height: 44px; font-size: 20px; font-weight: bold; border: none; border-radius: 8px; cursor: pointer; background: #444; color: white; }
.numpad-key:hover { background: #666; }
.numpad-clear { background: #c62828; }
.numpad-ok { background: #2e7d32; }

/* 地胡带拖选择弹窗 */
.dihu-choice-overlay { position: absolute; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.8); display: flex; justify-content: center; align-items: center; z-index: 1000; }
.dihu-dialog { background: #2d5a3d; border: 3px solid #ffd700; border-radius: 15px; padding: 30px; text-align: center; color: white; }
.dihu-dialog h3 { font-size: 24px; margin: 0 0 15px; color: #ffd700; }
.dihu-dialog p { margin: 0 0 20px; font-size: 16px; }
.dihu-btn { display: block; width: 200px; margin: 10px auto; padding: 12px; font-size: 18px; font-weight: bold; border: none; border-radius: 30px; cursor: pointer; color: white; transition: 0.2s; }
.dihu-btn.direct { background: linear-gradient(145deg, #4CAF50, #2E7D32); }
.dihu-btn.drag { background: linear-gradient(145deg, #ff9800, #f57c00); }
.dihu-btn:active { transform: scale(0.95); }

/* ===== 顶部控制栏（BGM / 语音 / 聊天，在游戏区域内） ===== */
.top-controls { position: absolute; top: 6px; right: 80px; z-index: 99999; display: flex; gap: 3px; }
.ctrl-btn { background: rgba(0,0,0,0.4); color: white; border: 1px solid rgba(255,255,255,0.2); border-radius: 6px; padding: 2px 6px; font-size: 15px; cursor: pointer; display: flex; align-items: center; gap: 2px; }
.ctrl-btn:hover { background: rgba(0,0,0,0.7); }
/* 麦克风按钮 + 音量条 */
.mic-btn { flex-direction: column; gap: 1px; min-width: 28px; }
.mic-icon { line-height: 1; }
.mic-bars { display: flex; gap: 1px; height: 8px; align-items: flex-end; }
.mic-bar { width: 3px; height: 3px; background: #444; border-radius: 1px; transition: height 0.1s, background 0.1s; }
.mic-bar.active { background: #4CAF50; }
.mic-bar:nth-child(1).active { height: 4px; }
.mic-bar:nth-child(2).active { height: 5px; }
.mic-bar:nth-child(3).active { height: 6px; }
.mic-bar:nth-child(4).active { height: 7px; }
.mic-bar:nth-child(5).active { height: 8px; }

/* ===== 聊天消息气泡（在游戏区域内） ===== */
.chat-bubbles { position: absolute; top: 36px; right: 8px; z-index: 99998; display: flex; flex-direction: column; gap: 4px; max-width: 60%; pointer-events: none; }
.chat-bubble { background: rgba(0,0,0,0.75); color: white; border-radius: 8px; padding: 4px 10px; font-size: 12px; animation: chatFadeIn 0.3s ease-out; display: flex; flex-direction: column; }
.chat-bubble.chat-self { background: rgba(0,100,200,0.75); align-items: flex-end; }
.chat-name { font-size: 9px; color: #aaa; margin-bottom: 1px; }
.chat-text { word-break: break-word; }
@keyframes chatFadeIn { from { opacity: 0; transform: translateX(20px); } to { opacity: 1; transform: translateX(0); } }

/* ===== 聊天输入栏（屏幕底部固定） ===== */
.chat-input-bar { position: fixed; bottom: 0; left: 0; right: 0; z-index: 99999; background: rgba(0,0,0,0.9); padding: 10px 12px; display: flex; gap: 8px; align-items: center; }
.chat-input { flex: 1; padding: 10px 14px; font-size: 16px; border: 2px solid #555; border-radius: 20px; background: rgba(255,255,255,0.1); color: white; outline: none; }
.chat-input:focus { border-color: #ffd700; }
.chat-send-btn { padding: 10px 18px; font-size: 14px; font-weight: bold; background: linear-gradient(145deg, #2196F3, #1565C0); border: none; border-radius: 20px; color: white; cursor: pointer; }
</style>