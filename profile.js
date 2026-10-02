'use strict';

/*
 * ─── Pixel Drag Legends — Driver Profile ───────────────────────────────
 *
 * A small, scalable player-identity layer that sits on top of the save
 * system. It answers "WHO is racing?" — separate from "WHAT do they own?"
 * (cash, cars and saves stay on the device and NEVER touch the cloud).
 *
 * Design rules (researched for this scale):
 *  1. LOCAL-FIRST — the device copy is the single source of truth at
 *     runtime. The Firebase mirror is a background debounce that must
 *     never block gameplay or menus; offline / blocked / denied all
 *     degrade to "LOCAL ONLY" with zero functional loss.
 *  2. TINY PAYLOADS — a profile is a few hundred bytes. Avatars are
 *     re-encoded through a canvas to a ≤256px square WebP/JPEG (usually
 *     5–15KB), which ALSO strips EXIF/GPS metadata (privacy).
 *  3. PEER SHARING OVER P2P — profiles travel to your opponent over the
 *     DTLS-encrypted WebRTC channel (see multiplayer.js 'profile' event).
 *  4. NO PII — display name + avatar only. No emails, no contacts, no
 *     location. The display name is charset-sanitized and length-capped.
 *  5. PROVIDER-READY — identity currently comes from the device
 *     ("local"). ProfileAuth below is the single seam where Google /
 *     Google Play Games / email sign-in plugs in later: those providers
 *     only need to resolve { ok, uid, provider } and the rest of the
 *     system already speaks "profile id". No fake auth ships here.
 * ─────────────────────────────────────────────────────────────────────── */

const PROFILE_STORAGE_KEY = 'profile_v1';
const PROFILE_NAME_MAX = 14;
const PROFILE_AVATAR_SIZE = 256;          // encoded square resolution (crisp at 2–3× DPI)
const PROFILE_AVATAR_MAX_BYTES = 22000;   // hard cap for the encoded avatar
const PROFILE_CLOUD_DEBOUNCE_MS = 2500;
const PROFILE_CLOUD_TIMEOUT_MS = 8000;

// Identity provider registry — THE extension seam for future sign-ins.
// The UI renders every registered provider; until a real implementation
// exists a provider reports available() === false and signIn() returns
// { ok:false } — the panel shows it as coming soon. NO placeholder auth:
// a real provider must resolve { ok:true, uid, provider } from a genuine
// credential flow (Firebase Auth / Play Games / email link) or throw.
const ProfileAuth = {
    current: 'local',
    providers: {
        local:     { id: 'local',     label: 'THIS DEVICE', available: () => true },
        google:    { id: 'google',    label: 'GOOGLE',      available: () => false },
        playgames: { id: 'playgames', label: 'PLAY GAMES',  available: () => false },
        email:     { id: 'email',     label: 'EMAIL',       available: () => false },
    },
    async signIn(providerId) {
        if (!providerId || providerId === 'local') {
            return { ok: true, provider: 'local', uid: null }; // uid=null → device-generated id
        }
        const p = this.providers[providerId];
        if (!p || !p.available()) return { ok: false, reason: 'unavailable' };
        // Real implementations plug in here — nothing below ships fake auth.
        throw new Error('provider registered but not implemented: ' + providerId);
    },
};

const Profile = {
    data: null,
    _cloudTimer: null,
    _cloudState: '',          // '' | 'on' | 'blocked' | 'off' | 'local'
    _wired: false,

    async init() {
        let raw = null;
        try { raw = await SaveSystem.load(PROFILE_STORAGE_KEY); } catch (e) {}
        this.data = this._migrate(raw);
        if (!this.data.id) {
            this.data.id = this._newId();
            this.data.createdAt = Date.now();
        }
        this.data.name = this._sanitizeName(this.data.name) || this._defaultName();
        this.data.stats = this.data.stats || { races: 0, wins: 0, losses: 0, bestET: null };
        this._persist();
        this._scheduleCloudSync();
        this._wirePanel();
        this._refreshChip();
    },

    // ── Public getters used across the game ─────────────────────────
    name() { return this.data ? this.data.name : 'DRIVER'; },
    avatar() { return this.data ? this.data.av : null; },

    // The small object shared with the peer over the encrypted P2P channel.
    share() {
        return { id: this.data.id, name: this.data.name, av: this.data.av };
    },

    // Career stats mirror — fed from the same code path that updates the
    // P2P record, so there is exactly one source of truth for numbers.
    recordMpResult(mpStats) {
        if (!this.data || !mpStats) return;
        this.data.stats = {
            races: mpStats.races || 0,
            wins: mpStats.wins || 0,
            losses: mpStats.losses || 0,
            bestET: mpStats.bestET || null,
        };
        this.data.updatedAt = Date.now();
        this._persist();
        this._scheduleCloudSync();
        if (this._panelOpen()) this.renderPanel();
    },

    setName(input) {
        const name = this._sanitizeName(input);
        if (!name) { game.showNotification('NAME: 2-14 LETTERS/DIGITS'); return false; }
        this.data.name = name;
        this.data.updatedAt = Date.now();
        this._persist();
        this._scheduleCloudSync();
        this._refreshAll();
        game.showNotification('NAME SAVED');
        return true;
    },

    saveName() {
        const input = document.getElementById('profile-name-input');
        if (input && this.setName(input.value)) this.renderPanel();
    },

    pickAvatar() {
        const file = document.getElementById('profile-avatar-file');
        if (file) { file.value = ''; file.click(); }
    },

    async onAvatarPicked(file) {
        if (!file) return;
        if (!/^image\//.test(file.type || '')) { game.showNotification('NOT AN IMAGE FILE'); return; }
        if (file.size > 8 * 1024 * 1024) { game.showNotification('IMAGE TOO LARGE — MAX 8MB'); return; }
        try {
            const src = await this._decodeImage(file);
            const dataUrl = this._encodeSquareAvatar(src);
            if (!dataUrl) { game.showNotification('AVATAR ENCODE FAILED'); return; }
            this.data.av = dataUrl;
            this.data.updatedAt = Date.now();
            this._persist();
            this._scheduleCloudSync();
            this._refreshAll();
            game.showNotification('AVATAR UPDATED');
        } catch (e) {
            game.showNotification('COULD NOT READ THAT IMAGE');
        }
    },

    removeAvatar() {
        if (!this.data.av) { game.showNotification('NO AVATAR TO REMOVE'); return; }
        this.data.av = null;
        this.data.updatedAt = Date.now();
        this._persist();
        this._scheduleCloudSync();
        this._refreshAll();
        game.showNotification('AVATAR REMOVED');
    },

    // Copies the Profile ID to the clipboard; the small copy icon flashes.
    copyId() {
        const text = this.formatId(this.data.id);
        const flash = () => {
            const el = document.getElementById('profile-id-copy');
            if (!el) return;
            el.classList.add('pf-copied');
            setTimeout(() => el.classList.remove('pf-copied'), 1200);
        };
        if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(text).then(flash).catch(() => {});
        } else {
            try {
                const ta = document.createElement('textarea');
                ta.value = text;
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

    // ── Account linking (structure only — no fake auth) ─────────────
    async linkAccount(providerId) {
        let res;
        try {
            res = await ProfileAuth.signIn(providerId);
        } catch (e) {
            res = { ok: false, reason: 'error' };
        }
        if (!res || !res.ok) {
            const p = ProfileAuth.providers[providerId];
            game.showNotification(((p && p.label) || String(providerId).toUpperCase()) + ' LINKING — COMING SOON');
            return false;
        }
        // A real provider resolves { ok:true, uid, provider } from a genuine
        // credential flow. The account then attaches to THIS profile id and
        // cloud sync upgrades to authenticated writes — wired up later.
        this.data.provider = res.provider;
        this.data.linkedUid = res.uid || null;
        this.data.updatedAt = Date.now();
        this._persist();
        this._scheduleCloudSync();
        this._refreshAll();
        return true;
    },

    // ── Panel (menu overlay) ────────────────────────────────────────
    openPanel() {
        game.menuState = 'PROFILE';
        document.getElementById('main-menu').classList.add('hidden');
        document.getElementById('profile-menu').classList.remove('hidden');
        this.renderPanel();
    },

    closePanel() {
        game.returnToMenu();
    },

    _panelOpen() {
        const el = document.getElementById('profile-menu');
        return !!(el && !el.classList.contains('hidden'));
    },

    renderPanel() {
        if (!this.data) return;
        const av = document.getElementById('profile-avatar');
        if (av) this.renderAvatar(av, { name: this.data.name, av: this.data.av }, '#37474f');
        const nameInput = document.getElementById('profile-name-input');
        if (nameInput && document.activeElement !== nameInput) nameInput.value = this.data.name;
        const stats = document.getElementById('profile-stats');
        if (stats) {
            const s = this.data.stats;
            const et = s.bestET ? ' \u00B7 BEST ' + s.bestET.toFixed(3) + 's' : '';
            stats.textContent = s.wins + 'W \u2013 ' + s.losses + 'L \u00B7 ' + s.races + ' RACES' + et;
        }
        const idEl = document.getElementById('profile-id');
        if (idEl) idEl.textContent = this.formatId(this.data.id);
        this._renderCloudStatus();
        this._renderAccounts();
        if (typeof Friends !== 'undefined') Friends.renderList();
    },

    // ── Account linking row (provider buttons) ──────────────────────
    _renderAccounts() {
        const row = document.getElementById('pf-link-row');
        if (!row || row.dataset.built === '1') return;
        row.innerHTML = '';
        for (const id of ['google', 'playgames', 'email']) {
            const p = ProfileAuth.providers[id];
            if (!p) continue;
            const b = document.createElement('span');
            b.className = 'menu-btn pf-btn pf-link-btn';
            b.textContent = p.label;
            b.setAttribute('role', 'button');
            b.tabIndex = 0;
            const soon = document.createElement('span');
            soon.className = 'pf-link-soon';
            soon.textContent = 'SOON';
            b.appendChild(soon);
            b.onclick = () => this.linkAccount(id);
            b.onkeydown = e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); this.linkAccount(id); } };
            row.appendChild(b);
        }
        row.dataset.built = '1';
    },

    // ── Shared avatar renderer (used by the chip, panel and MP lobby) ──
    // Avatars are ALWAYS drawn from a square, pre-cropped source into a
    // fixed box with object-fit: cover — geometrically impossible to show
    // a stretched or distorted image. No avatar → colored initial tile.
    renderAvatar(el, profile, fallbackColor) {
        if (!el) return;
        const av = profile && profile.av;
        el.innerHTML = '';
        if (av) {
            el.classList.add('mp-avatar-img');
            const img = document.createElement('img');
            img.src = av;
            img.alt = '';
            el.appendChild(img);
            return;
        }
        el.classList.remove('mp-avatar-img');
        el.style.background = fallbackColor || (profile && profile.color) || '#37474f';
        el.textContent = String((profile && profile.name) || '?').trim().charAt(0).toUpperCase() || '?';
    },

    // ── Internals ───────────────────────────────────────────────────
    _migrate(raw) {
        const d = (raw && typeof raw === 'object') ? raw : {};
        return {
            v: 1,
            id: typeof d.id === 'string' ? d.id.replace(/[^0-9a-fA-F]/g, '').toLowerCase().slice(0, 16) : '',
            name: typeof d.name === 'string' ? d.name : '',
            av: (typeof d.av === 'string' && d.av.length <= PROFILE_AVATAR_MAX_BYTES + 4000) ? d.av : null,
            provider: (d.provider && typeof d.provider === 'string') ? d.provider : 'local',
            linkedUid: (d.linkedUid && typeof d.linkedUid === 'string') ? d.linkedUid.slice(0, 128) : null,
            createdAt: +d.createdAt || 0,
            updatedAt: +d.updatedAt || 0,
            stats: d.stats && typeof d.stats === 'object' ? {
                races: +d.stats.races || 0,
                wins: +d.stats.wins || 0,
                losses: +d.stats.losses || 0,
                bestET: (typeof d.stats.bestET === 'number' && isFinite(d.stats.bestET)) ? d.stats.bestET : null,
            } : { races: 0, wins: 0, losses: 0, bestET: null },
        };
    },

    _sanitizeName(s) {
        const clean = String(s || '')
            .replace(/[^A-Za-z0-9 _.\-]/g, '')
            .replace(/\s+/g, ' ')
            .trim()
            .slice(0, PROFILE_NAME_MAX);
        return clean.length >= 2 ? clean : '';
    },

    _newId() {
        const arr = new Uint8Array(8);
        if (window.crypto && crypto.getRandomValues) crypto.getRandomValues(arr);
        else for (let i = 0; i < arr.length; i++) arr[i] = Math.floor(Math.random() * 256);
        return Array.from(arr).map(b => b.toString(16).padStart(2, '0')).join('');
    },

    formatId(id) {
        return String(id || '').replace(/[^0-9a-fA-F]/g, '').toUpperCase().padEnd(16, '0').match(/.{1,4}/g).join('-');
    },

    _defaultName() {
        return 'DRIVER ' + String(this.data.id || '0000').slice(-4).toUpperCase();
    },

    // Loads any image the device can decode. createImageBitmap with
    // 'from-image' also bakes EXIF orientation in, so phone photos taken
    // sideways come out upright; falls back to an <img> decode.
    async _decodeImage(file) {
        if (window.createImageBitmap) {
            try {
                return await createImageBitmap(file, { imageOrientation: 'from-image' });
            } catch (e) { /* older engines: fall through to <img> */ }
        }
        return new Promise((resolve, reject) => {
            const url = URL.createObjectURL(file);
            const img = new Image();
            img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
            img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('image decode failed')); };
            img.src = url;
        });
    },

    // Perfect-square avatar pipeline: CENTER square crop (cover) →
    // high-quality multi-step downscale → 256px encode, WebP first with a
    // JPEG fallback, quality stepped down until under the size cap. The
    // output is always square and sharply downscaled, and displaying it
    // with object-fit: cover makes stretching/distortion impossible.
    // Canvas re-encoding also strips EXIF/GPS metadata (privacy).
    _encodeSquareAvatar(src) {
        const sw = src.width || src.naturalWidth;
        const sh = src.height || src.naturalHeight;
        if (!sw || !sh) return null;
        const side = Math.min(sw, sh);
        const sx = (sw - side) / 2, sy = (sh - side) / 2;

        // Step 1: crop to the center square at source resolution.
        let cur = document.createElement('canvas');
        cur.width = side; cur.height = side;
        let cctx = cur.getContext('2d');
        cctx.imageSmoothingEnabled = true;
        cctx.imageSmoothingQuality = 'high';
        cctx.drawImage(src, sx, sy, side, side, 0, 0, side, side);

        // Step 2: halve repeatedly — avoiding one giant downscale jump
        // prevents aliasing and keeps small text/faces readable.
        while (cur.width > PROFILE_AVATAR_SIZE * 2) {
            const half = document.createElement('canvas');
            half.width = Math.max(PROFILE_AVATAR_SIZE, Math.floor(cur.width / 2));
            half.height = half.width;
            const hctx = half.getContext('2d');
            hctx.imageSmoothingEnabled = true;
            hctx.imageSmoothingQuality = 'high';
            hctx.drawImage(cur, 0, 0, half.width, half.height);
            cur = half;
        }

        // Step 3: final 256px canvas.
        const out = document.createElement('canvas');
        out.width = PROFILE_AVATAR_SIZE;
        out.height = PROFILE_AVATAR_SIZE;
        const octx = out.getContext('2d');
        octx.imageSmoothingEnabled = true;
        octx.imageSmoothingQuality = 'high';
        octx.drawImage(cur, 0, 0, PROFILE_AVATAR_SIZE, PROFILE_AVATAR_SIZE);

        // Step 4: encode — smallest first, quality stepped down under the cap.
        const encodes = [
            ['image/webp', [0.9, 0.82, 0.72]],
            ['image/jpeg', [0.88, 0.8, 0.7]],
        ];
        for (const [type, qualities] of encodes) {
            for (const q of qualities) {
                try {
                    const url = out.toDataURL(type, q);
                    const bytes = Math.ceil((url.length - url.indexOf(',') - 1) * 3 / 4);
                    if (bytes <= PROFILE_AVATAR_MAX_BYTES) return url;
                } catch (e) { /* unsupported type on this engine: try next */ }
            }
        }
        return null;
    },

    _persist() {
        // Silent background persistence — the profile must never nag or
        // block; failures leave the in-memory copy authoritative.
        SaveSystem.save(PROFILE_STORAGE_KEY, this.data).catch(() => {});
    },

    _refreshAll() {
        this._refreshChip();
        if (this._panelOpen()) this.renderPanel();
        if (typeof MP !== 'undefined' && MP._connected && MP._renderLobbySelf) MP._renderLobbySelf();
    },

    _refreshChip() {
        const chip = document.getElementById('menu-profile');
        if (!chip || !this.data) return;
        const av = chip.querySelector('.mp-avatar');
        if (av) this.renderAvatar(av, { name: this.data.name, av: this.data.av }, '#ff9800');
        const nm = document.getElementById('menu-profile-name');
        if (nm) nm.textContent = this.data.name.toUpperCase();
    },

    // ── Firebase mirror (background, never blocking) ────────────────
    _db() {
        if (typeof MP === 'undefined' || !MP.firebaseConfigured || !MP.firebaseConfigured()) return null;
        try { if (!MP.ensureFirebase()) return null; } catch (e) { return null; }
        return MP.db || null;
    },

    _scheduleCloudSync() {
        if (this._cloudTimer) clearTimeout(this._cloudTimer);
        this._cloudTimer = setTimeout(() => { this._cloudSync(); }, PROFILE_CLOUD_DEBOUNCE_MS);
    },

    async _cloudSync() {
        const db = this._db();
        if (!db || !this.data.id) { this._setCloudState('local'); return; }
        const d = this.data;
        const payload = { name: d.name, av: d.av, stats: d.stats, provider: d.provider, updatedAt: Date.now() };
        try {
            await this._watchdog(db.ref('pdl_profiles/' + d.id).update(payload), PROFILE_CLOUD_TIMEOUT_MS);
            this._setCloudState('on');
        } catch (e) {
            this._setCloudState(this._isRulesError(e) ? 'blocked' : 'off');
        }
    },

    _setCloudState(s) {
        if (this._cloudState === s) return;
        this._cloudState = s;
        this._renderCloudStatus();
    },

    _renderCloudStatus() {
        const el = document.getElementById('profile-cloud-status');
        if (!el) return;
        const map = {
            'on':      ['CLOUD SYNC: ON', 'pf-cloud-on'],
            'blocked': ['CLOUD SYNC: UNAVAILABLE — SAVING LOCALLY', 'pf-cloud-dim'],
            'off':     ['CLOUD SYNC: OFFLINE — SAVING LOCALLY', 'pf-cloud-dim'],
            'local':   ['CLOUD SYNC: LOCAL ONLY', 'pf-cloud-dim'],
        };
        const entry = map[this._cloudState] || map['local'];
        el.textContent = entry[0];
        el.className = 'pf-cloud ' + entry[1];
    },

    _isRulesError(e) {
        const code = String((e && e.code) || '').toUpperCase();
        const text = String((e && (e.message || e)) || '').toLowerCase();
        return code.includes('PERMISSION') || text.includes('permission_denied');
    },

    _watchdog(promise, ms) {
        return Promise.race([
            promise,
            new Promise((_, rej) => setTimeout(() => rej(new Error('profile sync timeout')), ms)),
        ]);
    },

    // ── One-time panel wiring ───────────────────────────────────────
    _wirePanel() {
        if (this._wired) return;
        this._wired = true;
        const file = document.getElementById('profile-avatar-file');
        if (file) file.addEventListener('change', () => { this.onAvatarPicked(file.files && file.files[0]); });
        const nameInput = document.getElementById('profile-name-input');
        if (nameInput) {
            nameInput.addEventListener('keydown', e => {
                if (e.key === 'Enter') { e.preventDefault(); this.saveName(); }
            });
        }
        const friendInput = document.getElementById('friend-add-input');
        if (friendInput) {
            friendInput.addEventListener('keydown', e => {
                if (e.key === 'Enter') { e.preventDefault(); if (typeof Friends !== 'undefined') Friends.addByInput(); }
            });
        }
        // Keyboard operability for chip, avatar tile and the copy icon.
        const chip = document.getElementById('menu-profile');
        if (chip) chip.addEventListener('keydown', e => {
            if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); this.openPanel(); }
        });
        const avTile = document.getElementById('profile-avatar');
        if (avTile) avTile.addEventListener('keydown', e => {
            if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); this.pickAvatar(); }
        });
        const copyIcon = document.getElementById('profile-id-copy');
        if (copyIcon) copyIcon.addEventListener('keydown', e => {
            if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); this.copyId(); }
        });
    },
};

window.Profile = Profile;
