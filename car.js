'use strict';

/* Piecewise-linear torque curve lookup. x = rpm/redline (0..1+).
   The curve is what makes low-rpm behaviour honest: at ~0 rpm an engine
   makes no torque, so a car dropped into a tall gear at walking pace
   simply cannot pull — it lugs, shudders and eventually stalls. */
function torqueCurveFactor(x) {
    const C = TORQUE_CURVE;
    if (x <= C[0][0]) return C[0][1];
    for (let i = 1; i < C.length; i++) {
        if (x <= C[i][0]) {
            const x0 = C[i - 1][0], y0 = C[i - 1][1];
            const x1 = C[i][0], y1 = C[i][1];
            return y0 + (y1 - y0) * (x - x0) / (x1 - x0);
        }
    }
    return C[C.length - 1][1];
}

class Car {
    constructor(config) {
        this.name = config.name || 'Stock Racer';
        this.color = config.color || '#d32f2f';
        this.secondaryColor = config.secondaryColor || '#9a0007';
        this.price = config.price || 0;
        this.type = config.type || 'hatch';
        // Art is independent from performance type: cars sharing a drivetrain class
        // still keep their own silhouette and attachment points.
        this.art = config.art || this.type;
        // Cylinder count only drives the engine-sound firing frequency
        // (rpm x cyl / 120) — it has zero effect on the physics.
        this.cyl = config.cyl || (this.type === 'dragster' ? 8 : 4);

        this.baseHp = config.hp || 200;
        this.baseRedline = config.redline || 7000;
        this.baseGearRatios = config.gearRatios || [0, 3.2, 2.2, 1.6, 1.2, 1.0];
        this.baseFinalDrive = config.finalDrive || 3.9;
        this.baseWeight = config.weight || 1200;
        this.baseGrip = config.grip || 1.0;
        this.baseDragArea = config.dragArea || 0.75;

        this.customization = config.randomizeCustomization ? this._randomCustomization() : this._stockCustomization();
        this.tune = { finalDrive: 0, gearSpacing: 0, launch: 0, aeroTrim: 0, ...(config.tune || {}) };

        this.upgrades = config.upgrades ? JSON.parse(JSON.stringify(config.upgrades)) : {
            engine: 1, injector: 1, chassis: 1, shortGears: 1,
            slicks: false, aero: false, parachute: false,
            performanceGearbox: false, swapped: false, turbo: 0, nos: 0,
        };

        this.applyUpgrades();
        this.reset();
    }

    _randomCustomization() {
        // Note: CUSTOMIZATION object is defined in game.js or loaded globally. 
        // For modularity, ensure it is accessible or passed. We'll attach it to window or game if needed, 
        // but since it's static, we can define it here or assume global scope from game.js init.
        // To be safe, we'll define a minimal fallback or assume game.CUSTOMIZATION is available.
        const C = window.CUSTOMIZATION || game.CUSTOMIZATION;
        const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
        return {
            rim: pick(C.rims),
            rimPaint: pick(C.rimPaints),
            spoiler: pick(C.spoilers),
            bodyKit: pick(C.bodyKits),
            exhaust: pick(C.exhausts),
            tire: pick(C.tires),
            tireBrand: pick(C.tireBrands),
            tint: pick(C.tints),
            livery: pick(C.liveries),
        };
    }

    _stockCustomization() {
        const C = window.CUSTOMIZATION || game.CUSTOMIZATION;
        return { rim: C.rims[0], rimPaint: C.rimPaints[0], spoiler: C.spoilers[0], bodyKit: C.bodyKits[0], exhaust: C.exhausts[0], tire: C.tires[0], tireBrand: C.tireBrands[0], tint: C.tints[0], livery: C.liveries[0] };
    }

    applyUpgrades() {
        const u = this.upgrades;
        // Numeric hardening: legacy saves may carry booleans (or miss keys)
        // for staged upgrades — a bare `true - 1` would silently LOWER hp
        // below stock. Level of a boolean = 1, missing = 1 (base).
        const lvl = v => Math.max(1, Math.round(Number(v) || 1));
        const eng = lvl(u.engine), inj = lvl(u.injector), chs = lvl(u.chassis), sg = lvl(u.shortGears);
        // Turbo: stage 1 spools audibly and adds usable top-end power (the
        // audio side models the lag — see SFX._updateTurbo). Kept as its own
        // multiplier so existing engine/injector scaling stays untouched.
        this.turbo = Math.max(0, Math.min(3, u.turbo || 0));
        this.nos = Math.max(0, Math.min(3, u.nos || 0));   // nitrous stage (bottle size)
        const ic = Math.max(0, Math.min(2, u.intercooler | 0));
        const cam = Math.max(0, Math.min(3, u.camshaft | 0));
        // Tunes that reshape the whole powerplant (see openShop for the
        // advertised trade-offs): advanced timing makes more power but the
        // knock margin eats redline; soft tires hook the launch but drag.
        const timing = Math.max(-3, Math.min(3, this.tune.ignitionTiming || 0));
        const tireP = Math.max(-3, Math.min(3, this.tune.tirePressure || 0));
        this.hp = this.baseHp * (1 + 0.12 * (eng - 1)) * (1 + 0.06 * (inj - 1)) * (1 + 0.07 * this.turbo)
            * (1 + 0.05 * ic) * (1 + 0.06 * cam) * (1 + 0.02 * timing);
        this.redline = this.baseRedline + 300 * (eng - 1) + 150 * cam - 90 * timing;
        this.weight = Math.max(600, this.baseWeight - 35 * (chs - 1) + 12 * ic);
        this.grip = this.baseGrip + (u.slicks ? 0.55 : 0);
        this.gearRatios = [...this.baseGearRatios];
        if (u.performanceGearbox) {
            this.gearRatios = [0, 3.4, 2.35, 1.75, 1.35, 1.08, 0.88, 0.73];
        }
        const spacing = Math.max(-3, Math.min(3, this.tune.gearSpacing || 0));
        const first = this.gearRatios[1];
        for (let i = 2; i < this.gearRatios.length; i++) {
            this.gearRatios[i] = first * Math.pow(this.gearRatios[i] / first, 1 - spacing * 0.055);
        }
        this.finalDrive = this.baseFinalDrive + 0.25 * (sg - 1) + 0.12 * Math.max(-3, Math.min(3, this.tune.finalDrive || 0));
        const aeroTrim = Math.max(-3, Math.min(3, this.tune.aeroTrim || 0));
        this.dragArea = (u.aero ? this.baseDragArea * 0.85 : this.baseDragArea) * (1 + aeroTrim * 0.025);
        // Tire pressure: soft (negative) = bigger contact patch at launch,
        // more rolling drag up top; hard (positive) = the reverse.
        this.dragArea *= (1 - 0.008 * tireP);
        this.launchGripBonus = 0.035 * Math.max(-3, Math.min(3, this.tune.launch || 0)) - 0.012 * tireP;
        this.launchTorqueMultiplier = 1 + 0.04 * Math.max(-3, Math.min(3, this.tune.launch || 0));
        this.grip += Math.max(0, aeroTrim) * 0.018;
        this.parachuteDrag = u.parachute ? 2500 : 0;
        // Low-end filler: big turbos and long-duration cams both soften the
        // launch band (real turbo lag / cam overlap). Blended out by 0.4
        // redline so the mid-range and top end are untouched.
        this._lowEndFactor = 1 - 0.025 * this.turbo - 0.045 * cam;
        this._fastShifter = !!u.racingClutch;

        // Peak crank torque is derived so the car's PEAK POWER still equals
        // its hp rating: P(rpm) = Tpk * curve(r) * (rpm in rad/s), maximised
        // near 0.9 x redline. Torque-based force (instead of power/speed)
        // removes the old 1/speed singularity AND makes gearing matter —
        // wheel force now literally is torque x ratio / wheel radius.
        let best = 0;
        for (const [r, t] of TORQUE_CURVE) best = Math.max(best, t * r);
        this._peakTorque = (this.hp * 745.7) / (best * this.redline * Math.PI / 30);
    }

    reset() {
        this.x = 0;
        this.speed = 0;
        this.rpm = IDLE_RPM;
        this.gear = 0;
        this.gas = 0;
        this.brake = 0;
        this.clutch = 0;
        this.shiftTimer = 0;
        this.reactionTime = 0.5;
        this.finished = false;
        this.finishTime = 0;
        this.reactionRecorded = 0;
        this.launched = false;
        this.trapSpeed = 0;
        this.squat = 0;
        this.wheelSlip = 0;
        this.engineStalled = false;
        this._bogTimer = 0;
        this._stallNotified = false;
        this.wheelRotation = 0;
        this._shiftBonus = 0;
        this._shiftBonusTimer = 0;
        this.nosTank = this.nos > 0 ? 1 : 0;   // full bottle at the line
        this.nosActive = false;
        this.nosSpraying = false;
    }

    // Bottle size in seconds of continuous spray — stages buy duration.
    _nosDuration() { return 3 + 1.2 * Math.max(0, Math.min(3, this.nos)); }

    getEngineForce() {
        // Shift timer interrupts power delivery; clutch in / neutral = no drive
        if (this.gear === 0 || this.clutch > 0.5 || this.shiftTimer > 0) return 0;
        if (this.engineStalled) return 0;
        if (this.gas < 0.05) return 0;

        const rpmRatio = this.rpm / this.redline;
        if (rpmRatio >= 1.0) return 0;

        // Wheel force = crank torque at the CURRENT engine speed, multiplied
        // through the gearbox. No speed term: a torque curve is a torque
        // curve, and gearing alone converts it to wheel force.
        const ratio = this.gearRatios[this.gear] * this.finalDrive;
        const torque = this._peakTorque * torqueCurveFactor(rpmRatio);
        let force = torque * ratio * DRIVETRAIN_EFFICIENCY * this.gas / WHEEL_RADIUS;

        // Turbo lag / cam overlap: the launch band makes less torque than
        // the peak numbers suggest (blended out by 0.4 x redline).
        if (this._lowEndFactor < 1) {
            const blend = Math.min(1, rpmRatio / 0.4);
            force *= this._lowEndFactor + (1 - this._lowEndFactor) * blend;
        }

        // Launch tuning (existing behaviour): launch bias adds low-speed muscle
        if (this.speed < 18) force *= this.launchTorqueMultiplier;

        // Nitrous injection: a flat power multiplier while the bottle sprays
        if (this.nosSpraying) force *= NOS_POWER_MULT;

        // Rev limiter fade near redline (existing behaviour)
        if (rpmRatio > 0.95) force *= Math.max(0, (1 - rpmRatio) * 20);

        const maxTraction = this.weight * G * Math.max(0.45, this.grip + this.launchGripBonus) * 0.7;
        return Math.min(force, maxTraction);
    }

    update(dt) {
        // Nitrous: hold-to-spray. Only under throttle, in gear, clutch out —
        // the bottle drains while it sprays and refills on the next race.
        const wantSpray = this.nosActive && this.nosTank > 0 && this.gear > 0 &&
                          this.clutch < 0.5 && this.gas > 0.2 && !this.engineStalled;
        this.nosSpraying = wantSpray;
        if (wantSpray) this.nosTank = Math.max(0, this.nosTank - dt / this._nosDuration());

        if (this.shiftTimer > 0) {
            this.shiftTimer -= dt;
            if (this.shiftTimer <= 0) this.shiftTimer = 0;
        }

        if (this._shiftBonusTimer > 0) {
            this._shiftBonusTimer -= dt;
            if (this._shiftBonusTimer <= 0) {
                this._shiftBonusTimer = 0;
                this._shiftBonus = 0;
            }
        }

        const inNeutral = this.gear === 0 || this.clutch > 0.5;
        const dragForce = 0.5 * AIR_DENSITY * this.dragArea * this.speed * this.speed;
        const rollForce = this.weight * G * 0.015;
        const parachuteForce = this.speed > 5 ? this.parachuteDrag : 0;

        this.wheelRotation += (this.speed / WHEEL_RADIUS) * dt;

        if (inNeutral) {
            const engineTorque = (this.hp * 745.7 / Math.max(this.rpm, 1000) / (Math.PI / 30)) * this.gas;
            const frictionTorque = this.rpm * 0.008 + 5;
            const netTorque = engineTorque - frictionTorque;
            // (30/π) converts crank rad/s² to rpm/s — the free-rev must reach
            // redline in well under a second, like a real unloaded engine.
            this.rpm += (netTorque / 0.25) * (30 / Math.PI) * dt;
            if (this.gas < 0.1) this.rpm = Math.max(IDLE_RPM, this.rpm - 3000 * dt);
            if (this.rpm > this.redline) this.rpm = this.redline;

            const brakeForce = this.brake * 12000;
            const decel = (dragForce + rollForce + brakeForce + parachuteForce) / this.weight;
            this.speed = Math.max(0, this.speed - decel * dt);
            this.wheelSlip = 0;
            this.engineStalled = false;
            this._bogTimer = 0;
            this._stallNotified = false;
        } else {
            const ratio = this.gearRatios[this.gear] * this.finalDrive;
            const wheelRads = this.speed / WHEEL_RADIUS;
            // TRUE wheel-demand rpm — deliberately NOT clamped to idle. With
            // the clutch engaged the crank is chained to the wheels: at a
            // standstill in 5th the engine is dragged toward 0 rpm, however
            // much the tach needle would prefer to idle.
            const targetRpm = wheelRads * ratio * 30 / Math.PI;

            // A stalled engine stays stalled until the driver pushes the
            // clutch in / drops to neutral (or the car is rolling fast
            // enough to bump-start). No magic instant restarts.
            if (this.engineStalled) {
                // Stays stalled until the driver pushes the clutch in or
                // drops to neutral — exactly like a real manual car. No
                // magic auto-restart while the drivetrain is still engaged.
                this.rpm = Math.max(0, this.rpm - 4000 * dt);
                this._stallNotified = true;
            } else if (game.raceState === 'RUNNING' && targetRpm < STALL_RPM) {
                // Bogging: engine dragged below its usable band. Hold it
                // there and it dies — fast without throttle, slower when
                // the driver is feeding it throttle and frying the clutch.
                this._bogTimer += dt;
                const grace = this.gas > 0.3 ? STALL_GRACE_GAS : STALL_GRACE_NOGAS;
                if (this._bogTimer > grace) {
                    this.engineStalled = true;
                    if (this === game.playerCar && !this._stallNotified) {
                        game.showNotification('STALLED! CLUTCH (SPACE) + SHIFT DOWN');
                        if (typeof SFX !== 'undefined') SFX.stall();
                    }
                }
            } else {
                this._bogTimer = 0;
            }

            let engineForce = this.getEngineForce();

            if (this._shiftBonusTimer > 0) {
                engineForce *= (1 + this._shiftBonus);
            }

            const maxTraction = this.weight * G * this.grip * 0.7;
            let effectiveForce = engineForce;
            if (engineForce >= maxTraction * 0.95) {
                effectiveForce = maxTraction * 0.75;
                this.wheelSlip = 1.0;
            } else {
                this.wheelSlip = 0;
            }

            const brakeForce = this.brake * 14000;
            let netForce = effectiveForce - dragForce - rollForce - brakeForce - parachuteForce;

            if (this.gas < 0.05 && this.speed > 1) {
                const engineBrakeForce = (this.rpm / this.redline) * ENGINE_BRAKE_MAX;
                netForce -= engineBrakeForce;
            }

            const accel = netForce / this.weight;
            this.speed = Math.max(0, this.speed + accel * dt);

            if (this.engineStalled) {
                // Stalled: no combustion, crank dragged by the wheels.
                this.rpm = Math.min(this.rpm, Math.max(0, targetRpm));
            } else if (this.speed < 3 && this.gas > 0.1) {
                // Clutch-slip launch zone: the driver feathers the throttle
                // and the revs flare above wheel speed (existing behaviour).
                const clutchSlipRpm = Math.min(this.redline * 0.5, 3500);
                const slipAmount = Math.max(0, 1 - this.speed / 3);
                const rpmTarget = targetRpm + (clutchSlipRpm - targetRpm) * slipAmount;
                this.rpm += (rpmTarget - this.rpm) * Math.min(1, 8 * dt);
            } else {
                // In gear the crank follows the wheels. A slower pull-down
                // when heavily loaded reads as the engine fighting the gear.
                const rate = (targetRpm < this.rpm && this.gas > 0.3) ? 7 : 12;
                this.rpm += (targetRpm - this.rpm) * Math.min(1, rate * dt);
                // Lugging band: visibly struggle instead of silently pulling.
                if (targetRpm > 0 && targetRpm < BOG_SHUDDER_RPM && this.gas > 0.3 && this.speed > 0.3) {
                    const shudder = (1 - targetRpm / BOG_SHUDDER_RPM);
                    this.rpm += Math.sin(performance.now() / 24) * 130 * shudder;
                    if (this === game.playerCar) game.screenShake = Math.max(game.screenShake, 1.6 * shudder);
                }
            }

            if (this.rpm > this.redline) {
                this.rpm = this.redline;
                if (Math.random() < 0.25) {
                    game.createBackfire(this);
                    if (this === game.playerCar && typeof SFX !== 'undefined') SFX.pop();
                }
            }
            // NOTE: no idle floor while in gear — the old clamp is what let a
            // car "idle" its way through a too-tall gear. Only a stalled
            // engine or a genuine stall condition drops the needle now.
            if (this.rpm < 0) this.rpm = 0;
        }

        this.x += this.speed * dt;

        const targetSquat = (this.gas > 0.5 && this.gear > 0 && this.rpm < this.redline) ? -2.5 : 0;
        this.squat += (targetSquat - this.squat) * Math.min(1, 8 * dt);

        if (!this.finished && this.x >= game.raceDistance) {
            this.finished = true;
            this.finishTime = game.raceTimer;
            this.trapSpeed = this.speed;
        }
    }

    shiftUp() {
        if (this.shiftTimer > 0) return;
        if (this.gear >= this.gearRatios.length - 1) return;

        // Pre-green staging shift (N -> 1st at the line): there is nothing to
        // judge yet — no rev slam to wheel-demand (which would read as a
        // stalled 0-rpm tach), no bonus, no EARLY SHIFT scolding.
        if (typeof game !== 'undefined' && game.raceState && game.raceState !== 'RUNNING') {
            this.gear++;
            this.shiftTimer = this._fastShifter ? 0.09 : 0.15;
            this._shiftBonus = 0;
            this._shiftBonusTimer = 0;
            this._bogTimer = 0;
            this._stallNotified = false;
            return;
        }

        const rpmBefore = this.rpm;
        const redline = this.redline;
        const perfectLow = redline * SHIFT_PERFECT_LOW;
        const perfectHigh = redline * SHIFT_PERFECT_HIGH;
        const goodLow = redline * SHIFT_GOOD_LOW;

        this.gear++;
        this.shiftTimer = this._fastShifter ? 0.09 : 0.15;

        const ratioNew = this.gearRatios[this.gear] * this.finalDrive;
        const wheelRads = this.speed / WHEEL_RADIUS;
        const targetRpm = wheelRads * ratioNew * 30 / Math.PI;

        let quality;
        if (rpmBefore >= perfectLow && rpmBefore <= perfectHigh) {
            // Genuine perfect shift: revs land exactly where the wheels want
            // them, plus a short, honest power bonus.
            this.rpm = Math.max(0, Math.min(this.redline, targetRpm));
            this._shiftBonus = BONUS_PERFECT;
            this._shiftBonusTimer = BONUS_TIME_PERFECT;
            quality = 'perfect';
        } else if (rpmBefore > perfectHigh) {
            this.rpm = Math.max(0, Math.min(this.redline, targetRpm * 0.98));
            this._shiftBonus = BONUS_LATE;
            this._shiftBonusTimer = 0;
            quality = 'late';
        } else if (rpmBefore >= goodLow) {
            this.rpm = Math.max(0, Math.min(this.redline, targetRpm * 0.92));
            this._shiftBonus = BONUS_GOOD;
            this._shiftBonusTimer = BONUS_TIME_GOOD;
            quality = 'good';
        } else {
            // Early shift: revs drop to where the wheels demand — often into
            // the lugging band. The bog penalty is now PHYSICAL (torque curve)
            // on top of the short BONUS_EARLY window.
            this.rpm = Math.max(0, Math.min(this.redline, targetRpm * 0.80));
            this._shiftBonus = BONUS_EARLY;
            this._shiftBonusTimer = BONUS_TIME_EARLY;
            quality = 'early';
        }
        this._bogTimer = 0;
        this._stallNotified = false;

        game.createBackfire(this);

        if (this === game.playerCar) {
            if (typeof SFX !== 'undefined') SFX.shift(quality);
            if (quality === 'perfect') {
                game.screenShake = 5;
                game.showNotification('PERFECT SHIFT!');
            } else if (quality === 'good') {
                game.screenShake = 2;
                game.showNotification('GOOD SHIFT');
            } else if (quality === 'late') {
                game.screenShake = 2;
                game.showNotification('LATE SHIFT');
            } else {
                game.screenShake = 1;
                game.showNotification('EARLY SHIFT');
            }
        }
    }

    shiftDown() {
        if (this.shiftTimer > 0) return;
        if (this.gear <= 0) return;
        this.gear--;
        this.shiftTimer = this._fastShifter ? 0.07 : 0.12;
        const ratioNew = this.gearRatios[this.gear] * this.finalDrive;
        const wheelRads = this.speed / WHEEL_RADIUS;
        const targetRpm = wheelRads * ratioNew * 30 / Math.PI;
        this.rpm = Math.max(0, Math.min(this.redline, targetRpm));
        this._shiftBonus = -0.05;
        this._shiftBonusTimer = 0.3;
        this._bogTimer = 0;
        // Dropping to neutral (or anywhere with the clutch out) restarts a
        // stalled engine the moment it free-revs again.
        this._stallNotified = false;
    }
}
