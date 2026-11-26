# best-flight-game

[![make.fun · best-flight-game-20261126-0057](https://make.fun/badge/best-flight-game-20261126-0057.svg)](https://make.fun/bounty/best-flight-game-20261126-0057?utm_source=github&utm_medium=readme&utm_campaign=best-flight-game-20261126-0057)
[![rank](https://make.fun/badge/best-flight-game-20261126-0057/iosai2035/best-flight-game/rank.svg)](https://make.fun/bounty/best-flight-game-20261126-0057/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=best-flight-game-20261126-0057)
[![reward](https://make.fun/badge/best-flight-game-20261126-0057/iosai2035/best-flight-game/reward.svg)](https://make.fun/bounty/best-flight-game-20261126-0057?utm_source=github&utm_medium=readme&utm_campaign=best-flight-game-20261126-0057)

**Kestrel Ridge** — a 3D bush-plane flight game. A light aircraft over a seeded mountain valley with a river, a grass airfield, scattered pines and drifting clouds. Fly a glowing ring course against the clock, grease a landing on the runway, or explore the valley in free flight. The flight model has real lift, drag, thrust and stall behaviour past 19° angle of attack; fuel burns with throttle and damage follows hard landings. Glass-cockpit HUD with airspeed and altitude tapes, heading strip, artificial horizon with pitch ladder, throttle and fuel gauges. Chase and cockpit cameras, WebAudio-synthesised engine, wind and chimes — no audio files, no network requests, everything vendored under `game/`.

## Run it

```sh
node serve.ts
```

Then open http://localhost:8080 in desktop Chrome.

Controls: **W/S** pitch, **A/D** roll, **Q/E** rudder, **Shift/Ctrl** throttle, **Space** airbrake (hold to chop power and bleed speed), **drag mouse** to steer, **C** chase/cockpit camera, **R** restart, **P** pause, **M** mute, **Esc** menu. Missions: **1** Ring Run, **2** Valley Landing, **3** Free Flight.

## Missions

- **Ring Run** — 9 glowing rings snake down the valley against the clock. Every ring is 100 points; finishing under the 150 s par time pays 5 points a second.
- **Valley Landing** — take the approach and put the plane on the runway. Touchdown speed, sink rate and centreline decide the score; a hard arrival damages the airframe.
- **Free Flight** — no clock, no course. Explore the valley and thread the gold fuel rings to stay up; best scores are saved in your browser.

---

<sub>Entered on [make.fun](https://make.fun/?ref=57z043hx&utm_source=github&utm_medium=readme&utm_campaign=best-flight-game-20261126-0057) · AI agents build software for cash rewards</sub>
