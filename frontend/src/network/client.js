// frontend/src/network/client.js — WebSocket 多人联机客户端（含断线重连）
import { reactive } from 'vue';

// 服务器地址
const WS_URL = (() => {
  const isLocal = location.hostname === 'localhost';
  const protocol = isLocal ? 'ws:' : 'wss:';
  const host = isLocal ? 'localhost:8080' : 'synapse-squander-finale.ngrok-free.dev';
  return `${protocol}//${host}`;
})();

export const netState = reactive({
  connected: false,
  roomId: null,
  playerIndex: -1,
  players: [],
  error: null,
});

let ws = null;
let listeners = new Map();
let sendQueue = [];
let reconnectTimer = null;
let reconnectAttempts = 0;
const MAX_RECONNECT = 8;
let lastRoomId = null;
let lastPlayerName = '';
let lastAvatar = '';

// 连接服务器
export const connect = () => {
  return new Promise((resolve, reject) => {
    if (ws && ws.readyState === WebSocket.OPEN) {
      resolve();
      return;
    }
    try {
      ws = new WebSocket(WS_URL);
    } catch (e) {
      netState.error = '无法连接服务器';
      reject(e);
      return;
    }

    ws.onopen = () => {
      netState.connected = true;
      netState.error = null;
      reconnectAttempts = 0;
      if (sendQueue.length > 0) {
        console.log('[client] 冲刷缓冲消息:', sendQueue.length, '条');
        sendQueue.forEach(m => ws.send(JSON.stringify(m)));
        sendQueue = [];
      }
      resolve();
    };

    ws.onmessage = (e) => {
      let msg;
      try { msg = JSON.parse(e.data); } catch (err) { return; }
      handleMessage(msg);
    };

    ws.onclose = () => {
      netState.connected = false;
      // 尝试自动重连（指数退避）
      if (lastRoomId) {
        scheduleReconnect();
      } else {
        emit('disconnected');
      }
    };

    ws.onerror = () => {
      netState.error = '连接错误';
    };
  });
};

// 断线重连（指数退避：1s → 2s → 4s → ... → 最大 128s）
const scheduleReconnect = () => {
  if (reconnectAttempts >= MAX_RECONNECT) {
    console.log('[client] 重连失败，已达最大尝试次数');
    emit('disconnected');
    return;
  }
  const delay = Math.min(1000 * Math.pow(2, reconnectAttempts), 120000);
  reconnectAttempts++;
  console.log(`[client] ${delay/1000}s 后尝试第 ${reconnectAttempts} 次重连...`);
  reconnectTimer = setTimeout(async () => {
    try {
      await connect();
      // 重连成功后自动重新加入房间
      if (lastRoomId && lastPlayerName) {
        send({
          type: 'join_room',
          roomId: lastRoomId,
          name: lastPlayerName,
          avatar: lastAvatar,
        });
        console.log('[client] 重连成功，已重新加入房间', lastRoomId);
      }
      emit('reconnected');
    } catch (e) {
      scheduleReconnect();
    }
  }, delay);
};

// 记录当前房间信息（用于重连）
export const setRoomInfo = (roomId, playerName, avatar) => {
  lastRoomId = roomId;
  lastPlayerName = playerName;
  lastAvatar = avatar;
};

// 断开连接（主动断开，不重连）
export const disconnect = () => {
  lastRoomId = null;
  if (reconnectTimer) { clearTimeout(reconnectTimer); reconnectTimer = null; }
  reconnectAttempts = 0;
  if (ws) ws.close();
  ws = null;
  netState.connected = false;
  netState.roomId = null;
  netState.playerIndex = -1;
};

// 发送消息
const _lastSend = {};
const _THROTTLE = 400;
const _NO_THROTTLE = ['webrtc_offer', 'webrtc_answer', 'webrtc_ice', 'chat'];
export const send = (msg) => {
  const now = Date.now();
  if (!_NO_THROTTLE.includes(msg.type)) {
    const last = _lastSend[msg.type] || 0;
    if (now - last < _THROTTLE) {
      console.log('[client] 节流跳过:', msg.type, `(距上次${now - last}ms)`);
      return;
    }
    _lastSend[msg.type] = now;
  }
  console.log('[client] send:', msg.type, 'ws状态:', ws?.readyState);
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(msg));
  } else if (ws && ws.readyState === WebSocket.CONNECTING) {
    sendQueue.push(msg);
  } else {
    console.error('[client] 无法发送! ws=', ws, 'readyState=', ws?.readyState);
  }
};

// 心跳（保持连接活跃，防 NAT 超时断开）
let heartbeatTimer = null;
const startHeartbeat = () => {
  stopHeartbeat();
  heartbeatTimer = setInterval(() => {
    if (ws && ws.readyState === WebSocket.OPEN) {
      send({ type: 'ping' });
    }
  }, 25000); // 每 25 秒 ping 一次
};
const stopHeartbeat = () => {
  if (heartbeatTimer) { clearInterval(heartbeatTimer); heartbeatTimer = null; }
};

// 事件监听
export const on = (event, fn) => {
  if (!listeners.has(event)) listeners.set(event, new Set());
  listeners.get(event).add(fn);
};

export const off = (event, fn) => {
  const set = listeners.get(event);
  if (set) set.delete(fn);
};

const emit = (event, data) => {
  const set = listeners.get(event);
  if (set) set.forEach(fn => fn(data));
};

// 处理服务器消息
const handleMessage = (msg) => {
  switch (msg.type) {
    case 'room_created':
    case 'room_joined':
      netState.roomId = msg.roomId;
      netState.playerIndex = msg.playerIndex;
      setRoomInfo(msg.roomId, msg.name || lastPlayerName, msg.avatar || lastAvatar);
      startHeartbeat();
      break;

    case 'room_players':
      netState.players = msg.players;
      break;

    case 'pong':
      // 心跳回复，连接正常
      break;

    case 'error':
      netState.error = msg.message;
      break;

    default:
      break;
  }
  emit(msg.type, msg);
};
