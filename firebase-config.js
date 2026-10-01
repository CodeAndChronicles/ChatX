import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import { getFirestore, doc, runTransaction, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import { getDatabase, ref, push, set, remove, onValue, onDisconnect, serverTimestamp as rtServerTimestamp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-database.js";

const firebaseConfig = {
    apiKey: "AIzaSyAnLTYi24LQlXVehkbrUESbWrf0auGpz_I",
    authDomain: "nova-chat-24378.firebaseapp.com",
    projectId: "nova-chat-24378",
    storageBucket: "nova-chat-24378.firebasestorage.app",
    messagingSenderId: "197888189650",
    appId: "1:197888189650:web:e3a4590c9d0236e49e390b",
    databaseURL: "https://nova-chat-24378-default-rtdb.firebaseio.com"
};

const app = initializeApp(firebaseConfig);

export const auth = getAuth(app);
export const db = getFirestore(app);
export const rtdb = getDatabase(app);

// =====================================================================
// V2 shared helpers
// =====================================================================
export const SCHEMA_VERSION = 2;
export const MESSAGE_TYPES = ['text', 'image', 'video', 'audio', 'file'];
export const USERNAME_MIN = 3;
export const USERNAME_MAX = 20;

export const convIdFor = (a, b) => [a, b].sort().join('_');

// Username: lowercase a-z 0-9 _ only (safe as a Firestore doc id).
export const normalizeUsername = (raw) =>
    String(raw || '').trim().toLowerCase().replace(/[^a-z0-9_]/g, '').slice(0, USERNAME_MAX);
export const isValidUsername = (n) => n.length >= USERNAME_MIN && n.length <= USERNAME_MAX;

// searchKeywords = prefixes (>=2 chars) of username + display name (+ each word of it).
export function buildSearchKeywords(username, displayName) {
    const out = new Set();
    const addPrefixes = (str) => {
        const s = String(str || '').toLowerCase().trim().slice(0, 30);
        for (let i = 2; i <= s.length; i++) out.add(s.slice(0, i));
    };
    addPrefixes(username);
    const name = String(displayName || '').toLowerCase().trim();
    addPrefixes(name);
    name.split(/\s+/).filter(Boolean).forEach(addPrefixes);
    return [...out].slice(0, 120);
}

const usernameError = (code) => Object.assign(new Error(code), { code });

// Reserve usernames/{name} for uid (transaction) and update the user doc + release the old name.
export async function claimUsername(uid, desired, { previous = null, displayName = '' } = {}) {
    const name = normalizeUsername(desired);
    if (!isValidUsername(name)) throw usernameError('invalid-username');
    const newRef = doc(db, 'usernames', name);
    const oldRef = previous && previous !== name ? doc(db, 'usernames', previous) : null;
    const userRef = doc(db, 'users', uid);
    await runTransaction(db, async (tx) => {
        const snap = await tx.get(newRef);
        const oldSnap = oldRef ? await tx.get(oldRef) : null;
        if (snap.exists() && snap.data().uid !== uid) throw usernameError('username-taken');
        if (!snap.exists()) tx.set(newRef, { uid, username: name, createdAt: serverTimestamp() });
        if (oldSnap && oldSnap.exists() && oldSnap.data().uid === uid) tx.delete(oldRef);
        tx.update(userRef, { username: name, searchKeywords: buildSearchKeywords(name, displayName) });
    });
    return name;
}

// Create users/{uid} + usernames/{name} atomically. strict=true -> throw if the username is taken,
// otherwise fall back to name + random suffix.
export async function createUserProfile(user, extra = {}) {
    const emailName = (user.email || 'user').split('@')[0];
    const displayName = extra.displayName || user.displayName || emailName;
    let base = normalizeUsername(extra.username || emailName);
    if (base.length < USERNAME_MIN) base = (base + 'user').slice(0, USERNAME_MAX);
    const candidates = extra.strict
        ? [base]
        : [base, ...Array.from({ length: 5 }, () => base.slice(0, USERNAME_MAX - 5) + Math.floor(1000 + Math.random() * 9000))];

    for (const username of candidates) {
        const profile = {
            uid: user.uid,
            email: user.email || '',
            username,
            displayName,
            photoURL: user.photoURL || '',
            gender: extra.gender || 'male',
            age: parseInt(extra.age) || 18,
            theme: 'dark',
            bio: '',
            pinnedChats: [],
            createdAt: serverTimestamp(),
            lastLogin: serverTimestamp(),
            searchKeywords: buildSearchKeywords(username, displayName),
            schemaVersion: SCHEMA_VERSION,
            migrationVersion: SCHEMA_VERSION   // born as V2: nothing to migrate
        };
        try {
            await runTransaction(db, async (tx) => {
                const nameRef = doc(db, 'usernames', username);
                const nameSnap = await tx.get(nameRef);
                if (nameSnap.exists() && nameSnap.data().uid !== user.uid) throw usernameError('username-taken');
                if (!nameSnap.exists()) tx.set(nameRef, { uid: user.uid, username, createdAt: serverTimestamp() });
                tx.set(doc(db, 'users', user.uid), profile);
            });
            return profile;
        } catch (e) {
            if (e.code !== 'username-taken') throw e;
        }
    }
    throw usernameError('username-taken');
}

// ---------------------------------------------------------------------
// Presence (RTDB): presence/{uid} = { connections: {connId:true}, lastSeen }
// One connection node per open page, so navigating index -> settings
// never flips the user offline. Re-registered on every reconnect.
// ---------------------------------------------------------------------
export function parsePresence(val) {
    const conns = val && val.connections ? Object.keys(val.connections).length : 0;
    return { isOnline: conns > 0, lastSeen: (val && val.lastSeen) || null };
}

export function startPresence(uid, { trackVisibility = false } = {}) {
    if (!uid) return () => {};
    const connRef = push(ref(rtdb, `presence/${uid}/connections`));
    const lastSeenRef = ref(rtdb, `presence/${uid}/lastSeen`);
    let connected = false, registered = false, stopped = false;

    const wantOnline = () => !stopped && connected && !(trackVisibility && document.hidden);

    async function register() {
        if (registered || !wantOnline()) return;
        registered = true;
        try {
            await onDisconnect(connRef).remove();
            await onDisconnect(lastSeenRef).set(rtServerTimestamp());
            await set(connRef, true);
        } catch (e) { registered = false; console.warn('presence register failed:', e); }
    }
    async function unregister() {
        if (!registered) return;
        registered = false;
        try {
            await remove(connRef);
            await set(lastSeenRef, rtServerTimestamp());
            await onDisconnect(connRef).cancel();
            await onDisconnect(lastSeenRef).cancel();
        } catch (e) { /* connection already gone: onDisconnect handled it */ }
    }

    const offConnected = onValue(ref(rtdb, '.info/connected'), (snap) => {
        connected = snap.val() === true;
        if (connected) { registered = false; register(); }   // server dropped old onDisconnect handlers
        else registered = false;
    });
    const onVis = () => { wantOnline() ? register() : unregister(); };
    if (trackVisibility) document.addEventListener('visibilitychange', onVis);

    return () => {
        stopped = true;
        try { offConnected(); } catch (e) {}
        document.removeEventListener('visibilitychange', onVis);
        return unregister();
    };
}
