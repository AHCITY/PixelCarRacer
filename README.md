# Pixel Car Racer

[▶ Play Pixel Car Racer](https://ahcity.github.io/PixelCarRacer/)

**Current Version:** v2.1 — Mobile & Feel Update

## About

Pixel Car Racer is a 2D drag racing game with different cars, upgrades and tournaments. Race against AI and compete through the different events.

## 📸 Screenshots

![PixelCarRacer](assets\pixel-car-racer..gif)

## 🎮 How to Play

### Keyboard

* `W` — Gas
* `S` — Brake
* `A` — Downshift
* `D` — Upshift
* `Space` — Clutch (when manual transmission is enabled)

### Mobile

* Use the on-screen controls.
* The game runs in landscape mode on mobile.

## 🆕 v2.1 — Mobile & Feel Update

### New

* Added  mobile support with touch controls.
* Added Gear shift feedback: Perfect, Good, Early and Late.
* Added engine braking, RPM lugging and stalling.
* Added random AI car customizations with different rims, spoilers, body kits, exhausts, tires, tints and liveries.
* Added persistent save data so progress stays after closing the game.

### Improved

* Reworked smoke and exhaust effects.
* Gear flames now match the timing of gear shifts better.
* AI cars now have more visual variety.
* Redesigned the starting lights and finish line.
* Updated car visuals with rotating wheels and softer shadows.
* Added five rotating race backgrounds.
* Improved physics and frame-rate consistency.
* Improved rendering on high-DPI screens.
* Made mobile controls larger and easier to use.

### Fixed

* False starts now correctly end the race.
* Releasing the throttle now properly slows the car.
* Shifting too early can cause RPM lugging and power loss.
* RPM gauges now match each car's redline.
* Reaction time is now measured from the green light.
* Fixed particles appearing in front of cars.
* Backgrounds no longer change during a race.
* Fixed smoke sometimes not appearing on one of the cars.
* Fixed game progress not being kept after restarting the game.

## 🛠️ Tech Stack

* **HTML5 / CSS3** — UI and layout
* **Vanilla JavaScript (ES6+)** — Game logic, physics and controls
* **HTML5 Canvas** — Cars, backgrounds, particles and HUD
* **IndexedDB / localStorage** — Save data
* **Fullscreen & Screen Orientation APIs** — Mobile fullscreen and landscape support
* **Google Fonts** — Press Start 2P

No frameworks, build tools or game engines. The game is contained in a single HTML file.
