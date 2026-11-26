// Kestrel Ridge — HUD: glass-cockpit instruments drawn on a 2D canvas
// over the 3D view. Airspeed tape (left), altitude tape (right), heading
// strip (top), artificial horizon with pitch ladder (centre), throttle and
// fuel gauges, mission timer, rings remaining, score, centre reticle,
// flight-path marker, next-ring direction arrow and message banners.
// Dark translucent panels, lit cyan/amber numerals — instruments that look
// flown, not drawn.

export function createHud(canvas) {
  const ctx = canvas.getContext('2d');
  const hud = { canvas, ctx };

  function resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.floor(canvas.clientWidth * dpr);
    canvas.height = Math.floor(canvas.clientHeight * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  window.addEventListener('resize', resize);
  resize();
  hud.resize = resize;

  const CYAN = '#7fe7ff';
  const AMBER = '#ffc21c';
  const GREEN = '#5dff8f';
  const RED = '#ff5a4e';
  const PANEL = 'rgba(8, 18, 28, 0.62)';
  const PANEL_LINE = 'rgba(127, 231, 255, 0.45)';

  function panel(x, y, w, h) {
    ctx.fillStyle = PANEL;
    ctx.fillRect(x, y, w, h);
    ctx.strokeStyle = PANEL_LINE;
    ctx.lineWidth = 1;
    ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
  }

  function text(str, x, y, size, color, align = 'left', weight = '600') {
    ctx.font = `${weight} ${size}px "Segoe UI", system-ui, sans-serif`;
    ctx.fillStyle = color;
    ctx.textAlign = align;
    ctx.textBaseline = 'middle';
    ctx.fillText(str, x, y);
  }

  // A scrolling tape: a scale of values with the current one boxed in the
  // middle and tick labels sliding past.
  function drawTape(x, y, w, h, value, step, unit, formatValue) {
    panel(x, y, w, h);
    const centre = y + h / 2;
    const pxPerUnit = h / (step * 8);
    ctx.save();
    ctx.beginPath();
    ctx.rect(x, y, w, h);
    ctx.clip();
    ctx.strokeStyle = 'rgba(127,231,255,0.5)';
    ctx.fillStyle = 'rgba(220,240,255,0.85)';
    ctx.font = '600 13px "Segoe UI", system-ui, sans-serif';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    const low = Math.floor((value - step * 4) / step) * step;
    for (let v = low; v <= value + step * 4; v += step) {
      const yy = centre - (v - value) * pxPerUnit;
      const major = Math.abs(v % (step * 5)) < 0.001;
      ctx.beginPath();
      ctx.moveTo(x + w - (major ? 16 : 9), yy);
      ctx.lineTo(x + w, yy);
      ctx.stroke();
      if (major && yy > y + 18 && yy < y + h - 18) ctx.fillText(formatValue(v), x + 6, yy);
    }
    ctx.restore();
    // Current value box.
    ctx.fillStyle = 'rgba(10, 30, 44, 0.92)';
    ctx.fillRect(x - 4, centre - 15, w + 8, 30);
    ctx.strokeStyle = CYAN;
    ctx.strokeRect(x - 3.5, centre - 14.5, w + 7, 29);
    text(formatValue(value), x + w / 2, centre, 17, '#ffffff', 'center', '700');
    // Unit at the top of the tape, clear of the tick labels.
    text(unit, x + w / 2, y + 12, 11, 'rgba(220,240,255,0.7)', 'center');
  }

  function drawHeadingStrip(w, heading) {
    const y = 14;
    const h = 34;
    panel(w / 2 - 190, y, 380, h);
    const cx = w / 2;
    ctx.save();
    ctx.beginPath();
    ctx.rect(w / 2 - 190, y, 380, h);
    ctx.clip();
    const pxPerDeg = 3.2;
    ctx.font = '600 12px "Segoe UI", system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (let d = Math.floor(heading - 60); d <= heading + 60; d += 5) {
      const dd = ((d % 360) + 360) % 360;
      const xx = cx + (d - heading) * pxPerDeg;
      const major = dd % 30 === 0;
      ctx.strokeStyle = 'rgba(127,231,255,0.6)';
      ctx.beginPath();
      ctx.moveTo(xx, y + h - (major ? 12 : 7));
      ctx.lineTo(xx, y + h);
      ctx.stroke();
      if (major) {
        const label = dd === 0 ? 'N' : dd === 90 ? 'E' : dd === 180 ? 'S' : dd === 270 ? 'W' : String(dd).padStart(3, '0');
        ctx.fillStyle = 'rgba(220,240,255,0.9)';
        ctx.fillText(label, xx, y + 13);
      }
    }
    ctx.restore();
    // Lubber line and current heading.
    ctx.strokeStyle = AMBER;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(cx, y + h - 2);
    ctx.lineTo(cx, y + h - 14);
    ctx.stroke();
    text(String(Math.round(heading)).padStart(3, '0') + '°', cx, y + h + 16, 15, '#ffffff', 'center', '700');
  }

  function drawHorizon(w, h, pitchDeg, rollDeg, airspeed, verticalSpeed) {
    // Compact attitude indicator at bottom centre, clear of the chase-view
    // plane (which sits near the middle of the screen). The sky/ground
    // halves are translucent washes so the world shows through faintly
    // instead of hiding the aircraft behind a solid disc.
    const cx = w / 2;
    const cy = h - 148;
    const R = Math.min(w, h) * 0.13;
    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, R, 0, Math.PI * 2);
    ctx.clip();
    ctx.translate(cx, cy);
    ctx.rotate((-rollDeg * Math.PI) / 180);
    const pitchPx = (pitchDeg / 90) * R * 2.4;
    ctx.translate(0, pitchPx);
    ctx.globalAlpha = 0.55;
    ctx.fillStyle = '#2f6fb4';
    ctx.fillRect(-R - 4, -R * 3, R * 2 + 8, R * 3);
    ctx.fillStyle = '#6b4a26';
    ctx.fillRect(-R - 4, 0, R * 2 + 8, R * 3);
    ctx.globalAlpha = 1;
    // Pitch ladder.
    ctx.strokeStyle = 'rgba(255,255,255,0.85)';
    ctx.lineWidth = 1.4;
    ctx.font = '600 11px "Segoe UI", system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (const deg of [-30, -20, -10, 10, 20, 30]) {
      const yy = (-deg / 90) * R * 2.4;
      const half = deg === 0 ? 46 : 30;
      ctx.beginPath();
      ctx.moveTo(-half, yy);
      ctx.lineTo(half, yy);
      ctx.stroke();
      ctx.fillStyle = '#ffffff';
      ctx.fillText(String(Math.abs(deg)), -half - 14, yy);
      ctx.fillText(String(Math.abs(deg)), half + 14, yy);
    }
    ctx.restore();
    // Fixed wings and boresight: the plane symbol never moves.
    ctx.strokeStyle = AMBER;
    ctx.lineWidth = 2.4;
    ctx.beginPath();
    ctx.moveTo(cx - 58, cy);
    ctx.lineTo(cx - 18, cy);
    ctx.moveTo(cx + 18, cy);
    ctx.lineTo(cx + 58, cy);
    ctx.moveTo(cx - 5, cy - 5);
    ctx.lineTo(cx + 5, cy + 5);
    ctx.moveTo(cx + 5, cy - 5);
    ctx.lineTo(cx - 5, cy + 5);
    ctx.stroke();
    // Ring around the attitude indicator.
    ctx.strokeStyle = PANEL_LINE;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(cx, cy, R + 1, 0, Math.PI * 2);
    ctx.stroke();
    // Roll pointer at the top.
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate((-rollDeg * Math.PI) / 180);
    ctx.fillStyle = AMBER;
    ctx.beginPath();
    ctx.moveTo(0, -R - 2);
    ctx.lineTo(-6, -R - 12);
    ctx.lineTo(6, -R - 12);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
    // Vertical speed under the horizon.
    const vsText = (verticalSpeed >= 0 ? '+' : '') + verticalSpeed.toFixed(1) + ' m/s';
    text('VS ' + vsText, cx, cy + R + 22, 13, verticalSpeed < -4 ? RED : 'rgba(220,240,255,0.9)', 'center');
  }

  function drawGauge(x, y, w, h, label, fraction, color, valueText) {
    panel(x, y, w, h);
    text(label, x + 10, y + 12, 11, 'rgba(220,240,255,0.75)');
    ctx.fillStyle = 'rgba(255,255,255,0.14)';
    ctx.fillRect(x + 10, y + 24, w - 20, 10);
    ctx.fillStyle = color;
    ctx.fillRect(x + 10, y + 24, (w - 20) * Math.max(0, Math.min(1, fraction)), 10);
    text(valueText, x + w - 10, y + 12, 12, '#ffffff', 'right', '700');
  }

  hud.draw = function draw(state) {
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    if (!w || !h) return;
    ctx.clearRect(0, 0, w, h);
    const f = state.flight;
    const m = state.mission;

    drawHeadingStrip(w, f.heading);
    drawTape(16, h * 0.30, 86, 240, f.airspeed * 1.94384, 10, 'KT', (v) => String(Math.round(v)));
    drawTape(w - 102, h * 0.30, 86, 240, Math.max(0, f.position.y), 100, 'M ALT', (v) => String(Math.round(v)));
    drawHorizon(w, h, state.pitchDeg, state.rollDeg, f.airspeed, f.verticalSpeed);

    // Throttle and fuel, bottom left.
    drawGauge(16, h - 108, 190, 44, 'THROTTLE', f.throttle, CYAN, Math.round(f.throttle * 100) + '%');
    drawGauge(16, h - 56, 190, 44, 'FUEL', f.fuel / 100, f.fuel < 15 ? RED : GREEN, Math.round(f.fuel) + ' L');
    // Score and mission, bottom right.
    panel(w - 216, h - 108, 200, 96);
    text(m.mode === 'menu' ? 'KESTREL RIDGE' : m.mode.replace('-', ' ').toUpperCase(), w - 206, h - 92, 13, CYAN, 'left', '700');
    text('SCORE  ' + m.score, w - 206, h - 66, 16, '#ffffff', 'left', '700');
    if (m.mode === 'ring-run') {
      text(`RINGS  ${m.ringsPassed}/${m.ringsTotal}`, w - 206, h - 42, 14, '#ffffff', 'left');
      text('TIME  ' + m.timer.toFixed(1) + 's', w - 26, h - 42, 14, AMBER, 'right', '700');
    } else if (m.mode === 'free-flight') {
      text(`FUEL RINGS  ${m.fuelRingsPassed}`, w - 206, h - 42, 14, '#ffffff', 'left');
      text('TIME  ' + m.timer.toFixed(1) + 's', w - 26, h - 42, 14, AMBER, 'right', '700');
    } else if (m.mode === 'valley-landing') {
      text('LAND ON THE RUNWAY', w - 206, h - 42, 14, '#ffffff', 'left');
    }

    // Damage bar, top right under the heading strip.
    if (f.damage > 0) {
      drawGauge(w - 216, 56, 200, 44, 'DAMAGE', f.damage / 100, f.damage > 60 ? RED : AMBER, Math.round(f.damage) + '%');
    }

    // Next-ring arrow: points toward the next ring when it is off-screen.
    // On-screen the ring itself is visible, so only a small hollow
    // diamond marks it instead of covering it with a triangle.
    if (state.nextRingScreen) {
      const n = state.nextRingScreen;
      ctx.save();
      ctx.translate(n.x, n.y);
      if (n.onScreen) {
        ctx.strokeStyle = CYAN;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(0, -12);
        ctx.lineTo(12, 0);
        ctx.lineTo(0, 12);
        ctx.lineTo(-12, 0);
        ctx.closePath();
        ctx.stroke();
      } else {
        ctx.rotate(n.angle);
        ctx.fillStyle = AMBER;
        ctx.beginPath();
        ctx.moveTo(14, 0);
        ctx.lineTo(-10, -9);
        ctx.lineTo(-10, 9);
        ctx.closePath();
        ctx.fill();
        ctx.restore();
        ctx.save();
        ctx.translate(n.x, n.y);
        text(n.distance + ' m', 0, 24, 12, AMBER, 'center', '700');
      }
      ctx.restore();
    }

    // Stall warning.
    if (f.stalled) {
      text('STALL', w / 2, h * 0.24, 30, RED, 'center', '800');
      text('NOSE DOWN — GAIN SPEED', w / 2, h * 0.24 + 30, 14, RED, 'center', '700');
    }
    if (state.airbrake) {
      text('AIRBRAKE', w / 2, h * 0.24, 22, AMBER, 'center', '800');
    }
    if (f.onGround && f.airspeed < 2 && m.mode !== 'menu') {
      text('ON THE GROUND — HOLD SHIFT TO TAKE OFF', w / 2, 128, 14, 'rgba(220,240,255,0.9)', 'center', '700');
    }

    // Message banner: under the heading strip, clear of the aircraft.
    if (m.message) {
      ctx.font = '700 20px "Segoe UI", system-ui, sans-serif';
      const tw = ctx.measureText(m.message).width;
      panel(w / 2 - tw / 2 - 18, 66, tw + 36, 40);
      text(m.message, w / 2, 66 + 21, 18, '#ffffff', 'center', '700');
    }

    // Best results, top left.
    if (m.best.ringTime) text('BEST RING RUN  ' + m.best.ringTime.toFixed(1) + 's', 16, 66, 12, 'rgba(220,240,255,0.8)');
    if (m.best.landing) text('BEST LANDING  +' + m.best.landing, 16, 84, 12, 'rgba(220,240,255,0.8)');
  };

  return hud;
}
