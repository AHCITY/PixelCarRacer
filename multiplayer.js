'use strict';

/*
 * ─── Pixel Drag Legends — P2P Multiplayer ───────────────────────────────
 *
 * Architecture (see chat for the full writeup):
 *  - Each side's OWN car is simulated 100% locally — zero added latency,
 *    exactly like single-player.
 *  - The OPPONENT's car is a real `Car` instance too, driven by their real
 *    gas/brake/clutch/gear inputs streamed over WebRTC, run through the
 *    same deterministic Car.update() — not a fake dot, a real replica.
 *  - Periodic authoritative snapshots correct any drift. Since the two
 *    cars never collide, a snapshot correction is invisible.
 *  - Firebase Realtime Database is used ONLY to exchange the initial
 *    WebRTC handshake (SDP + ICE candidates) via a short room code. Once
 *    the connection opens, gameplay never touches Firebase again.
 *
 * ─── Firebase setup ────────────────────────────────────────────────────
 *  The config below is already filled in (project: pixelcarracer).
 *  One thing left to verify on YOUR Firebase console:
 *
 *  Realtime Database → "Rules" tab — use something like:
 *
 *     {
 *       "rules": {
 *         "pdl_mp_rooms": {
 *           "$roomCode": { ".read": true, ".write": true }
 *         },
 *         ".read": false,
 *         ".write": false
 *       }
 *     }
 *
 *     This only exposes a scratch "mailbox" per room code — nothing about
 *     the player's save data, cash, etc. ever touches Firebase.
 *
 * If the config is blanked out or Firebase can't be reached, the
 * Multiplayer menu shows a friendly "OFFLINE" badge instead of breaking
 * anything — single-player is completely unaffected either way.
 * ─────────────────────────────────────────────────────────────────────── */

const FIREBASE_CONFIG = {
    apiKey: "AIzaSyDVJ5dIrdi24itz2xOOY7BttKnWWY0cgm8",
    authDomain: "pixelcarracer-ff509.firebaseapp.com",
    databaseURL: "https://pixelcarracer-ff509-default-rtdb.firebaseio.com",
    projectId: "pixelcarracer-ff509",
    storageBucket: "pixelcarracer-ff509.firebasestorage.app",
    messagingSenderId: "877495673026",
    appId: "1:877495673026:web:fb195e7674d2066f0f1b5b",
    measurementId: "G-J1TD3S2QP0"
};

const MP = {
    roomPath: 'pdl_mp_rooms',
    iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' },
    ],

    // ---- connection state ----
    isHost: false,
    pc: null,
    eventsChannel: null,   // reliable / ordered — discrete events
    stateChannel: null,    // unreliable / unordered — frequent ticks
    roomCode: null,
    roomRef: null,
    db: null,
    _connected: false,
    _pendingCandidates: null,
    _uiWired: false,
    _peerLostHandled: false,
    _discGraceTimer: null,
    _lobbyResetToken: 0,

    // ---- race/lobby state ----
    remoteLoadout: null,
    _remoteOutcome: null,      // peer's race report, may arrive before ours is requested
    clockOffset: 0,
    countdownStart: null,
    _stagingFallbackAt: null,
    localRevved: false,
    remoteRevved: false,
    localReady: false,
    remoteReady: false,
    _launched: false,
    _outcomeResolve: null,
    _pongSamples: [],
    _lastGas: null, _lastBrake: null, _lastClutch: null,
    _lastInputSend: 0, _lastSync: 0,

    init() {
        this._wireUI();
        // Nothing else to do yet — Firebase connects lazily when the player
        // actually opens the Multiplayer menu, so a blank/broken config
        // never touches single-player at all.
    },

    firebaseConfigured() {
        return !!(FIREBASE_CONFIG.apiKey && FIREBASE_CONFIG.databaseURL);
    },

    ensureFirebase() {
        if (!this.firebaseConfigured()) return false;
        if (typeof firebase === 'undefined') return false;
        try {
            if (!firebase.apps.length) firebase.initializeApp(FIREBASE_CONFIG);
            this.db = firebase.database();
            return true;
        } catch (e) {
            console.warn('Firebase init failed:', e);
            return false;
        }
    },

    // ───────────────────────────────────────────── Menu / lobby ──────
    resetMenu() {
        this.disconnect();
        this._show('mp-choice', true);
        this._show('mp-host-panel', false);
        this._show('mp-join-panel', false);
        this._show('mp-ready-panel', false);
        const card = document.getElementById('mp-opp-card');
        if (card) card.classList.add('hidden');
        const badge = document.getElementById('mp-net-badge');
        if (badge) {
            const ok = this.firebaseConfigured();
            badge.textContent = ok ? '\u25CF P2P ONLINE' : '\u25CF OFFLINE — SETUP NEEDED';
            badge.classList.toggle('mp-badge-on', ok);
            badge.classList.toggle('mp-badge-off', !ok);
        }
        this.status('');
    },

    _show(id, visible) {
        const el = document.getElementById(id);
        if (el) el.classList.toggle('hidden', !visible);
    },

    // kind: '' = info (cyan) | 'ok' = success (green) | 'busy' = waiting (pulse) | 'err' = error (red)
    status(text, kind) {
        const el = document.getElementById('mp-status');
        if (!el) return;
        el.innerText = text;
        el.classList.toggle('mp-status-ok', kind === 'ok');
        el.classList.toggle('mp-status-err', kind === 'err');
        el.classList.toggle('mp-status-busy', kind === 'busy');
    },

    // One-time wiring of the Multiplayer menu's input behaviours.
    _wireUI() {
        if (this._uiWired) return;
        this._uiWired = true;
        const input = document.getElementById('mp-code-input');
        if (input) {
            // Keep the code box clean: uppercase alphanumerics only, 5 chars.
            input.addEventListener('input', () => {
                const clean = input.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 5);
                if (input.value !== clean) input.value = clean;
            });
            input.addEventListener('keydown', e => {
                if (e.key === 'Enter') { e.preventDefault(); this.joinGame(); }
            });
        }
        const copyBtn = document.getElementById('mp-copy-btn');
        if (copyBtn) copyBtn.addEventListener('click', () => this.copyRoomCode());
    },

    copyRoomCode() {
        const el = document.getElementById('mp-room-code');
        const code = this.roomCode || (el ? el.innerText : '').trim();
        if (!code || code === '-----') return;
        const flash = () => {
            const btn = document.getElementById('mp-copy-btn');
            if (!btn) return;
            btn.textContent = 'COPIED!';
            setTimeout(() => { btn.textContent = 'COPY CODE'; }, 1200);
        };
        if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(code).then(flash).catch(() => {});
        } else {
            try {
                const ta = document.createElement('textarea');
                ta.value = code;
                ta.style.position = 'fixed';
                ta.style.opacity = '0';
                document.body.appendChild(ta);
                ta.select();
                document.execCommand('copy');
                document.body.removeChild(ta);
                flash();
            } catch (e) {}
        }
    },

    showJoinPanel() {
        this._show('mp-choice', false);
        this._show('mp-join-panel', true);
        const input = document.getElementById('mp-code-input');
        if (input) { input.value = ''; setTimeout(() => input.focus(), 50); }
    },

    async hostGame() {
        if (this.pc || this.roomRef) return; // already hosting/joining
        if (!this.ensureFirebase()) { this.status('MULTIPLAYER NOT CONFIGURED — SEE multiplayer.js', 'err'); return; }
        this._show('mp-choice', false);
        this._show('mp-host-panel', true);
        this.status('CREATING ROOM...', 'busy');
        this.isHost = true;

        try {
            const code = await this._reserveRoomCode();
            this.roomCode = code;
            const codeEl = document.getElementById('mp-room-code');
            if (codeEl) codeEl.innerText = code;

            this.roomRef = this.db.ref(this.roomPath + '/' + code);
            this.roomRef.onDisconnect().remove();

            this._createPeerConnection();
            this.eventsChannel = this.pc.createDataChannel('events');
            this.stateChannel = this.pc.createDataChannel('state', { ordered: false, maxRetransmits: 0 });
            this._wireChannel(this.eventsChannel);
            this._wireChannel(this.stateChannel);

            this.roomRef.child('guestCandidates').on('child_added', snap => this._addRemoteCandidate(snap.val()));

            const offer = await this.pc.createOffer();
            await this.pc.setLocalDescription(offer);
            await this.roomRef.child('offer').set({ sdp: offer.sdp, type: offer.type });
        } catch (e) {
            console.warn('Host failed:', e);
            this.status('COULD NOT REACH FIREBASE \u2014 CHECK CONNECTION', 'err');
            this.disconnect();
            this._show('mp-host-panel', false);
            this._show('mp-choice', true);
            return;
        }

        this.status('WAITING FOR OPPONENT...', 'busy');

        this.roomRef.child('answer').on('value', async snap => {
            const answer = snap.val();
            if (!answer || this.pc.currentRemoteDescription) return;
            await this.pc.setRemoteDescription(new RTCSessionDescription(answer));
            this._flushPendingCandidates();
            this.status('CONNECTING...', 'busy');
        });
    },

    async joinGame() {
        if (this.pc || this.roomRef) return; // already joining/hosting
        if (!this.ensureFirebase()) { this.status('MULTIPLAYER NOT CONFIGURED — SEE multiplayer.js', 'err'); return; }
        const input = document.getElementById('mp-code-input');
        const code = (input ? input.value : '').trim().toUpperCase();
        if (code.length < 4) { this.status('ENTER A VALID CODE', 'err'); return; }
        this.isHost = false;
        this.roomCode = code;
        this.status('LOOKING FOR ROOM...', 'busy');

        const ref = this.db.ref(this.roomPath + '/' + code);
        let room = null;
        try {
            const snap = await ref.once('value');
            room = snap.val();
        } catch (e) {
            this.status('COULD NOT REACH ROOM — CHECK CONNECTION', 'err');
            return;
        }
        if (!room || !room.offer) { this.status('ROOM NOT FOUND', 'err'); return; }

        this.roomRef = ref;
        this._createPeerConnection();
        this.pc.ondatachannel = e => {
            if (e.channel.label === 'events') this.eventsChannel = e.channel;
            else if (e.channel.label === 'state') this.stateChannel = e.channel;
            this._wireChannel(e.channel);
        };

        this.roomRef.child('hostCandidates').on('child_added', snap => this._addRemoteCandidate(snap.val()));

        try {
            await this.pc.setRemoteDescription(new RTCSessionDescription(room.offer));
            this._flushPendingCandidates();
            const answer = await this.pc.createAnswer();
            await this.pc.setLocalDescription(answer);
            await this.roomRef.child('answer').set({ sdp: answer.sdp, type: answer.type });
        } catch (e) {
            console.warn('Join failed:', e);
            this.status('JOIN FAILED — CHECK CODE AND RETRY', 'err');
            this.disconnect();
            this._show('mp-choice', true);
            this._show('mp-join-panel', true);
            return;
        }

        this.status('CONNECTING...', 'busy');
    },

    _createPeerConnection() {
        this._peerLostHandled = false;
        this.pc = new RTCPeerConnection({ iceServers: this.iceServers });
        this.pc.onicecandidate = e => {
            if (!e.candidate || !this.roomRef) return;
            const list = this.isHost ? 'hostCandidates' : 'guestCandidates';
            this.roomRef.child(list).push(e.candidate.toJSON());
        };
        this.pc.onconnectionstatechange = () => {
            const s = this.pc && this.pc.connectionState;
            if (s === 'failed' || s === 'closed') { this._handlePeerLost(); return; }
            if (s === 'disconnected') {
                // 'disconnected' is NOT terminal — brief network blips recover
                // on their own. Only give up if it stays broken.
                if (this._discGraceTimer) clearTimeout(this._discGraceTimer);
                this._discGraceTimer = setTimeout(() => {
                    this._discGraceTimer = null;
                    const now = this.pc && this.pc.connectionState;
                    if (!this.pc || now === 'disconnected' || now === 'failed' || now === 'closed') {
                        this._handlePeerLost();
                    }
                }, MP_DISCONNECT_GRACE_MS);
            }
        };
    },

    // Single funnel for "the peer is gone" — resolves races fairly instead
    // of yanking players around, and keeps the lobby usable afterwards.
    _handlePeerLost() {
        if (this._peerLostHandled) return;
        this._peerLostHandled = true;

        const inRace = game.state === 'RACE' && game.raceMode === 'multiplayer' && !game.finished;
        if (inRace && game.raceState === 'RUNNING') {
            // Mid-run: resolve as a forfeit through the normal outcome path so
            // the remaining player keeps a result (and the win) — no yank.
            game.showNotification('OPPONENT LEFT \u2014 FORFEIT');
            game.finishMultiplayerRace({ falseStart: false, localFinishTime: 999, forfeit: true });
            return;
        }
        if (inRace) {
            // Pre-start (staging/countdown): nothing to resolve — clean exit.
            game.showNotification('OPPONENT DISCONNECTED');
            setTimeout(() => { if (game.state === 'RACE' && !game.finished) game.returnToMenu(); }, 1600);
            return;
        }
        // Lobby / ready screen: surface it in the MP status line, then reset.
        this.status('OPPONENT DISCONNECTED', 'err');
        const token = ++this._lobbyResetToken;
        setTimeout(() => {
            if (this._lobbyResetToken !== token) return;
            if (game.state !== 'RACE') this.resetMenu();
        }, 2500);
    },

    _addRemoteCandidate(data) {
        if (!data || !this.pc) return;
        if (!this.pc.remoteDescription) {
            this._pendingCandidates = this._pendingCandidates || [];
            this._pendingCandidates.push(data);
            return;
        }
        try { this.pc.addIceCandidate(new RTCIceCandidate(data)); } catch (e) {}
    },

    _flushPendingCandidates() {
        if (!this._pendingCandidates) return;
        const list = this._pendingCandidates;
        this._pendingCandidates = null;
        list.forEach(data => { try { this.pc.addIceCandidate(new RTCIceCandidate(data)); } catch (e) {} });
    },

    _wireChannel(channel) {
        channel.onopen = () => this._onChannelOpen();
        channel.onmessage = e => {
            let msg;
            try { msg = JSON.parse(e.data); } catch (err) { return; }
            this._handleMessage(msg);
        };
    },

    _onChannelOpen() {
        if (!this.eventsChannel || this.eventsChannel.readyState !== 'open') return;
        if (!this.stateChannel || this.stateChannel.readyState !== 'open') return;
        if (this._connected) return;
        this._connected = true;

        // The direct P2P link is up — the Firebase "mailbox" is no longer
        // needed, so tidy it up after a short grace period.
        if (this.roomRef) {
            const ref = this.roomRef;
            const wasHost = this.isHost;
            setTimeout(() => { ref.off(); if (wasHost) ref.remove().catch(() => {}); }, 4000);
        }

        this._show('mp-host-panel', false);
        this._show('mp-join-panel', false);
        this._show('mp-ready-panel', true);
        this.status('CONNECTED! EXCHANGING CAR DATA...', 'ok');

        this.sendLoadout();
        this.calibrateClock();
    },

    setReady() {
        this.localReady = true;
        this.sendLoadout();
        this.sendEvent({ type: 'ready' });
        const btn = document.getElementById('mp-ready-btn');
        if (btn) { btn.classList.add('hidden'); btn.setAttribute('aria-hidden', 'true'); }
        this.status(this.remoteReady ? 'BOTH READY \u2014 STARTING...' : 'WAITING FOR OPPONENT TO READY UP...', 'ok');
        this._maybeLaunch();
    },

    _maybeLaunch() {
        if (this.localReady && this.remoteReady && !this._launched) {
            this._launched = true;
            game.startRaceMode('multiplayer');
        }
    },

    disconnect() {
        this._connected = false;
        this._launched = false;
        this.localReady = false;
        this.remoteReady = false;
        this.localRevved = false;
        this.remoteRevved = false;
        this.countdownStart = null;
        this._stagingFallbackAt = null;
        this._remoteOutcome = null;
        this._outcomeResolve = null;
        this._pendingCandidates = null;
        this._peerLostHandled = true; // we're tearing down on purpose
        if (this._discGraceTimer) { clearTimeout(this._discGraceTimer); this._discGraceTimer = null; }
        if (this.eventsChannel) { try { this.eventsChannel.close(); } catch (e) {} this.eventsChannel = null; }
        if (this.stateChannel) { try { this.stateChannel.close(); } catch (e) {} this.stateChannel = null; }
        if (this.pc) { try { this.pc.close(); } catch (e) {} this.pc = null; }
        if (this.roomRef) {
            try { this.roomRef.off(); if (this.isHost) this.roomRef.remove().catch(() => {}); } catch (e) {}
            this.roomRef = null;
        }
        this.roomCode = null;
        this.remoteLoadout = null;
        this._pongSamples = [];
    },

    leaveMultiplayer() {
        this.disconnect();
        game.returnToMenu();
    },

    async _reserveRoomCode() {
        const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no 0/O or 1/I — easy to read aloud
        // RTDB requests queue silently while offline — don't hang the UI on
        // that forever; race each read against a watchdog.
        const withWatchdog = (p, ms) => Promise.race([
            p,
            new Promise((_, rej) => setTimeout(() => rej(new Error('firebase timeout')), ms)),
        ]);
        for (let attempt = 0; attempt < 6; attempt++) {
            let code = '';
            for (let i = 0; i < 5; i++) code += alphabet[Math.floor(Math.random() * alphabet.length)];
            const snap = await withWatchdog(this.db.ref(this.roomPath + '/' + code).once('value'), 6000);
            if (!snap.exists()) return code;
        }
        return 'R' + Math.floor(1000 + Math.random() * 9000);
    },

    // ───────────────────────────────────────────── Messaging ─────────
    sendEvent(obj) {
        if (this.eventsChannel && this.eventsChannel.readyState === 'open') this.eventsChannel.send(JSON.stringify(obj));
    },
    sendState(obj) {
        if (this.stateChannel && this.stateChannel.readyState === 'open') this.stateChannel.send(JSON.stringify(obj));
    },

    sendLoadout() {
        const c = game.playerCar;
        if (!c) return;
        this.sendEvent({ type: 'loadout', car: {
            name: c.name, color: c.color, secondaryColor: c.secondaryColor, price: c.price,
            type: c.type, art: c.art, baseHp: c.baseHp, baseRedline: c.baseRedline,
            baseGearRatios: c.baseGearRatios, baseFinalDrive: c.baseFinalDrive,
            baseWeight: c.baseWeight, baseGrip: c.baseGrip, baseDragArea: c.baseDragArea,
            upgrades: c.upgrades, tune: c.tune,
            // IDs only — the peer re-hydrates them into drawable entries, so
            // their replica of YOUR car wears YOUR rims/livery/spoiler too.
            customization: (typeof serializeCustomization === 'function') ? serializeCustomization(c.customization) : null,
        }});
    },

    // Builds a REAL Car instance matching the opponent's actual stats, so
    // replaying their real inputs through it produces a faithful replica —
    // not a placeholder dot.
    buildOpponentCar() {
        const cd = this.remoteLoadout;
        const def = cd ? {
            name: cd.name, hp: cd.baseHp, weight: cd.baseWeight, grip: cd.baseGrip,
            redline: cd.baseRedline, price: cd.price || 0, color: cd.color,
            secondaryColor: cd.secondaryColor, type: cd.type, art: cd.art || cd.type,
            gearRatios: cd.baseGearRatios, finalDrive: cd.baseFinalDrive, dragArea: cd.baseDragArea,
            upgrades: cd.upgrades, tune: cd.tune,
        } : {
            name: 'Opponent', hp: 200, weight: 1200, grip: 1, redline: 7000, price: 0,
            color: '#2196f3', secondaryColor: '#0d47a1', type: 'sedan', art: 'sedan',
            gearRatios: [0, 3.2, 2.2, 1.6, 1.2, 1.0], finalDrive: 3.9, dragArea: 0.75,
        };
        const car = new Car(def);
        if (cd && cd.customization && typeof hydrateCustomization === 'function') {
            try { car.customization = hydrateCustomization(cd.customization); } catch (e) {}
        }
        return car;
    },

    sendShift(type) { this.sendEvent({ type }); },

    armForRace() {
        this.localRevved = false;
        this.remoteRevved = false;
        this.countdownStart = null;
        this._stagingFallbackAt = null;
        this._remoteOutcome = null;   // never leak the previous race's report
    },

    // Called every multiplayer physics tick from game.updateMultiplayerRace().
    tick() {
        if (!this._connected) return;
        const p = game.playerCar;
        if (!p) return;
        const now = performance.now();

        if (p.gas > 0.1) this.localRevved = true;

        const changed = p.gas !== this._lastGas || p.brake !== this._lastBrake || p.clutch !== this._lastClutch;
        if (changed || now - this._lastInputSend > 1000 / MP_INPUT_HZ) {
            this.sendState({ type: 'input', gas: p.gas, brake: p.brake, clutch: p.clutch });
            this._lastGas = p.gas; this._lastBrake = p.brake; this._lastClutch = p.clutch;
            this._lastInputSend = now;
        }

        if (now - this._lastSync > MP_SYNC_MS) {
            this.sendState({ type: 'sync', x: p.x, speed: p.speed, rpm: p.rpm, gear: p.gear });
            this._lastSync = now;
        }

        if (this.isHost && this.localRevved && !this.countdownStart && game.raceState === 'STAGING') {
            if (this.remoteRevved) {
                this.beginSynchronizedCountdown();
            } else if (!this._stagingFallbackAt) {
                // Arm silently: if the opponent never revs, don't stall forever.
                this._stagingFallbackAt = now + MP_STAGING_FALLBACK_MS;
            } else if (now >= this._stagingFallbackAt) {
                game.showNotification('STARTING WITHOUT OPPONENT');
                this.beginSynchronizedCountdown();
            }
        }
    },

    // Host-only: picks a near-future instant and broadcasts it so both
    // sides start the light sequence at (as close as possible to) the
    // same real-world moment.
    beginSynchronizedCountdown() {
        const startAt = performance.now() + MP_START_LEAD_MS;
        this.countdownStart = startAt;
        this.sendEvent({ type: 'countdown', hostStart: startAt });
    },

    // Guest-only: estimates (host clock − our clock) via a few ping/pong
    // round trips, so a host timestamp can be converted into our own
    // performance.now() timeline.
    calibrateClock() {
        if (this.isHost) return;
        this._pongSamples = [];
        let sent = 0;
        const step = () => {
            if (sent >= 5) {
                if (this._pongSamples.length) {
                    const best = this._pongSamples.reduce((a, b) => (a.rtt < b.rtt ? a : b));
                    this.clockOffset = best.offset;
                }
                return;
            }
            sent++;
            this.sendEvent({ type: 'ping', t0: performance.now() });
            setTimeout(step, 120);
        };
        step();
    },

    // Sends this side's race result and waits (briefly) for the peer's
    // matching report so both sides agree on the outcome before either
    // applies a reward. Falls back to locally-observed data on timeout
    // (e.g. the peer disconnected right at the line).
    reportOutcome(local, fallbackRemote, callback) {
        this.sendEvent({ type: 'raceOutcome', falseStart: !!local.falseStart, finishTime: local.finishTime ?? 999 });

        // The peer may have finished BEFORE us — their report arrives while
        // nobody is listening yet. It's stored, not dropped, so use it now.
        if (this._remoteOutcome) {
            const remote = this._remoteOutcome;
            this._remoteOutcome = null;
            callback(remote);
            return;
        }

        let done = false;
        this._outcomeResolve = (remote) => {
            if (done) return;
            done = true;
            this._outcomeResolve = null;
            callback(remote);
        };
        setTimeout(() => {
            if (done) return;
            done = true;
            this._outcomeResolve = null;
            callback(fallbackRemote);
        }, MP_OUTCOME_TIMEOUT_MS);
    },

    _handleMessage(msg) {
        switch (msg.type) {
            case 'loadout': {
                this.remoteLoadout = msg.car;
                // Update the ready-panel opponent card (visible whenever the
                // panel is open, regardless of whether the loadout or the
                // panel got here first).
                const card = document.getElementById('mp-opp-card');
                if (card && msg.car) {
                    card.classList.remove('hidden');
                    const chip = document.getElementById('mp-opp-chip');
                    const name = document.getElementById('mp-opp-name');
                    const stats = document.getElementById('mp-opp-stats');
                    if (chip) chip.style.background = msg.car.color || '#888';
                    if (name) name.textContent = String(msg.car.name || 'UNKNOWN CAR').toUpperCase();
                    if (stats && typeof msg.car.baseHp === 'number' && typeof msg.car.baseWeight === 'number') {
                        stats.textContent = Math.round(msg.car.baseHp) + ' HP \u00B7 ' + Math.round(msg.car.baseWeight) + ' KG';
                    }
                }
                const rp = document.getElementById('mp-ready-panel');
                if (rp && !rp.classList.contains('hidden')) {
                    this.status('OPPONENT IS DRIVING A ' + String(msg.car.name || 'CAR').toUpperCase(), 'ok');
                }
                break;
            }
            case 'ready':
                this.remoteReady = true;
                this.status(this.localReady ? 'BOTH READY \u2014 STARTING...' : 'OPPONENT IS READY \u2014 PRESS READY UP', 'ok');
                this._maybeLaunch();
                break;
            case 'input':
                this.remoteRevved = this.remoteRevved || msg.gas > 0.1;
                if (game.opponentCar) {
                    game.opponentCar.gas = msg.gas;
                    game.opponentCar.brake = msg.brake;
                    game.opponentCar.clutch = msg.clutch;
                }
                break;
            case 'sync':
                this._applySync(msg);
                break;
            case 'shiftUp':
                if (game.opponentCar) game.opponentCar.shiftUp();
                break;
            case 'shiftDown':
                if (game.opponentCar) game.opponentCar.shiftDown();
                break;
            case 'countdown': {
                // Convert the host's timestamp into OUR performance.now()
                // timeline. Never let it land in the past — a start already
                // due just begins on the next frame instead of skipping lights.
                const localStart = Math.max(msg.hostStart - this.clockOffset, performance.now() + 50);
                this.countdownStart = localStart;
                break;
            }
            case 'ping':
                this.sendEvent({ type: 'pong', t0: msg.t0, t1: performance.now() });
                break;
            case 'pong': {
                const now = performance.now();
                this._pongSamples.push({ rtt: now - msg.t0, offset: msg.t1 - (msg.t0 + now) / 2 });
                break;
            }
            case 'raceOutcome': {
                const report = {
                    falseStart: !!msg.falseStart,
                    finishTime: (typeof msg.finishTime === 'number' && isFinite(msg.finishTime)) ? msg.finishTime : 999,
                };
                if (this._outcomeResolve) {
                    const resolve = this._outcomeResolve;
                    this._outcomeResolve = null;
                    resolve(report);
                } else {
                    // We haven't finished yet — keep it for reportOutcome().
                    this._remoteOutcome = report;
                }
                break;
            }
        }
    },

    // Gently corrects drift on the replicated opponent car. Large jumps
    // snap instantly (e.g. after a dropped run of packets); small ones
    // ease in so nothing visibly pops.
    _applySync(msg) {
        const o = game.opponentCar;
        if (!o) return;
        const dx = msg.x - o.x;
        if (Math.abs(dx) > 3) o.x = msg.x; else o.x += dx * 0.3;
        o.speed += (msg.speed - o.speed) * 0.3;
        o.rpm += (msg.rpm - o.rpm) * 0.3;
        if (msg.gear !== undefined && msg.gear !== o.gear) o.gear = msg.gear;
    },
};

window.MP = MP;
