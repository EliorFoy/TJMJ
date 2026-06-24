// server/index.js — WebSocket 游戏服务器入口
import { WebSocketServer } from 'ws';
import { GameRoom } from './GameRoom.js';
import crypto from 'crypto';

const PORT = process.env.PORT || 8080;
const wss = new WebSocketServer({ port: PORT });
const rooms = new Map();

console.log(`🀄 TJMJ 服务器已启动，端口 ${PORT}`);

// === Twilio TURN 凭据生成（24h 有效，启动时算一次） ===
// 设置环境变量: set TWILIO_ACCOUNT_SID=xxx && set TWILIO_AUTH_TOKEN=xxx
const TWILIO_ACCOUNT_SID = process.env.TWILIO_ACCOUNT_SID || '';
const TWILIO_AUTH_TOKEN = process.env.TWILIO_AUTH_TOKEN || '';
const TTL = 86400; // 24 小时
const HAS_TWILIO = TWILIO_ACCOUNT_SID && TWILIO_AUTH_TOKEN;
const TURN_CREDENTIALS = HAS_TWILIO ? generateTurnCredentials() : null;
if (!HAS_TWILIO) console.log('[服务器] ⚠️ 未设置 TWILIO 环境变量，TURN 不可用');

function generateTurnCredentials() {
  const timestamp = Math.floor(Date.now() / 1000) + TTL;
  const username = `${timestamp}:${TWILIO_ACCOUNT_SID}`;
  const hmac = crypto.createHmac('sha1', TWILIO_AUTH_TOKEN);
  hmac.update(username);
  const password = hmac.digest('base64');
  return { username, password };
}

// 每小时刷新一次
setInterval(() => {
  const newCreds = generateTurnCredentials();
  Object.assign(TURN_CREDENTIALS, newCreds);
  console.log('[服务器] TURN 凭据已刷新');
}, 3600000);

wss.on('connection', (ws) => {
  let myRoom = null;
  let myPlayerIndex = -1;

  ws.on('message', (raw) => {
    let msg;
    try { msg = JSON.parse(raw.toString()); } catch (e) { return; }
    console.log(`[服务器] 收到消息: type=${msg.type} tile=${msg.tile} action=${msg.action} room=${msg.roomId}`);

    switch (msg.type) {

      case 'create_room': {
        const roomId = msg.roomId || generateRoomCode();
        if (rooms.has(roomId)) { ws.send(JSON.stringify({ type: 'error', message: '房间已存在' })); return; }
        console.log(`[服务器] 创建房间 ${roomId}`);
        const room = new GameRoom(roomId, (id) => rooms.delete(id));
        rooms.set(roomId, room);
        myPlayerIndex = room.addPlayer(ws, msg.name || '玩家', msg.avatar || '1.表情包');
        myRoom = room;
        ws.send(JSON.stringify({ type: 'room_created', roomId, playerIndex: myPlayerIndex }));
        broadcastRoomPlayers(room);
        break;
      }

      case 'join_room': {
        const roomId = msg.roomId?.toUpperCase?.() || msg.roomId;
        console.log(`[服务器] 玩家加入房间 ${roomId}, 当前在线 ${rooms.has(roomId) ? rooms.get(roomId).players.length : 0}/4`);
        let room = rooms.get(roomId);
        // 测试房间 8888：如果状态不对，自动重建
        if (roomId === '8888' && room && room.state !== 'LOBBY') {
          rooms.delete('8888');
          room = new GameRoom('8888', (id) => {});
          rooms.set('8888', room);
          console.log('[服务器] 测试房间 8888 已重建');
        }
        if (!room || room.state !== 'LOBBY') {
          ws.send(JSON.stringify({ type: 'error', message: '房间不存在或已开始' }));
          return;
        }
        if (room.players.length >= 4) {
          ws.send(JSON.stringify({ type: 'error', message: '房间已满' }));
          return;
        }
        myPlayerIndex = room.addPlayer(ws, msg.name || '玩家', msg.avatar || '1.表情包');
        myRoom = room;
        console.log(`[服务器] 房间 ${roomId} 现有 ${room.players.length}/4 人`);
        ws.send(JSON.stringify({ type: 'room_joined', roomId: room.id, playerIndex: myPlayerIndex }));
        broadcastRoomPlayers(room);

        // 人满自动开局
        if (room.players.length === 4 && room.players.every(p => p.connected)) {
          console.log(`[服务器] 房间 ${roomId} 满员，1.5秒后开局`);
          setTimeout(() => {
            room.startGame();
          }, 1500);
        }
        break;
      }

      case 'ready': {
        if (!myRoom || myRoom.state !== 'LOBBY') return;
        const p = myRoom.players[myPlayerIndex];
        if (p) p.ready = true;
        broadcastRoomPlayers(myRoom);
        if (myRoom.players.length === 4 && myRoom.players.every(p => p.ready)) {
          setTimeout(() => myRoom.startGame(), 800);
        }
        break;
      }

      case 'discard': {
        if (!myRoom || myRoom.state !== 'PLAYING') return;
        myRoom.handleDiscard(myPlayerIndex, msg.tile);
        break;
      }

      case 'draw': {
        if (!myRoom || myRoom.state !== 'PLAYING') return;
        myRoom.handleDraw(myPlayerIndex);
        break;
      }

      case 'action': {
        if (!myRoom || myRoom.state !== 'PLAYING') return;
        myRoom.handleAction(myPlayerIndex, msg.action, msg.combo);
        break;
      }

      case 'pass': {
        if (!myRoom || myRoom.state !== 'PLAYING') return;
        myRoom.handlePass(myPlayerIndex);
        break;
      }

      case 'pay': {
        if (!myRoom) return;
        const amount = parseInt(msg.amount) || 0;
        if (amount > 0 && msg.to != null && msg.to !== myPlayerIndex && myRoom.players[msg.to] && myRoom.players[myPlayerIndex]) {
          myRoom.players[msg.to].score += amount;
          myRoom.players[myPlayerIndex].score -= amount;
          myRoom.broadcast({ type: 'score_update', scores: myRoom.players.map(p => p.score) });
        }
        break;
      }

      case 'join_spectate': {
        const room = rooms.get(msg.roomId);
        if (!room || room.state !== 'PLAYING') {
          ws.send(JSON.stringify({ type: 'error', message: '房间不存在或未开始' }));
          return;
        }
        myPlayerIndex = -1;
        myRoom = room;
        room.addObserver(ws);
        ws.send(JSON.stringify({ type: 'spectate_joined', roomId: room.id, players: room.playersInfo() }));
        break;
      }

      case 'emoji': {
        if (!myRoom) return;
        myRoom.broadcast({ type: 'emoji_from', from: myPlayerIndex, to: msg.target, icon: msg.icon });
        break;
      }

      // === 文字聊天 ===
      case 'chat': {
        if (!myRoom || !msg.text) return;
        myRoom.broadcast({ type: 'chat', from: myPlayerIndex, fromName: msg.fromName || ('玩家' + (myPlayerIndex + 1)), text: msg.text });
        break;
      }

      // === WebRTC 语音信令中继 ===
      case 'webrtc_offer':
      case 'webrtc_answer':
      case 'webrtc_ice': {
        if (!myRoom || msg.to == null) return;
        myRoom.sendTo(msg.to, { type: msg.type, from: myPlayerIndex, data: msg.data });
        break;
      }

      // 玩家确认继续（4人全部确认后开始新局）
      case 'ready_next': {
        if (myRoom && myPlayerIndex >= 0) {
          myRoom.playerReadyForNext(myPlayerIndex);
        }
        break;
      }

      // 获取 TURN 凭据
      case 'get_turn': {
        const servers = [
          { urls: 'stun:stun.l.google.com:19302' },
          { urls: 'stun:stun1.l.google.com:19302' },
        ];
        if (HAS_TWILIO && TURN_CREDENTIALS) {
          servers.push({
            urls: ['turn:global.turn.twilio.com:3478?transport=udp', 'turn:global.turn.twilio.com:3478?transport=tcp'],
            username: TURN_CREDENTIALS.username,
            credential: TURN_CREDENTIALS.password,
          });
        }
        ws.send(JSON.stringify({ type: 'turn_credentials', iceServers: servers }));
        break;
      }

      // 心跳保活
      case 'ping': {
        try { ws.send(JSON.stringify({ type: 'pong' })); } catch(e) {}
        break;
      }
    }
  });

  ws.on('close', () => {
    if (myRoom) {
      myRoom.removePlayer(ws);
      broadcastRoomPlayers(myRoom);
    }
  });
});

function broadcastRoomPlayers(room) {
  room.broadcast({ type: 'room_players', players: room.playersInfo(), roomId: room.id });
}

function generateRoomCode() {
  let code = '';
  for (let i = 0; i < 4; i++) code += Math.floor(Math.random() * 10);
  return code;
}

// 测试房间 8888 常驻
function ensureTestRoom() {
  if (!rooms.has('8888') || rooms.get('8888').state !== 'LOBBY') {
    rooms.delete('8888');
    const testRoom = new GameRoom('8888', (id) => { /* 不自动删除，手动管理 */ });
    rooms.set('8888', testRoom);
    console.log('[服务器] 测试房间 8888 已创建');
  }
}
ensureTestRoom();
console.log('✅ 服务器就绪，测试房间 8888 已就绪，等待连接...');
