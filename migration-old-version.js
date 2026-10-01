// =====================================================================
// NovaChat V1 -> V2 migration  (idempotent, per-user, resumable)
// =====================================================================
// Called automatically from index.html after login (in the background):
//     import('./migration-old-version.js').then(m => m.migrateCurrentUser(user))
// Manual re-run from the browser console (signed in):
//     (await import('./migration-old-version.js')).migrateCurrentUser(auth.currentUser, { force: true })
//
// Each user migrates ONLY what they own / participate in (their profile, their
// conversations, their presence), so this keeps working once Security Rules exist.
//
// Order (per spec):  read V1  ->  transform  ->  write V2  ->  validate
//                    ->  mark completed  ->  only then clean obsolete V1 data.
// Nothing is deleted before validation passes. Re-running never creates duplicates:
// documents are upgraded in place (same IDs) and only when they actually differ.
//
// V1 -> V2 changes
//   users/{uid}            username normalized + reserved in usernames/{name}; searchKeywords rebuilt
//                          (prefixes); + schemaVersion, migrationVersion:2; obsolete `status` removed
//   usernames/{name}       NEW  { uid, username, createdAt }
//   conversations/{id}     lastMessage "string" -> {id,text,type,senderId,timestamp}; + sentCount{uid:n};
//                          + schemaVersion:2; obsolete `lastMessageSender` removed
//   .../messages/{id}      + type:"text", edited/editedAt, replyTo(null), reactions (normalized),
//                          delivered/seen (+At); timestamp / text / id are NEVER touched
//   RTDB status/{uid}      merged into presence/{uid}/lastSeen, then removed
//   RTDB presence/{uid}    legacy `state` removed (V2 derives online from presence/{uid}/connections)

import {
    db, rtdb, SCHEMA_VERSION, MESSAGE_TYPES,
    normalizeUsername, isValidUsername, claimUsername
} from "./firebase-config.js";
import {
    doc, getDoc, getDocs, collection, query, where, orderBy, limit, startAfter,
    writeBatch, updateDoc, deleteField, serverTimestamp, documentId, getCountFromServer
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import { ref, get, set, remove } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-database.js";

const PAGE = 400; // < 500 writes per batch

// ---------------------------------------------------------------------
// Pure transforms (exported so they can be unit-tested)
// ---------------------------------------------------------------------
export function normalizeReactions(r) {
    const out = {};
    if (!r || typeof r !== 'object' || Array.isArray(r)) return out;
    for (const [emoji, users] of Object.entries(r)) {
        if (!Array.isArray(users)) continue;
        const uniq = [...new Set(users.filter(u => typeof u === 'string' && u))];
        if (uniq.length) out[emoji] = uniq;
    }
    return out;
}

// Returns ONLY the fields that must change (empty object = already V2).
export function normalizeMessage(m) {
    const patch = {};
    const type = MESSAGE_TYPES.includes(m.type) ? m.type : 'text';
    if (m.type !== type) patch.type = type;
    if (type === 'text' && typeof m.text !== 'string') patch.text = String(m.text ?? '');

    const edited = m.edited === true;
    if (m.edited !== edited) patch.edited = edited;
    if (m.editedAt === undefined) patch.editedAt = null;

    if (m.replyTo === undefined) {
        patch.replyTo = null;
    } else if (m.replyTo && typeof m.replyTo === 'object') {
        const rt = {
            id: String(m.replyTo.id ?? ''),
            text: String(m.replyTo.text ?? ''),
            senderName: String(m.replyTo.senderName ?? '')
        };
        if (JSON.stringify(rt) !== JSON.stringify({ id: m.replyTo.id, text: m.replyTo.text, senderName: m.replyTo.senderName })) {
            patch.replyTo = rt;
        }
    }

    const reactions = normalizeReactions(m.reactions);
    if (JSON.stringify(reactions) !== JSON.stringify(m.reactions ?? null)) patch.reactions = reactions;

    const seen = m.seen === true;
    const delivered = m.delivered === true || seen; // seen implies delivered
    if (m.seen !== seen) patch.seen = seen;
    if (m.delivered !== delivered) patch.delivered = delivered;
    if (m.deliveredAt === undefined) patch.deliveredAt = null;
    if (m.seenAt === undefined) patch.seenAt = null;
    return patch;
}

export function buildConversationPatch(conv, stats) {
    const participants = Array.isArray(conv.participants) ? conv.participants : [];
    const sentCount = {};
    participants.forEach(uid => { sentCount[uid] = stats.sent[uid] || 0; });

    const unread = {};
    participants.forEach(uid => {
        const n = conv.unread && conv.unread[uid];
        unread[uid] = Number.isFinite(n) && n > 0 ? n : 0;
    });

    // The newest real message is the source of truth (V1 never refreshed the preview on edit/delete).
    const last = stats.last;
    const lastMessage = last ? {
        id: last.id,
        text: last.type === 'text' ? last.text : '',
        type: last.type,
        senderId: last.senderId || null,
        timestamp: last.timestamp || conv.updatedAt || null
    } : null;

    return { lastMessage, sentCount, unread };
}

// ---------------------------------------------------------------------
// Conversation migration
// ---------------------------------------------------------------------
async function migrateMessages(convId) {
    const col = collection(db, 'conversations', convId, 'messages');
    const stats = { total: 0, patched: 0, sent: {}, last: null };
    let cursor = null;

    for (;;) {
        const q = cursor
            ? query(col, orderBy(documentId()), startAfter(cursor), limit(PAGE))
            : query(col, orderBy(documentId()), limit(PAGE));
        const snap = await getDocs(q);
        if (snap.empty) break;

        const batch = writeBatch(db);
        let ops = 0;
        snap.docs.forEach(d => {
            const m = d.data();
            stats.total++;
            if (m.senderId) stats.sent[m.senderId] = (stats.sent[m.senderId] || 0) + 1;

            const ms = m.timestamp && m.timestamp.toMillis ? m.timestamp.toMillis() : 0;
            if (!stats.last || ms >= stats.last._ms) {
                stats.last = {
                    _ms: ms, id: d.id, senderId: m.senderId,
                    type: MESSAGE_TYPES.includes(m.type) ? m.type : 'text',
                    text: typeof m.text === 'string' ? m.text : '', timestamp: m.timestamp || null
                };
            }
            const patch = normalizeMessage(m);
            if (Object.keys(patch).length) { batch.update(d.ref, patch); ops++; stats.patched++; }
        });
        if (ops) await batch.commit();

        cursor = snap.docs[snap.docs.length - 1];
        if (snap.size < PAGE) break;
    }
    return stats;
}

async function validateMessages(convId) {
    const col = collection(db, 'conversations', convId, 'messages');
    const total = (await getCountFromServer(col)).data().count;
    const typed = (await getCountFromServer(query(col, where('type', 'in', MESSAGE_TYPES)))).data().count;
    if (typed !== total) throw new Error(`validation failed for ${convId}: ${total - typed}/${total} messages without a valid type`);
    return total;
}

async function migrateConversation(convSnap) {
    const convId = convSnap.id;
    const conv = convSnap.data();

    const stats = await migrateMessages(convId);       // transform + write messages
    await validateMessages(convId);                    // validate
    const patch = buildConversationPatch(conv, stats);
    await updateDoc(convSnap.ref, {                    // write V2 metadata + mark completed
        ...patch,
        schemaVersion: SCHEMA_VERSION,
        migratedAt: serverTimestamp()
    });
    if ('lastMessageSender' in conv) {                 // only now: clean obsolete V1 field
        await updateDoc(convSnap.ref, { lastMessageSender: deleteField() });
    }
    return stats;
}

// ---------------------------------------------------------------------
// Profile / username
// ---------------------------------------------------------------------
async function migrateProfile(user, userData) {
    const emailName = (user.email || 'user').split('@')[0];
    let base = normalizeUsername(userData.username || emailName);
    if (!isValidUsername(base)) base = normalizeUsername(emailName + 'user');
    if (!isValidUsername(base)) base = 'user' + user.uid.slice(0, 6).toLowerCase().replace(/[^a-z0-9]/g, '');

    const candidates = [base, ...Array.from({ length: 5 }, () => base.slice(0, 15) + Math.floor(1000 + Math.random() * 9000))];
    for (const name of candidates) {
        try {
            const finalName = await claimUsername(user.uid, name, { displayName: userData.displayName || emailName });
            return { username: finalName, changed: finalName !== userData.username };
        } catch (e) {
            if (e.code !== 'username-taken') throw e; // V1 had no uniqueness guarantee: first claimant keeps the name
        }
    }
    throw new Error('could not reserve a username');
}

// ---------------------------------------------------------------------
// RTDB
// ---------------------------------------------------------------------
async function migratePresence(uid) {
    const [oldStatus, presence] = await Promise.all([
        get(ref(rtdb, `status/${uid}`)),          // written by V1 settings.html
        get(ref(rtdb, `presence/${uid}`))         // written by V1 index.html
    ]);
    const s = oldStatus.val(), p = presence.val();
    const lastSeen = Math.max(Number(s && s.lastSeen) || 0, Number(p && p.lastSeen) || 0) || null;

    if (lastSeen) {
        await set(ref(rtdb, `presence/${uid}/lastSeen`), lastSeen);
        const check = await get(ref(rtdb, `presence/${uid}/lastSeen`));
        if (Number(check.val()) < lastSeen) throw new Error('presence validation failed');
    }
    // validated -> clean obsolete V1 nodes
    if (s !== null) await remove(ref(rtdb, `status/${uid}`));
    if (p && 'state' in p) await remove(ref(rtdb, `presence/${uid}/state`));
}

// ---------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------
export async function migrateCurrentUser(user, { force = false, log = (...a) => console.log('[migration]', ...a) } = {}) {
    if (!user) return { status: 'no-user' };
    const uid = user.uid;
    const userRef = doc(db, 'users', uid);
    const userSnap = await getDoc(userRef);
    if (!userSnap.exists()) return { status: 'no-profile' };
    const userData = userSnap.data();

    if ((userData.migrationVersion || 0) >= SCHEMA_VERSION && !force) return { status: 'already-migrated' };

    const report = { status: 'completed', profileChanged: false, conversations: { migrated: 0, skipped: 0, failed: 0 }, messagesPatched: 0, errors: [] };

    // 1) profile + username reservation
    try {
        const r = await migrateProfile(user, userData);
        report.profileChanged = r.changed;
        log('username reserved:', r.username);
    } catch (e) { report.errors.push('profile: ' + e.message); }

    // 2) conversations (each: transform -> write -> validate -> mark -> cleanup)
    const convs = await getDocs(query(collection(db, 'conversations'), where('participants', 'array-contains', uid)));
    for (const c of convs.docs) {
        try {
            if ((c.data().schemaVersion || 0) >= SCHEMA_VERSION && !force) {
                report.conversations.skipped++;
            } else {
                const st = await migrateConversation(c);
                report.conversations.migrated++;
                report.messagesPatched += st.patched;
            }
            await remove(ref(rtdb, `typing/${c.id}/${uid}`)).catch(() => {}); // drop stale V1 typing state
        } catch (e) {
            report.conversations.failed++;
            report.errors.push(`conversation ${c.id}: ${e.message}`);
            console.error('[migration] conversation failed, V1 data left untouched:', c.id, e);
        }
    }

    // 3) RTDB presence
    try { await migratePresence(uid); }
    catch (e) { report.errors.push('presence: ' + e.message); }

    // 4) mark completed only when everything validated, then clean the user's obsolete fields
    if (report.errors.length === 0) {
        await updateDoc(userRef, { migrationVersion: SCHEMA_VERSION, schemaVersion: SCHEMA_VERSION, migratedAt: serverTimestamp() });
        if ('status' in userData) await updateDoc(userRef, { status: deleteField() }); // V1 users.status was never read
        log('completed', report);
    } else {
        report.status = 'partial';
        console.warn('[migration] partial - will retry on next login; V1 data kept where validation failed', report);
    }
    return report;
}
