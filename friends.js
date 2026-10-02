'use strict';

/* ─── Pixel Drag Legends — Friends ──────────────────────────────────────
 *
 * The social graph around the Profile ID (the canonical player key, kept
 * stable on purpose so future Google / Play Games / email linking never
 * orphans a friend list).
 *
 * The local store mirrors the future Firebase Realtime Database layout 1:1
 * so wiring real sync later is a backend swap, not a rearchitecture:
 *
 *     pdl_friendRequests/<toId>/<fromId> = { from, fromName, ts }
 *         - keyed BY SENDER: one outstanding request per pair by design,
 *           duplicates overwrite instead of piling up.
 *     pdl_friends/<uid>/<friendUid>      = { name, ts }
 *         - written to BOTH sides atomically on accept (multi-location
 *           update); denormalized name snapshot = list is ONE read.
 *     pdl_presence/<uid>                 = { online, lastSeen }
 *         - .info/connected + onDisconnect() pattern.
 *
 * TODAY (no auth yet): requests ride the DTLS-encrypted P2P channel you
 * already race on — add a friend code, then when the two of you connect
 * for a race the request is delivered and shows up with ACCEPT / DECLINE.
 * Presence: a friend shows ONLINE while you are actually connected to them.
 * Security posture carried into the future rules: you can only CREATE a
 * request addressed to someone else, only the recipient + sender can remove
 * it, and only an existing request lets the accepter write into the other
 * side's friend list. Blocks mirror the future pdl_blocks/<uid>/<blockedId>
 * node: blocklist checks gate requests, accepts and friend rows, and a
 * block always severs the social edge in BOTH directions first.
 * ─────────────────────────────────────────────────────────────────────── */

const FRIENDS_STORAGE_KEY = 'friends_v1';
const FRIEND_NAME_MAX = 20;

const Friends = {
    data: null,
    _loaded: false,

    async init() {
        if (this._loaded) return;
        this._loaded = true;
        let raw = null;
        try { raw = await SaveSystem.load(FRIENDS_STORAGE_KEY); } catch (e) {}
        this.data = this._migrate(raw);
        this._persist();
    },

    _migrate(raw) {
        const d = (raw && typeof raw === 'object') ? raw : {};
        const pickMap = src => {
            const out = {};
            if (src && typeof src === 'object') {
                for (const [k, v] of Object.entries(src)) {
                    const id = String(k).toLowerCase().replace(/[^0-9a-f]/g, '').slice(0, 16);
                    if (id.length === 16 && v && typeof v === 'object') {
                        out[id] = {
                            name: String(v.name || v.fromName || '').slice(0, FRIEND_NAME_MAX),
                            fromName: String(v.fromName || v.name || '').slice(0, FRIEND_NAME_MAX),
                            ts: +v.ts || 0,
                            lastRaced: +v.lastRaced || 0,
                        };
                    }
                }
            }
            return out;
        };
        return {
            v: 1,
            friends: pickMap(d.friends),
            incoming: pickMap(d.incoming),
            outgoing: pickMap(d.outgoing),
            blocked: pickMap(d.blocked),   // reserved for the future pdl_blocks node
        };
    },

    _persist() {
        SaveSystem.save(FRIENDS_STORAGE_KEY, this.data).catch(() => {});
    },

    /* ── Helpers ───────────────────────────────────────────────────── */
    normalizeCode(input) {
        return String(input || '').toLowerCase().replace(/[^0-9a-f]/g, '').slice(0, 16);
    },

    isSelf(id) {
        return !!(typeof Profile !== 'undefined' && Profile.data && Profile.data.id === id);
    },

    isFriend(id) { return !!(this.data && this.data.friends[id]); },
    hasOutgoing(id) { return !!(this.data && this.data.outgoing[id]); },
    hasIncoming(id) { return !!(this.data && this.data.incoming[id]); },
    isBlocked(id) { return !!(this.data && this.data.blocked[id]); },

    /* ── Last-raced memory ──
       Local stand-in for the future pdl_presence/lastRace node: whenever a
       real race against this friend completes, multiplayer.js touches this
       timestamp and the friends list shows a friendly "LAST RACE 2H AGO". */
    touchLastRaced(id) {
        if (!this.data || !id) return;
        const f = this.data.friends[id];
        if (!f) return;
        f.lastRaced = Date.now();
        this._persist();
    },

    _relTime(ts) {
        const s = Math.max(0, (Date.now() - ts) / 1000);
        if (s < 90) return 'JUST NOW';
        if (s < 3600) return Math.floor(s / 60) + 'M AGO';
        if (s < 86400) return Math.floor(s / 3600) + 'H AGO';
        return Math.floor(s / 86400) + 'D AGO';
    },

    _fmt(id) {
        return (typeof Profile !== 'undefined') ? Profile.formatId(id) : id.toUpperCase();
    },

    // A friend is ONLINE right now only while you are actually connected to
    // them over P2P (their shared profile id matches). When Firebase lands
    // this reads pdl_presence/<uid> instead — same UI, same function.
    isOnline(id) {
        if (typeof MP === 'undefined' || !MP._connected || !MP.remoteProfile) return false;
        return this.normalizeCode(MP.remoteProfile.id) === id;
    },

    /* ── Actions ───────────────────────────────────────────────────── */
    addByInput() {
        const input = document.getElementById('friend-add-input');
        if (!input) return;
        const res = this.sendRequest(input.value);
        if (res.ok) input.value = '';
        else game.showNotification(res.msg);
    },

    sendRequest(raw) {
        if (!this.data) return { ok: false, msg: 'NOT READY YET' };
        const id = this.normalizeCode(raw);
        if (id.length < 8) return { ok: false, msg: 'ENTER A VALID FRIEND CODE' };
        if (this.isSelf(id)) return { ok: false, msg: "THAT'S YOUR OWN CODE" };
        if (this.isBlocked(id)) return { ok: false, msg: 'DRIVER IS BLOCKED' };
        if (this.data.friends[id]) return { ok: false, msg: 'ALREADY FRIENDS' };
        if (this.data.outgoing[id] || this.data.incoming[id]) return { ok: false, msg: 'REQUEST ALREADY PENDING' };
        this.data.outgoing[id] = { name: this._fmt(id), ts: Date.now() };
        this._persist();
        this._render();
        // If that exact driver is already connected to us, deliver instantly.
        this._deliverRequest(id);
        game.showNotification('FRIEND REQUEST SENT');
        return { ok: true };
    },

    _deliverRequest(id) {
        if (typeof MP === 'undefined' || !MP._connected || !MP.remoteProfile) return;
        if (this.normalizeCode(MP.remoteProfile.id) !== id) return;
        if (typeof Profile === 'undefined' || !Profile.data) return;
        MP.sendEvent({ type: 'friendReq', p: { id: Profile.data.id, name: Profile.name() } });
    },

    // Called by multiplayer.js when the peer's profile arrives — this is the
    // moment a queued request can be delivered to the exact driver.
    onPeerProfile(remote) {
        if (!remote || !this.data) return;
        const id = this.normalizeCode(remote.id);
        if (!id) return;
        if (this.data.outgoing[id] && this.data.outgoing[id].ts) {
            // Keep the real driver name once we've met them.
            this.data.outgoing[id].name = String(remote.name || this.data.outgoing[id].name).slice(0, FRIEND_NAME_MAX);
            this._persist();
            this._deliverRequest(id);
        }
        this._render();
    },

    _handlePeerRequest(p) {
        if (!this.data || !p) return;
        const id = this.normalizeCode(p.id);
        if (!id || this.isSelf(id) || this.data.friends[id] || (this.data.blocked && this.data.blocked[id])) return;
        const name = String(p.name || 'DRIVER').slice(0, FRIEND_NAME_MAX);
        if (this.data.incoming[id]) {
            this.data.incoming[id].fromName = name;
        } else {
            this.data.incoming[id] = { fromName: name, ts: Date.now() };
            game.showNotification('FRIEND REQUEST FROM ' + name.toUpperCase());
            if (typeof SFX !== 'undefined') SFX.notify();
        }
        this._persist();
        this._render();
    },

    acceptRequest(id) {
        if (!this.data || !this.data.incoming[id]) return;
        const req = this.data.incoming[id];
        delete this.data.incoming[id];
        delete this.data.outgoing[id];
        this.data.friends[id] = { name: req.fromName || this._fmt(id), ts: Date.now() };
        this._persist();
        this._render();
        if (typeof MP !== 'undefined' && MP._connected && MP.remoteProfile &&
            this.normalizeCode(MP.remoteProfile.id) === id &&
            typeof Profile !== 'undefined' && Profile.data) {
            // Mutual confirmation: they only become friends on their side
            // once this acceptance lands on their machine.
            MP.sendEvent({ type: 'friendAcc', id: Profile.data.id, name: Profile.name() });
        }
        game.showNotification('FRIEND ADDED');
        if (typeof SFX !== 'undefined') SFX.notify();
    },

    _handlePeerAccept(msg) {
        if (!this.data || !msg) return;
        const id = this.normalizeCode(msg.id);
        // Blocked drivers can never slip a friendship in — even if a stale
        // outgoing request somehow survived on their side.
        if (!id || this.isBlocked(id) || !this.data.outgoing[id]) return;
        const name = String(msg.name || this.data.outgoing[id].name || this._fmt(id)).slice(0, FRIEND_NAME_MAX);
        delete this.data.outgoing[id];
        delete this.data.incoming[id];
        this.data.friends[id] = { name, ts: Date.now() };
        this._persist();
        this._render();
        game.showNotification('FRIEND ADDED');
        if (typeof SFX !== 'undefined') SFX.notify();
    },

    declineRequest(id) {
        if (!this.data || !this.data.incoming[id]) return;
        delete this.data.incoming[id];
        this._persist();
        this._render();
    },

    cancelRequest(id) {
        if (!this.data || !this.data.outgoing[id]) return;
        delete this.data.outgoing[id];
        this._persist();
        this._render();
    },

    // Drops every edge between us and `id` (friend + both request rows).
    // Returns true when a live friendship existed — peers are then told.
    _sever(id) {
        if (!this.data) return false;
        const wasFriend = !!this.data.friends[id];
        delete this.data.friends[id];
        delete this.data.incoming[id];
        delete this.data.outgoing[id];
        if (wasFriend) {
            // Mutual removal: tell them to drop us from their list too.
            if (typeof MP !== 'undefined' && MP._connected && MP.remoteProfile &&
                this.normalizeCode(MP.remoteProfile.id) === id &&
                typeof Profile !== 'undefined' && Profile.data) {
                MP.sendEvent({ type: 'friendRemove', id: Profile.data.id });
            }
        }
        return wasFriend;
    },

    removeFriend(id) {
        if (!this.data || !this.data.friends[id]) return;
        this._sever(id);
        this._persist();
        this._render();
        game.showNotification('FRIEND REMOVED');
    },

    /* ── Blocks (future pdl_blocks/<uid>/<blockedId>) ────────────────
       Blocking is one-sided and silent: the other driver is never told,
       their requests/accepts are simply swallowed by the guards above,
       and any existing friendship/requests die immediately. Unblock is
       local too — nothing is sent, the graph is just writable again. */
    blockFriend(id) {
        if (!this.data || !id || this.isSelf(id) || this.isBlocked(id)) return;
        this._sever(id);
        this.data.blocked[id] = { name: this._fmt(id), ts: Date.now() };
        this._persist();
        this._render();
        game.showNotification('DRIVER BLOCKED');
    },

    // Used by peer-facing flows that know the driver's real name (e.g. a
    // request row's BLOCK action) so the list never shows a raw code.
    blockKnown(id, name) {
        if (!this.data || !id || this.isSelf(id)) return;
        const norm = this.normalizeCode(id);
        if (!norm) return;
        this._sever(norm);
        this.data.blocked[norm] = { name: String(name || this._fmt(norm)).slice(0, FRIEND_NAME_MAX), ts: Date.now() };
        this._persist();
        this._render();
        game.showNotification('DRIVER BLOCKED');
    },

    unblock(id) {
        if (!this.data || !this.data.blocked[id]) return;
        delete this.data.blocked[id];
        this._persist();
        this._render();
        game.showNotification('DRIVER UNBLOCKED');
    },

    _handlePeerRemove(msg) {
        if (!this.data || !msg) return;
        const id = this.normalizeCode(msg.id);
        if (!id || !this.data.friends[id]) return;
        delete this.data.friends[id];
        this._persist();
        this._render();
    },

    /* ── UI ────────────────────────────────────────────────────────── */
    _render() {
        if (typeof Profile !== 'undefined' && Profile._panelOpen && Profile._panelOpen()) {
            this.renderList();
        }
    },

    renderList() {
        const box = document.getElementById('friends-list');
        if (!box || !this.data) return;
        box.innerHTML = '';

        const items = [];
        for (const [id, f] of Object.entries(this.data.friends)) {
            items.push({ id, state: 'friend', name: f.name || this._fmt(id), online: this.isOnline(id), lastRaced: f.lastRaced || 0 });
        }
        for (const [id, r] of Object.entries(this.data.incoming)) {
            items.push({ id, state: 'incoming', name: r.fromName || this._fmt(id) });
        }
        for (const [id, r] of Object.entries(this.data.outgoing)) {
            items.push({ id, state: 'outgoing', name: r.name || this._fmt(id) });
        }

        if (!items.length) {
            const empty = document.createElement('div');
            empty.className = 'fr-row fr-empty';
            empty.textContent = 'NO FRIENDS YET';
            box.appendChild(empty);
        }

        const rank = { friend: 0, incoming: 1, outgoing: 2 };
        items.sort((a, b) =>
            (rank[a.state] - rank[b.state]) ||
            ((b.online ? 1 : 0) - (a.online ? 1 : 0)) ||
            ((b.lastRaced || 0) - (a.lastRaced || 0)) ||
            a.name.localeCompare(b.name));

        const btn = (row, cls, label, fn) => {
            const b = document.createElement('span');
            b.className = 'fr-btn ' + cls;
            b.setAttribute('role', 'button');
            b.tabIndex = 0;
            b.textContent = label;
            b.onclick = fn;
            b.onkeydown = e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); fn(); } };
            row.appendChild(b);
            return b;
        };

        for (const it of items) {
            const row = document.createElement('div');
            row.className = 'fr-row';

            if (it.state === 'friend') {
                const dot = document.createElement('span');
                dot.className = 'fr-dot' + (it.online ? ' on' : '');
                dot.setAttribute('aria-hidden', 'true');
                const name = document.createElement('span');
                name.className = 'fr-name';
                name.textContent = it.name.toUpperCase();
                const sub = document.createElement('span');
                sub.className = 'fr-sub' + (it.online ? ' fr-sub-on' : '');
                sub.textContent = it.online ? 'ONLINE'
                    : (it.lastRaced ? 'LAST RACE ' + this._relTime(it.lastRaced) : 'OFFLINE');
                row.appendChild(dot);
                row.appendChild(name);
                row.appendChild(sub);
                btn(row, 'warn', 'BLOCK', () => this.blockKnown(it.id, it.name));
                btn(row, 'red', 'REMOVE', () => this.removeFriend(it.id));
            } else if (it.state === 'incoming') {
                const name = document.createElement('span');
                name.className = 'fr-name';
                name.textContent = it.name.toUpperCase();
                const sub = document.createElement('span');
                sub.className = 'fr-sub';
                sub.textContent = 'WANTS TO ADD YOU';
                row.appendChild(name);
                row.appendChild(sub);
                btn(row, 'green', 'ACCEPT', () => this.acceptRequest(it.id));
                btn(row, 'red', 'DECLINE', () => this.declineRequest(it.id));
                btn(row, 'warn', 'BLOCK', () => this.blockKnown(it.id, it.name));
            } else {
                const name = document.createElement('span');
                name.className = 'fr-name';
                name.textContent = it.name.toUpperCase();
                const sub = document.createElement('span');
                sub.className = 'fr-sub';
                sub.textContent = 'PENDING';
                row.appendChild(name);
                row.appendChild(sub);
                btn(row, '', 'CANCEL', () => this.cancelRequest(it.id));
            }
            box.appendChild(row);
        }

        // BLOCKED — always last, only rendered when non-empty. A blocked
        // driver can't send requests that reach you and can never become a
        // friend again until you unblock them.
        const blockedIds = Object.keys(this.data.blocked);
        if (!blockedIds.length) return;
        const divider = document.createElement('div');
        divider.className = 'fr-divider';
        divider.textContent = 'BLOCKED (' + blockedIds.length + ')';
        box.appendChild(divider);
        blockedIds.sort((a, b) =>
            ((this.data.blocked[a].name || a).localeCompare(this.data.blocked[b].name || b)));
        for (const id of blockedIds) {
            const b = this.data.blocked[id];
            const row = document.createElement('div');
            row.className = 'fr-row fr-row-blocked';
            const name = document.createElement('span');
            name.className = 'fr-name fr-name-blocked';
            name.textContent = String(b.name || this._fmt(id)).toUpperCase();
            const sub = document.createElement('span');
            sub.className = 'fr-sub';
            sub.textContent = 'BLOCKED';
            row.appendChild(name);
            row.appendChild(sub);
            btn(row, '', 'UNBLOCK', () => this.unblock(id));
            box.appendChild(row);
        }
    },
};

window.Friends = Friends;
