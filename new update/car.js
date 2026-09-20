'use strict';

class Car {
    constructor(config) {
        this.name = config.name || 'Stock Racer';
        this.color = config.color || '#d32f2f';
        this.secondaryColor = config.secondaryColor || '#9a0007';
        this.price = config.price || 0;
        this.type = config.type || 'hatch';

        this.baseHp = config.hp || 200;
        this.baseRedline = config.redline || 7000;
        this.baseGearRatios = config.gearRatios || [0, 3.2, 2.2, 1.6, 1.2, 1.0];
        this.baseFinalDrive = config.finalDrive || 3.9;
        this.baseWeight = config.weight || 1200;
        this.baseGrip = config.grip || 1.0;
        this.baseDragArea = config.dragArea || 0.75;

        this.customization = config.customization || this._randomCustomization();

        this.upgrades = config.upgrades ? JSON.parse(JSON.stringify(config.upgrades)) : {
            engine: 1, injector: 1, chassis: 1, shortGears: 1,
            slicks: false, aero: false, parachute: false,
            performanceGearbox: false, swapped: false,
        };

        this.applyUpgrades();
        this.reset();
    }

    _randomCustomization() {
        // Note: CUSTOMIZATION object is defined in game.js or loaded globally. 
        // For modularity, ensure it's accessible or passed. We'll attach it to window or game if needed, 
        // but since it's static, we can define it here or assume global scope from game.js init.
        // To be safe, we'll define a minimal fallback or assume game.CUSTOMIZATION is available.
        const C = window.CUSTOMIZATION || game.CUSTOMIZATION;
        const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
        return {
            rim: pick(C.rims),
            spoiler: pick(C.spoilers),
            bodyKit: pick(C.bodyKits),
            exhaust: pick(C.exhausts),
            tire: pick(C.tires),
            tint: pick(C.tints),
            livery: pick(C.liveries),
        };
    }

    applyUpgrades() {
        const u = this.upgrades;
        this.hp = this.baseHp * (1 + 0.12 * (u.engine - 1)) * (1 + 0.06 * (u.injector - 1));
        this.redline = this.baseRedline + 300 * (u.engine - 1);
        this.weight = Math.max(600, this.baseWeight - 35 * (u.chassis - 1));
        this.grip = this.baseGrip + (u.slicks ? 0.55 : 0);
        this.gearRatios = [...this.baseGearRatios];
        if (u.performanceGearbox) {
            this.gearRatios = [0, 3.4, 2.35, 1.75, 1.35, 1.08, 0.88, 0.73];
        }
        this.finalDrive = this.baseFinalDrive + 0.25 * (u.shortGears - 1);
        this.dragArea = u.aero ? this.baseDragArea * 0.85 : this.baseDragArea;
        this.parachuteDrag = u.parachute ? 2500 : 0;
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
        this.wheelRotation = 0;
        this._shiftBonus = 0;
        this._shiftBonusTimer = 0;
    }

    getEngineForce() {
        // FIX: Shift timer now correctly interrupts power delivery
        if (this.gear === 0 || this.clutch > 0.5 || this.shiftTimer > 0) return 0;
        if (this.engineStalled) return 0;
        if (this.gas < 0.05) return 0;

        const rpmRatio = this.rpm / this.redline;
        if (rpmRatio >= 1.0) return 0;

        const ratio = this.gearRatios[this.gear] * this.finalDrive;
        const powerWatts = this.hp * 745.7;

        const peakRpm = this.redline * 0.65;
        let torqueFactor;
        if (this.rpm < peakRpm) {
            torqueFactor = 0.5 + 0.5 * (this.rpm / peakRpm);
        } else {
            torqueFactor = 1.0 - 0.4 * ((this.rpm - peakRpm) / (this.redline - peakRpm));
        }
        torqueFactor = Math.max(0.2, torqueFactor);

        const lugFactor = Math.max(0, Math.min(1,
            (this.rpm - LUG_RPM_LOW) / (LUG_RPM_HIGH - LUG_RPM_LOW)));

        const speed = Math.max(this.speed, 0.5);
        let force = (powerWatts * ratio * DRIVETRAIN_EFFICIENCY * torqueFactor * lugFactor * this.gas)
            / (speed * WHEEL_RADIUS);

        if (rpmRatio > 0.95) {
            force *= Math.max(0, (1 - rpmRatio) * 20);
        }

        const maxTraction = this.weight * G * this.grip * 0.7;
        return Math.min(force, maxTraction);
    }

    update(dt) {
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
            this.rpm += (netTorque / 0.25) * (Math.PI / 30) * dt;
            if (this.gas < 0.1) this.rpm = Math.max(IDLE_RPM, this.rpm - 3000 * dt);
            if (this.rpm > this.redline) this.rpm = this.redline;

            const brakeForce = this.brake * 12000;
            const decel = (dragForce + rollForce + brakeForce + parachuteForce) / this.weight;
            this.speed = Math.max(0, this.speed - decel * dt);
            this.wheelSlip = 0;
            this.engineStalled = false;
        } else {
            const ratio = this.gearRatios[this.gear] * this.finalDrive;
            const wheelRads = this.speed / WHEEL_RADIUS;
            const targetRpm = wheelRads * ratio * 30 / Math.PI;

            if (targetRpm < 700 && this.gas < 0.1 && this.speed < 1) {
                this.engineStalled = true;
            } else {
                this.engineStalled = false;
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

            if (this.speed < 3 && this.gas > 0.1) {
                const clutchSlipRpm = Math.min(this.redline * 0.5, 3500);
                const slipAmount = Math.max(0, 1 - this.speed / 3);
                const rpmTarget = targetRpm + (clutchSlipRpm - targetRpm) * slipAmount;
                this.rpm += (rpmTarget - this.rpm) * Math.min(1, 8 * dt);
            } else {
                this.rpm += (targetRpm - this.rpm) * Math.min(1, 12 * dt);
            }

            if (this.rpm > this.redline) {
                this.rpm = this.redline;
                if (Math.random() < 0.25) game.createBackfire(this);
            }
            if (this.rpm < IDLE_RPM) {
                this.rpm = IDLE_RPM;
                if (this.speed < 0.5 && this.gas < 0.1) this.speed = 0;
            }
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

        const rpmBefore = this.rpm;
        const redline = this.redline;
        const perfectLow = redline * SHIFT_PERFECT_LOW;
        const perfectHigh = redline * SHIFT_PERFECT_HIGH;
        const goodLow = redline * SHIFT_GOOD_LOW;

        this.gear++;
        this.shiftTimer = 0.15;

        const ratioNew = this.gearRatios[this.gear] * this.finalDrive;
        const wheelRads = this.speed / WHEEL_RADIUS;
        const targetRpm = wheelRads * ratioNew * 30 / Math.PI;

        let quality;
        if (rpmBefore >= perfectLow && rpmBefore <= perfectHigh) {
            this.rpm = Math.max(IDLE_RPM, targetRpm);
            this._shiftBonus = BONUS_PERFECT;
            this._shiftBonusTimer = BONUS_TIME_PERFECT;
            quality = 'perfect';
        } else if (rpmBefore > perfectHigh) {
            this.rpm = Math.max(IDLE_RPM, targetRpm * 0.98);
            this._shiftBonus = BONUS_LATE;
            this._shiftBonusTimer = 0;
            quality = 'late';
        } else if (rpmBefore >= goodLow) {
            this.rpm = Math.max(IDLE_RPM, targetRpm * 0.92);
            this._shiftBonus = BONUS_GOOD;
            this._shiftBonusTimer = BONUS_TIME_GOOD;
            quality = 'good';
        } else {
            this.rpm = Math.max(IDLE_RPM, targetRpm * 0.80);
            this._shiftBonus = BONUS_EARLY;
            this._shiftBonusTimer = BONUS_TIME_EARLY;
            quality = 'early';
        }

        game.createBackfire(this);

        if (this === game.playerCar) {
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
        this.shiftTimer = 0.12;
        const ratioNew = this.gearRatios[this.gear] * this.finalDrive;
        const wheelRads = this.speed / WHEEL_RADIUS;
        const targetRpm = wheelRads * ratioNew * 30 / Math.PI;
        this.rpm = Math.max(IDLE_RPM, Math.min(this.redline, targetRpm));
        this._shiftBonus = -0.05;
        this._shiftBonusTimer = 0.3;
    }
}