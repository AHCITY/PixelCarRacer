'use strict';

const SaveSystem = {
    DB_NAME: 'pdl_saves',
    DB_VERSION: 1,
    STORE: 'game_state',
    db: null,

    async init() {
        try {
            this.db = await this._openDB();
            if (navigator.storage && navigator.storage.persist) {
                try { await navigator.storage.persist(); } catch (e) {}
            }
        } catch (e) {
            console.warn('IndexedDB unavailable, falling back to localStorage:', e);
            this.db = null;
        }
    },

    _openDB() {
        return new Promise((resolve, reject) => {
            if (!window.indexedDB) { reject('IndexedDB not supported'); return; }
            const req = indexedDB.open(this.DB_NAME, this.DB_VERSION);
            req.onupgradeneeded = (e) => {
                const db = e.target.result;
                if (!db.objectStoreNames.contains(this.STORE)) {
                    db.createObjectStore(this.STORE, { keyPath: 'id' });
                }
            };
            req.onsuccess = (e) => resolve(e.target.result);
            req.onerror = (e) => reject(e.target.error);
        });
    },

    async save(key, data) {
        const payload = { id: key, data, version: 1, timestamp: Date.now() };
        if (this.db) {
            try {
                return await new Promise((resolve, reject) => {
                    const tx = this.db.transaction(this.STORE, 'readwrite');
                    const store = tx.objectStore(this.STORE);
                    const req = store.put(payload);
                    req.onsuccess = () => resolve(true);
                    req.onerror = (e) => reject(e.target.error);
                });
            } catch (e) {
                console.warn('IndexedDB save failed, using localStorage:', e);
            }
        }
        try {
            localStorage.setItem('pdl_' + key, JSON.stringify(data));
            return true;
        } catch (e) { return false; }
    },

    async load(key) {
        if (this.db) {
            try {
                const result = await new Promise((resolve, reject) => {
                    const tx = this.db.transaction(this.STORE, 'readonly');
                    const store = tx.objectStore(this.STORE);
                    const req = store.get(key);
                    req.onsuccess = (e) => resolve(e.target.result ? e.target.result.data : null);
                    req.onerror = (e) => reject(e.target.error);
                });
                if (result) return result;
            } catch (e) {
                console.warn('IndexedDB load failed, trying localStorage:', e);
            }
        }
        try {
            const raw = localStorage.getItem('pdl_' + key);
            return raw ? JSON.parse(raw) : null;
        } catch (e) { return null; }
    },

    async delete(key) {
        if (this.db) {
            try {
                await new Promise((resolve, reject) => {
                    const tx = this.db.transaction(this.STORE, 'readwrite');
                    tx.objectStore(this.STORE).delete(key);
                    tx.oncomplete = () => resolve(true);
                    tx.onerror = (e) => reject(e.target.error);
                });
            } catch (e) {}
        }
        try { localStorage.removeItem('pdl_' + key); } catch (e) {}
    }
};