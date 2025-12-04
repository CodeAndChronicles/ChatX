// js/realtime.js
import firebaseService from './firebase.js';
import utils from './utils.js';

class RealTimeService {
    constructor() {
        this.listeners = new Map();
        this.updateIntervals = new Map();
        this.typingTimeouts = new Map();
        this.isTyping = false;
        this.lastSeenUpdate = null;
    }
    
    // ===== USER STATUS UPDATES =====
    
    async updateUserOnlineStatus(userId, isOnline) {
        try {
            const result = await firebaseService.updateUserStatus(userId, isOnline);
            if (result.success) {
                utils.createToast(isOnline ? 'أنت الآن متصل' : 'أنت الآن غير متصل', 'success');
            }
            return result;
        } catch (error) {
            console.error('Update online status error:', error);
            return { success: false, error: error.message };
        }
    }
    
    setupUserStatusUpdates(userId, mode = 'auto') {
        // Clear existing interval
        if (this.updateIntervals.has('status')) {
            clearInterval(this.updateIntervals.get('status'));
        }
        
        if (mode === 'auto') {
            // Update last seen every minute
            const interval = setInterval(async () => {
                await firebaseService.updateUserDocument(userId, {
                    lastSeen: firebaseService.serverTimestamp
                });
            }, 60000); // Every minute
            
            this.updateIntervals.set('status', interval);
            
            // Update on visibility change
            document.addEventListener('visibilitychange', async () => {
                if (document.hidden) {
                    await this.updateUserOnlineStatus(userId, false);
                } else {
                    await this.updateUserOnlineStatus(userId, true);
                }
            });
        } else if (mode === 'online') {
            // Keep user online
            this.updateUserOnlineStatus(userId, true);
        } else if (mode === 'offline') {
            // Keep user offline
            this.updateUserOnlineStatus(userId, false);
        }
    }
    
    // ===== TYPING INDICATOR =====
    
    async startTyping(userId, chatId) {
        if (this.isTyping) return;
        
        this.isTyping = true;
        
        // Clear existing timeout
        if (this.typingTimeouts.has(chatId)) {
            clearTimeout(this.typingTimeouts.get(chatId));
        }
        
        // Update typing status
        await firebaseService.updateTypingStatus(userId, chatId, true);
        
        // Set timeout to stop typing
        const timeout = setTimeout(async () => {
            await this.stopTyping(userId, chatId);
        }, 3000); // Stop after 3 seconds of inactivity
        
        this.typingTimeouts.set(chatId, timeout);
    }
    
    async stopTyping(userId, chatId) {
        if (!this.isTyping) return;
        
        this.isTyping = false;
        
        // Clear timeout
        if (this.typingTimeouts.has(chatId)) {
            clearTimeout(this.typingTimeouts.get(chatId));
            this.typingTimeouts.delete(chatId);
        }
        
        // Update typing status
        await firebaseService.updateTypingStatus(userId, chatId, false);
    }
    
    // ===== MESSAGE STATUS UPDATES =====
    
    async markMessageAsRead(chatId, messageId, userId) {
        try {
            const messageRef = firebaseService.db.doc(`chats/${chatId}/messages/${messageId}`);
            
            await firebaseService.db.runTransaction(async (transaction) => {
                const messageDoc = await transaction.get(messageRef);
                
                if (!messageDoc.exists()) {
                    throw new Error('Message not found');
                }
                
                const messageData = messageDoc.data();
                
                // Only mark as read if not already read and not sent by current user
                if (messageData.senderId !== userId && !messageData.read) {
                    transaction.update(messageRef, {
                        read: true,
                        readAt: firebaseService.serverTimestamp
                    });
                }
            });
            
            return { success: true };
        } catch (error) {
            console.error('Mark message as read error:', error);
            return { success: false, error: error.message };
        }
    }
    
    async markAllMessagesAsRead(chatId, userId) {
        try {
            const result = await firebaseService.markMessagesAsRead(chatId, userId);
            return result;
        } catch (error) {
            console.error('Mark all messages as read error:', error);
            return { success: false, error: error.message };
        }
    }
    
    // ===== REAL-TIME CHAT UPDATES =====
    
    setupChatUpdates(chatId, userId, callbacks = {}) {
        // Setup messages listener
        const messagesUnsubscribe = firebaseService.setupMessagesListener(chatId, (messages) => {
            if (callbacks.onMessagesUpdate) {
                callbacks.onMessagesUpdate(messages);
            }
            
            // Mark new messages as read
            const unreadMessages = messages.filter(msg => 
                msg.senderId !== userId && !msg.read
            );
            
            if (unreadMessages.length > 0) {
                this.markAllMessagesAsRead(chatId, userId);
            }
        });
        
        // Setup chat listener
        const chatUnsubscribe = firebaseService.db
            .collection('chats')
            .doc(chatId)
            .onSnapshot((doc) => {
                if (doc.exists() && callbacks.onChatUpdate) {
                    callbacks.onChatUpdate(doc.data());
                }
            });
        
        // Store listeners for cleanup
        this.listeners.set(`chat_${chatId}`, {
            messages: messagesUnsubscribe,
            chat: chatUnsubscribe
        });
        
        return () => {
            messagesUnsubscribe();
            chatUnsubscribe();
            this.listeners.delete(`chat_${chatId}`);
        };
    }
    
    // ===== REAL-TIME USER UPDATES =====
    
    setupUserUpdates(userId, callbacks = {}) {
        const unsubscribe = firebaseService.setupUserListener(userId, (userData) => {
            if (callbacks.onUserUpdate) {
                callbacks.onUserUpdate(userData);
            }
        });
        
        this.listeners.set(`user_${userId}`, unsubscribe);
        
        return unsubscribe;
    }
    
    // ===== REAL-TIME CHATS LIST UPDATES =====
    
    setupChatsListUpdates(userId, callbacks = {}) {
        const unsubscribe = firebaseService.setupChatsListener(userId, async (chats) => {
            // Get blocked users
            const blockedResult = await firebaseService.getBlockedUsers(userId);
            const blockedUsers = blockedResult.success ? blockedResult.users : [];
            const blockedUserIds = blockedUsers.map(user => user.uid);
            
            // Filter out blocked users and sort
            const filteredChats = chats.filter(chat => {
                const otherUserId = chat.members.find(id => id !== userId);
                return !blockedUserIds.includes(otherUserId);
            });
            
            // Sort chats
            filteredChats.sort((a, b) => {
                // Pinned chats first
                const userData = firebaseService.getCurrentUserData();
                const pinnedChats = userData?.pinnedChats || [];
                
                const aIsPinned = pinnedChats.includes(a.id);
                const bIsPinned = pinnedChats.includes(b.id);
                
                if (aIsPinned && !bIsPinned) return -1;
                if (!aIsPinned && bIsPinned) return 1;
                
                // Unread chats next
                const aUnread = a.unreadCount?.[userId] || 0;
                const bUnread = b.unreadCount?.[userId] || 0;
                
                if (aUnread > 0 && bUnread === 0) return -1;
                if (aUnread === 0 && bUnread > 0) return 1;
                
                // Then by last message time
                const timeA = a.lastMessageTime?.toDate?.() || a.createdAt?.toDate?.() || new Date(0);
                const timeB = b.lastMessageTime?.toDate?.() || b.createdAt?.toDate?.() || new Date(0);
                
                return timeB - timeA;
            });
            
            if (callbacks.onChatsUpdate) {
                callbacks.onChatsUpdate(filteredChats);
            }
        });
        
        this.listeners.set(`chats_${userId}`, unsubscribe);
        
        return unsubscribe;
    }
    
    // ===== REAL-TIME REQUESTS UPDATES =====
    
    setupRequestsUpdates(userId, type = 'incoming', callbacks = {}) {
        const unsubscribe = firebaseService.setupChatRequestsListener(userId, type, (requests) => {
            if (callbacks.onRequestsUpdate) {
                callbacks.onRequestsUpdate(requests);
            }
        });
        
        this.listeners.set(`requests_${userId}_${type}`, unsubscribe);
        
        return unsubscribe;
    }
    
    // ===== BLOCK SYSTEM UPDATES =====
    
    setupBlockUpdates(userId, callbacks = {}) {
        // Check for block changes every 30 seconds
        let lastBlockedUsers = [];
        
        const interval = setInterval(async () => {
            const result = await firebaseService.getBlockedUsers(userId);
            
            if (result.success) {
                const currentBlockedUsers = result.users;
                
                // Check for changes
                if (JSON.stringify(currentBlockedUsers) !== JSON.stringify(lastBlockedUsers)) {
                    lastBlockedUsers = currentBlockedUsers;
                    
                    if (callbacks.onBlockUpdate) {
                        callbacks.onBlockUpdate(currentBlockedUsers);
                    }
                }
            }
        }, 30000);
        
        this.updateIntervals.set(`blocks_${userId}`, interval);
        
        return () => {
            clearInterval(interval);
            this.updateIntervals.delete(`blocks_${userId}`);
        };
    }
    
    // ===== TYPING INDICATOR LISTENER =====
    
    setupTypingListener(chatId, otherUserId, callback) {
        const unsubscribe = firebaseService.db
            .collection('users')
            .doc(otherUserId)
            .onSnapshot((doc) => {
                if (doc.exists()) {
                    const userData = doc.data();
                    const isTyping = userData.typingIn === chatId;
                    
                    if (callback) {
                        callback(isTyping);
                    }
                }
            });
        
        this.listeners.set(`typing_${chatId}_${otherUserId}`, unsubscribe);
        
        return unsubscribe;
    }
    
    // ===== ONLINE STATUS LISTENER =====
    
    setupOnlineStatusListener(userId, callback) {
        const unsubscribe = firebaseService.db
            .collection('users')
            .doc(userId)
            .onSnapshot((doc) => {
                if (doc.exists()) {
                    const userData = doc.data();
                    
                    if (callback) {
                        callback({
                            isOnline: userData.isOnline,
                            lastSeen: userData.lastSeen,
                            status: userData.status
                        });
                    }
                }
            });
        
        this.listeners.set(`online_${userId}`, unsubscribe);
        
        return unsubscribe;
    }
    
    // ===== MESSAGE REACTIONS =====
    
    async addReaction(chatId, messageId, userId, emoji) {
        try {
            const messageRef = firebaseService.db.doc(`chats/${chatId}/messages/${messageId}`);
            
            await firebaseService.db.runTransaction(async (transaction) => {
                const messageDoc = await transaction.get(messageRef);
                
                if (!messageDoc.exists()) {
                    throw new Error('Message not found');
                }
                
                const messageData = messageDoc.data();
                const reactions = messageData.reactions || [];
                
                // Remove existing reaction from this user
                const filteredReactions = reactions.filter(reaction => 
                    reaction.userId !== userId || reaction.emoji !== emoji
                );
                
                // Add new reaction
                filteredReactions.push({
                    userId,
                    emoji,
                    timestamp: firebaseService.serverTimestamp
                });
                
                transaction.update(messageRef, {
                    reactions: filteredReactions
                });
            });
            
            return { success: true };
        } catch (error) {
            console.error('Add reaction error:', error);
            return { success: false, error: error.message };
        }
    }
    
    async removeReaction(chatId, messageId, userId, emoji) {
        try {
            const messageRef = firebaseService.db.doc(`chats/${chatId}/messages/${messageId}`);
            
            await firebaseService.db.runTransaction(async (transaction) => {
                const messageDoc = await transaction.get(messageRef);
                
                if (!messageDoc.exists()) {
                    throw new Error('Message not found');
                }
                
                const messageData = messageDoc.data();
                const reactions = messageData.reactions || [];
                
                // Remove reaction
                const filteredReactions = reactions.filter(reaction => 
                    !(reaction.userId === userId && reaction.emoji === emoji)
                );
                
                transaction.update(messageRef, {
                    reactions: filteredReactions
                });
            });
            
            return { success: true };
        } catch (error) {
            console.error('Remove reaction error:', error);
            return { success: false, error: error.message };
        }
    }
    
    // ===== MESSAGE EDITS =====
    
    async editMessage(chatId, messageId, newText, userId) {
        try {
            // Check if user is the sender
            const messageRef = firebaseService.db.doc(`chats/${chatId}/messages/${messageId}`);
            const messageDoc = await messageRef.get();
            
            if (!messageDoc.exists()) {
                return { success: false, error: 'Message not found' };
            }
            
            const messageData = messageDoc.data();
            
            if (messageData.senderId !== userId) {
                return { success: false, error: 'لا يمكنك تعديل رسائل الآخرين' };
            }
            
            const result = await firebaseService.editMessage(chatId, messageId, newText);
            return result;
        } catch (error) {
            console.error('Edit message error:', error);
            return { success: false, error: error.message };
        }
    }
    
    // ===== MESSAGE DELETION =====
    
    async deleteMessage(chatId, messageId, userId, deleteForEveryone = false) {
        try {
            const result = await firebaseService.deleteMessage(chatId, messageId, userId, deleteForEveryone);
            return result;
        } catch (error) {
            console.error('Delete message error:', error);
            return { success: false, error: error.message };
        }
    }
    
    // ===== CHAT MANAGEMENT =====
    
    async pinChat(userId, chatId) {
        try {
            const userData = firebaseService.getCurrentUserData();
            const pinnedChats = userData?.pinnedChats || [];
            
            let updatedPinnedChats;
            let action;
            
            if (pinnedChats.includes(chatId)) {
                // Unpin
                updatedPinnedChats = pinnedChats.filter(id => id !== chatId);
                action = 'unpinned';
            } else {
                // Pin
                updatedPinnedChats = [...pinnedChats, chatId];
                action = 'pinned';
            }
            
            const result = await firebaseService.updateUserDocument(userId, {
                pinnedChats: updatedPinnedChats
            });
            
            if (result.success) {
                utils.createToast(
                    action === 'pinned' ? 'تم تثبيت المحادثة' : 'تم إلغاء تثبيت المحادثة',
                    'success'
                );
            }
            
            return { success: result.success, action };
        } catch (error) {
            console.error('Pin chat error:', error);
            return { success: false, error: error.message };
        }
    }
    
    async muteChat(userId, chatId, duration = null) {
        try {
            const userData = firebaseService.getCurrentUserData();
            const mutedChats = userData?.mutedChats || {};
            
            let updatedMutedChats = { ...mutedChats };
            let action;
            
            if (mutedChats[chatId]) {
                // Unmute
                delete updatedMutedChats[chatId];
                action = 'unmuted';
            } else {
                // Mute
                updatedMutedChats[chatId] = duration ? 
                    Date.now() + (duration * 60 * 60 * 1000) : 
                    'forever';
                action = 'muted';
            }
            
            const result = await firebaseService.updateUserDocument(userId, {
                mutedChats: updatedMutedChats
            });
            
            if (result.success) {
                const message = action === 'muted' 
                    ? (duration ? `تم كتم المحادثة لمدة ${duration} ساعة` : 'تم كتم المحادثة')
                    : 'تم إلغاء كتم المحادثة';
                
                utils.createToast(message, 'success');
            }
            
            return { success: result.success, action };
        } catch (error) {
            console.error('Mute chat error:', error);
            return { success: false, error: error.message };
        }
    }
    
    async clearChatHistory(chatId, userId) {
        try {
            const result = await firebaseService.clearChat(chatId, userId);
            
            if (result.success) {
                utils.createToast('تم مسح سجل المحادثة', 'success');
            }
            
            return result;
        } catch (error) {
            console.error('Clear chat history error:', error);
            return { success: false, error: error.message };
        }
    }
    
    // ===== USER SEARCH =====
    
    async searchUsersRealTime(query, excludeUserId) {
        try {
            const result = await firebaseService.searchUsers(query, excludeUserId);
            return result;
        } catch (error) {
            console.error('Search users real-time error:', error);
            return { success: false, error: error.message };
        }
    }
    
    // ===== CHAT REQUESTS =====
    
    async sendChatRequestRealTime(fromUserId, toUserId, message = '') {
        try {
            // Check if user is blocked
            const blockedResult = await firebaseService.isUserBlocked(toUserId, fromUserId);
            
            if (blockedResult.success && blockedResult.isBlocked) {
                return { 
                    success: false, 
                    error: 'لا يمكنك إرسال طلب محادثة إلى هذا المستخدم' 
                };
            }
            
            const result = await firebaseService.sendChatRequest(fromUserId, toUserId, message);
            
            if (result.success) {
                utils.createToast('تم إرسال طلب المحادثة', 'success');
            }
            
            return result;
        } catch (error) {
            console.error('Send chat request real-time error:', error);
            return { success: false, error: error.message };
        }
    }
    
    async respondToChatRequestRealTime(requestId, response, userId) {
        try {
            const result = await firebaseService.respondToChatRequest(requestId, response, userId);
            
            if (result.success) {
                const message = response === 'accepted' 
                    ? 'تم قبول طلب المحادثة' 
                    : 'تم رفض طلب المحادثة';
                
                utils.createToast(message, 'success');
            }
            
            return result;
        } catch (error) {
            console.error('Respond to chat request real-time error:', error);
            return { success: false, error: error.message };
        }
    }
    
    async blockUserRealTime(requestId, userId) {
        try {
            const result = await firebaseService.blockUserFromRequest(requestId, userId);
            
            if (result.success) {
                utils.createToast('تم حظر المستخدم', 'success');
            }
            
            return result;
        } catch (error) {
            console.error('Block user real-time error:', error);
            return { success: false, error: error.message };
        }
    }
    
    // ===== CLEANUP =====
    
    cleanup() {
        // Clear all intervals
        this.updateIntervals.forEach(interval => {
            clearInterval(interval);
        });
        this.updateIntervals.clear();
        
        // Clear all timeouts
        this.typingTimeouts.forEach(timeout => {
            clearTimeout(timeout);
        });
        this.typingTimeouts.clear();
        
        // Unsubscribe all listeners
        this.listeners.forEach(unsubscribe => {
            if (typeof unsubscribe === 'function') {
                unsubscribe();
            } else if (typeof unsubscribe === 'object') {
                Object.values(unsubscribe).forEach(fn => {
                    if (typeof fn === 'function') {
                        fn();
                    }
                });
            }
        });
        this.listeners.clear();
        
        this.isTyping = false;
        this.lastSeenUpdate = null;
    }
    
    // ===== UTILITY METHODS =====
    
    getIsTyping() {
        return this.isTyping;
    }
    
    setIsTyping(isTyping) {
        this.isTyping = isTyping;
    }
    
    // Check if chat is muted
    isChatMuted(chatId) {
        const userData = firebaseService.getCurrentUserData();
        const mutedChats = userData?.mutedChats || {};
        
        if (!mutedChats[chatId]) return false;
        
        if (mutedChats[chatId] === 'forever') return true;
        
        // Check if mute duration has expired
        return Date.now() < mutedChats[chatId];
    }
    
    // Get mute time remaining
    getMuteTimeRemaining(chatId) {
        const userData = firebaseService.getCurrentUserData();
        const mutedChats = userData?.mutedChats || {};
        const muteUntil = mutedChats[chatId];
        
        if (!muteUntil || muteUntil === 'forever') return null;
        
        const timeRemaining = muteUntil - Date.now();
        if (timeRemaining <= 0) return null;
        
        const hours = Math.floor(timeRemaining / (1000 * 60 * 60));
        const minutes = Math.floor((timeRemaining % (1000 * 60 * 60)) / (1000 * 60));
        
        return { hours, minutes };
    }
    
    // Format mute time remaining
    formatMuteTimeRemaining(chatId) {
        const timeRemaining = this.getMuteTimeRemaining(chatId);
        
        if (!timeRemaining) return null;
        
        if (timeRemaining.hours > 0) {
            return `${timeRemaining.hours} ساعة و ${timeRemaining.minutes} دقيقة`;
        } else {
            return `${timeRemaining.minutes} دقيقة`;
        }
    }
}

// Create global RealTime service instance
const realTimeService = new RealTimeService();

// Export for use in other modules
export default realTimeService;
