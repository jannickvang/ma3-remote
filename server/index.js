'use strict';

const fs = require('fs');
const path = require('path');
const http = require('http');
const dgram = require('dgram');
const express = require('express');
const { WebSocketServer, WebSocket } = require('ws');

const PORT = parseInt(process.env.PORT || '3000', 10);
// In de verpakte .exe (pkg) staat de config naast het uitvoerbare bestand
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
    console.warn('[config] MA3_ATTRIBUTE_MAP is geen geldige JSON, genegeerd.');
    return {};
  }
}

/* ------------------------------------------------------------------ *
 * Attribuutnamen: logische naam (frontend) -> MA3 attribuutnaam.
 * Pas aan via MA3_ATTRIBUTE_MAP (JSON) als jouw fixtures andere namen gebruiken.
 * ------------------------------------------------------------------ */
const ATTRIBUTE_MAP = Object.assign(
  {
    Pan: 'Pan',
    Tilt: 'Tilt',
    Zoom: 'Zoom',
    Focus: 'Focus1',
    Frost: 'Frost1',
    Blade1: 'Blade1A',
    Blade2: 'Blade2A',
    Blade3: 'Blade3A',
    Blade4: 'Blade4A',
    Blade1Rot: 'Blade1Rot',
    Blade2Rot: 'Blade2Rot',
    Blade3Rot: 'Blade3Rot',
    Blade4Rot: 'Blade4Rot',
    ColorR: 'ColorRGB_R',
    ColorG: 'ColorRGB_G',
    ColorB: 'ColorRGB_B'
  },
  parseJson(process.env.MA3_ATTRIBUTE_MAP)
);

/* ------------------------------------------------------------------ *
 * Instellingen: opgeslagen config > omgevingsvariabelen > standaard (127.0.0.1:8000).
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
    /* geen opgeslagen config */
  }
  return cfg;
}

function saveConfig(cfg) {
  try {
    fs.mkdirSync(path.dirname(CONFIG_PATH), { recursive: true });
    fs.writeFileSync(CONFIG_PATH, JSON.stringify(cfg, null, 2));
  } catch (e) {
    console.warn('[config] opslaan mislukt:', e.message);
  }
}

/* ------------------------------------------------------------------ *
 * MA3 via OSC (UDP, standaardpoort 8000).
 * Zet op de console: Setup > In & Out > OSC: een regel met de gewenste poort en
 * "Receive Command" = Yes, en bovenaan "Enable Input". Elk commando gaat als
 * OSC-bericht "/cmd" met het commando als string-argument. Er is geen terugkoppeling.
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

function decodeOsc(buf) {
  const readStr = (off) => {
    let end = off;
    while (end < buf.length && buf[end] !== 0) end++;
    return [buf.toString('utf8', off, end), off + Math.ceil((end - off + 1) / 4) * 4];
  };
  try {
    let [address, off] = readStr(0);
    let tags;
    [tags, off] = readStr(off);
    const args = [];
    for (const t of tags.slice(1)) {
      if (t !== 's') break;
      let a;
      [a, off] = readStr(off);
      args.push(a);
    }
    return { address, args };
  } catch (e) {
    return null;
  }
}

class MA3Link {
  constructor(cfg, onStatus) {
    this.onStatus = onStatus;
    this.socket = dgram.createSocket('udp4');
    this.socket.on('error', (err) => this.reportError(err.message));
    this.lastError = null;
    this.listenSocket = null;
    this.listenPort = null;
    this.onMessage = () => {};
    this.configure(cfg, false);
  }

  // Luistert op dezelfde poort als waarnaar we sturen, voor antwoorden via SendOSC van de MA3
  listen(port) {
    if (this.listenPort === port) return;
    if (this.listenSocket) try { this.listenSocket.close(); } catch (e) { /* al gesloten */ }
    this.listenPort = port;
    const sock = dgram.createSocket({ type: 'udp4', reuseAddr: true });
    this.listenSocket = sock;
    sock.on('error', (err) => {
      console.warn(`[osc-in] luisteren op poort ${port} mislukt: ${err.message}`);
      this.listenError = err.message;
    });
    sock.on('message', (buf) => {
      const m = decodeOsc(buf);
      console.log(`[osc-in] ${m ? m.address + ' ' + JSON.stringify(m.args) : 'onleesbaar bericht'}`);
      if (m) this.onMessage(m);
    });
    this.listenError = null;
    sock.bind(port, () => console.log(`[osc-in] luistert op UDP ${port}`));
  }

  configure(cfg, notify = true) {
    this.ip = cfg.ip;
    this.port = cfg.port;
    this.lastError = null;
    this.mode = cfg.ip ? 'osc' : 'simulation';
    if (this.mode === 'osc') this.listen(cfg.port);
    if (notify) this.onStatus();
  }

  status() {
    return { mode: this.mode, target: this.ip || null, ip: this.ip || '', port: this.port };
  }

  reportError(message) {
    if (message !== this.lastError) console.warn(`[ma3] fout: ${message}`);
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
 * Vertaal PWA-berichten naar MA3-commando's.
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
    case 'color': {
      const rgb = Array.isArray(msg.rgb) ? msg.rgb.map((v) => num(v, 0, 255)) : [];
      if (rgb.length !== 3 || rgb.some((v) => v === null)) return [];
      return [
        `Attribute "${ATTRIBUTE_MAP.ColorR}" At ${fmt((rgb[0] / 255) * 100)}`,
        `Attribute "${ATTRIBUTE_MAP.ColorG}" At ${fmt((rgb[1] / 255) * 100)}`,
        `Attribute "${ATTRIBUTE_MAP.ColorB}" At ${fmt((rgb[2] / 255) * 100)}`
      ];
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
 * Kleurpresets ophalen: een Lua-regel (geen plugin) laat de MA3 elke bestaande
 * preset terugsturen via SendOSC als "/preset" met "nr|naam".
 * ------------------------------------------------------------------ */
const PRESET_PREFIX = '/';
let presetJob = null;

function presetLua(pool, start, end, oscId) {
  return (
    `Lua "local q=string.char(34) ` +
    `local pl=Root().ShowData.DataPools.Default.PresetPools[${pool}] ` +
    `for _,p in ipairs(pl:Children()) do ` +
    `if p.no>=${start} and p.no<=${end} then ` +
    `local n=tostring(p.name):gsub('[^%w ._-]','') ` +
    `Cmd('SendOSC ${oscId} '..q..'${PRESET_PREFIX}preset,s,'..p.no..'|'..n..q) end end ` +
    `Cmd('SendOSC ${oscId} '..q..'${PRESET_PREFIX}done,s,ok'..q)"`
  );
}

function fetchPresets(msg, reply) {
  const pool = Math.round(num(msg.pool, 1, 99) || 4);
  const start = Math.round(num(msg.start, 1, 9999) || 1);
  const count = Math.round(num(msg.count, 1, 200) || 32);
  const oscId = Math.round(num(msg.oscId, 1, 99) || 3);
  const listenPort = ma3.port;
  if (presetJob) clearTimeout(presetJob.timer);
  const job = { items: [], reply, start, end: start + count - 1 };
  job.timer = setTimeout(() => {
    if (presetJob === job) {
      presetJob = null;
      reply({ type: 'presets', ok: false, error: 'Geen antwoord ontvangen op UDP ' + listenPort + (ma3.listenError ? ' (' + ma3.listenError + ')' : '') + '. Controleer in de MA3 de OSC-regel: Send aan, IP van deze computer, poort ' + listenPort });
    }
  }, 6000);
  presetJob = job;
  ma3.send(presetLua(pool, start, start + count - 1, oscId));
}

function handleInbound(m) {
  if (!presetJob || !m.address.startsWith(PRESET_PREFIX)) return;
  const job = presetJob;
  if (m.address === PRESET_PREFIX + 'preset' && m.args[0]) {
    const [no, ...rest] = m.args[0].split('|');
    job.items.push({ no: parseInt(no, 10), name: rest.join('|') });
  } else if (m.address === PRESET_PREFIX + 'done') {
    clearTimeout(job.timer);
    presetJob = null;
    const items = job.items.filter((i) => Number.isFinite(i.no)).sort((a, b) => a.no - b.no);
    job.reply({ type: 'presets', ok: true, start: job.start, end: job.end, items });
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
ma3.onMessage = handleInbound;

app.get('/api/status', (req, res) => res.json(ma3.status()));

wss.on('connection', (ws, req) => {
  console.log('[ws] client verbonden:', req.socket.remoteAddress);
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
    if (msg.type === 'fetchPresets') {
      return fetchPresets(msg, (obj) => {
        if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(obj));
      });
    }
    if (msg.type === 'setConfig') {
      const ip = typeof msg.ip === 'string' ? msg.ip.trim() : '';
      const port = parseInt(msg.port, 10);
      if (!validTarget(ip, port)) {
        return ws.send(JSON.stringify({ type: 'configError', error: 'Ongeldig IP-adres of poort' }));
      }
      const cfg = { ip, port };
      console.log(`[config] nieuw MA3-doel: ${ip}:${port}`);
      saveConfig(cfg);
      ma3.configure(cfg);
      return;
    }
    for (const cmd of buildCommands(msg)) ma3.send(cmd);
  });

  ws.on('close', () => console.log('[ws] client weg'));
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
  console.error(`Server kan niet starten: ${err.message}`);
  if (PACKAGED) setTimeout(() => process.exit(1), 15000);
  else process.exit(1);
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`MA3 Remote PWA draait op http://0.0.0.0:${PORT}`);
  for (const list of Object.values(require('os').networkInterfaces())) {
    for (const i of list || []) {
      if (i.family === 'IPv4' && !i.internal) console.log(`  Open op je iPad: http://${i.address}:${PORT}`);
    }
  }
  console.log(`MA3 doel: ${ma3.ip}:${ma3.port}`);
});
