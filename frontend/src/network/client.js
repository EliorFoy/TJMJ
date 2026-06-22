// frontend/src/network/client.js — WebSocket 多人联机客户端
import { reactive } from 'vue';

// 服务器地址
const WS_URL = (() => {
  // 本地开发用 localhost:8080，公网用 ngrok 地址（ngrok 仅接受 wss 加密连接）
  const isLocal = location.hostname === 'localhost';
  const protocol = isLocal ? 'ws:' : 'wss:';
  const host = isLocal ? 'localhost:8080' : 'synapse-squander-finale.ngrok-free.dev';
  return `${protocol}//${host}`;
})();

export const netState = reactive({
  connected: false,
  roomId: null,
  playerIndex: -1,
  players: [],         // [{ id, name, avatar, score, connected }]
  error: null,
});

let ws = null;
let listeners = new Map(); // event → Set of callbacks

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
      resolve();
    };

    ws.onmessage = (e) => {
      let msg;
      try { msg = JSON.parse(e.data); } catch (err) { return; }
      handleMessage(msg);
    };

    ws.onclose = () => {
      netState.connected = false;
      emit('disconnected');
    };

    ws.onerror = () => {
      netState.error = '连接错误';
    };
  });
};

// 断开连接
export const disconnect = () => {
  if (ws) ws.close();
  ws = null;
  netState.connected = false;
  netState.roomId = null;
  netState.playerIndex = -1;
};

// 发送消息（内置节流，防止过快点击导致断连）
const _lastSend = {};
const _THROTTLE = 400; // 同类型消息最小间隔400ms
export const send = (msg) => {
  const now = Date.now();
  const last = _lastSend[msg.type] || 0;
  if (now - last < _THROTTLE) {
    console.log('[client] 节流跳过:', msg.type, `(距上次${now - last}ms)`);
    return;
  }
  _lastSend[msg.type] = now;
  console.log('[client] send:', msg.type, 'ws状态:', ws?.readyState);
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(msg));
  } else {
    console.error('[client] 无法发送! ws=', ws, 'readyState=', ws?.readyState);
  }
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
      break;

    case 'room_players':
      netState.players = msg.players;
      break;

    case 'error':
      netState.error = msg.message;
      break;

    default:
      break;
  }
  emit(msg.type, msg);
};
