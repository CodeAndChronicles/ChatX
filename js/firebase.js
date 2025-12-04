// js/firebase.js
import { app } from '../firebase-config.js';
import { 
    getAuth,
    createUserWithEmailAndPassword,
    signInWithEmailAndPassword,
    signOut,
    updateProfile,
    updatePassword,
    deleteUser,
    reauthenticateWithCredential,
    EmailAuthProvider,
    onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/12.6.0/firebase-auth.js";

import {
    getFirestore,
    collection,
    doc,
    getDoc,
    getDocs,
    setDoc,
    updateDoc,
    addDoc,
    deleteDoc,
    query,
    where,
    orderBy,
    onSnapshot,
    serverTimestamp,
    writeBatch,
    limit,
    increment,
    arrayUnion,
    arrayRemove,
    runTransaction
} from "https://www.gstatic.com/firebasejs/12.6.0/firebase-firestore.js";

import utils from './utils.js';

// ===== FIREBASE INITIALIZATION =====
const auth = getAuth(app);
const db = getFirestore(app);

class FirebaseService {
    constructor() {
        this.unsubscribers = new Map();
        this.currentUser = null;
        this.currentUserData = null;
    }

    // ===== AUTHENTICATION =====
    
    async signUp(email, password, name) {
        try {
            const userCredential = await createUserWithEmailAndPassword(auth, email, password);
            const user = userCredential.user;
            
            // Update profile with name
            await updateProfile(user, {
                displayName: name
            });
            
            // Create user document
            await this.createUserDocument(user.uid, {
                email,
                name,
                createdAt: serverTimestamp()
            });
            
            return { success: true, user };
        } catch (error) {
            console.error('Sign up error:', error);
            return { success: false, error: this.handleAuthError(error) };
        }
    }
    
    async signIn(email, password) {
        try {
            const userCredential = await signInWithEmailAndPassword(auth, email, password);
            return { success: true, user: userCredential.user };
        } catch (error) {
            console.error('Sign in error:', error);
            return { success: false, error: this.handleAuthError(error) };
        }
    }
    
    async signOut() {
        try {
            // Update user status to offline
            if (this.currentUser) {
                await this.updateUserStatus(this.currentUser.uid, false);
            }
            
            await signOut(auth);
            this.cleanupListeners();
            return { success: true };
        } catch (error) {
            console.error('Sign out error:', error);
            return { success: false, error: error.message };
        }
    }
    
    async updateUserPassword(currentPassword, newPassword) {
        try {
            const user = auth.currentUser;
            const credential = EmailAuthProvider.credential(user.email, currentPassword);
            
            await reauthenticateWithCredential(user, credential);
            await updatePassword(user, newPassword);
            
            return { success: true };
        } catch (error) {
            console.error('Update password error:', error);
            return { success: false, error: this.handleAuthError(error) };
        }
    }
    
    async deleteUserAccount(password) {
        try {
            const user = auth.currentUser;
            const credential = EmailAuthProvider.credential(user.email, password);
            
            await reauthenticateWithCredential(user, credential);
            
            // Delete user data
            await this.deleteUserData(user.uid);
            
            // Delete user account
            await deleteUser(user);
            
            this.cleanupListeners();
            return { success: true };
        } catch (error) {
            console.error('Delete account error:', error);
            return { success: false, error: this.handleAuthError(error) };
        }
    }
    
    // ===== USER MANAGEMENT =====
    
    async createUserDocument(uid, userData) {
        try {
            const userRef = doc(db, "users", uid);
            const username = userData.email?.split('@')[0] || `user_${Date.now()}`;
            
            const userDoc = {
                uid,
                name: userData.name || 'مستخدم جديد',
                email: userData.email,
                username: username,
                avatarColor: utils.getUserColor(uid),
                coverColor: 'purple',
                bio: '',
                status: '📍 مشغول الآن',
                isOnline: true,
                lastSeen: serverTimestamp(),
                createdAt: serverTimestamp(),
                updatedAt: serverTimestamp(),
                typingIn: null,
                pinnedChats: [],
                blockedUsers: [],
                mutedChats: {},
                readReceipts: true,
                showOnlineStatus: true,
                showLastSeen: true,
                theme: 'dark',
                colorTheme: 'purple',
                onlineStatusMode: 'auto'
            };
            
            await setDoc(userRef, userDoc);
            
            // Create username mapping
            await setDoc(doc(db, "usernames", username), {
                uid: uid,
                createdAt: serverTimestamp()
            });
            
            return { success: true };
        } catch (error) {
            console.error('Create user document error:', error);
            return { success: false, error: error.message };
        }
    }
    
    async getUserDocument(uid) {
        try {
            const userRef = doc(db, "users", uid);
            const userDoc = await getDoc(userRef);
            
            if (userDoc.exists()) {
                return { success: true, data: userDoc.data() };
            } else {
                return { success: false, error: 'User not found' };
            }
        } catch (error) {
            console.error('Get user document error:', error);
            return { success: false, error: error.message };
        }
    }
    
    async updateUserDocument(uid, updates) {
        try {
            const userRef = doc(db, "users", uid);
            
            // If updating username, update the username mapping
            if (updates.username) {
                const currentUser = await this.getUserDocument(uid);
                if (currentUser.success && currentUser.data.username !== updates.username) {
                    const batch = writeBatch(db);
                    
                    // Delete old username mapping
                    if (currentUser.data.username) {
                        batch.delete(doc(db, "usernames", currentUser.data.username));
                    }
                    
                    // Create new username mapping
                    batch.set(doc(db, "usernames", updates.username), {
                        uid: uid,
                        updatedAt: serverTimestamp()
                    });
                    
                    await batch.commit();
                }
            }
            
            await updateDoc(userRef, {
                ...updates,
                updatedAt: serverTimestamp()
            });
            
            return { success: true };
        } catch (error) {
            console.error('Update user document error:', error);
            return { success: false, error: error.message };
        }
    }
    
    async deleteUserData(uid) {
        try {
            const batch = writeBatch(db);
            
            // Delete user document
            batch.delete(doc(db, "users", uid));
            
            // Get user document to delete username mapping
            const userDoc = await this.getUserDocument(uid);
            if (userDoc.success && userDoc.data.username) {
                batch.delete(doc(db, "usernames", userDoc.data.username));
            }
            
            // Delete user's chats
            const chatsQuery = query(
                collection(db, "chats"),
                where("members", "array-contains", uid)
            );
            
            const chatsSnapshot = await getDocs(chatsQuery);
            chatsSnapshot.forEach(chatDoc => {
                batch.delete(chatDoc.ref);
            });
            
            // Delete chat requests
            const requestsQuery = query(
                collection(db, "chatRequests"),
                where("fromUserId", "==", uid)
            );
            
            const requestsSnapshot = await getDocs(requestsQuery);
            requestsSnapshot.forEach(requestDoc => {
                batch.delete(requestDoc.ref);
            });
            
            await batch.commit();
            return { success: true };
        } catch (error) {
            console.error('Delete user data error:', error);
            return { success: false, error: error.message };
        }
    }
    
    async updateUserStatus(uid, isOnline) {
        try {
            const updates = {
                isOnline,
                lastSeen: serverTimestamp()
            };
            
            return await this.updateUserDocument(uid, updates);
        } catch (error) {
            console.error('Update user status error:', error);
            return { success: false, error: error.message };
        }
    }
    
    async updateTypingStatus(uid, chatId, isTyping) {
        try {
            const updates = {
                typingIn: isTyping ? chatId : null
            };
            
            return await this.updateUserDocument(uid, updates);
        } catch (error) {
            console.error('Update typing status error:', error);
            return { success: false, error: error.message };
        }
    }
    
    // ===== CHAT MANAGEMENT =====
    
    async createChat(userId1, userId2) {
        try {
            const chatId = utils.generateChatId(userId1, userId2);
            const chatRef = doc(db, "chats", chatId);
            
            const chatDoc = {
                id: chatId,
                members: [userId1, userId2],
                lastMessage: "",
                lastMessageTime: null,
                unreadCount: {
                    [userId1]: 0,
                    [userId2]: 0
                },
                createdAt: serverTimestamp(),
                typing: {}
            };
            
            await setDoc(chatRef, chatDoc);
            
            return { success: true, chatId };
        } catch (error) {
            console.error('Create chat error:', error);
            return { success: false, error: error.message };
        }
    }
    
    async getChat(chatId) {
        try {
            const chatRef = doc(db, "chats", chatId);
            const chatDoc = await getDoc(chatRef);
            
            if (chatDoc.exists()) {
                return { success: true, data: chatDoc.data() };
            } else {
                return { success: false, error: 'Chat not found' };
            }
        } catch (error) {
            console.error('Get chat error:', error);
            return { success: false, error: error.message };
        }
    }
    
    async getUserChats(userId) {
        try {
            const chatsQuery = query(
                collection(db, "chats"),
                where("members", "array-contains", userId)
            );
            
            const chatsSnapshot = await getDocs(chatsQuery);
            const chats = [];
            
            for (const chatDoc of chatsSnapshot.docs) {
                const chatData = chatDoc.data();
                const otherUserId = chatData.members.find(id => id !== userId);
                
                if (otherUserId) {
                    const otherUser = await this.getUserDocument(otherUserId);
                    
                    if (otherUser.success) {
                        chats.push({
                            id: chatDoc.id,
                            ...chatData,
                            otherUser: otherUser.data
                        });
                    }
                }
            }
            
            // Sort chats by last message time
            chats.sort((a, b) => {
                const timeA = a.lastMessageTime?.toDate?.() || a.createdAt?.toDate?.() || new Date(0);
                const timeB = b.lastMessageTime?.toDate?.() || b.createdAt?.toDate?.() || new Date(0);
                return timeB - timeA;
            });
            
            return { success: true, chats };
        } catch (error) {
            console.error('Get user chats error:', error);
            return { success: false, error: error.message };
        }
    }
    
    async sendMessage(chatId, senderId, text) {
        try {
            const messagesRef = collection(db, "chats", chatId, "messages");
            const chatRef = doc(db, "chats", chatId);
            
            const messageData = {
                text,
                senderId,
                timestamp: serverTimestamp(),
                read: false,
                deletedFor: [],
                edited: false,
                reactions: []
            };
            
            // Add message
            const messageRef = await addDoc(messagesRef, messageData);
            
            // Update chat
            const chat = await this.getChat(chatId);
            if (chat.success) {
                const otherUserId = chat.data.members.find(id => id !== senderId);
                
                await updateDoc(chatRef, {
                    lastMessage: text,
                    lastMessageTime: serverTimestamp(),
                    [`unreadCount.${otherUserId}`]: increment(1)
                });
            }
            
            return { success: true, messageId: messageRef.id };
        } catch (error) {
            console.error('Send message error:', error);
            return { success: false, error: error.message };
        }
    }
    
    async getChatMessages(chatId) {
        try {
            const messagesQuery = query(
                collection(db, "chats", chatId, "messages"),
                orderBy("timestamp", "asc")
            );
            
            const messagesSnapshot = await getDocs(messagesQuery);
            const messages = [];
            
            messagesSnapshot.forEach(doc => {
                messages.push({
                    id: doc.id,
                    ...doc.data()
                });
            });
            
            return { success: true, messages };
        } catch (error) {
            console.error('Get chat messages error:', error);
            return { success: false, error: error.message };
        }
    }
    
    async markMessagesAsRead(chatId, userId) {
        try {
            const messagesQuery = query(
                collection(db, "chats", chatId, "messages"),
                where("senderId", "!=", userId),
                where("read", "==", false)
            );
            
            const messagesSnapshot = await getDocs(messagesQuery);
            const batch = writeBatch(db);
            
            messagesSnapshot.forEach(doc => {
                batch.update(doc.ref, { 
                    read: true,
                    readAt: serverTimestamp()
                });
            });
            
            if (!messagesSnapshot.empty) {
                await batch.commit();
            }
            
            // Reset unread count
            const chatRef = doc(db, "chats", chatId);
            await updateDoc(chatRef, {
                [`unreadCount.${userId}`]: 0
            });
            
            return { success: true };
        } catch (error) {
            console.error('Mark messages as read error:', error);
            return { success: false, error: error.message };
        }
    }
    
    async editMessage(chatId, messageId, newText) {
        try {
            const messageRef = doc(db, "chats", chatId, "messages", messageId);
            
            await updateDoc(messageRef, {
                text: newText,
                edited: true,
                editedAt: serverTimestamp()
            });
            
            return { success: true };
        } catch (error) {
            console.error('Edit message error:', error);
            return { success: false, error: error.message };
        }
    }
    
    async deleteMessage(chatId, messageId, userId, deleteForEveryone = false) {
        try {
            if (deleteForEveryone) {
                // Check if user is the sender
                const messageRef = doc(db, "chats", chatId, "messages", messageId);
                const messageDoc = await getDoc(messageRef);
                
                if (messageDoc.exists() && messageDoc.data().senderId === userId) {
                    await deleteDoc(messageRef);
                    return { success: true };
                } else {
                    return { success: false, error: 'لا يمكنك حذف رسائل الآخرين' };
                }
            } else {
                // Delete for me only
                const messageRef = doc(db, "chats", chatId, "messages", messageId);
                
                await updateDoc(messageRef, {
                    deletedFor: arrayUnion(userId)
                });
                
                return { success: true };
            }
        } catch (error) {
            console.error('Delete message error:', error);
            return { success: false, error: error.message };
        }
    }
    
    async clearChat(chatId, userId) {
        try {
            const messagesQuery = query(
                collection(db, "chats", chatId, "messages")
            );
            
            const messagesSnapshot = await getDocs(messagesQuery);
            const batch = writeBatch(db);
            
            messagesSnapshot.forEach(doc => {
                batch.update(doc.ref, {
                    deletedFor: arrayUnion(userId)
                });
            });
            
            if (!messagesSnapshot.empty) {
                await batch.commit();
            }
            
            // Update chat
            const chatRef = doc(db, "chats", chatId);
            await updateDoc(chatRef, {
                lastMessage: "",
                lastMessageTime: null,
                [`unreadCount.${userId}`]: 0
            });
            
            return { success: true };
        } catch (error) {
            console.error('Clear chat error:', error);
            return { success: false, error: error.message };
        }
    }
    
    // ===== CHAT REQUESTS =====
    
    async sendChatRequest(fromUserId, toUserId, message = '') {
        try {
            // Check if request already exists
            const existingRequest = await this.getChatRequest(fromUserId, toUserId);
            if (existingRequest.success && existingRequest.data) {
                return { success: false, error: 'تم إرسال طلب المحادثة مسبقاً' };
            }
            
            // Check if chat already exists
            const chatId = utils.generateChatId(fromUserId, toUserId);
            const chat = await this.getChat(chatId);
            if (chat.success) {
                return { success: false, error: 'المحادثة موجودة بالفعل' };
            }
            
            // Create request
            const requestsRef = collection(db, "chatRequests");
            
            const requestData = {
                fromUserId,
                toUserId,
                message,
                status: 'pending', // pending, accepted, rejected, blocked
                createdAt: serverTimestamp(),
                updatedAt: serverTimestamp()
            };
            
            await addDoc(requestsRef, requestData);
            
            return { success: true };
        } catch (error) {
            console.error('Send chat request error:', error);
            return { success: false, error: error.message };
        }
    }
    
    async getChatRequest(fromUserId, toUserId) {
        try {
            const requestsQuery = query(
                collection(db, "chatRequests"),
                where("fromUserId", "==", fromUserId),
                where("toUserId", "==", toUserId),
                limit(1)
            );
            
            const requestsSnapshot = await getDocs(requestsQuery);
            
            if (!requestsSnapshot.empty) {
                const requestDoc = requestsSnapshot.docs[0];
                return { 
                    success: true, 
                    data: {
                        id: requestDoc.id,
                        ...requestDoc.data()
                    }
                };
            }
            
            return { success: false, data: null };
        } catch (error) {
            console.error('Get chat request error:', error);
            return { success: false, error: error.message };
        }
    }
    
    async getUserChatRequests(userId, type = 'incoming') {
        try {
            let requestsQuery;
            
            if (type === 'incoming') {
                requestsQuery = query(
                    collection(db, "chatRequests"),
                    where("toUserId", "==", userId),
                    where("status", "==", "pending"),
                    orderBy("createdAt", "desc")
                );
            } else {
                requestsQuery = query(
                    collection(db, "chatRequests"),
                    where("fromUserId", "==", userId),
                    where("status", "in", ["pending", "accepted", "rejected"]),
                    orderBy("createdAt", "desc")
                );
            }
            
            const requestsSnapshot = await getDocs(requestsQuery);
            const requests = [];
            
            for (const requestDoc of requestsSnapshot.docs) {
                const requestData = requestDoc.data();
                
                // Get user info
                const userIdToFetch = type === 'incoming' ? requestData.fromUserId : requestData.toUserId;
                const user = await this.getUserDocument(userIdToFetch);
                
                if (user.success) {
                    requests.push({
                        id: requestDoc.id,
                        ...requestData,
                        user: user.data
                    });
                }
            }
            
            return { success: true, requests };
        } catch (error) {
            console.error('Get user chat requests error:', error);
            return { success: false, error: error.message };
        }
    }
    
    async respondToChatRequest(requestId, response, userId) {
        try {
            const requestRef = doc(db, "chatRequests", requestId);
            const requestDoc = await getDoc(requestRef);
            
            if (!requestDoc.exists()) {
                return { success: false, error: 'طلب المحادثة غير موجود' };
            }
            
            const requestData = requestDoc.data();
            
            if (requestData.toUserId !== userId) {
                return { success: false, error: 'ليس لديك صلاحية الرد على هذا الطلب' };
            }
            
            const updates = {
                status: response,
                updatedAt: serverTimestamp(),
                respondedAt: serverTimestamp()
            };
            
            await updateDoc(requestRef, updates);
            
            // If accepted, create chat
            if (response === 'accepted') {
                await this.createChat(requestData.fromUserId, requestData.toUserId);
            }
            
            return { success: true };
        } catch (error) {
            console.error('Respond to chat request error:', error);
            return { success: false, error: error.message };
        }
    }
    
    async blockUserFromRequest(requestId, userId) {
        try {
            const requestRef = doc(db, "chatRequests", requestId);
            const requestDoc = await getDoc(requestRef);
            
            if (!requestDoc.exists()) {
                return { success: false, error: 'طلب المحادثة غير موجود' };
            }
            
            const requestData = requestDoc.data();
            
            if (requestData.toUserId !== userId) {
                return { success: false, error: 'ليس لديك صلاحية حظر هذا المستخدم' };
            }
            
            // Update request status to blocked
            await updateDoc(requestRef, {
                status: 'blocked',
                updatedAt: serverTimestamp()
            });
            
            // Add to blocked users
            await this.toggleBlockUser(userId, requestData.fromUserId);
            
            return { success: true };
        } catch (error) {
            console.error('Block user from request error:', error);
            return { success: false, error: error.message };
        }
    }
    
    // ===== BLOCK SYSTEM =====
    
    async toggleBlockUser(userId, targetUserId) {
        try {
            const userRef = doc(db, "users", userId);
            const userDoc = await getDoc(userRef);
            
            if (!userDoc.exists()) {
                return { success: false, error: 'المستخدم غير موجود' };
            }
            
            const userData = userDoc.data();
            const blockedUsers = userData.blockedUsers || [];
            
            let action;
            
            if (blockedUsers.includes(targetUserId)) {
                // Unblock
                await updateDoc(userRef, {
                    blockedUsers: arrayRemove(targetUserId)
                });
                action = 'unblocked';
            } else {
                // Block
                await updateDoc(userRef, {
                    blockedUsers: arrayUnion(targetUserId)
                });
                action = 'blocked';
                
                // Delete any existing chat
                const chatId = utils.generateChatId(userId, targetUserId);
                const chat = await this.getChat(chatId);
                
                if (chat.success) {
                    await deleteDoc(doc(db, "chats", chatId));
                }
                
                // Reject any pending requests
                const requestsQuery = query(
                    collection(db, "chatRequests"),
                    where("fromUserId", "==", targetUserId),
                    where("toUserId", "==", userId),
                    where("status", "==", "pending")
                );
                
                const requestsSnapshot = await getDocs(requestsQuery);
                const batch = writeBatch(db);
                
                requestsSnapshot.forEach(requestDoc => {
                    batch.update(requestDoc.ref, {
                        status: 'blocked',
                        updatedAt: serverTimestamp()
                    });
                });
                
                if (!requestsSnapshot.empty) {
                    await batch.commit();
                }
            }
            
            return { success: true, action };
        } catch (error) {
            console.error('Toggle block user error:', error);
            return { success: false, error: error.message };
        }
    }
    
    async getBlockedUsers(userId) {
        try {
            const userDoc = await this.getUserDocument(userId);
            
            if (!userDoc.success) {
                return { success: false, error: userDoc.error };
            }
            
            const blockedUserIds = userDoc.data.blockedUsers || [];
            const blockedUsers = [];
            
            for (const blockedUserId of blockedUserIds) {
                const blockedUser = await this.getUserDocument(blockedUserId);
                if (blockedUser.success) {
                    blockedUsers.push(blockedUser.data);
                }
            }
            
            return { success: true, users: blockedUsers };
        } catch (error) {
            console.error('Get blocked users error:', error);
            return { success: false, error: error.message };
        }
    }
    
    async isUserBlocked(userId, targetUserId) {
        try {
            const userDoc = await this.getUserDocument(userId);
            
            if (!userDoc.success) {
                return { success: false, error: userDoc.error };
            }
            
            const blockedUsers = userDoc.data.blockedUsers || [];
            const isBlocked = blockedUsers.includes(targetUserId);
            
            return { success: true, isBlocked };
        } catch (error) {
            console.error('Check if user blocked error:', error);
            return { success: false, error: error.message };
        }
    }
    
    // ===== SEARCH =====
    
    async searchUsers(queryText, excludeUserId) {
        try {
            if (!queryText.trim()) {
                return { success: true, users: [] };
            }
            
            // Search by username
            const usernameQuery = query(
                collection(db, "users"),
                where("username", ">=", queryText.toLowerCase()),
                where("username", "<=", queryText.toLowerCase() + '\uf8ff'),
                limit(10)
            );
            
            const usernameSnapshot = await getDocs(usernameQuery);
            const users = [];
            const seenUserIds = new Set();
            
            // Add username results
            usernameSnapshot.forEach(doc => {
                const userData = doc.data();
                if (userData.uid !== excludeUserId && !seenUserIds.has(userData.uid)) {
                    users.push(userData);
                    seenUserIds.add(userData.uid);
                }
            });
            
            // Search by name (if we need more results)
            if (users.length < 10) {
                const nameQuery = query(
                    collection(db, "users"),
                    where("name", ">=", queryText),
                    where("name", "<=", queryText + '\uf8ff'),
                    limit(10 - users.length)
                );
                
                const nameSnapshot = await getDocs(nameQuery);
                
                nameSnapshot.forEach(doc => {
                    const userData = doc.data();
                    if (userData.uid !== excludeUserId && !seenUserIds.has(userData.uid)) {
                        users.push(userData);
                        seenUserIds.add(userData.uid);
                    }
                });
            }
            
            return { success: true, users };
        } catch (error) {
            console.error('Search users error:', error);
            return { success: false, error: error.message };
        }
    }
    
    // ===== REAL-TIME LISTENERS =====
    
    setupAuthListener(callback) {
        return onAuthStateChanged(auth, async (user) => {
            if (user) {
                this.currentUser = user;
                
                // Get user document
                const userDoc = await this.getUserDocument(user.uid);
                if (userDoc.success) {
                    this.currentUserData = userDoc.data;
                }
                
                // Update online status
                await this.updateUserStatus(user.uid, true);
            } else {
                this.currentUser = null;
                this.currentUserData = null;
            }
            
            if (callback) callback(user);
        });
    }
    
    setupUserListener(userId, callback) {
        const userRef = doc(db, "users", userId);
        
        const unsubscribe = onSnapshot(userRef, (doc) => {
            if (doc.exists()) {
                const userData = doc.data();
                this.currentUserData = userData;
                
                if (callback) callback(userData);
            }
        });
        
        this.unsubscribers.set(`user_${userId}`, unsubscribe);
        return unsubscribe;
    }
    
    setupChatsListener(userId, callback) {
        const chatsQuery = query(
            collection(db, "chats"),
            where("members", "array-contains", userId)
        );
        
        const unsubscribe = onSnapshot(chatsQuery, async (snapshot) => {
            const chats = [];
            
            for (const chatDoc of snapshot.docs) {
                const chatData = chatDoc.data();
                const otherUserId = chatData.members.find(id => id !== userId);
                
                if (otherUserId) {
                    const otherUser = await this.getUserDocument(otherUserId);
                    
                    if (otherUser.success) {
                        chats.push({
                            id: chatDoc.id,
                            ...chatData,
                            otherUser: otherUser.data
                        });
                    }
                }
            }
            
            if (callback) callback(chats);
        });
        
        this.unsubscribers.set(`chats_${userId}`, unsubscribe);
        return unsubscribe;
    }
    
    setupMessagesListener(chatId, callback) {
        const messagesQuery = query(
            collection(db, "chats", chatId, "messages"),
            orderBy("timestamp", "asc")
        );
        
        const unsubscribe = onSnapshot(messagesQuery, (snapshot) => {
            const messages = [];
            
            snapshot.forEach(doc => {
                messages.push({
                    id: doc.id,
                    ...doc.data()
                });
            });
            
            if (callback) callback(messages);
        });
        
        this.unsubscribers.set(`messages_${chatId}`, unsubscribe);
        return unsubscribe;
    }
    
    setupChatRequestsListener(userId, type, callback) {
        let requestsQuery;
        
        if (type === 'incoming') {
            requestsQuery = query(
                collection(db, "chatRequests"),
                where("toUserId", "==", userId),
                where("status", "==", "pending"),
                orderBy("createdAt", "desc")
            );
        } else {
            requestsQuery = query(
                collection(db, "chatRequests"),
                where("fromUserId", "==", userId),
                orderBy("createdAt", "desc")
            );
        }
        
        const unsubscribe = onSnapshot(requestsQuery, async (snapshot) => {
            const requests = [];
            
            for (const requestDoc of snapshot.docs) {
                const requestData = requestDoc.data();
                const userIdToFetch = type === 'incoming' ? requestData.fromUserId : requestData.toUserId;
                const user = await this.getUserDocument(userIdToFetch);
                
                if (user.success) {
                    requests.push({
                        id: requestDoc.id,
                        ...requestData,
                        user: user.data
                    });
                }
            }
            
            if (callback) callback(requests);
        });
        
        this.unsubscribers.set(`requests_${userId}_${type}`, unsubscribe);
        return unsubscribe;
    }
    
    // ===== UTILITY METHODS =====
    
    handleAuthError(error) {
        switch (error.code) {
            case 'auth/email-already-in-use':
                return 'البريد الإلكتروني مستخدم بالفعل';
            case 'auth/invalid-email':
                return 'بريد إلكتروني غير صالح';
            case 'auth/operation-not-allowed':
                return 'العملية غير مسموحة';
            case 'auth/weak-password':
                return 'كلمة المرور ضعيفة';
            case 'auth/user-disabled':
                return 'الحساب معطل';
            case 'auth/user-not-found':
                return 'المستخدم غير موجود';
            case 'auth/wrong-password':
                return 'كلمة المرور غير صحيحة';
            case 'auth/too-many-requests':
                return 'تم إرسال طلبات كثيرة، يرجى المحاولة لاحقاً';
            case 'auth/requires-recent-login':
                return 'يجب تسجيل الدخول مرة أخرى';
            default:
                return 'حدث خطأ غير متوقع';
        }
    }
    
    cleanupListeners() {
        this.unsubscribers.forEach(unsubscribe => {
            unsubscribe();
        });
        this.unsubscribers.clear();
    }
    
    getCurrentUser() {
        return this.currentUser;
    }
    
    getCurrentUserData() {
        return this.currentUserData;
    }
    
    setCurrentUserData(userData) {
        this.currentUserData = userData;
    }
}

// Create global Firebase service instance
const firebaseService = new FirebaseService();

// Export for use in other modules
export default firebaseService;
