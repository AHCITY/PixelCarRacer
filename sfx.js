'use strict';

/* ─── Pixel Drag Legends — Procedural SFX (Web Audio, zero assets) ──────
 *
 * Everything is synthesized in the browser: no audio files, nothing to
 * download, nothing copyrighted. Two layers:
 *
 *  1. ENGINE — a persistent oscillator bank (0.5x / 1x / 2x of the firing
 *     frequency rpm x cyl / 120) plus filtered intake noise, a soft waveshaper
 *     and a lowpass whose cutoff tracks throttle + revs. Driven every frame
 *     from the player's real car state with setTargetAtTime (no zipper noise).
 *     Turbocharged cars add a whistle layer (sine + bandpassed noise) that
 *     spools with revs under load and a blow-off "psshh" one-shot on shifts.
 *  2. ONE-SHOTS — short synthesized cues: shift quality blips, the christmas
 *     tree beeps, finish fanfares, cash, UI clicks, stall, backfire, screech.
 *
 * Style reference: Pixel Car Racer pairs realistic engine recordings with
 * chiptune-ish UI micro-blips — we approximate the vibe with a buzzy
 * sawtooth engine + 8-bit square-wave cues, all originally synthesized.
 * Mobile: the AudioContext is created/resumed inside the first user gesture
 * (autoplay policy), one fixed node pool, one-shots are 1-3 nodes each.
 * ─────────────────────────────────────────────────────────────────────── */

const SFX = {
    ctx: null,
    master: null,
    _eng: null,
    _ready: false,
    _lastBrake: 0,
    MUTE_KEY: 'pdl_sfx_muted',
    VOL_KEY: 'pdl_sfx_vol',         // master (sound) volume 0..1, persisted
    MUSIC_VOL_KEY: 'pdl_music_vol', // music bus volume 0..1, persisted
    VOLUME: 0.55,

    init() {
        if (this._ready) return;
        const AC = window.AudioContext || window.webkitAudioContext;
        if (!AC) return;
        try {
            this.ctx = new AC();
            // Gentle limiter so stacked cues can never clip or distort.
            const comp = this.ctx.createDynamicsCompressor();
            comp.threshold.value = -18;
            comp.knee.value = 24;
            comp.ratio.value = 8;
            comp.attack.value = 0.004;
            comp.release.value = 0.22;
            this.master = this.ctx.createGain();
            this.master.gain.value = this.muted() ? 0 : this.sfxVolume();
            this.master.connect(comp);
            comp.connect(this.ctx.destination);
            this._buildEngine();
            this._buildMusic();
            this._ready = true;
        } catch (e) {
            console.warn('SFX init failed:', e);
            this.ctx = null;
        }
    },

    // Browsers (especially iOS) only allow audio after a real user gesture —
    // call init+resume from every gesture until the context reports running.
    unlock() {
        this.init();
        if (this.ctx && this.ctx.state !== 'running') {
            this.ctx.resume().catch(() => {});
        }
        this.updateMusic(this._racing === true);
    },

    muted() {
        try { return localStorage.getItem(this.MUTE_KEY) === '1'; } catch (e) { return false; }
    },

    setMuted(m) {
        try { localStorage.setItem(this.MUTE_KEY, m ? '1' : '0'); } catch (e) {}
        if (this.master && this.ctx) {
            this.master.gain.setTargetAtTime(m ? 0 : this.sfxVolume(), this.ctx.currentTime, 0.03);
        }
    },

    toggleMute() {
        this.setMuted(!this.muted());
        return this.muted();
    },

    /* ── Volume sliders (pause menu) ───────────────────────────────────
       Two levels: SOUND scales the master bus (everything), MUSIC is a
       sub-balance on the music bus. Both persist to localStorage.
       Dragging a slider above 0 while its mute flag is set un-mutes it —
       explicit user intent on the volume control itself. */
    sfxVolume() {
        try {
            const v = parseFloat(localStorage.getItem(this.VOL_KEY));
            if (Number.isFinite(v)) return Math.min(1, Math.max(0, v));
        } catch (e) {}
        return this.VOLUME;
    },

    setSfxVolume(v) {
        v = Math.min(1, Math.max(0, Number(v) || 0));
        try { localStorage.setItem(this.VOL_KEY, String(v)); } catch (e) {}
        if (v > 0 && this.muted()) this.setMuted(false);
        if (this.master && this.ctx) {
            this.master.gain.setTargetAtTime(this.muted() ? 0 : v, this.ctx.currentTime, 0.03);
        }
    },

    musicVolume() {
        try {
            const v = parseFloat(localStorage.getItem(this.MUSIC_VOL_KEY));
            if (Number.isFinite(v)) return Math.min(1, Math.max(0, v));
        } catch (e) {}
        return this.MUSIC_VOL;
    },

    setMusicVolume(v) {
        v = Math.min(1, Math.max(0, Number(v) || 0));
        try { localStorage.setItem(this.MUSIC_VOL_KEY, String(v)); } catch (e) {}
        if (v > 0 && this.musicMuted()) this.setMusicMuted(false);
        if (this._music && this.ctx) {
            this._music.gain.gain.setTargetAtTime(this.musicMuted() ? 0 : v, this.ctx.currentTime, 0.05);
        }
    },

    /* ── Engine: persistent node pool, driven per frame ─────────────── */
    _buildEngine() {
        const ctx = this.ctx;
        const out = ctx.createGain();
        out.gain.value = 0;

        // Soft saturation — adds "engine" grit without harsh digital clipping.
        const shaper = ctx.createWaveShaper();
        const N = 256, curve = new Float32Array(N);
        for (let i = 0; i < N; i++) {
            const x = (i / (N - 1)) * 2 - 1;
            curve[i] = Math.tanh(1.6 * x);
        }
        shaper.curve = curve;

        const lp = ctx.createBiquadFilter();
        lp.type = 'lowpass';
        lp.frequency.value = 400;
        lp.Q.value = 0.8;

        const harm = ctx.createGain();
        harm.gain.value = 0.1;

        // Harmonic bank: sub firing pulse, fundamental, 2nd harmonic.
        const oscs = [];
        [[0.5, 0.34], [1, 0.5], [2, 0.22]].forEach(([mult, g]) => {
            const o = ctx.createOscillator();
            o.type = 'sawtooth';
            o.frequency.value = 40 * mult;
            o.detune.value = mult === 1 ? 3 : -4;
            const og = ctx.createGain();
            og.gain.value = g;
            o.connect(og);
            og.connect(harm);
            o.start();
            oscs.push({ o, mult });
        });

        // Intake/exhaust rush: looping white noise through a bandpass that
        // tracks the firing frequency, gain tracks throttle.
        const nbuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
        const nd = nbuf.getChannelData(0);
        for (let i = 0; i < nd.length; i++) nd[i] = Math.random() * 2 - 1;
        const noise = ctx.createBufferSource();
        noise.buffer = nbuf;
        noise.loop = true;
        const nbp = ctx.createBiquadFilter();
        nbp.type = 'bandpass';
        nbp.frequency.value = 300;
        nbp.Q.value = 1.1;
        const ng = ctx.createGain();
        ng.gain.value = 0;
        noise.connect(nbp);
        nbp.connect(ng);
        ng.connect(harm);
        noise.start();

        harm.connect(shaper);
        shaper.connect(lp);
        lp.connect(out);
        out.connect(this.master);

        // Idle lope: slow wobble on the output gain, only audible near idle.
        const lfo = ctx.createOscillator();
        lfo.type = 'sine';
        lfo.frequency.value = 3.1;
        const lfoGain = ctx.createGain();
        lfoGain.gain.value = 0;
        lfo.connect(lfoGain);
        lfoGain.connect(out.gain);
        lfo.start();

        // Turbo whistle: a pure sine plus a thin band of noise, both gated by
        // a boost gain that the frame driver spools/bleeds. Silent until a
        // turbo'd car actually builds boost — zero cost otherwise.
        const tGain = ctx.createGain();
        tGain.gain.value = 0;
        const tOsc = ctx.createOscillator();
        tOsc.type = 'sine';
        tOsc.frequency.value = 900;
        const tOscG = ctx.createGain();
        tOscG.gain.value = 0.5;
        tOsc.connect(tOscG);
        tOscG.connect(tGain);
        const tNoise = ctx.createBufferSource();
        tNoise.buffer = nbuf;
        tNoise.loop = true;
        const tBp = ctx.createBiquadFilter();
        tBp.type = 'bandpass';
        tBp.frequency.value = 2600;
        tBp.Q.value = 2.2;
        const tNoiseG = ctx.createGain();
        tNoiseG.gain.value = 0.16;
        tNoise.connect(tBp);
        tBp.connect(tNoiseG);
        tNoiseG.connect(tGain);
        tGain.connect(this.master);
        tOsc.start();
        tNoise.start();

        // Nitrous hiss: a constant-flow bottle is basically a loud, bright
        // leak — looping white noise through a wide high-passed band, gated
        // by a spray gain the frame driver opens/closes. Silent with no kit.
        const nHp = ctx.createBiquadFilter();
        nHp.type = 'highpass';
        nHp.frequency.value = 900;
        const nBp = ctx.createBiquadFilter();
        nBp.type = 'bandpass';
        nBp.frequency.value = 3200;
        nBp.Q.value = 0.9;
        const nGain = ctx.createGain();
        nGain.gain.value = 0;
        const nSrc = ctx.createBufferSource();
        nSrc.buffer = nbuf;
        nSrc.loop = true;
        nSrc.connect(nHp);
        nHp.connect(nBp);
        nBp.connect(nGain);
        nGain.connect(this.master);
        nSrc.start();

        this._eng = { oscs, harm, ng, nbp, lp, out, lfoGain, tGain, tOsc, tBp, nGain, nBp };
        this._boost = 0;
        this._nosWas = false;
    },

    // Called every frame from game.loop with the player's car.
    updateEngine(car, active) {
        if (!this._ready || !this._eng || !car) return;
        const t = this.ctx.currentTime;
        const e = this._eng;
        const red = car.redline || 7000;
        const rn = Math.max(0, Math.min(1.02, car.rpm / red));
        const thr = car.gas > 0.05 ? 1 : 0;
        const f = Math.max(24, (car.rpm * (car.cyl || 4)) / 120); // firing frequency
        for (const { o, mult } of e.oscs) {
            o.frequency.setTargetAtTime(Math.min(f * mult, 5200), t, 0.03);
        }
        e.nbp.frequency.setTargetAtTime(Math.min(Math.max(f * 1.7, 200), 5200), t, 0.05);
        e.harm.gain.setTargetAtTime(0.10 + 0.24 * thr + 0.10 * rn, t, 0.06);
        e.ng.gain.setTargetAtTime(0.05 * thr + 0.04 * rn, t, 0.08);
        e.lp.frequency.setTargetAtTime(280 + 2100 * thr + 1700 * rn, t, 0.06);
        const vol = active ? (0.14 + 0.16 * thr + 0.08 * rn) : 0;
        e.out.gain.setTargetAtTime(vol, t, 0.09);
        const lope = (active && rn < 0.18) ? 0.05 * (1 - rn / 0.18) : 0;
        e.lfoGain.gain.setTargetAtTime(lope, t, 0.1);
        this._updateTurbo(car, active, t);
        this._updateNos(car, active, t);
    },

    // Nitrous spray layer: hiss level/brightness follow the ACTUAL spray
    // state (car.nosSpraying already applies the guards), so the sound stops
    // the moment the bottle empties or the driver dumps the throttle.
    _updateNos(car, active, t) {
        const e = this._eng;
        if (!e.nGain) return;
        const has = (car.nos || 0) > 0;
        const spraying = has && active && !!car.nosSpraying;
        if (spraying && !this._nosWas) {
            // Solenoid crack as the bottle opens.
            this._noise(0.09, 0.07, 'highpass', 2400, 3200, 0.7);
        }
        this._nosWas = spraying;
        if (!has) {
            e.nGain.gain.setTargetAtTime(0, t, 0.08);
            return;
        }
        const red = car.redline || 7000;
        const rn = Math.max(0, Math.min(1, car.rpm / red));
        e.nBp.frequency.setTargetAtTime(2600 + 1800 * rn, t, 0.06);
        e.nGain.gain.setTargetAtTime(spraying ? (0.10 + 0.05 * rn) : 0, t, spraying ? 0.03 : 0.10);
    },

    // Turbo spool model (audio-only): shaft speed follows throttle + revs
    // with inertia — spooling is slower than bleeding, exactly like a real
    // journal-bearing turbo. Bigger turbos (more stages) spool later and
    // whistle brighter. _boost is also what arms the blow-off one-shot.
    _updateTurbo(car, active, t) {
        const e = this._eng;
        if (!e.tGain) return;
        const stages = Math.max(0, Math.min(3, car.turbo || 0));
        if (!stages || !active) {
            this._boost = 0;
            e.tGain.gain.setTargetAtTime(0, t, 0.12);
            return;
        }
        const red = car.redline || 7000;
        const spoolRpm = red * (0.34 - 0.03 * stages);   // bigger turbo = more lag
        const demand = (car.gas > 0.05 && car.clutch < 0.5 && !car.engineStalled)
            ? Math.max(0, Math.min(1, (car.rpm - spoolRpm) / (red - spoolRpm)))
            : 0;
        const rising = demand > this._boost;
        this._boost = Math.max(0, Math.min(1, this._boost + (demand - this._boost) * (rising ? 0.055 : 0.16)));
        const b = this._boost;
        // Whistle pitch rides boost + revs; volume rides boost^1.6 (quiet spool).
        const whistle = Math.min(4200, 700 + 2100 * b * (0.55 + 0.45 * (car.rpm / red)) * (0.9 + 0.06 * stages));
        e.tOsc.frequency.setTargetAtTime(whistle, t, 0.05);
        e.tBp.frequency.setTargetAtTime(Math.min(5200, whistle * 2.6), t, 0.06);
        e.tGain.gain.setTargetAtTime(0.055 * Math.pow(b, 1.6) * (0.75 + 0.12 * stages), t, 0.07);
    },

    // Blow-off valve: a short band-swept "psshh" with a subtle flutter —
    // plays on shifts when the turbo was actually spooled. Also bleeds the
    // boost model (throttle slams shut during the gear change).
    blowOff() {
        if (!this._ready) return;
        const b = this._boost || 0;
        if (b < 0.22) return;
        this._boost = 0.08;
        const ctx = this.ctx;
        const t = ctx.currentTime;
        const dur = 0.22 + 0.16 * b;
        const len = Math.max(1, Math.floor(ctx.sampleRate * dur));
        const buf = ctx.createBuffer(1, len, ctx.sampleRate);
        const d = buf.getChannelData(0);
        for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
        const src = ctx.createBufferSource();
        src.buffer = buf;
        const bp = ctx.createBiquadFilter();
        bp.type = 'bandpass';
        bp.frequency.setValueAtTime(2100 + 1400 * b, t);
        bp.frequency.exponentialRampToValueAtTime(900, t + dur);
        bp.Q.value = 1.4;
        const g = ctx.createGain();
        g.gain.setValueAtTime(0.0001, t);
        g.gain.exponentialRampToValueAtTime(0.10 + 0.10 * b, t + 0.012);
        g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
        // Flutter: cheap tremolo on the release tail.
        const lfo = ctx.createOscillator();
        lfo.type = 'sine';
        lfo.frequency.value = 26;
        const lg = ctx.createGain();
        lg.gain.value = 0.035 * b;
        lfo.connect(lg);
        lg.connect(g.gain);
        lfo.start(t);
        lfo.stop(t + dur + 0.05);
        src.connect(bp);
        bp.connect(g);
        g.connect(this.master);
        src.start(t);
        src.stop(t + dur + 0.03);
    },

    /* ── One-shot helpers ───────────────────────────────────────────── */
    _blip(type, f0, f1, dur, vol, when) {
        if (!this._ready) return;
        const ctx = this.ctx;
        const t = ctx.currentTime + (when || 0);
        const o = ctx.createOscillator();
        o.type = type;
        o.frequency.setValueAtTime(Math.max(20, f0), t);
        if (f1 && f1 !== f0) o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
        const g = ctx.createGain();
        g.gain.setValueAtTime(0.0001, t);
        g.gain.exponentialRampToValueAtTime(vol, t + 0.006);
        g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
        o.connect(g);
        g.connect(this.master);
        o.start(t);
        o.stop(t + dur + 0.03);
    },

    _noise(dur, vol, type, f0, f1, q, when) {
        if (!this._ready) return;
        const ctx = this.ctx;
        const t = ctx.currentTime + (when || 0);
        const len = Math.max(1, Math.floor(ctx.sampleRate * dur));
        const buf = ctx.createBuffer(1, len, ctx.sampleRate);
        const d = buf.getChannelData(0);
        for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
        const src = ctx.createBufferSource();
        src.buffer = buf;
        const f = ctx.createBiquadFilter();
        f.type = type;
        f.frequency.setValueAtTime(f0, t);
        if (f1 && f1 !== f0) f.frequency.exponentialRampToValueAtTime(f1, t + dur);
        f.Q.value = q || 1;
        const g = ctx.createGain();
        g.gain.setValueAtTime(0.0001, t);
        g.gain.exponentialRampToValueAtTime(vol, t + Math.min(0.02, dur * 0.2));
        g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
        src.connect(f);
        f.connect(g);
        g.connect(this.master);
        src.start(t);
        src.stop(t + dur + 0.03);
    },

    /* ── Game cues ──────────────────────────────────────────────────── */
    ui() {
        if (!this._ready) return;
        const j = 0.96 + Math.random() * 0.08;
        this._blip('square', 1450 * j, 1150 * j, 0.05, 0.08);
    },

    // Christmas tree amber (lights 1-3) — NHRA-style 440 Hz blip.
    beep() {
        if (!this._ready) return;
        this._blip('square', 440, 440, 0.12, 0.22);
    },

    // Green light / GO — 880 Hz, longer, with a soft air swell.
    go() {
        if (!this._ready) return;
        this._blip('square', 880, 880, 0.26, 0.24);
        this._noise(0.4, 0.06, 'bandpass', 900, 2400, 0.8);
    },

    // Gear shift, quality = 'perfect' | 'good' | 'late' | 'early'.
    shift(quality) {
        if (!this._ready) return;
        // Mechanical basis every shift gets: short filtered noise + blip.
        this._noise(0.12, 0.14, 'lowpass', 2000, 700, 0.7);
        this._blip('square', 180, 90, 0.06, 0.10);
        if (quality === 'perfect') {
            // Bright little arpeggio — the reward cue.
            const notes = [1047, 1319, 1568];
            notes.forEach((f, i) => this._blip('square', f, f, i === 2 ? 0.15 : 0.035, 0.12, 0.02 + i * 0.035));
            this._blip('sine', 2093, 2093, 0.12, 0.05, 0.1);
        } else if (quality === 'early') {
            // Bog: dull drop.
            this._blip('sine', 95, 58, 0.14, 0.16, 0.02);
            this._noise(0.1, 0.08, 'lowpass', 500, 220, 0.8, 0.02);
        } else if (quality === 'late') {
            // Buzz: revved out.
            this._blip('square', 112, 96, 0.2, 0.12, 0.02);
        }
        // 'good' needs nothing extra.
    },

    // Tire chirp / screech while braking hard from speed (throttled).
    brake(speed) {
        if (!this._ready) return;
        const now = performance.now();
        if (now - this._lastBrake < 320) return;
        this._lastBrake = now;
        const v = Math.min(0.12, 0.04 + speed / 600);
        this._noise(0.28, v, 'bandpass', 1050, 880, 7);
    },

    // Launch chirp at the green light.
    launch() {
        if (!this._ready) return;
        this._blip('square', 780, 300, 0.09, 0.1);
        this._noise(0.2, 0.1, 'bandpass', 1000, 700, 6);
    },

    // Rev-limiter backfire pop.
    pop() {
        if (!this._ready) return;
        this._noise(0.07, 0.16, 'lowpass', 750, 250, 0.7);
        this._blip('sine', 72, 55, 0.06, 0.14);
    },

    stall() {
        if (!this._ready) return;
        this._blip('sawtooth', 130, 50, 0.45, 0.16);
        this._blip('sine', 80, 40, 0.3, 0.12, 0.1);
    },

    // Results fanfares.
    finish(won) {
        if (!this._ready) return;
        if (won) {
            const notes = [523, 659, 784, 1047];
            notes.forEach((f, i) => this._blip('square', f, f, i === 3 ? 0.32 : 0.09, 0.14, i * 0.09));
        } else {
            this._blip('square', 392, 392, 0.16, 0.12);
            this._blip('square', 262, 220, 0.3, 0.12, 0.17);
        }
    },

    cash() {
        if (!this._ready) return;
        this._blip('square', 988, 1319, 0.14, 0.12);
        this._blip('square', 1319, 1760, 0.12, 0.09, 0.1);
    },

    notify() {
        if (!this._ready) return;
        this._blip('sine', 880, 880, 0.09, 0.09);
        this._blip('sine', 1175, 1175, 0.11, 0.09, 0.1);
    },

    /* ── Music: procedural chiptune loops (zero assets, original tunes) ──
       Two short loops rendered ONCE into AudioBuffers with an
       OfflineAudioContext: MENU (chill 96 BPM) and RACE (driving 132 BPM).
       One looping source at a time feeds a dedicated music bus; switching
       themes crossfades. Each race background plays the race loop at its own
       semitone transposition (playbackRate) — five stages, five moods, zero
       extra memory. Rendering is async and never blocks the UI.
       Toggles + two volume sliders live in the pause menu and the main-menu
       SETTINGS panel (SOUND/MUSIC rows and the MUSIC VOL / SOUND VOL
       sliders); the music bus itself rides the master bus, so SOUND VOL
       scales everything. */
    MUSIC_KEY: 'pdl_sfx_music_muted',
    MUSIC_VOL: 0.4,   // on the 5%-slider grid so the pause fader never lies
    // Semitone transposition of the race loop per background. 0 = A minor as
    // composed; the others sit ±1/±2 semitones around it so consecutive
    // races feel fresh without any shrill stretch (speed rides along, which
    // reads as intentional in chiptune).
    RACE_BG_SEMI: {
        night_city: 0,
        sunset_highway: -1,
        industrial: 1,
        mountain_dusk: 2,
        neon_tokyo: -2,
    },
    // Per-CAR variant: a deterministic semitone offset hashed from the
    // player's car name, so your Civic and your Supra don't race to the
    // same rendition of the tune (weighted toward 0 to stay tasteful).
    // Combined with the stage offset and clamped to ±3 semitones total.
    CAR_SEMI_CHOICES: [0, 0, -1, 1, -2, 2],
    _carSemi(name) {
        const s = String(name || '');
        if (!s) return 0;
        let h = 0;
        for (let i = 0; i < s.length; i++) h = ((h * 31) + s.charCodeAt(i)) | 0;
        return this.CAR_SEMI_CHOICES[Math.abs(h) % this.CAR_SEMI_CHOICES.length];
    },
    _music: null,
    _racing: false,
    _bg: null,

    musicMuted() {
        try { return localStorage.getItem(this.MUSIC_KEY) === '1'; } catch (e) { return false; }
    },

    setMusicMuted(m) {
        try { localStorage.setItem(this.MUSIC_KEY, m ? '1' : '0'); } catch (e) {}
        if (this._music && this.ctx) {
            this._music.gain.gain.setTargetAtTime(m ? 0 : this.musicVolume(), this.ctx.currentTime, 0.05);
        }
    },

    toggleMusicMuted() {
        this.setMusicMuted(!this.musicMuted());
        return this.musicMuted();
    },

    // Called from game.loop every frame (cheap no-op when unchanged).
    // `bg` (optional) is the current background id and `carName` (optional)
    // the player's car name — the race loop is transposed per stage AND
    // per car (see RACE_BG_SEMI / _carSemi), clamped to ±3 semitones so
    // the combination never goes shrill.
    updateMusic(racing, bg, carName) {
        const wantBg = racing ? (bg || null) : null;
        if (wantBg !== this._bg || carName !== this._bgCar) {
            this._bg = wantBg;
            this._bgCar = carName || '';
            if (this._music) {
                const st = racing && bg
                    ? Math.max(-3, Math.min(3, (this.RACE_BG_SEMI[bg] || 0) + this._carSemi(carName)))
                    : 0;
                this._music.rate = Math.pow(2, st / 12);
            }
        }
        this._racing = racing;
        this.setTheme(racing ? 'race' : 'menu');
    },

    // Music intensity (0..1): a low-pass on the music bus opens as revs
    // climb — the tune sounds like it's PULLING with the engine. Menus (0)
    // stay fully open. setTargetAtTime keeps it click-free; safe when the
    // audio context is suspended or the bus isn't built yet.
    MUSIC_FILTER_HZ_MIN: 950,
    MUSIC_FILTER_HZ_MAX: 8200,
    updateMusicIntensity(level) {
        const m = this._music;
        if (!m || !m.filter || !this.ctx) return;
        const v = Math.min(1, Math.max(0, Number(level) || 0));
        if (m._lastIntensity !== undefined && Math.abs(v - m._lastIntensity) < 0.02) return;
        m._lastIntensity = v;
        const hz = this.MUSIC_FILTER_HZ_MIN + (this.MUSIC_FILTER_HZ_MAX - this.MUSIC_FILTER_HZ_MIN) * v * v;
        try { m.filter.frequency.setTargetAtTime(hz, this.ctx.currentTime, 0.09); } catch (e) {}
    },

    _buildMusic() {
        const m = { gain: null, filter: null, src: null, srcGain: null, theme: null, rate: 1, rendering: false, buffers: {} };
        m.gain = this.ctx.createGain();
        m.gain.gain.value = this.musicMuted() ? 0 : this.musicVolume();
        m.gain.connect(this.master);
        // Intensity low-pass sits between the theme sources and the bus:
        // srcGain → filter → gain. Wide open until updateMusicIntensity
        // narrows it at idle revs during a race.
        m.filter = this.ctx.createBiquadFilter();
        m.filter.type = 'lowpass';
        m.filter.frequency.value = this.MUSIC_FILTER_HZ_MAX;
        m.filter.Q.value = 0.4;
        m.filter.connect(m.gain);
        this._music = m;
        if (!window.OfflineAudioContext) return;   // very old engines: SFX only
        m.rendering = true;
        Promise.all([this._renderLoop(false), this._renderLoop(true)])
            .then(([menu, race]) => {
                m.buffers.menu = menu;
                m.buffers.race = race;
                m.rendering = false;
                this.setTheme(this._racing ? 'race' : 'menu');
            })
            .catch(() => { m.rendering = false; });
    },

    setTheme(theme) {
        const m = this._music;
        if (!m || !this.ctx || this.ctx.state !== 'running' || m.rendering) return;
        const rate = (theme === 'race') ? (m.rate || 1) : 1;
        const key = theme + '@' + rate.toFixed(4);
        if (m.theme === key) return;
        const buf = theme ? m.buffers[theme] : null;
        if (!buf) return;                          // still rendering
        const t = this.ctx.currentTime;
        if (m.src) {
            try { m.srcGain.gain.setTargetAtTime(0, t, 0.15); } catch (e) {}
            try { m.src.stop(t + 0.6); } catch (e) {}
        }
        const src = this.ctx.createBufferSource();
        src.buffer = buf;
        src.loop = true;
        src.playbackRate.value = rate;
        const g = this.ctx.createGain();
        g.gain.setValueAtTime(0.0001, t);
        g.gain.setTargetAtTime(1, t, 0.22);
        src.connect(g);
        g.connect(m.filter);      // through the intensity low-pass, then the bus
        src.start(t + 0.05);
        m.src = src;
        m.srcGain = g;
        m.theme = key;
    },

    // Renders one original 4-bar chiptune loop offline. Am–F–C–G
    // progression: triangle bass, square lead, noise hats/snare.
    _renderLoop(race) {
        const bpm = race ? 132 : 96;
        const bars = 4;
        const spb = 60 / bpm;                     // seconds per beat
        const dur = bars * 4 * spb;
        const sr = 22050;                          // chip-friendly, halves memory
        const oc = new OfflineAudioContext(2, Math.ceil(sr * (dur + 0.05)), sr);
        const out = oc.createGain();
        out.gain.value = 0.9;
        out.connect(oc.destination);

        const freq = n => 440 * Math.pow(2, (n - 69) / 12);
        const tone = (type, f, t0, len, vol) => {
            const o = oc.createOscillator();
            o.type = type;
            o.frequency.setValueAtTime(f, t0);
            const g = oc.createGain();
            g.gain.setValueAtTime(0.0001, t0);
            g.gain.linearRampToValueAtTime(vol, t0 + 0.008);
            g.gain.exponentialRampToValueAtTime(0.0001, t0 + len);
            o.connect(g);
            g.connect(out);
            o.start(t0);
            o.stop(t0 + len + 0.02);
        };
        const tick = (t0, len, vol, f) => {
            const n = Math.max(1, Math.floor(sr * len));
            const buf = oc.createBuffer(1, n, sr);
            const d = buf.getChannelData(0);
            for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
            const s = oc.createBufferSource();
            s.buffer = buf;
            const bp = oc.createBiquadFilter();
            bp.type = 'bandpass';
            bp.frequency.value = f;
            bp.Q.value = 0.9;
            const g = oc.createGain();
            g.gain.setValueAtTime(vol, t0);
            g.gain.exponentialRampToValueAtTime(0.0001, t0 + len);
            s.connect(bp);
            bp.connect(g);
            g.connect(out);
            s.start(t0);
        };

        // A2 F2 C3 G2 — an original progression in A natural minor.
        const roots = [45, 41, 48, 43];
        for (let b = 0; b < bars; b++) {
            const t0 = b * 4 * spb;
            const root = roots[b];
            // Bass
            if (race) {
                for (let e = 0; e < 8; e++) {
                    const n = (e % 4 === 3) ? root + 12 : root;
                    tone('triangle', freq(n), t0 + e * spb / 2, spb * 0.42, 0.20);
                }
            } else {
                for (let beat = 0; beat < 4; beat++) {
                    const n = (beat === 2) ? root + 7 : root;
                    tone('triangle', freq(n), t0 + beat * spb, spb * 0.7, 0.17);
                }
            }
            // Lead (A-minor pentatonic line, consonant over all four chords)
            const mel = race
                ? [[0, 69], [0.25, 72], [0.5, 76], [0.75, 72], [1, 69], [1.25, 72], [1.5, 76], [1.75, 81],
                   [2, 79], [2.25, 76], [2.5, 72], [2.75, 76], [3, 74], [3.25, 72], [3.5, 71], [3.75, 69]]
                : [[0, 76], [0.75, 72], [1.5, 69], [2.25, 72]];
            for (const [beat, n] of mel) {
                tone('square', freq(n), t0 + beat * spb, race ? spb * 0.20 : spb * 0.55, race ? 0.075 : 0.085);
            }
            // Drums
            if (race) {
                for (let e = 0; e < 8; e++) tick(t0 + e * spb / 2, 0.04, e % 2 ? 0.05 : 0.09, 7000);
                tick(t0 + spb, 0.14, 0.16, 1900);
                tick(t0 + 3 * spb, 0.14, 0.16, 1900);
            } else {
                tick(t0 + spb, 0.05, 0.045, 8000);
                tick(t0 + 3 * spb, 0.05, 0.045, 8000);
            }
        }
        return oc.startRendering();
    },
};

// Audio unlock: any first gesture boots + resumes the context.
['pointerdown', 'touchstart', 'keydown'].forEach(ev => {
    document.addEventListener(ev, () => SFX.unlock(), { capture: true, passive: true });
});
document.addEventListener('visibilitychange', () => {
    if (!document.hidden && SFX.ctx && SFX.ctx.state !== 'running') SFX.ctx.resume().catch(() => {});
});

// UI click layer — one delegated listener covers every menu button past and
// future (race pedal buttons are deliberately excluded: they're gameplay).
document.addEventListener('click', e => {
    if (!e.target || !e.target.closest) return;
    if (e.target.closest('.menu-btn, .mp-copy-btn, .gar-arrow, .mp-mode-opt, .mp-turn-row, ' +
        '.pf-chip, .pf-link-btn, .fr-btn, .mp-quick-forget, .fs-btn, .pf-copy-icon, .pf-avatar')) {
        SFX.ui();
    }
}, true);

window.SFX = SFX;
