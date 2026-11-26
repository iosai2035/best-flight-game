// Kestrel Ridge — input: keyboard and mouse.
// W/S pitch, A/D roll, Q/E yaw, Shift/Ctrl throttle, C camera, R reset,
// M mute, P pause, 1/2/3 choose a mission, Enter start. Mouse drag steers:
// dragging left/right rolls, up/down pitches, like a stick. All input is
// gathered into one plain object the flight model reads each frame.

export function createInput(canvas) {
  const input = {
    pitch: 0, // -1..1, positive pulls the nose up
    roll: 0, // -1..1, positive rolls right
    yaw: 0, // -1..1, positive yaws right
    throttleTarget: 0.62,
    airbrake: false, // held Space: throttle to idle and add drag
    keys: new Set(),
    dragging: false,
    dragDX: 0,
    dragDY: 0,
    // One-shot events consumed by main.js each frame.
    pressed: new Set(),
    mouseSteer: { x: 0, y: 0 },
  };

  const KEY_ACTIONS = {
    KeyW: 'pitchUp',
    ArrowUp: 'pitchUp',
    KeyS: 'pitchDown',
    ArrowDown: 'pitchDown',
    KeyA: 'rollLeft',
    ArrowLeft: 'rollLeft',
    KeyD: 'rollRight',
    ArrowRight: 'rollRight',
    KeyQ: 'yawLeft',
    KeyE: 'yawRight',
    ShiftLeft: 'throttleUp',
    ShiftRight: 'throttleUp',
    ControlLeft: 'throttleDown',
    ControlRight: 'throttleDown',
  };

  function onKeyDown(e) {
    if (e.repeat) return;
    input.keys.add(e.code);
    input.pressed.add(e.code);
    if (KEY_ACTIONS[e.code] || e.code === 'Space') e.preventDefault();
  }
  function onKeyUp(e) {
    input.keys.delete(e.code);
  }
  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);
  window.addEventListener('blur', () => input.keys.clear());

  let lastX = 0;
  let lastY = 0;
  canvas.addEventListener('pointerdown', (e) => {
    input.dragging = true;
    lastX = e.clientX;
    lastY = e.clientY;
    canvas.setPointerCapture(e.pointerId);
  });
  canvas.addEventListener('pointermove', (e) => {
    if (!input.dragging) return;
    const dx = e.clientX - lastX;
    const dy = e.clientY - lastY;
    lastX = e.clientX;
    lastY = e.clientY;
    input.dragDX += dx;
    input.dragDY += dy;
  });
  function endDrag() {
    input.dragging = false;
    input.mouseSteer.x = 0;
    input.mouseSteer.y = 0;
  }
  canvas.addEventListener('pointerup', endDrag);
  canvas.addEventListener('pointercancel', endDrag);

  // Read the held keys into smooth stick deflections each frame.
  input.update = function update(dt) {
    const k = input.keys;
    const targetPitch = (k.has('KeyW') || k.has('ArrowUp') ? 1 : 0)
      + (k.has('KeyS') || k.has('ArrowDown') ? -1 : 0);
    const targetRoll = (k.has('KeyD') || k.has('ArrowRight') ? 1 : 0)
      + (k.has('KeyA') || k.has('ArrowLeft') ? -1 : 0);
    const targetYaw = (k.has('KeyE') ? 1 : 0) + (k.has('KeyQ') ? -1 : 0);

    // Mouse drag acts as a stick: recent drag displacement steers, and
    // the stick recentres itself when the pilot lets go.
    const steerX = Math.max(-1, Math.min(1, input.dragDX / 90));
    const steerY = Math.max(-1, Math.min(1, input.dragDY / 90));
    input.mouseSteer.x = steerX;
    input.mouseSteer.y = steerY;
    input.dragDX *= Math.max(0, 1 - dt * 2.2);
    input.dragDY *= Math.max(0, 1 - dt * 2.2);

    const blend = 1 - Math.exp(-dt * 10);
    input.pitch += ((targetPitch - steerY) - input.pitch) * blend;
    input.roll += ((targetRoll + steerX) - input.roll) * blend;
    input.yaw += (targetYaw - input.yaw) * blend;

    if (k.has('ShiftLeft') || k.has('ShiftRight')) {
      input.throttleTarget = Math.min(1, input.throttleTarget + dt * 0.45);
    }
    if (k.has('ControlLeft') || k.has('ControlRight')) {
      input.throttleTarget = Math.max(0, input.throttleTarget - dt * 0.45);
    }
    // Space is the airbrake: hold it to chop the throttle and bleed speed
    // for a short final or a tight ring. Releasing it restores the lever.
    input.airbrake = k.has('Space');
  };

  input.consumePressed = function consumePressed(code) {
    if (input.pressed.has(code)) {
      input.pressed.delete(code);
      return true;
    }
    return false;
  };

  input.endFrame = function endFrame() {
    input.pressed.clear();
  };

  return input;
}
