/* Virtuele encoder-wielen met touch-events (touchstart/touchmove/touchend).
 * Elk wiel verzamelt vingerbeweging in pixels en zet die om in hele stappen
 * (pxPerStep pixels = 1 stap). Stappen worden gebundeld (25 ms) en verstuurd via
 * de sender die app.js instelt. Muis-fallback voor desktop is ingebouwd. */
(function () {
  'use strict';

  var sender = function () {};
  var FLUSH_MS = 25;
  var wheels = [];

  function setSender(fn) { sender = fn; }

  function round2(n) { return Math.round(n * 100) / 100; }

  function Wheel(parent, opts) {
    this.attr = opts.attr;
    this.label = opts.label;
    this.pxPerStep = opts.pxPerStep || 7;   // pixels per stap
    this.stepSize = opts.stepSize || 1;      // % per stap
    this.invert = !!opts.invert;
    // Versnelling: sneller slepen = grotere stappen (alleen als accel is ingeschakeld)
    this.accel = !!opts.accel;
    this.accelStart = opts.accelStart || 0.6;  // px/ms waarboven versnelling begint
    this.accelGain = opts.accelGain || 4;      // extra vermenigvuldiger per px/ms
    this.accelMax = opts.accelMax || 25;       // maximale vermenigvuldiger
    this.lastT = 0;
    this.speed = 0;
    this.accum = 0;
    this.pending = 0;
    this.offset = 0;
    this.activeId = null;
    this.lastY = 0;
    this.flushTimer = null;
    this.lastMoveTime = 0;
    this.build(parent, opts.className);
    this.bind();
    wheels.push(this);
  }

  Wheel.prototype.build = function (parent, className) {
    var root = document.createElement('div');
    root.className = 'wheel ' + (className || '');
    var title = document.createElement('div');
    title.className = 'wheel-label';
    title.textContent = this.label;
    var track = document.createElement('div');
    track.className = 'wheel-track';
    var grip = document.createElement('div');
    grip.className = 'wheel-grip';
    track.appendChild(grip);
    root.appendChild(title);
    root.appendChild(track);
    parent.appendChild(root);
    this.root = root;
    this.track = track;
  };

  Wheel.prototype.bind = function () {
    var self = this;
    var el = this.track;

    el.addEventListener('touchstart', function (e) {
      e.preventDefault();
      if (self.activeId !== null) return;
      var t = e.changedTouches[0];
      self.begin(t.identifier, t.clientY);
    }, { passive: false });

    el.addEventListener('touchmove', function (e) {
      e.preventDefault();
      if (self.activeId === null) return;
      for (var i = 0; i < e.changedTouches.length; i++) {
        var t = e.changedTouches[i];
        if (t.identifier === self.activeId) { self.move(t.clientY); break; }
      }
    }, { passive: false });

    function endHandler(e) {
      e.preventDefault();
      if (self.activeId === null) return;
      for (var i = 0; i < e.changedTouches.length; i++) {
        if (e.changedTouches[i].identifier === self.activeId) { self.end(); break; }
      }
    }
    el.addEventListener('touchend', endHandler, { passive: false });
    el.addEventListener('touchcancel', endHandler, { passive: false });

    // Muis-fallback (desktop)
    el.addEventListener('mousedown', function (e) {
      if (self.activeId !== null) return;
      e.preventDefault();
      self.begin('mouse', e.clientY);
      function mm(ev) { self.move(ev.clientY); }
      function mu() {
        window.removeEventListener('mousemove', mm);
        window.removeEventListener('mouseup', mu);
        self.end();
      }
      window.addEventListener('mousemove', mm);
      window.addEventListener('mouseup', mu);
    });
  };

  Wheel.prototype.begin = function (id, y) {
    this.activeId = id;
    this.lastY = y;
    this.lastT = performance.now();
    this.speed = 0;
    this.accum = 0;
    this.root.classList.add('active');
  };

  Wheel.prototype.move = function (y) {
    var dy = this.lastY - y;        // omhoog slepen = positief
    this.lastY = y;
    if (this.invert) dy = -dy;
    this.offset = (this.offset + dy) % 28;
    this.track.style.backgroundPositionY = this.offset + 'px';

    var factor = 1;
    if (this.accel) {
      var now = performance.now();
      var dt = Math.max(now - this.lastT, 1);
      this.lastT = now;
      // Gladgestreken snelheid, zodat één snelle touch-event niet direct uitschiet
      this.speed = this.speed * 0.6 + (Math.abs(dy) / dt) * 0.4;
      if (this.speed > this.accelStart) {
        factor = Math.min(this.accelMax, 1 + (this.speed - this.accelStart) * this.accelGain);
      }
    }
    this.accum += (dy * factor) / this.pxPerStep;
    var steps = this.accum < 0 ? Math.ceil(this.accum) : Math.floor(this.accum);
    if (steps !== 0) {
      this.accum -= steps;
      this.pending += steps;
      this.schedule();
    }
  };

  Wheel.prototype.end = function () {
    this.activeId = null;
    this.accum = 0;
    this.root.classList.remove('active');
    this.flush();
  };

  Wheel.prototype.schedule = function () {
    var self = this;
    if (this.flushTimer) return;
    this.flushTimer = setTimeout(function () { self.flush(); }, FLUSH_MS);
  };

  Wheel.prototype.flush = function () {
    clearTimeout(this.flushTimer);
    this.flushTimer = null;
    if (this.pending === 0) return;
    var amount = round2(this.pending * this.stepSize);
    this.pending = 0;
    sender({ type: 'encoder', attr: this.attr, amount: amount });
  };

  // Voorkom iOS-gestures (pinch-zoom, bounce) buiten invoervelden
  document.addEventListener('gesturestart', function (e) { e.preventDefault(); });
  document.addEventListener('gesturechange', function (e) { e.preventDefault(); });
  document.addEventListener('touchmove', function (e) {
    if (!e.target.closest('.scrollable, input, dialog')) e.preventDefault();
  }, { passive: false });

  window.Encoders = { Wheel: Wheel, setSender: setSender };
})();
