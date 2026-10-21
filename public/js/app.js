(function () {
  'use strict';

  /* ================= WebSocket ================= */
  var ws = null;
  var reconnectDelay = 500;
  var connEl = document.getElementById('conn');
  var connText = document.getElementById('conn-text');
  var queue = [];
  var ma3Dialog = document.getElementById('ma3-dialog');
  var ma3Waiting = false;

  var ma3State = { ip: '', port: 8000, mode: 'simulation' };

  function setConn(state, text) {
    connEl.className = 'conn ' + state;
    connText.textContent = text;
  }

  function describeState() {
    if (ma3State.mode === 'simulation') return 'Simulatiemodus (geen MA3-adres ingesteld)';
    return 'Commando’s via OSC (UDP) naar ' + ma3State.ip + ':' + ma3State.port + '. Er is geen terugkoppeling, dus de verbinding kan niet worden gecontroleerd.';
  }

  function renderStatus() {
    document.getElementById('ma3-state').textContent = describeState();
    if (ma3State.mode === 'simulation') setConn('sim', 'Simulatie');
    else setConn('on', ma3State.ip + ':' + ma3State.port);
  }

  function connect() {
    var proto = location.protocol === 'https:' ? 'wss://' : 'ws://';
    ws = new WebSocket(proto + location.host + '/ws');
    ws.onopen = function () {
      reconnectDelay = 500;
      setConn('sim', 'Server');
      while (queue.length) ws.send(queue.shift());
    };
    ws.onmessage = function (ev) {
      var msg;
      try { msg = JSON.parse(ev.data); } catch (e) { return; }
      if (msg.type === 'configError') {
        document.getElementById('ma3-error').textContent = msg.error;
        return;
      }
      if (msg.type === 'presets' && window.ma3OnPresets) { window.ma3OnPresets(msg); return; }
      if (msg.type !== 'status') return;
      ma3State = msg;
      if (ma3Dialog.open && ma3Waiting) { ma3Waiting = false; ma3Dialog.close(); }
      renderStatus();
    };
    ws.onclose = function () {
      setConn('off', 'Offline');
      setTimeout(connect, reconnectDelay);
      reconnectDelay = Math.min(reconnectDelay * 2, 5000);
    };
    ws.onerror = function () { try { ws.close(); } catch (e) {} };
  }

  function send(obj) {
    var data = JSON.stringify(obj);
    if (ws && ws.readyState === WebSocket.OPEN) ws.send(data);
    else if (obj.type === 'cmd' && queue.length < 20) queue.push(data); // encoders niet bufferen
  }
  function cmd(text) { send({ type: 'cmd', cmd: text }); }

  setInterval(function () {
    if (ws && ws.readyState === WebSocket.OPEN) ws.send('{"type":"ping"}');
  }, 10000);

  Encoders.setSender(send);
  connect();

  var ipInput = document.getElementById('ma3-ip');
  var portInput = document.getElementById('ma3-port');
  var errEl = document.getElementById('ma3-error');
  connEl.addEventListener('click', function () {
    ipInput.value = ma3State.ip || '127.0.0.1';
    portInput.value = ma3State.port || 8000;
    errEl.textContent = '';
    document.getElementById('ma3-state').textContent = describeState();
    ma3Dialog.showModal();
  });
  document.getElementById('ma3-cancel').addEventListener('click', function () { ma3Waiting = false; ma3Dialog.close(); });
  document.getElementById('ma3-local').addEventListener('click', function () { ipInput.value = '127.0.0.1'; portInput.value = 8000; });
  document.getElementById('ma3-save').addEventListener('click', function () {
    var ip = ipInput.value.trim();
    var port = parseInt(portInput.value, 10);
    if (!/^[A-Za-z0-9]([A-Za-z0-9.-]*[A-Za-z0-9])?$/.test(ip) || !(port >= 1 && port <= 65535)) {
      errEl.textContent = 'Ongeldig IP-adres of poort';
      return;
    }
    errEl.textContent = '';
    if (!ws || ws.readyState !== WebSocket.OPEN) { errEl.textContent = 'Geen verbinding met de server'; return; }
    ma3Waiting = true;
    send({ type: 'setConfig', ip: ip, port: port });
  });

  /* ================= Navigatie ================= */
  var navBtns = document.querySelectorAll('.nav-btn');
  var pages = document.querySelectorAll('.page');
  function showPage(name) {
    navBtns.forEach(function (b) { b.classList.toggle('active', b.dataset.page === name); });
    pages.forEach(function (p) { p.classList.toggle('active', p.id === 'page-' + name); });
    try { localStorage.setItem('ma3.page', name); } catch (e) {}
  }
  navBtns.forEach(function (b) { b.addEventListener('click', function () { showPage(b.dataset.page); }); });
  try { var saved = localStorage.getItem('ma3.page'); if (saved) showPage(saved); } catch (e) {}

  ['bar-buttons', 'seq-overview', 'color-grid', 'config-list'].forEach(function (id) {
    document.getElementById(id).classList.add('scrollable');
  });

  /* ================= Encoders ================= */
  var Wheel = Encoders.Wheel;
  new Wheel(document.getElementById('wheel-pan'), { attr: 'Pan', label: 'Pan', pxPerStep: 6, stepSize: 0.05 });
  new Wheel(document.getElementById('wheel-tilt'), { attr: 'Tilt', label: 'Tilt', pxPerStep: 6, stepSize: 0.05 });
  var mid = document.getElementById('wheels-middle');
  new Wheel(mid, { attr: 'Zoom', label: 'Zoom', pxPerStep: 7, stepSize: 1 });
  new Wheel(mid, { attr: 'Focus', label: 'Focus', pxPerStep: 7, stepSize: 1 });

  var grid = document.getElementById('shaper-grid');
  for (var i = 1; i <= 4; i++) {
    var box = document.createElement('div');
    box.className = 'shaper-blade';
    box.innerHTML = '<h3>Blade ' + i + '</h3><div class="pair"></div>';
    var pair = box.querySelector('.pair');
    grid.appendChild(box);
    new Wheel(pair, { attr: 'Blade' + i, label: 'Insteek', pxPerStep: 7, stepSize: 0.05, accel: true });
    new Wheel(pair, { attr: 'Blade' + i + 'Rot', label: 'Rotatie', pxPerStep: 7, stepSize: 0.05, accel: true });
  }


  /* ================= Cues & Seq ================= */
  var selectedSeq = null;
  var storeMode = 'merge';
  var overview = document.getElementById('seq-overview');
  var selLabel = document.getElementById('sel-label');
  var seqStart = document.getElementById('seq-start');
  var seqCount = document.getElementById('seq-count');
  var cueNumber = document.getElementById('cue-number');

  function intVal(el, def, min, max) {
    var n = parseInt(el.value, 10);
    if (!isFinite(n)) n = def;
    return Math.min(max, Math.max(min, n));
  }

  var savedStart = parseInt(localStorage.getItem('ma3.seqStart'), 10);
  if (isFinite(savedStart) && savedStart > 0) seqStart.value = savedStart;

  function buildOverview() {
    var start = intVal(seqStart, 201, 1, 99999);
    localStorage.setItem('ma3.seqStart', String(start));
    var count = intVal(seqCount, 30, 1, 200);
    overview.innerHTML = '';
    for (var n = start; n < start + count; n++) {
      var b = document.createElement('button');
      b.className = 'seq-chip' + (n === selectedSeq ? ' selected' : '');
      b.textContent = n;
      b.dataset.seq = n;
      overview.appendChild(b);
    }
    if (selectedSeq === null || selectedSeq < start || selectedSeq >= start + count) selectSeq(start);
  }

  function selectSeq(n) {
    selectedSeq = n;
    selLabel.textContent = 'Seq ' + n;
    overview.querySelectorAll('.seq-chip').forEach(function (c) {
      c.classList.toggle('selected', parseInt(c.dataset.seq, 10) === n);
    });
  }

  overview.addEventListener('click', function (e) {
    var chip = e.target.closest('.seq-chip');
    if (chip) selectSeq(parseInt(chip.dataset.seq, 10));
  });
  document.getElementById('seq-build').addEventListener('click', buildOverview);
  seqStart.addEventListener('change', buildOverview);
  seqCount.addEventListener('change', buildOverview);

  function doUpdate() {
    cmd('Update /NoConfirmation');
    cmd('ClearAll');
  }
  window.ma3Update = doUpdate;

  function cueVal() {
    var v = parseFloat(cueNumber.value);
    return isFinite(v) && v > 0 ? v : 1;
  }

  document.getElementById('edit-cue1').addEventListener('click', function () {
    cmd('Edit Sequence ' + selectedSeq + ' Cue 1');
  });

  var modeBtns = document.querySelectorAll('#store-mode .seg');
  modeBtns.forEach(function (b) {
    b.addEventListener('click', function () {
      storeMode = b.dataset.mode;
      modeBtns.forEach(function (x) { x.classList.toggle('active', x === b); });
    });
  });

  function storeCmd(seq, cue) {
    return 'Store Sequence ' + seq + ' Cue ' + cue + ' /' + storeMode;
  }
  document.getElementById('store-cue').addEventListener('click', function () {
    cmd(storeCmd(selectedSeq, cueVal()));
  });
  document.getElementById('update-btn').addEventListener('click', function () {
    doUpdate();
  });
  buildOverview();

  /* ================= Fixtures & Kleur ================= */
  var selMode = 'fixture';
  var selInput = document.getElementById('sel-input');
  var selBtns = document.querySelectorAll('#sel-mode .seg');
  selBtns.forEach(function (b) {
    b.addEventListener('click', function () {
      selMode = b.dataset.mode;
      selBtns.forEach(function (x) { x.classList.toggle('active', x === b); });
      selInput.placeholder = selMode === 'group' ? 'bv. 3 of 1 thru 4' : 'bv. 1 thru 8 + 12';
    });
  });

  var keys = ['7', '8', '9', 'Thru', '4', '5', '6', '+', '1', '2', '3', '-', '0', '.', '⌫', 'C'];
  var keypad = document.getElementById('keypad');
  keys.forEach(function (k) {
    var b = document.createElement('button');
    b.textContent = k;
    b.addEventListener('click', function () {
      var v = selInput.value;
      if (k === '⌫') selInput.value = v.slice(0, -1);
      else if (k === 'C') selInput.value = '';
      else if (k === 'Thru' || k === '+' || k === '-') selInput.value = (v.trim() + ' ' + k.toLowerCase() + ' ').replace(/^\s+/, '');
      else selInput.value = v + k;
    });
    keypad.appendChild(b);
  });

  document.getElementById('sel-clear').addEventListener('click', function () { selInput.value = ''; });
  document.getElementById('sel-apply').addEventListener('click', function () {
    var text = selInput.value.replace(/[^0-9a-zA-Z .+\-]/g, '').trim();
    if (!text) return;
    cmd((selMode === 'group' ? 'Group ' : 'Fixture ') + text);
    selInput.value = '';
  });

  var colorGrid = document.getElementById('color-grid');
  var preStart = document.getElementById('pre-start');
  var preCount = document.getElementById('pre-count');
  var preOsc = document.getElementById('pre-osc');
  var preStatus = document.getElementById('preset-status');
  var PRE_POOL = 4;

  ['start', 'count', 'osc'].forEach(function (k) {
    var el = document.getElementById('pre-' + k);
    var v = localStorage.getItem('ma3.pre.' + k);
    if (v) el.value = v;
    el.addEventListener('change', function () { localStorage.setItem('ma3.pre.' + k, el.value); });
  });

  function renderPresets(msg) {
    colorGrid.innerHTML = '';
    var have = {};
    msg.items.forEach(function (i) { have[i.no] = i.name; });
    for (var n = msg.start; n <= msg.end; n++) {
      (function (n) {
        var exists = Object.prototype.hasOwnProperty.call(have, n);
        var b = document.createElement('button');
        b.className = 'swatch' + (exists ? '' : ' missing');
        b.disabled = !exists;
        var num = document.createElement('span');
        num.textContent = PRE_POOL + '.' + n;
        var name = document.createElement('small');
        name.textContent = exists ? (have[n] || '(geen naam)') : 'leeg';
        b.appendChild(num);
        b.appendChild(name);
        b.addEventListener('click', function () {
          colorGrid.querySelectorAll('.swatch.selected').forEach(function (s) { s.classList.remove('selected'); });
          b.classList.add('selected');
          cmd('Preset ' + PRE_POOL + '.' + n);
        });
        colorGrid.appendChild(b);
      })(n);
    }
  }

  window.ma3OnPresets = function (msg) {
    document.getElementById('pre-fetch').disabled = false;
    if (!msg.ok) { preStatus.textContent = msg.error; return; }
    preStatus.textContent = msg.items.length + ' gevonden';
    renderPresets(msg);
  };

  document.getElementById('pre-fetch').addEventListener('click', function () {
    var btn = document.getElementById('pre-fetch');
    btn.disabled = true;
    preStatus.textContent = 'Ophalen...';
    send({
      type: 'fetchPresets', pool: PRE_POOL,
      start: intVal(preStart, 1, 1, 9999), count: intVal(preCount, 32, 1, 200), oscId: intVal(preOsc, 3, 1, 99)
    });
  });

  /* ================= Onderste knoppenbalk ================= */
  var DEFAULT_BUTTONS = [
    { id: 'highlight', label: 'Highlight', cmd: 'Highlight', visible: true },
    { id: 'next', label: 'Next', cmd: 'Next', visible: true },
    { id: 'prev', label: 'Previous', cmd: 'Previous', visible: true },
    { id: 'set', label: 'Set', cmd: "Set Selection Property 'Active'", visible: true },
    { id: 'full', label: 'Full', cmd: 'At Full', visible: true },
    { id: 'clear', label: 'Clear', cmd: 'Clear', visible: true },
    { id: 'esc', label: 'Esc', cmd: 'Escape', visible: true },
    { id: 'store', label: 'Store', cmd: 'Store', visible: false },
    { id: 'update', label: 'Update', cmd: 'Update', visible: false }
  ];
  var BAR_KEY = 'ma3.bar.v3';
  var barButtons = loadBar();
  var barEl = document.getElementById('bar-buttons');
  var dialog = document.getElementById('config-dialog');
  var listEl = document.getElementById('config-list');

  function clone(o) { return JSON.parse(JSON.stringify(o)); }
  function loadBar() {
    try {
      var s = JSON.parse(localStorage.getItem(BAR_KEY));
      if (Array.isArray(s) && s.length) return s;
    } catch (e) {}
    return clone(DEFAULT_BUTTONS);
  }
  function saveBar() {
    try { localStorage.setItem(BAR_KEY, JSON.stringify(barButtons)); } catch (e) {}
  }

  function renderBar() {
    barEl.innerHTML = '';
    barButtons.forEach(function (def) {
      if (!def.visible) return;
      var b = document.createElement('button');
      b.className = 'bar-btn';
      b.textContent = def.label;
      b.addEventListener('touchstart', function () { b.classList.add('pressed'); }, { passive: true });
      ['touchend', 'touchcancel'].forEach(function (t) {
        b.addEventListener(t, function () { b.classList.remove('pressed'); }, { passive: true });
      });
      b.addEventListener('click', function () {
        if (def.cmd === 'Update' && window.ma3Update) window.ma3Update();
        else cmd(def.cmd);
      });
      barEl.appendChild(b);
    });
  }

  function renderConfig() {
    listEl.innerHTML = '';
    barButtons.forEach(function (def, idx) {
      var li = document.createElement('li');
      var chk = document.createElement('input');
      chk.type = 'checkbox';
      chk.checked = def.visible;
      chk.addEventListener('change', function () { def.visible = chk.checked; saveBar(); renderBar(); });
      var name = document.createElement('span');
      name.className = 'name';
      name.textContent = def.label;
      var small = document.createElement('small');
      small.textContent = def.cmd;
      name.appendChild(small);
      li.appendChild(chk);
      li.appendChild(name);
      [['▲', -1], ['▼', 1]].forEach(function (a) {
        var btn = document.createElement('button');
        btn.textContent = a[0];
        btn.addEventListener('click', function () {
          var to = idx + a[1];
          if (to < 0 || to >= barButtons.length) return;
          var tmp = barButtons[idx]; barButtons[idx] = barButtons[to]; barButtons[to] = tmp;
          saveBar(); renderBar(); renderConfig();
        });
        li.appendChild(btn);
      });
      if (def.custom) {
        var del = document.createElement('button');
        del.textContent = '✕';
        del.addEventListener('click', function () {
          barButtons.splice(idx, 1);
          saveBar(); renderBar(); renderConfig();
        });
        li.appendChild(del);
      }
      listEl.appendChild(li);
    });
  }

  document.getElementById('bar-config').addEventListener('click', function () {
    renderConfig();
    if (dialog.showModal) dialog.showModal(); else dialog.setAttribute('open', '');
  });
  document.getElementById('config-close').addEventListener('click', function () {
    if (dialog.close) dialog.close(); else dialog.removeAttribute('open');
  });
  document.getElementById('config-reset').addEventListener('click', function () {
    barButtons = clone(DEFAULT_BUTTONS);
    saveBar(); renderBar(); renderConfig();
  });
  document.getElementById('custom-add').addEventListener('click', function () {
    var labelEl = document.getElementById('custom-label');
    var cmdEl = document.getElementById('custom-cmd');
    var label = labelEl.value.trim();
    var c = cmdEl.value.trim();
    if (!label || !c) return;
    barButtons.push({ id: 'custom-' + Date.now(), label: label, cmd: c, visible: true, custom: true });
    labelEl.value = '';
    cmdEl.value = '';
    saveBar(); renderBar(); renderConfig();
  });

  renderBar();

  /* ================= Service worker ================= */
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', function () {
      navigator.serviceWorker.register('/sw.js').catch(function () {});
    });
  }
})();
