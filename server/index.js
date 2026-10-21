'use strict';

const fs = require('fs');
const path = require('path');
const http = require('http');
const dgram = require('dgram');
const express = require('express');
const { WebSocketServer, WebSocket } = require('ws');

const PORT = parseInt(process.env.PORT || '3000', 10);
// In the packaged .exe (pkg) the config is stored next to the executable
const PACKAGED = typeof process.pkg !== 'undefined';
const CONFIG_PATH =
  process.env.CONFIG_PATH ||
  (PACKAGED
    ? path.join(path.dirname(process.execPath), 'ma3-remote-config.json')
    : path.join(__dirname, '..', 'data', 'config.json'));

function parseJson(str) {
  if (!str) return {};
  try {
    const obj = JSON.parse(str);
    return obj && typeof obj === 'object' ? obj : {};
  } catch (e) {
    console.warn('[config] MA3_ATTRIBUTE_MAP is not valid JSON, ignored.');
    return {};
  }
}

/* ------------------------------------------------------------------ *
 * Attribute names: logical name (frontend) -> MA3 attribute name.
 * Override via MA3_ATTRIBUTE_MAP (JSON) if your fixtures use other names.
 * ------------------------------------------------------------------ */
const ATTRIBUTE_MAP = Object.assign(
  {
    Pan: 'Pan',
    Tilt: 'Tilt',
    Zoom: 'Zoom',
    Focus: 'Focus1',
    Blade1: 'Blade1A',
    Blade2: 'Blade2A',
    Blade3: 'Blade3A',
    Blade4: 'Blade4A',
    Blade1Rot: 'Blade1Rot',
    Blade2Rot: 'Blade2Rot',
    Blade3Rot: 'Blade3Rot',
    Blade4Rot: 'Blade4Rot'
  },
  parseJson(process.env.MA3_ATTRIBUTE_MAP)
);

/* ------------------------------------------------------------------ *
 * Settings: saved config > environment variables > default (127.0.0.1:8000).
 * ------------------------------------------------------------------ */
const HOST_RE = /^[A-Za-z0-9]([A-Za-z0-9.-]{0,251}[A-Za-z0-9])?$/;

function validTarget(ip, port) {
  return typeof ip === 'string' && HOST_RE.test(ip) && Number.isInteger(port) && port >= 1 && port <= 65535;
}

function loadConfig() {
  const cfg = {
    ip: (process.env.MA3_IP || '127.0.0.1').trim(),
    port: parseInt(process.env.MA3_PORT || '8000', 10)
  };
  try {
    const saved = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
    if (validTarget(saved.ip, saved.port)) {
      cfg.ip = saved.ip;
      cfg.port = saved.port;
    }
  } catch (e) {
    /* no saved config */
  }
  return cfg;
}

function saveConfig(cfg) {
  try {
    fs.mkdirSync(path.dirname(CONFIG_PATH), { recursive: true });
    fs.writeFileSync(CONFIG_PATH, JSON.stringify(cfg, null, 2));
  } catch (e) {
    console.warn('[config] saving failed:', e.message);
  }
}

/* ------------------------------------------------------------------ *
 * MA3 via OSC (UDP, default port 8000).
 * On the console: Setup > In & Out > OSC: a line with the chosen port and
 * "Receive Command" = Yes, and "Enable Input" at the top. Every command is sent
 * as an OSC message "/cmd" with the command as string argument. There is no feedback.
 * ------------------------------------------------------------------ */
function oscPad(buf) {
  const pad = (4 - (buf.length % 4)) % 4;
  return Buffer.concat([buf, Buffer.alloc(pad)]);
}

function oscString(str) {
  return oscPad(Buffer.concat([Buffer.from(str, 'utf8'), Buffer.from([0])]));
}

function encodeOsc(address, args) {
  const tags = ',' + args.map(() => 's').join('');
  return Buffer.concat([oscString(address), oscString(tags), ...args.map((a) => oscString(String(a)))]);
}

class MA3Link {
  constructor(cfg, onStatus) {
    this.onStatus = onStatus;
    this.socket = dgram.createSocket('udp4');
    this.socket.on('error', (err) => this.reportError(err.message));
    this.lastError = null;
    this.configure(cfg, false);
  }

  configure(cfg, notify = true) {
    this.ip = cfg.ip;
    this.port = cfg.port;
    this.lastError = null;
    this.mode = cfg.ip ? 'osc' : 'simulation';
    if (notify) this.onStatus();
  }

  status() {
    return { mode: this.mode, target: this.ip || null, ip: this.ip || '', port: this.port };
  }

  reportError(message) {
    if (message !== this.lastError) console.warn(`[ma3] error: ${message}`);
    this.lastError = message;
  }

  send(command) {
    if (this.mode === 'simulation') {
      console.log('[sim] ->', command);
      return true;
    }
    console.log(`[osc] -> ${this.ip}:${this.port} /cmd "${command}"`);
    this.socket.send(encodeOsc('/cmd', [command]), this.port, this.ip, (err) => {
      if (err) this.reportError(err.message);
    });
    return true;
  }
}

/* ------------------------------------------------------------------ *
 * Translate PWA messages to MA3 commands.
 * ------------------------------------------------------------------ */
function sanitizeText(s, max = 200) {
  return String(s).replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, max);
}

function num(v, min, max) {
  const n = Number(v);
  if (!Number.isFinite(n)) return null;
  return Math.min(max, Math.max(min, n));
}

function fmt(n) {
  return String(Math.round(n * 100) / 100);
}

function buildCommands(msg) {
  switch (msg.type) {
    case 'encoder': {
      const attr = ATTRIBUTE_MAP[msg.attr];
      const amount = num(msg.amount, -100, 100);
      if (!attr || amount === null || amount === 0) return [];
      const sign = amount > 0 ? '+' : '-';
      return [`Attribute "${attr}" At ${sign} ${fmt(Math.abs(amount))}`];
    }
    case 'cmd': {
      const cmd = sanitizeText(msg.cmd);
      return cmd ? [cmd] : [];
    }
    default:
      return [];
  }
}

/* ------------------------------------------------------------------ *
 * HTTP + WebSocket
 * ------------------------------------------------------------------ */
const app = express();
app.disable('x-powered-by');
app.use(express.static(path.join(__dirname, '..', 'public')));

const server = http.createServer(app);
const wss = new WebSocketServer({ server, path: '/ws', maxPayload: 8 * 1024 });

function broadcastStatus() {
  const payload = JSON.stringify({ type: 'status', ...ma3.status() });
  for (const client of wss.clients) {
    if (client.readyState === WebSocket.OPEN) client.send(payload);
  }
}

const initial = loadConfig();
const ma3 = new MA3Link(initial, broadcastStatus);

app.get('/api/status', (req, res) => res.json(ma3.status()));

wss.on('connection', (ws, req) => {
  console.log('[ws] client connected:', req.socket.remoteAddress);
  ws.isAlive = true;
  ws.on('pong', () => (ws.isAlive = true));
  ws.send(JSON.stringify({ type: 'status', ...ma3.status() }));

  ws.on('message', (data) => {
    let msg;
    try {
      msg = JSON.parse(data.toString());
    } catch (e) {
      return;
    }
    if (!msg || typeof msg !== 'object') return;
    if (msg.type === 'ping') return ws.send(JSON.stringify({ type: 'pong' }));
    if (msg.type === 'setConfig') {
      const ip = typeof msg.ip === 'string' ? msg.ip.trim() : '';
      const port = parseInt(msg.port, 10);
      if (!validTarget(ip, port)) {
        return ws.send(JSON.stringify({ type: 'configError', error: 'Invalid IP address or port' }));
      }
      const cfg = { ip, port };
      console.log(`[config] new MA3 target: ${ip}:${port}`);
      saveConfig(cfg);
      ma3.configure(cfg);
      return;
    }
    for (const cmd of buildCommands(msg)) ma3.send(cmd);
  });

  ws.on('close', () => console.log('[ws] client gone'));
});

setInterval(() => {
  for (const ws of wss.clients) {
    if (!ws.isAlive) {
      ws.terminate();
      continue;
    }
    ws.isAlive = false;
    ws.ping();
  }
}, 15000);

server.on('error', (err) => {
  console.error(`Server cannot start: ${err.message}`);
  if (PACKAGED) setTimeout(() => process.exit(1), 15000);
  else process.exit(1);
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`MA3 Remote PWA running on http://0.0.0.0:${PORT}`);
  for (const list of Object.values(require('os').networkInterfaces())) {
    for (const i of list || []) {
      if (i.family === 'IPv4' && !i.internal) console.log(`  Open on your iPad: http://${i.address}:${PORT}`);
    }
  }
  console.log(`MA3 target: ${ma3.ip}:${ma3.port}`);
});
