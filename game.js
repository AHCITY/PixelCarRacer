'use strict';

/* ─── AI Customization System ─── */
const CUSTOMIZATION = {
    rims: [
        { id: 'stock', name: 'stock', draw: (ctx, r) => drawRim(ctx, r, 4, '#6f7780') },
        { id: 'five_spoke', name: '5-spoke', draw: (ctx, r) => drawRim(ctx, r, 5, '#d1d5db') },
        { id: 'mesh', name: 'mesh', draw: (ctx, r) => drawRim(ctx, r, 12, '#8b949e', true) },
        { id: 'deep_dish', name: 'deep-dish', draw: (ctx, r) => drawRim(ctx, r, 6, '#b7bcc4', false, true) },
        { id: 'blade', name: 'blade', draw: (ctx, r) => drawRim(ctx, r, 5, '#c7ced6', false, false, 0.24) },
        { id: 'star', name: 'star', draw: (ctx, r) => drawRim(ctx, r, 5, '#e5e7eb', false, false, 0.48) },
    ],
    spoilers: [
        { id: 'none', name: 'none' },
        { id: 'lip', name: 'lip', draw: (ctx, car) => drawSpoiler(ctx, car, 'lip') },
        { id: 'ducktail', name: 'ducktail', draw: (ctx, car) => drawSpoiler(ctx, car, 'ducktail') },
        { id: 'wing', name: 'wing', draw: (ctx, car) => drawSpoiler(ctx, car, 'wing') },
        { id: 'gt_wing', name: 'gt-wing', draw: (ctx, car) => drawSpoiler(ctx, car, 'gt') },
    ],
    bodyKits: [
        { id: 'stock', name: 'stock' },
        { id: 'lip_kit', name: 'lip-kit', draw: (ctx, car) => drawBodyKit(ctx, car, 'lip') },
        { id: 'widebody', name: 'widebody', draw: (ctx, car) => drawBodyKit(ctx, car, 'wide') },
        { id: 'track', name: 'track', draw: (ctx, car) => drawBodyKit(ctx, car, 'track') },
    ],
    exhausts: [
        { id: 'stock', name: 'stock' },
        { id: 'single', name: 'single', draw: (ctx, car) => drawExhaust(ctx, car, 'single') },
        { id: 'dual', name: 'dual', draw: (ctx, car) => drawExhaust(ctx, car, 'dual') },
        { id: 'side_pipe', name: 'side-pipe', draw: (ctx, car) => drawExhaust(ctx, car, 'side') },
    ],
    tires: [
        { id: 'street', name: 'street', radius: 11, rimRadius: 0.55 },
        { id: 'sport', name: 'sport', radius: 12, rimRadius: 0.6 },
        { id: 'slick', name: 'slick', radius: 13, rimRadius: 0.5, slick: true },
        { id: 'low_profile', name: 'low-profile', radius: 11, rimRadius: 0.7 },
    ],
    tints: [
        { id: 'clear', name: 'clear', color: '#1a2332' },
        { id: 'tint_25', name: '25%', color: '#1a2332' },
        { id: 'tint_50', name: '50%', color: '#0f1520' },
        { id: 'tint_75', name: '75%', color: '#080c15' },
        { id: 'limo', name: 'limo', color: '#000000' },
    ],
    liveries: [
        { id: 'solid', name: 'solid' },
        { id: 'racing_stripe', name: 'racing-stripe', draw: (ctx, car) => drawLivery(ctx, car, 'stripe') },
        { id: 'dual_stripe', name: 'dual-stripe', draw: (ctx, car) => drawLivery(ctx, car, 'dual') },
        { id: 'flames', name: 'flames', draw: (ctx, car) => drawLivery(ctx, car, 'flames') },
        { id: 'camo', name: 'camo', draw: (ctx, car) => drawLivery(ctx, car, 'camo') },
        { id: 'checker', name: 'checker', draw: (ctx, car) => drawLivery(ctx, car, 'checker') },
        { id: 'gradient', name: 'gradient', draw: (ctx, car) => drawLivery(ctx, car, 'gradient') },
        { id: 'number', name: 'number', draw: (ctx, car) => drawLivery(ctx, car, 'number') },
    ],
};

// Saves contain IDs only.  Functions stay in this catalog, never in saved data.
function serializeCustomization(customization) {
    const out = {};
    for (const key of ['rim', 'spoiler', 'bodyKit', 'exhaust', 'tire', 'tint', 'livery']) out[key] = customization?.[key]?.id || customization?.[key]?.name || null;
    return out;
}
function hydrateCustomization(saved) {
    const groups = { rim: 'rims', spoiler: 'spoilers', bodyKit: 'bodyKits', exhaust: 'exhausts', tire: 'tires', tint: 'tints', livery: 'liveries' };
    const result = {};
    for (const [key, group] of Object.entries(groups)) {
        const value = saved?.[key];
        result[key] = CUSTOMIZATION[group].find(item => item.id === value || item.name === value || item.name === value?.name) || CUSTOMIZATION[group][0];
    }
    return result;
}
window.CUSTOMIZATION = CUSTOMIZATION; // Expose for Car.js

function drawRim(ctx, r, spokes, color, mesh = false, dish = false, blade = 0.12) {
    ctx.fillStyle = dish ? '#25272b' : '#16191d'; ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.fill();
    if (dish) { ctx.fillStyle = color; ctx.beginPath(); ctx.arc(0, 0, r * .76, 0, Math.PI * 2); ctx.fill(); }
    ctx.strokeStyle = color; ctx.lineWidth = mesh ? 0.75 : 1.4;
    for (let i = 0; i < spokes; i++) {
        const a = i * Math.PI * 2 / spokes;
        ctx.save(); ctx.rotate(a); ctx.beginPath(); ctx.moveTo(r * .16, 0); ctx.lineTo(r * .9, 0); ctx.stroke();
        if (mesh) { ctx.rotate(Math.PI / spokes); ctx.beginPath(); ctx.moveTo(r * .22, 0); ctx.lineTo(r * .82, 0); ctx.stroke(); }
        ctx.restore();
    }
    ctx.fillStyle = dish ? '#111' : color; ctx.beginPath(); ctx.arc(0, 0, r * blade, 0, Math.PI * 2); ctx.fill();
}
function artAnchor(car, key) { return car._artAnchors?.[key] || { x: 3, y: 27 }; }
function drawSpoiler(ctx, car, kind) {
    const a = artAnchor(car, 'spoiler'); ctx.fillStyle = kind === 'lip' || kind === 'ducktail' ? car.secondaryColor : '#17191c';
    if (kind === 'lip') ctx.fillRect(a.x, a.y, 10, 2);
    else if (kind === 'ducktail') { ctx.beginPath(); ctx.moveTo(a.x, a.y + 2); ctx.lineTo(a.x + 10, a.y + 2); ctx.lineTo(a.x + 7, a.y - 2); ctx.lineTo(a.x + 1, a.y - 2); ctx.fill(); }
    else { const w = kind === 'gt' ? 20 : 14; ctx.fillRect(a.x + 2, a.y, 2, 7); ctx.fillRect(a.x + w - 4, a.y, 2, 7); ctx.fillStyle = car.secondaryColor; ctx.fillRect(a.x, a.y - 2, w, 3); }
}
function drawBodyKit(ctx, car, kind) {
    const a = artAnchor(car, 'kit'), rear = artAnchor(car, 'rearWheel'), front = artAnchor(car, 'frontWheel');
    ctx.fillStyle = kind === 'wide' ? car.color : '#11151a'; ctx.fillRect(a.x, a.y, a.w, kind === 'track' ? 3 : 2);
    if (kind !== 'lip') { ctx.fillRect(rear.x - rear.r - 2, rear.y - 4, 3, 8); ctx.fillRect(front.x + front.r - 1, front.y - 4, 3, 8); }
}
function drawExhaust(ctx, car, kind) {
    const a = artAnchor(car, 'exhaust'); ctx.fillStyle = '#b8c0c8';
    if (kind === 'side') ctx.fillRect(a.x, a.y, 24, 2);
    else { ctx.fillRect(a.x - 4, a.y, 5, 2); if (kind === 'dual') ctx.fillRect(a.x - 4, a.y + 5, 5, 2); }
}
function drawLivery(ctx, car, kind) {
    const a = artAnchor(car, 'livery');
    if (kind === 'stripe') { ctx.fillStyle = car.secondaryColor; ctx.fillRect(a.x, a.y + 8, a.w, 3); }
    else if (kind === 'dual') { ctx.fillStyle = car.secondaryColor; ctx.fillRect(a.x + a.w * .27, a.y + 3, 3, a.h - 3); ctx.fillRect(a.x + a.w * .56, a.y + 3, 3, a.h - 3); }
    else if (kind === 'flames') { ctx.fillStyle = '#ff6d00'; ctx.beginPath(); ctx.moveTo(a.x + 4, a.y + a.h); ctx.lineTo(a.x + 11, a.y + 4); ctx.lineTo(a.x + 16, a.y + a.h); ctx.lineTo(a.x + 23, a.y + 9); ctx.lineTo(a.x + 30, a.y + a.h); ctx.fill(); }
    else if (kind === 'camo') { ctx.fillStyle = '#2c3b2b'; for (let i = 0; i < 5; i++) ctx.fillRect(a.x + 5 + i * 15, a.y + ((i * 7) % 10), 8 + (i % 2) * 4, 5); }
    else if (kind === 'checker') { for (let x = 0; x < a.w; x += 6) for (let y = 0; y < 8; y += 4) { ctx.fillStyle = ((x / 6 + y / 4) % 2) ? '#111' : '#eee'; ctx.fillRect(a.x + x, a.y + 7 + y, 6, 4); } }
    else if (kind === 'gradient') { const g = ctx.createLinearGradient(a.x, a.y, a.x + a.w, a.y + a.h); g.addColorStop(0, 'rgba(255,255,255,.32)'); g.addColorStop(1, 'rgba(255,255,255,0)'); ctx.fillStyle = g; ctx.fillRect(a.x, a.y, a.w, a.h); }
    else if (kind === 'number') { ctx.fillStyle = '#fff'; ctx.font = 'bold 12px monospace'; ctx.fillText('7', a.x + a.w * .48, a.y + a.h - 2); }
}

const game = {
    canvas: null, ctx: null,
    state: 'MENU', menuState: 'MAIN',
    cash: 2500, ownedCars: [], selectedCarIndex: 0,
    quickStats: { races: 0, wins: 0, recentMargin: 0 },
    raceDistance: 402,
    lights: 0, lightTimer: 0, raceStartTime: 0, raceTimer: 0,
    raceState: 'STAGING',
    raceMode: 'quick', tournamentRound: 1,
    screenShake: 0, METERS_TO_PX: 22,
    playerCar: null, opponentCar: null,
    effects: null,
    accumulator: 0, lastTimestamp: 0,
    paused: false,
    backgrounds: ['night_city', 'sunset_highway', 'industrial', 'mountain_dusk', 'neon_tokyo'],
    currentBackground: 0,
    _pendingRotation: false,
    _isMobile: false,
    _isFullscreen: false,
    _saveDirty: false,
    _saveTimer: null,
    SAVE_KEY: 'progress_v3',
    bestET: null,
    raceResults: null,
    previewCar: null,

    carDefs: [
        { name: "Civic '99", hp: 160, weight: 1100, grip: 0.95, redline: 8200, price: 0,
          color: '#fdd835', secondaryColor: '#333', type: 'hatch', art: 'civic_ek',
          gearRatios: [0, 3.8, 2.4, 1.7, 1.3, 1.0], finalDrive: 4.0, dragArea: 0.72 },
        { name: "S14 Drift", hp: 280, weight: 1250, grip: 1.0, redline: 7500, price: 8000,
          color: '#9c27b0', secondaryColor: '#4a148c', type: 'sedan', art: 's14',
          gearRatios: [0, 3.5, 2.2, 1.6, 1.2, 1.0], finalDrive: 3.9, dragArea: 0.75 },
        { name: "Mustang GT", hp: 420, weight: 1650, grip: 1.0, redline: 6500, price: 15000,
          color: '#b71c1c', secondaryColor: '#fff', type: 'muscle', art: 'mustang_sn95',
          gearRatios: [0, 3.3, 2.0, 1.4, 1.1, 0.9], finalDrive: 3.55, dragArea: 0.82 },
        { name: "R34 GTR", hp: 550, weight: 1500, grip: 1.35, redline: 8500, price: 35000,
          color: '#0288d1', secondaryColor: '#01579b', type: 'sedan', art: 'r34',
          gearRatios: [0, 3.8, 2.5, 1.9, 1.5, 1.2, 0.9], finalDrive: 3.55, dragArea: 0.78 },
        { name: "Supra Mk4", hp: 600, weight: 1550, grip: 1.2, redline: 7800, price: 42000,
          color: '#e65100', secondaryColor: '#ff9800', type: 'super', art: 'supra_a80',
          gearRatios: [0, 3.2, 2.1, 1.5, 1.1, 0.9, 0.7], finalDrive: 3.27, dragArea: 0.76 },
        { name: "Viper ACR", hp: 750, weight: 1480, grip: 1.45, redline: 6200, price: 65000,
          color: '#1b5e20', secondaryColor: '#000', type: 'super', art: 'viper_acr',
          gearRatios: [0, 2.9, 1.9, 1.4, 1.1, 0.9, 0.7], finalDrive: 3.55, dragArea: 0.73 },
        { name: "Lambo Huracan", hp: 850, weight: 1400, grip: 1.55, redline: 9000, price: 120000,
          color: '#76ff03', secondaryColor: '#33691e', type: 'super', art: 'huracan',
          gearRatios: [0, 3.5, 2.5, 1.9, 1.5, 1.2, 1.0, 0.8], finalDrive: 3.08, dragArea: 0.70 },
        { name: "Funny Car", hp: 2500, weight: 900, grip: 2.8, redline: 9500, price: 500000,
          color: '#311b92', secondaryColor: '#d50000', type: 'dragster', art: 'funny_car',
          gearRatios: [0, 4.0, 3.0, 2.2, 1.8, 1.5], finalDrive: 4.3, dragArea: 1.10 }
    ],

    async init() {
        this.canvas = document.getElementById('gameCanvas');
        this.ctx = this.canvas.getContext('2d');
        this.resize();
        window.addEventListener('resize', () => this.resize());
        window.addEventListener('orientationchange', () => this.handleOrientationChange());

        await SaveSystem.init();
        await this.loadGame();

        this.detectMobile();
        this.setupFullscreenListeners();

        if (this.ownedCars.length === 0) {
            this.ownedCars.push(new Car(this.carDefs[0]));
            this.selectedCarIndex = 0;
            this.scheduleSave();
        }
        this.playerCar = this.ownedCars[this.selectedCarIndex];
        this.effects = new RaceParticles(this.ctx);
        this.setupInput();
        this.updateMenuUI();
        this.lastTimestamp = performance.now();
        this.loop(this.lastTimestamp);

        if (this._isMobile) {
            this.showFullscreenPrompt();
        }
    },

    scheduleSave() {
        this._saveDirty = true;
        if (this._saveTimer) clearTimeout(this._saveTimer);
        this._saveTimer = setTimeout(() => this.flushSave(), 500);
    },

    async flushSave() {
        if (!this._saveDirty) return;
        this._saveDirty = false;
        const data = {
            cash: this.cash,
            selectedCarIndex: this.selectedCarIndex,
            tournamentRound: this.tournamentRound,
            quickStats: this.quickStats,
            bestET: this.bestET || null,
            currentBackground: this.currentBackground,
            ownedCars: this.ownedCars.map(car => ({
                name: car.name, color: car.color, secondaryColor: car.secondaryColor,
                price: car.price, type: car.type, art: car.art,
                baseHp: car.baseHp, baseRedline: car.baseRedline,
                baseGearRatios: car.baseGearRatios, baseFinalDrive: car.baseFinalDrive,
                baseWeight: car.baseWeight, baseGrip: car.baseGrip,
                baseDragArea: car.baseDragArea,
                upgrades: car.upgrades,
                tune: car.tune,
                customization: serializeCustomization(car.customization)
            })),
            version: 3,
        };
        const ok = await SaveSystem.save(this.SAVE_KEY, data);
        if (ok) this.flashSave();
    },

    async loadGame() {
        try {
            const data = await SaveSystem.load(this.SAVE_KEY);
            if (!data) return;

            this.cash = data.cash ?? 2500;
            this.tournamentRound = data.tournamentRound ?? 1;
            this.quickStats = { races: 0, wins: 0, recentMargin: 0, ...(data.quickStats || {}) };
            this.bestET = data.bestET ?? null;
            this.currentBackground = data.currentBackground ?? 0;
            if (this.currentBackground >= this.backgrounds.length) this.currentBackground = 0;

            this.ownedCars = (data.ownedCars || []).map(cd => {
                const def = {
                    name: cd.name, hp: cd.baseHp, weight: cd.baseWeight,
                    grip: cd.baseGrip, redline: cd.baseRedline, price: cd.price,
                    color: cd.color, secondaryColor: cd.secondaryColor, type: cd.type,
                    art: cd.art || this.carDefs.find(def => def.name === cd.name)?.art || cd.type,
                    gearRatios: cd.baseGearRatios, finalDrive: cd.baseFinalDrive,
                    dragArea: cd.baseDragArea, tune: cd.tune,
                };
                const car = new Car(def);
                car.upgrades = cd.upgrades || car.upgrades;
                // Player customization is intentionally stock until the player-facing garage arrives.
                car.customization = car._stockCustomization();
                car.applyUpgrades();
                return car;
            });
            this.selectedCarIndex = Math.min(data.selectedCarIndex ?? 0, Math.max(0, this.ownedCars.length - 1));
        } catch (e) {
            console.warn('Load failed, starting fresh:', e);
            this.cash = 2500;
            this.tournamentRound = 1;
            this.ownedCars = [];
        }
    },

    flashSave() {
        const el = document.getElementById('save-indicator');
        if (el) {
            el.style.opacity = 1;
            clearTimeout(this._saveTimeout);
            this._saveTimeout = setTimeout(() => el.style.opacity = 0, 1000);
        }
    },

    detectMobile() {
        const ua = navigator.userAgent || '';
        const touch = ('ontouchstart' in window) || navigator.maxTouchPoints > 1;
        const smallScreen = window.innerWidth <= 1024;
        const isMobileUA = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini|Mobile|Tablet/i.test(ua);
        this._isMobile = (isMobileUA || (touch && smallScreen)) && smallScreen;

        if (this._isMobile) {
            document.body.classList.add('mobile');
        }
        this.updateOrientationClass();
    },

    updateOrientationClass() {
        if (!this._isMobile) return;
        const isPortrait = window.innerHeight > window.innerWidth;
        document.body.classList.toggle('portrait', isPortrait);
    },

    handleOrientationChange() {
        setTimeout(() => {
            this.updateOrientationClass();
            this.resize();
        }, 200);
    },

    resize() {
        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        const w = window.innerWidth;
        const h = window.innerHeight;
        this.canvas.width = w * dpr;
        this.canvas.height = h * dpr;
        this.canvas.style.width = w + 'px';
        this.canvas.style.height = h + 'px';
        this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        this.ctx.imageSmoothingEnabled = false;
        this.updateOrientationClass();
    },

    setupFullscreenListeners() {
        const handler = () => {
            this._isFullscreen = !!(document.fullscreenElement || document.webkitFullscreenElement);
            setTimeout(() => this.resize(), 150);
        };
        document.addEventListener('fullscreenchange', handler);
        document.addEventListener('webkitfullscreenchange', handler);
    },

    isFullscreenAvailable() {
        const el = document.documentElement;
        return !!(el.requestFullscreen || el.webkitRequestFullscreen || el.msRequestFullscreen);
    },

    async enterFullscreen() {
        if (!this.isFullscreenAvailable()) return false;
        const el = document.getElementById('game-container');
        try {
            if (el.requestFullscreen) await el.requestFullscreen({ navigationUI: 'hide' });
            else if (el.webkitRequestFullscreen) await el.webkitRequestFullscreen();
            else if (el.msRequestFullscreen) await el.msRequestFullscreen();
            return true;
        } catch (e) {
            console.warn('Fullscreen request failed:', e);
            return false;
        }
    },

    async exitFullscreen() {
        try {
            if (document.exitFullscreen) await document.exitFullscreen();
            else if (document.webkitExitFullscreen) await document.webkitExitFullscreen();
            else if (document.msExitFullscreen) await document.msExitFullscreen();
        } catch (e) {}
    },

    showFullscreenPrompt() {
        if (localStorage.getItem('pdl_fs_asked') === '1') return;
        if (!this.isFullscreenAvailable()) return;
        const el = document.getElementById('fullscreen-prompt');
        el.classList.add('active');
    },

    async acceptFullscreen() {
        document.getElementById('fullscreen-prompt').classList.remove('active');
        localStorage.setItem('pdl_fs_asked', '1');
        await this.enterFullscreen();
        this.tryLockOrientation();
    },

    declineFullscreen() {
        document.getElementById('fullscreen-prompt').classList.remove('active');
        localStorage.setItem('pdl_fs_asked', '1');
    },

    async tryLockOrientation() {
        try {
            if (screen.orientation && screen.orientation.lock) {
                await screen.orientation.lock('landscape').catch(() => {});
            }
        } catch (e) {}
    },

    async toggleFullscreenFromMenu() {
        if (this._isFullscreen) {
            await this.exitFullscreen();
        } else {
            await this.enterFullscreen();
            this.tryLockOrientation();
        }
    },

    setupInput() {
        const handle = (action, val) => {
            if (this.state !== 'RACE' || this.paused) return;
            const car = this.playerCar;
            if (action === 'gas') {
                car.gas = val;
                this._toggleBtn('btn-gas', val);
                if (val && this.raceState === 'RUNNING' && !car.launched) {
                    car.launched = true;
                    if (car.reactionRecorded === 0) {
                        car.reactionTime = this.raceTimer;
                        car.reactionRecorded = 1;
                        const rd = document.getElementById('reaction-display');
                        if (rd) rd.innerText = 'RT: ' + car.reactionTime.toFixed(3) + 's';
                    }
                }
            }
            if (action === 'brake') { car.brake = val; this._toggleBtn('btn-brake', val); }
            if (action === 'clutch') { car.clutch = val; this._toggleBtn('btn-clutch', val); }
        };

        window.addEventListener('keydown', e => {
            if (e.repeat) return;
            const k = e.key.toLowerCase();
            if (k === 'escape') { this.togglePause(); return; }
            if (this.paused) return;
            if (k === 'w' || k === 'arrowup') handle('gas', 1);
            if (k === 's' || k === 'arrowdown') handle('brake', 1);
            if (k === ' ') { e.preventDefault(); handle('clutch', 1); }
            if (k === 'd' || k === 'arrowright') {
                if (this.state === 'RACE') { this.playerCar.shiftUp(); this._pulseBtn('btn-up'); }
            }
            if (k === 'a' || k === 'arrowleft') {
                if (this.state === 'RACE') { this.playerCar.shiftDown(); this._pulseBtn('btn-down'); }
            }
        });

        window.addEventListener('keyup', e => {
            if (this.paused) return;
            const k = e.key.toLowerCase();
            if (k === 'w' || k === 'arrowup') handle('gas', 0);
            if (k === 's' || k === 'arrowdown') handle('brake', 0);
            if (k === ' ') handle('clutch', 0);
        });

        const bind = (id, action) => {
            const el = document.getElementById(id);
            if (!el) return;
            const down = e => { e.preventDefault(); e.stopPropagation(); handle(action, 1); };
            const up = e => { e.preventDefault(); e.stopPropagation(); handle(action, 0); };
            el.addEventListener('touchstart', down, { passive: false });
            el.addEventListener('touchend', up, { passive: false });
            el.addEventListener('touchcancel', up, { passive: false });
            el.addEventListener('mousedown', down);
            el.addEventListener('mouseup', up);
            el.addEventListener('mouseleave', up);
        };
        bind('btn-gas', 'gas');
        bind('btn-brake', 'brake');
        bind('btn-clutch', 'clutch');

        const upBtn = document.getElementById('btn-up');
        const downBtn = document.getElementById('btn-down');
        if (upBtn) {
            const shiftUpHandler = e => {
                e.preventDefault(); e.stopPropagation();
                if (!this.paused && this.state === 'RACE') this.playerCar.shiftUp();
                this._pulseBtn('btn-up');
            };
            upBtn.addEventListener('touchstart', shiftUpHandler, { passive: false });
            upBtn.addEventListener('mousedown', shiftUpHandler);
        }
        if (downBtn) {
            const shiftDownHandler = e => {
                e.preventDefault(); e.stopPropagation();
                if (!this.paused && this.state === 'RACE') this.playerCar.shiftDown();
                this._pulseBtn('btn-down');
            };
            downBtn.addEventListener('touchstart', shiftDownHandler, { passive: false });
            downBtn.addEventListener('mousedown', shiftDownHandler);
        }

        document.addEventListener('contextmenu', e => {
            if (e.target.classList && e.target.classList.contains('btn')) e.preventDefault();
        });

        // Bind fullscreen prompt buttons
        document.getElementById('fs-yes-btn').addEventListener('click', () => this.acceptFullscreen());
        document.getElementById('fs-no-btn').addEventListener('click', () => this.declineFullscreen());
    },

    _toggleBtn(id, on) {
        const el = document.getElementById(id);
        if (el) on ? el.classList.add('active') : el.classList.remove('active');
    },

    _pulseBtn(id) {
        const el = document.getElementById(id);
        if (!el) return;
        el.classList.add('active');
        setTimeout(() => el.classList.remove('active'), 100);
    },

    togglePause() {
        if (this.state !== 'RACE') return;
        this.paused = !this.paused;
        const menu = document.getElementById('pause-menu');
        if (this.paused) {
            menu.classList.remove('hidden');
            this.playerCar.gas = 0;
            this.playerCar.brake = 0;
            this.playerCar.clutch = 0;
            this._toggleBtn('btn-gas', false);
            this._toggleBtn('btn-brake', false);
            this._toggleBtn('btn-clutch', false);
        } else {
            menu.classList.add('hidden');
        }
    },
    resumeRace() {
        this.paused = false;
        document.getElementById('pause-menu').classList.add('hidden');
    },
    restartRace() {
        this.paused = false;
        document.getElementById('pause-menu').classList.add('hidden');
        this.startRaceMode(this.raceMode);
    },
    quitToMenu() {
        this.paused = false;
        document.getElementById('pause-menu').classList.add('hidden');
        this.returnToMenu();
    },

    loop(timestamp) {
        requestAnimationFrame(t => this.loop(t));
        const realDt = (timestamp - this.lastTimestamp) / 1000;
        this.lastTimestamp = timestamp;

        if (this.paused) {
            this.draw();
            return;
        }

        this.accumulator += Math.min(realDt, 0.1);

        let steps = 0;
        while (this.accumulator >= FIXED_DT && steps < MAX_SUBSTEPS) {
            if (this.state === 'RACE') this.updateRace(FIXED_DT);
            this.accumulator -= FIXED_DT;
            steps++;
        }
        if (steps >= MAX_SUBSTEPS) this.accumulator = 0;

        if (this.screenShake > 0.1) this.screenShake *= 0.88;
        else this.screenShake = 0;

        this.draw();
    },

    updateRace(dt) {
        if (this.finished) return;

        const p = this.playerCar;
        const o = this.opponentCar;
        const frozen = this.raceState !== 'RUNNING';

        if (this.raceState === 'STAGING') {
            if (p.gas > 0.1) {
                this.raceState = 'COUNTDOWN';
                this.lights = 0;
                this.lightTimer = performance.now();
            }
        }

        if (this.raceState === 'COUNTDOWN') {
            const elapsed = (performance.now() - this.lightTimer) / 1000;
            this.lights = Math.min(4, Math.floor(elapsed));
            o.clutch = 1; o.gear = 1;
            o.gas = (Math.sin(performance.now() / 150) > 0) ? 1 : 0;
            o.rpm = 1000 + (o.redline - 1000) * 0.5 * (0.5 + 0.5 * Math.sin(performance.now() / 200));

            if (p.speed > 0.5) {
                this.finishRace(false, 'FALSE START');
                return;
            }

            if (elapsed >= 4) {
                this.raceState = 'RUNNING';
                this.raceStartTime = performance.now();
                this.raceTimer = 0;
                this.showNotification('GO!');
                this.lights = 4;
            }
        }

        if (this.raceState === 'RUNNING') {
            this.raceTimer = (performance.now() - this.raceStartTime) / 1000;

            if (AUTO_SHIFT_ENABLED) {
                if (p.gear === 0 && p.gas > 0.3 && p.clutch < 0.3) {
                    p.gear = 1;
                    p.shiftTimer = 0.1;
                }
            }

            if (this.raceTimer > o.reactionTime && !o.launched) {
                o.launched = true; o.clutch = 0; o.gas = 1; o.gear = 1;
            }
            if (o.launched) {
                o.clutch = 0; o.gas = 1;
                if (o.rpm > o.redline * (o.aiShiftPoint || 0.92) && o.gear < o.gearRatios.length - 1) o.shiftUp();
                if (o.rpm > o.redline - 100) o.rpm = o.redline - 200;
            }
            if (p.finished && !this.finished) { this.finishRace(true); return; }
            if (o.finished && !this.finished) { this.finishRace(false); return; }
        }

        p.update(dt);
        o.update(dt);

        if (frozen) {
            o.x = 0; o.speed = 0; o.squat = 0;
        }

        if (p.wheelSlip > 0.4 && p.speed < 25 && p.gas > 0.5) {
            this.createSmoke(p, p.speed < 5);
        }
        if (o.wheelSlip > 0.4 && o.speed < 25 && o.gas > 0.5) {
            this.createSmoke(o, o.speed < 5);
        }

        if (this.effects) this.effects.update(dt);
    },

    finishRace(won, reason) {
        if (this.finished) return;
        this.finished = true;
        this.raceState = 'FINISHED';

        const p = this.playerCar, o = this.opponentCar;
        p.speed = 0; p.gas = 0; p.brake = 1;
        o.speed = 0; o.gas = 0;

        let playerTime, reactionTime, prize = 0;
        if (reason === 'FALSE START') {
            playerTime = 999; reactionTime = 999; prize = 0;
        } else {
            playerTime = p.finishTime || this.raceTimer;
            reactionTime = p.reactionTime || 0;
            if (won) {
                if (this.raceMode === 'quick') {
                    prize = 250 + Math.floor(Math.random() * 150);
                    this.quickStats.races++;
                    this.quickStats.wins++;
                } else if (this.tournamentRound >= 3) {
                    prize = this.activeTournamentTier?.prize || 5000;
                    this.tournamentRound = 1;
                } else {
                    prize = 0;
                    this.tournamentRound++;
                }
            } else {
                prize = this.raceMode === 'quick' ? 50 : 0;
                if (this.raceMode === 'quick') this.quickStats.races++;
                // A tournament loss ends the run. A new entry always starts at Heat 1.
                if (this.raceMode === 'tournament') this.tournamentRound = 1;
            }
        }

        if (!reason && (!this.bestET || playerTime < this.bestET)) this.bestET = playerTime;
        this.cash += prize;
        this.raceResults = {
            playerTime, playerReaction: reactionTime, won,
            opponentName: o.name, trapSpeed: p.trapSpeed || p.speed, reason
        };

        if (this.raceMode === 'quick') this._pendingRotation = true;
        this.scheduleSave();

        setTimeout(() => {
            this.state = 'RESULTS';
            document.getElementById('ui-layer').classList.add('hidden');
            document.getElementById('pause-btn').classList.add('hidden');
            document.getElementById('results-menu').classList.remove('hidden');
            const title = document.getElementById('result-title');
            title.innerText = reason || (won ? 'VICTORY' : 'DEFEAT');
            title.style.color = won ? '#4caf50' : '#f44336';
            document.getElementById('result-time').innerText = playerTime.toFixed(3) + 's';
            document.getElementById('result-reaction').innerText = (reactionTime > 10.0 || reason === 'FALSE START') ? '—' : reactionTime.toFixed(3) + 's';
            document.getElementById('result-trap').innerText = Math.round((p.trapSpeed || p.speed) * MPS_TO_MPH) + ' mph';
            document.getElementById('result-prize').innerText = '$' + prize;
        }, 500);
    },

    draw() {
        const W = window.innerWidth;
        const H = window.innerHeight;
        const ctx = this.ctx;
        ctx.save();
        if (this.screenShake > 0.1) {
            ctx.translate((Math.random() - 0.5) * this.screenShake, (Math.random() - 0.5) * this.screenShake);
        }
        if (this.state !== 'RACE') {
            Renderer.drawGarageBg(ctx, W, H, this.menuState, this.previewCar, this.playerCar);
        } else {
            Renderer.drawRaceScene(ctx, W, H, this.playerCar, this.opponentCar, this.effects, this.screenShake, this.raceDistance, this.METERS_TO_PX, this.raceState, this.lights, this._isMobile);
        }
        ctx.restore();
    },

    drawBackground(ctx, W, H, camX) {
        const bg = this.backgrounds[this.currentBackground];
        if (bg === 'sunset_highway') return this.bgSunsetHighway(ctx, W, H, camX);
        if (bg === 'industrial') return this.bgIndustrial(ctx, W, H, camX);
        if (bg === 'mountain_dusk') return this.bgMountainDusk(ctx, W, H, camX);
        if (bg === 'neon_tokyo') return this.bgNeonTokyo(ctx, W, H, camX);
        return this.bgNightCity(ctx, W, H, camX);
    },

    _fillSky(ctx, W, H, topColor, midColor, botColor) {
        const grad = ctx.createLinearGradient(0, 0, 0, H);
        grad.addColorStop(0, topColor);
        grad.addColorStop(0.5, midColor);
        grad.addColorStop(1, botColor);
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, W, H);
    },

    bgNightCity(ctx, W, H, camX) {
        this._fillSky(ctx, W, H, '#021a35', '#0a2a50', '#0d47a1');
        ctx.fillStyle = '#fff';
        for (let i = 0; i < 40; i++) {
            const sx = (i * 137.5) % W;
            const sy = (i * 67.3) % (H * 0.4);
            const size = (i % 3 === 0) ? 2 : 1;
            ctx.globalAlpha = 0.3 + Math.abs(Math.sin(i)) * 0.5;
            ctx.fillRect(sx, sy, size, size);
        }
        ctx.globalAlpha = 1;
        ctx.fillStyle = '#050a14';
        const base = H * 0.72;
        for (let i = 0; i < Math.floor(W / 45) + 4; i++) {
            const seed = i * 137.5;
            const h = 60 + Math.abs(Math.sin(seed)) * 90 + Math.abs(Math.cos(seed * 0.7)) * 40;
            let bx = (i * 45) - (camX * 0.08);
            bx = ((bx % (W + 200)) + W + 200) % (W + 200) - 100;
            ctx.fillRect(bx, base - h, 40, h);
            for (let wy = 0; wy < Math.floor(h / 22); wy++) {
                for (let wx = 0; wx < 2; wx++) {
                    ctx.fillStyle = Math.abs(Math.sin(seed + wy * 31 + wx * 17)) > 0.55 ? '#1a2a4a' : '#0a1525';
                    ctx.fillRect(bx + 8 + wx * 16, base - h + 12 + wy * 22, 8, 10);
                }
            }
            ctx.fillStyle = '#050a14';
        }
    },

    bgSunsetHighway(ctx, W, H, camX) {
        this._fillSky(ctx, W, H, '#2b1055', '#c96e4a', '#f7b267');
        const sunY = H * 0.55;
        const sunX = W * 0.7 - (camX * 0.02) % (W * 1.5);
        const sunGrad = ctx.createRadialGradient(sunX, sunY, 5, sunX, sunY, 90);
        sunGrad.addColorStop(0, '#fff2a8');
        sunGrad.addColorStop(0.4, '#ffb347');
        sunGrad.addColorStop(1, 'rgba(255,100,50,0)');
        ctx.fillStyle = sunGrad;
        ctx.fillRect(0, 0, W, H);
        ctx.fillStyle = '#1a0a2a';
        for (let i = 0; i < Math.floor(W / 80) + 3; i++) {
            const seed = i * 91.3;
            const h = 40 + Math.abs(Math.sin(seed)) * 40;
            let bx = (i * 80) - (camX * 0.05);
            bx = ((bx % (W + 300)) + W + 300) % (W + 300) - 150;
            ctx.beginPath();
            ctx.moveTo(bx, H * 0.72);
            ctx.lineTo(bx + 40, H * 0.72 - h);
            ctx.lineTo(bx + 80, H * 0.72);
            ctx.closePath();
            ctx.fill();
        }
        ctx.fillStyle = '#0d0418';
        for (let i = 0; i < Math.floor(W / 180) + 2; i++) {
            let px = (i * 180 + 50) - (camX * 0.12);
            px = ((px % (W + 400)) + W + 400) % (W + 400) - 200;
            const baseY = H * 0.72;
            ctx.fillRect(px, baseY - 70, 4, 70);
            for (let a = 0; a < 5; a++) {
                const angle = -Math.PI / 2 + (a - 2) * 0.5;
                ctx.save();
                ctx.translate(px + 2, baseY - 70);
                ctx.rotate(angle);
                ctx.fillRect(0, -18, 3, 18);
                ctx.restore();
            }
        }
    },

    bgIndustrial(ctx, W, H, camX) {
        this._fillSky(ctx, W, H, '#1a1005', '#2a1a08', '#3a2a10');
        ctx.fillStyle = '#e8d8a0';
        ctx.beginPath();
        ctx.arc(W * 0.15, H * 0.18, 22, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#1a1005';
        ctx.beginPath();
        ctx.arc(W * 0.17, H * 0.16, 18, 0, Math.PI * 2);
        ctx.fill();
        const base = H * 0.72;
        ctx.fillStyle = '#0a0500';
        for (let i = 0; i < Math.floor(W / 100) + 3; i++) {
            const seed = i * 53.7;
            let bx = (i * 100) - (camX * 0.06);
            bx = ((bx % (W + 300)) + W + 300) % (W + 300) - 150;
            const w = 60 + Math.abs(Math.sin(seed)) * 40;
            const h = 80 + Math.abs(Math.cos(seed)) * 60;
            ctx.fillRect(bx, base - h, w, h);
            for (let s = 0; s < 2; s++) {
                const sx = bx + 10 + s * (w - 30);
                ctx.fillRect(sx, base - h - 40, 8, 40);
                ctx.fillStyle = 'rgba(80,70,60,0.3)';
                for (let p = 0; p < 3; p++) {
                    ctx.beginPath();
                    ctx.arc(sx + 4 + p * 5, base - h - 45 - p * 12, 8 + p * 3, 0, Math.PI * 2);
                    ctx.fill();
                }
                ctx.fillStyle = '#0a0500';
            }
            for (let wy = 0; wy < 3; wy++) {
                for (let wx = 0; wx < Math.floor(w / 20); wx++) {
                    if (Math.abs(Math.sin(seed + wy * 13 + wx * 7)) > 0.5) {
                        ctx.fillStyle = '#c9a050';
                        ctx.fillRect(bx + 8 + wx * 20, base - h + 15 + wy * 25, 8, 12);
                        ctx.fillStyle = '#0a0500';
                    }
                }
            }
        }
    },

    bgMountainDusk(ctx, W, H, camX) {
        this._fillSky(ctx, W, H, '#0a0520', '#2a1a4a', '#6a3a7a');
        ctx.fillStyle = '#fff';
        for (let i = 0; i < 30; i++) {
            const sx = (i * 173.3) % W;
            const sy = (i * 47.1) % (H * 0.35);
            ctx.globalAlpha = 0.4 + Math.abs(Math.sin(i * 1.3)) * 0.4;
            ctx.fillRect(sx, sy, 2, 2);
        }
        ctx.globalAlpha = 1;
        for (let layer = 0; layer < 2; layer++) {
            const offset = layer * 60;
            const speed = 0.04 + layer * 0.03;
            const baseY = H * 0.72 - offset * 0.3;
            ctx.fillStyle = layer === 0 ? '#2a1a3a' : '#0f0520';
            for (let i = 0; i < Math.floor(W / 120) + 3; i++) {
                const seed = i * 71.1 + layer * 100;
                let bx = (i * 120) - (camX * speed);
                bx = ((bx % (W + 400)) + W + 400) % (W + 400) - 200;
                ctx.beginPath();
                ctx.moveTo(bx - 40, baseY);
                ctx.lineTo(bx, baseY - 70 - Math.abs(Math.sin(seed)) * 50);
                ctx.lineTo(bx + 40, baseY - 30 - Math.abs(Math.cos(seed)) * 30);
                ctx.lineTo(bx + 80, baseY);
                ctx.closePath();
                ctx.fill();
            }
        }
    },

    bgNeonTokyo(ctx, W, H, camX) {
        this._fillSky(ctx, W, H, '#05000d', '#12002a', '#1e003a');
        const base = H * 0.72;
        for (let i = 0; i < Math.floor(W / 65) + 3; i++) {
            const seed = i * 189.7;
            const h = 55 + Math.abs(Math.sin(seed)) * 80;
            let bx = (i * 65) - (camX * 0.09);
            bx = ((bx % (W + 300)) + W + 300) % (W + 300) - 150;
            ctx.fillStyle = '#08001a';
            ctx.fillRect(bx, base - h, 55, h);
            const neonColors = ['#c9407a', '#5fa8b8', '#b8923a', '#5ca87a'];
            for (let ny = 0; ny < Math.floor(h / 45); ny++) {
                const colorSeed = Math.abs(Math.sin(seed * 1.3 + ny * 5.1));
                if (colorSeed > 0.55) {
                    const color = neonColors[Math.floor(colorSeed * 100) % neonColors.length];
                    ctx.fillStyle = color;
                    ctx.globalAlpha = 0.35;
                    ctx.fillRect(bx + 6, base - h + 12 + ny * 45, 18, 2);
                    ctx.globalAlpha = 1;
                }
            }
            for (let wy = 0; wy < Math.floor(h / 20); wy++) {
                for (let wx = 0; wx < 3; wx++) {
                    if (Math.abs(Math.sin(seed + wy * 23 + wx * 13)) > 0.7) {
                        ctx.fillStyle = '#1a2a4a';
                        ctx.fillRect(bx + 6 + wx * 16, base - h + 12 + wy * 20, 8, 6);
                    }
                }
            }
        }
    },

    _getCarCanvasMetrics(car) {
        const W = window.innerWidth;
        const H = window.innerHeight;
        const followOffset = Math.min(W * 0.34, 220);
        const camX = Math.max(0, this.playerCar.x * this.METERS_TO_PX - followOffset);
        const roadY = getRoadY(H, this._isMobile);
        const isPlayer = (car === this.playerCar);
        const scale = isPlayer ? 1.1 : 0.95;
        const laneY = isPlayer ? roadY + 65 : roadY + 20;
        const carX = (car.x * this.METERS_TO_PX) - camX + 40;
        const art = (typeof artFor === 'function') ? artFor(car) : null;
        const rearWheel = car._artAnchors?.rearWheel || (art ? { x: art.wheels[0][0], y: art.wheels[0][1] } : { x: 22, y: 36 });
        const exhaust = car._artAnchors?.exhaust || (art ? { x: art.rear, y: 29 } : { x: 2, y: 29 });
        const rearWheelX = carX + rearWheel.x * scale;
        const rearWheelY = laneY + car.squat + rearWheel.y * scale;
        const exhaustX = carX + exhaust.x * scale;
        const exhaustY = laneY + car.squat + exhaust.y * scale;
        return { carX, laneY, scale, rearWheelX, rearWheelY, exhaustX, exhaustY };
    },

    createSmoke(car, burnout) {
        if (!this.effects) return;
        const m = this._getCarCanvasMetrics(car);
        this.effects.emitTireSmoke(m.rearWheelX, m.rearWheelY, !!burnout);
    },

    createBackfire(car) {
        if (!this.effects) return;
        const m = this._getCarCanvasMetrics(car);
        this.effects.triggerGearFlame(m.exhaustX, m.exhaustY);
    },

    updateMenuUI() {
        document.getElementById('menu-cash').innerText = this.cash;
        document.getElementById('shop-cash').innerText = this.cash;
        document.getElementById('dealer-cash').innerText = this.cash;
        const rec = document.getElementById('menu-record');
        if (rec) rec.innerText = this.bestET ? 'BEST ET: ' + this.bestET.toFixed(3) + 's' : '';
    },

    showNotification(text) {
        const n = document.getElementById('notification');
        if (!n) return;
        n.innerText = text;
        n.style.opacity = 1;
        n.style.top = '18%';
        clearTimeout(this._notifTimeout);
        this._notifTimeout = setTimeout(() => { n.style.opacity = 0; n.style.top = '25%'; }, 900);
    },

    performanceScore(car) {
        const upgradeCount = Object.values(car.upgrades).reduce((sum, value) => sum + (value === true ? 1 : (typeof value === 'number' ? Math.max(0, value - 1) : 0)), 0);
        return car.hp / car.weight + upgradeCount * 0.025;
    },

    getTournamentTier() {
        const score = this.performanceScore(this.playerCar);
        if (score < 0.38) return { name: 'LIGHT CUP', ai: 0.98, prize: 5000, start: 0 };
        if (score < 0.66) return { name: 'STREET KINGS', ai: 1.03, prize: 18000, start: 2 };
        return { name: 'PRO LEAGUE', ai: 1.08, prize: 50000, start: 4 };
    },

    getQuickOpponent() {
        const playerScore = this.performanceScore(this.playerCar);
        const upgrades = Object.values(this.playerCar.upgrades).reduce((sum, value) => sum + (value === true ? 1 : (typeof value === 'number' ? Math.max(0, value - 1) : 0)), 0);
        const earlyCareer = this.quickStats.races < 4 && upgrades === 0;
        const skill = earlyCareer ? 0.67 + this.quickStats.races * 0.035 : Math.min(1.12, 0.86 + upgrades * 0.025 + this.quickStats.wins / Math.max(1, this.quickStats.races) * 0.08);
        const target = playerScore * skill;
        let best = this.carDefs[0], bestGap = Infinity;
        for (const def of this.carDefs) {
            const gap = Math.abs(def.hp / def.weight - target);
            if (gap < bestGap) { best = def; bestGap = gap; }
        }
        return { def: best, scale: skill * (0.96 + Math.random() * 0.08), reaction: earlyCareer ? 0.46 + Math.random() * .14 : Math.max(.15, .34 - upgrades * .01 + Math.random() * .08), shift: earlyCareer ? .84 : .89 + Math.min(.05, upgrades * .006) };
    },

    startRaceMode(mode) {
        this.raceMode = mode;
        this.state = 'RACE';
        this.menuState = 'RACE';
        this.raceState = 'STAGING';
        this.finished = false;
        this.paused = false;
        this.effects = new RaceParticles(this.ctx);

        document.querySelectorAll('.menu-overlay').forEach(el => el.classList.add('hidden'));
        document.getElementById('ui-layer').classList.remove('hidden');
        document.getElementById('hud').classList.remove('hidden');
        document.getElementById('controls').classList.remove('hidden');
        document.getElementById('pause-btn').classList.remove('hidden');

        // Force landscape on race start
        this.tryLockOrientation();

        let def, scaleFactor, aiShift;
        if (mode === 'quick') {
            const match = this.getQuickOpponent();
            def = match.def; scaleFactor = match.scale; aiShift = match.shift;
            this._opponentReaction = match.reaction;
        } else {
            const tier = this.getTournamentTier();
            def = this.carDefs[Math.min(this.carDefs.length - 1, tier.start + this.tournamentRound - 1)];
            scaleFactor = tier.ai + (this.tournamentRound - 1) * .035;
            aiShift = .91 + this.tournamentRound * .01;
            this._opponentReaction = Math.max(.12, .32 - this.tournamentRound * .025);
            this.activeTournamentTier = tier;
        }

        this.opponentCar = new Car({ ...def, randomizeCustomization: true });
        this.opponentCar.hp = Math.floor(def.hp * scaleFactor);
        this.opponentCar.reactionTime = this._opponentReaction;
        this.opponentCar.aiShiftPoint = aiShift;

        document.getElementById('opp-name').innerText = mode === 'tournament' ? this.activeTournamentTier.name + ' • ' + this.opponentCar.name : this.opponentCar.name;
        document.getElementById('tournament-round').innerText = mode === 'tournament' ? this.tournamentRound + '/3' : 'FREE RUN';
        document.getElementById('reaction-display').innerText = '';
        document.getElementById('race-timer').innerText = '0.000';

        this.playerCar.reset();
        this.opponentCar.reset();

        this.lights = 0;
        this.lightTimer = performance.now();
        this.raceStartTime = 0;
        this.raceTimer = 0;
        this.accumulator = 0;
    },

    returnToMenu() {
        if (this._pendingRotation) {
            this.currentBackground = (this.currentBackground + 1) % this.backgrounds.length;
            this._pendingRotation = false;
            this.scheduleSave();
        }

        this.state = 'MENU';
        this.menuState = 'MAIN';
        this.finished = false;
        this.paused = false;
        this.effects = new RaceParticles(this.ctx);
        document.querySelectorAll('.menu-overlay').forEach(el => el.classList.add('hidden'));
        document.getElementById('ui-layer').classList.remove('hidden');
        document.getElementById('hud').classList.add('hidden');
        document.getElementById('controls').classList.add('hidden');
        document.getElementById('pause-btn').classList.add('hidden');
        document.getElementById('main-menu').classList.remove('hidden');
        this.playerCar.reset();
        this.updateMenuUI();
    },

    openGarage() {
        this.menuState = 'GARAGE';
        document.getElementById('main-menu').classList.add('hidden');
        document.getElementById('garage-menu').classList.remove('hidden');
        const container = document.getElementById('car-stats-display');
        container.innerHTML = '';
        this.ownedCars.forEach((car, index) => {
            const div = document.createElement('div');
            div.className = 'car-item ' + (index === this.selectedCarIndex ? 'selected' : '');
            const hp = Math.round(car.hp);
            const pw = (car.hp / car.weight * 1000).toFixed(0);
            div.innerHTML =
                '<div>' +
                    '<div style="color:' + car.color + '; font-size:14px;">' + car.name + '</div>' +
                    '<div style="font-size:9px; color:#aaa; margin-top:5px;">' +
                        hp + ' HP &middot; ' + car.weight + 'kg &middot; ' + pw + ' hp/ton' +
                    '</div>' +
                    '<div style="font-size:8px; color:#555; margin-top:3px;">' +
                        'Redline: ' + car.redline + ' &middot; Grip: ' + car.grip.toFixed(2) +
                    '</div>' +
                '</div>' +
                (index === this.selectedCarIndex
                    ? '<div style="color:#ffeb3b; font-size:10px;">DRIVING</div>'
                    : '<div style="color:#4caf50; font-size:9px;">SELECT</div>');
            div.onclick = () => {
                this.selectedCarIndex = index;
                this.playerCar = this.ownedCars[index];
                this.scheduleSave();
                this.openGarage();
            };
            container.appendChild(div);
        });
    },

    openShop() {
        this.menuState = 'SHOP';
        document.getElementById('main-menu').classList.add('hidden');
        document.getElementById('shop-menu').classList.remove('hidden');
        this.updateMenuUI();

        const upgrades = [
            { key: 'engine', name: 'ECU Remap', stages: 5, cost: 500, desc: '+12% HP per stage, +300 rpm redline' },
            { key: 'injector', name: 'Fuel System', stages: 5, cost: 800, desc: '+6% HP per stage' },
            { key: 'chassis', name: 'Weight Reduction', stages: 3, cost: 1200, desc: '-35kg per stage (min 600kg)' },
            { key: 'shortGears', name: 'Short Gears', stages: 3, cost: 1500, desc: '+0.25 final drive per stage' },
            { key: 'slicks', name: 'Drag Slicks', stages: 1, cost: 2500, desc: '+0.55 grip — essential for 400+ HP' },
            { key: 'aero', name: 'Aero Package', stages: 1, cost: 3500, desc: '-15% drag' },
            { key: 'performanceGearbox', name: 'Pro Transmission', stages: 1, cost: 8000, desc: '7-speed close ratio' },
            { key: 'parachute', name: 'Parachute', stages: 1, cost: 4000, desc: 'Extra braking force above 5 m/s' },
        ];

        const container = document.getElementById('shop-items');
        container.innerHTML = '';
        const car = this.playerCar;

        upgrades.forEach(item => {
            const lvl = car.upgrades[item.key] || 0;
            const isBool = item.stages === 1;
            const isMax = isBool ? !!lvl : lvl >= item.stages;
            const cost = isMax ? 0 : item.cost * (isBool ? 1 : lvl);

            const div = document.createElement('div');
            div.className = 'shop-item';
            div.innerHTML =
                '<div class="shop-item-header">' +
                    '<span style="color:#fff">' + item.name +
                        ' <span style="color:#666">' + (isBool ? (isMax ? '✓' : '') : 'Lvl ' + lvl) + '</span>' +
                    '</span>' +
                    '<span style="color:' + (isMax ? '#4caf50' : (this.cash >= cost ? '#4caf50' : '#f44336')) + '">' +
                        (isMax ? 'MAX' : '$' + cost.toLocaleString()) +
                    '</span>' +
                '</div>' +
                '<div class="shop-item-detail">' + item.desc + '</div>';

            div.onclick = () => {
                if (isMax) return;
                if (this.cash >= cost) {
                    this.cash -= cost;
                    if (isBool) car.upgrades[item.key] = true;
                    else car.upgrades[item.key]++;
                    car.applyUpgrades();
                    this.scheduleSave();
                    this.updateMenuUI();
                    this.openShop();
                    this.showNotification('INSTALLED');
                } else {
                    this.showNotification('INSUFFICIENT FUNDS');
                }
            };
            container.appendChild(div);
        });

        const heading = document.createElement('div');
        heading.className = 'shop-item';
        heading.style.cssText = 'border-color:#4fc3f7; color:#4fc3f7; cursor:default;';
        heading.innerHTML = '<div class="shop-item-header"><span>TUNE SETUP</span><span style="color:#888">-3 to +3</span></div><div class="shop-item-detail">Adjustments are free. Every setting has a trade-off and is applied to your car immediately.</div>';
        container.appendChild(heading);
        const tunes = [
            { key: 'finalDrive', name: 'Final Drive', low: 'Taller: higher top speed, softer launch', high: 'Shorter: stronger acceleration, lower top speed' },
            { key: 'gearSpacing', name: 'Gear Spacing', low: 'Wider: fewer shifts, larger RPM drops', high: 'Closer: stronger pull, more shifts' },
            { key: 'launch', name: 'Launch Bias', low: 'Gentler launch, less wheelspin control', high: 'Harder launch, more low-speed torque and grip' },
            { key: 'aeroTrim', name: 'Aero Trim', low: 'Less drag, less high-speed stability', high: 'More stability and grip, more drag' },
        ];
        tunes.forEach(item => {
            const value = car.tune[item.key] || 0;
            const div = document.createElement('div');
            div.className = 'shop-item';
            div.innerHTML = '<div class="shop-item-header"><span style="color:#fff">' + item.name + '</span><span style="color:#4fc3f7">' + (value > 0 ? '+' : '') + value + '</span></div><div class="shop-item-detail">' + (value < 0 ? item.low : value > 0 ? item.high : 'Balanced') + '<br><span style="color:#666">Click to increase; Shift-click to decrease.</span></div>';
            div.onclick = event => {
                const delta = event.shiftKey ? -1 : 1;
                car.tune[item.key] = Math.max(-3, Math.min(3, value + delta));
                car.applyUpgrades(); this.scheduleSave(); this.openShop(); this.showNotification('TUNE APPLIED');
            };
            container.appendChild(div);
        });
    },

    openDealership() {
        this.menuState = 'DEALER';
        document.getElementById('main-menu').classList.add('hidden');
        document.getElementById('dealership-menu').classList.remove('hidden');
        this.updateMenuUI();

        const container = document.getElementById('dealer-items');
        container.innerHTML = '';
        if (!this.previewCar) this.previewCar = new Car(this.carDefs[1]);

        this.carDefs.forEach(def => {
            const isOwned = this.ownedCars.some(c => c.name === def.name);
            const div = document.createElement('div');
            div.className = 'car-item ' + (isOwned ? 'owned' : '');
            const pw = (def.hp / def.weight * 1000).toFixed(0);
            div.innerHTML =
                '<div>' +
                    '<span style="font-size:13px">' + def.name + '</span>' +
                    '<span style="font-size:9px; color:#888; margin-left:6px;">' + def.hp + ' HP &middot; ' + def.weight + 'kg &middot; ' + pw + ' hp/ton</span>' +
                '</div>' +
                '<div style="color:' + (isOwned ? '#4caf50' : (this.cash >= def.price ? '#4caf50' : '#f44336')) + '; font-size:11px;">' +
                    (isOwned ? 'OWNED' : '$' + def.price.toLocaleString()) +
                '</div>';

            div.onclick = () => {
                this.previewCar = new Car({ ...def, customization: null });
                if (isOwned) {
                    const idx = this.ownedCars.findIndex(c => c.name === def.name);
                    if (idx >= 0) {
                        this.selectedCarIndex = idx;
                        this.playerCar = this.ownedCars[idx];
                        this.scheduleSave();
                        this.showNotification('SELECTED');
                    }
                    return;
                }
                if (this.cash >= def.price) {
                    this.cash -= def.price;
                    const newCar = new Car(JSON.parse(JSON.stringify(def)));
                    this.ownedCars.push(newCar);
                    this.selectedCarIndex = this.ownedCars.length - 1;
                    this.playerCar = newCar;
                    this.scheduleSave();
                    this.updateMenuUI();
                    this.openDealership();
                    this.showNotification('PURCHASED!');
                } else {
                    this.showNotification('INSUFFICIENT FUNDS');
                }
            };
            container.appendChild(div);
        });
    }
};

window.addEventListener('load', () => game.init());
