// js/chat.js
import firebaseService from './firebase.js';
import realTimeService from './realtime.js';
import utils from './utils.js';

class ChatManager {
    constructor() {
        this.currentChatId = null;
        this.currentChatUser = null;
        this.currentUserId = null;
        this.messages = [];
        this.cleanupFunctions = new Map();
        this.messageMenu = null;
        this.selectedMessageId = null;
    }
    
    // ===== CHAT INITIALIZATION =====
    
    async initialize(userId) {
        this.currentUserId = userId;
        
        // Load initial chats
        await this.loadChats();
        
        // Setup real-time updates for chats
        this.setupChatsUpdates();
        
        // Setup event listeners
        this.setupEventListeners();
    }
    
    async loadChats() {
        try {
            const result = await firebaseService.getUserChats(this.currentUserId);
            
            if (result.success) {
                this.renderChats(result.chats);
                return result.chats;
            } else {
                utils.createToast('فشل تحميل المحادثات', 'error');
                return [];
            }
        } catch (error) {
            console.error('Load chats error:', error);
            utils.createToast('حدث خطأ في تحميل المحادثات', 'error');
            return [];
        }
    }
    
    setupChatsUpdates() {
        const cleanup = realTimeService.setupChatsListUpdates(this.currentUserId, {
            onChatsUpdate: (chats) => {
                this.renderChats(chats);
            }
        });
        
        this.cleanupFunctions.set('chats', cleanup);
    }
    
    // ===== CHAT RENDERING =====
    
    renderChats(chats) {
        const chatsList = document.getElementById('chatsList');
        if (!chatsList) return;
        
        // Clear existing chats
        utils.removeAllChildren(chatsList);
        
        if (chats.length === 0) {
            chatsList.innerHTML = `
                <div class="empty-state-compact">
                    <iconify-icon icon="mdi:chat-outline" class="empty-icon"></iconify-icon>
                    <h3>لا توجد محادثات</h3>
                    <p>ابدأ محادثة جديدة بالنقر على زر +</p>
                </div>
            `;
            return;
        }
        
        // Separate pinned and regular chats
        const userData = firebaseService.getCurrentUserData();
        const pinnedChats = userData?.pinnedChats || [];
        
        const pinned = chats.filter(chat => pinnedChats.includes(chat.id));
        const regular = chats.filter(chat => !pinnedChats.includes(chat.id));
        
        // Render pinned chats
        if (pinned.length > 0) {
            const pinnedSection = document.createElement('div');
            pinnedSection.className = 'pinned-section';
            pinnedSection.innerHTML = `
                <div class="section-title">
                    <iconify-icon icon="mdi:pin"></iconify-icon>
                    <span>المحادثات المثبتة</span>
                </div>
            `;
            chatsList.appendChild(pinnedSection);
            
            pinned.forEach(chat => {
                chatsList.appendChild(this.createChatItem(chat));
            });
            
            // Add separator
            const separator = document.createElement('div');
            separator.className = 'chats-separator';
            chatsList.appendChild(separator);
        }
        
        // Render regular chats
        regular.forEach(chat => {
            chatsList.appendChild(this.createChatItem(chat));
        });
    }
    
    createChatItem(chat) {
        const chatItem = document.createElement('div');
        chatItem.className = 'chat-item';
        chatItem.dataset.chatId = chat.id;
        
        if (chat.id === this.currentChatId) {
            chatItem.classList.add('active');
        }
        
        // Check if muted
        if (realTimeService.isChatMuted(chat.id)) {
            chatItem.classList.add('muted');
        }
        
        // Check if blocked
        const userData = firebaseService.getCurrentUserData();
        const blockedUsers = userData?.blockedUsers || [];
        if (blockedUsers.includes(chat.otherUser.uid)) {
            chatItem.classList.add('blocked');
        }
        
        // Get chat preview
        const preview = this.getChatPreview(chat);
        const time = chat.lastMessageTime ? utils.formatTime(chat.lastMessageTime) : '';
        const unreadCount = chat.unreadCount?.[this.currentUserId] || 0;
        
        chatItem.innerHTML = `
            <div class="chat-avatar">
                ${this.createAvatarElement(chat.otherUser)}
                ${this.createStatusIndicator(chat.otherUser)}
            </div>
            <div class="chat-info">
                <div class="chat-header">
                    <h4 class="chat-name">${chat.otherUser.name}</h4>
                    <span class="chat-time">${time}</span>
                </div>
                <div class="chat-preview">
                    ${this.getTypingIndicator(chat)}
                    <p class="chat-message">${preview}</p>
                    ${unreadCount > 0 ? `<span class="unread-count">${unreadCount}</span>` : ''}
                </div>
                ${this.getChatIndicators(chat)}
            </div>
        `;
        
        // Add click event
        chatItem.addEventListener('click', () => this.openChat(chat.id, chat.otherUser));
        
        // Add context menu
        chatItem.addEventListener('contextmenu', (e) => {
            e.preventDefault();
            this.showChatContextMenu(e, chat);
        });
        
        return chatItem;
    }
    
    getChatPreview(chat) {
        if (chat.otherUser.typingIn === chat.id) {
            return '<span class="chat-typing">يكتب...</span>';
        }
        
        if (chat.lastMessage) {
            return utils.getMessagePreview(chat.lastMessage, 30);
        }
        
        return 'ابدأ المحادثة...';
    }
    
    getTypingIndicator(chat) {
        if (chat.otherUser.typingIn === chat.id) {
            return '<div class="typing-indicator"><div class="typing-dots"><span></span><span></span><span></span></div><span>يكتب...</span></div>';
        }
        return '';
    }
    
    getChatIndicators(chat) {
        const indicators = [];
        const userData = firebaseService.getCurrentUserData();
        
        // Pinned indicator
        const pinnedChats = userData?.pinnedChats || [];
        if (pinnedChats.includes(chat.id)) {
            indicators.push('<iconify-icon icon="mdi:pin" class="pin-indicator"></iconify-icon>');
        }
        
        // Muted indicator
        if (realTimeService.isChatMuted(chat.id)) {
            indicators.push('<iconify-icon icon="mdi:volume-off" class="muted-indicator"></iconify-icon>');
        }
        
        // Blocked indicator
        const blockedUsers = userData?.blockedUsers || [];
        if (blockedUsers.includes(chat.otherUser.uid)) {
            indicators.push('<span class="blocked-indicator">محظور</span>');
        }
        
        if (indicators.length > 0) {
            return `<div class="chat-indicators">${indicators.join('')}</div>`;
        }
        
        return '';
    }
    
    createAvatarElement(user) {
        const div = document.createElement('div');
        div.className = 'avatar';
        div.style.background = user.avatarColor || utils.getUserColor(user.uid);
        div.textContent = utils.getInitials(user.name);
        return div.outerHTML;
    }
    
    createStatusIndicator(user) {
        const showOnlineStatus = firebaseService.getCurrentUserData()?.showOnlineStatus ?? true;
        
        if (!showOnlineStatus || !user.isOnline) {
            return '<div class="status-indicator offline"></div>';
        }
        
        if (user.typingIn) {
            return '<div class="status-indicator typing"></div>';
        }
        
        return '<div class="status-indicator online"></div>';
    }
    
    // ===== CHAT OPENING =====
    
    async openChat(chatId, otherUser) {
        try {
            this.currentChatId = chatId;
            this.currentChatUser = otherUser;
            
            // Update UI
            this.showChatWindow();
            this.updateChatHeader(otherUser);
            
            // Load messages
            await this.loadMessages();
            
            // Mark messages as read
            await realTimeService.markAllMessagesAsRead(chatId, this.currentUserId);
            
            // Setup real-time updates for this chat
            this.setupChatUpdates();
            
            // Update active chat in sidebar
            this.updateActiveChatInSidebar();
            
            // Setup typing listener
            this.setupTypingListener();
            
            // Setup online status listener
            this.setupOnlineStatusListener();
            
        } catch (error) {
            console.error('Open chat error:', error);
            utils.createToast('فشل فتح المحادثة', 'error');
        }
    }
    
    showChatWindow() {
        const emptyState = document.getElementById('emptyState');
        const chatWindow = document.getElementById('chatWindow');
        const pagesContainer = document.getElementById('pagesContainer');
        
        if (emptyState) emptyState.classList.remove('active');
        if (chatWindow) chatWindow.classList.add('active');
        if (pagesContainer) pagesContainer.classList.remove('active');
        
        // Update active nav item
        document.querySelectorAll('.nav-item').forEach(item => {
            item.classList.remove('active');
        });
        document.querySelector('.nav-item[data-page="chats"]')?.classList.add('active');
    }
    
    updateChatHeader(user) {
        const chatUserName = document.getElementById('chatUserName');
        const chatUserAvatar = document.getElementById('chatUserAvatar');
        const statusText = document.getElementById('statusText');
        
        if (chatUserName) chatUserName.textContent = user.name;
        if (chatUserAvatar) {
            chatUserAvatar.textContent = utils.getInitials(user.name);
            chatUserAvatar.style.background = user.avatarColor || utils.getUserColor(user.uid);
        }
        if (statusText) {
            statusText.textContent = this.getUserStatusText(user);
        }
    }
    
    getUserStatusText(user) {
        const showOnlineStatus = firebaseService.getCurrentUserData()?.showOnlineStatus ?? true;
        const showLastSeen = firebaseService.getCurrentUserData()?.showLastSeen ?? true;
        
        if (showOnlineStatus && user.isOnline) {
            return user.status || 'متصل الآن';
        } else if (showLastSeen) {
            return `آخر ظهور ${utils.formatLastSeen(user.lastSeen, false)}`;
        } else {
            return 'غير متصل';
        }
    }
    
    async loadMessages() {
        try {
            const messagesContainer = document.getElementById('chatMessages');
            if (!messagesContainer) return;
            
            // Show loading
            messagesContainer.innerHTML = `
                <div class="loading-container">
                    <div class="loading-spinner-small"></div>
                    <p class="loading-text">جاري تحميل الرسائل...</p>
                </div>
            `;
            
            const result = await firebaseService.getChatMessages(this.currentChatId);
            
            if (result.success) {
                this.messages = result.messages;
                this.renderMessages();
            } else {
                utils.createToast('فشل تحميل الرسائل', 'error');
                messagesContainer.innerHTML = `
                    <div class="empty-state">
                        <iconify-icon icon="mdi:message-outline" class="empty-icon"></iconify-icon>
                        <h3>لا توجد رسائل</h3>
                        <p>ابدأ المحادثة الآن!</p>
                    </div>
                `;
            }
        } catch (error) {
            console.error('Load messages error:', error);
            utils.createToast('حدث خطأ في تحميل الرسائل', 'error');
        }
    }
    
    setupChatUpdates() {
        // Cleanup previous listeners
        if (this.cleanupFunctions.has('chat')) {
            this.cleanupFunctions.get('chat')();
        }
        
        const cleanup = realTimeService.setupChatUpdates(this.currentChatId, this.currentUserId, {
            onMessagesUpdate: (messages) => {
                this.messages = messages;
                this.renderMessages();
                
                // Scroll to bottom
                this.scrollToBottom();
            },
            onChatUpdate: (chatData) => {
                // Update chat info if needed
                this.updateChatInfo(chatData);
            }
        });
        
        this.cleanupFunctions.set('chat', cleanup);
    }
    
    setupTypingListener() {
        if (!this.currentChatId || !this.currentChatUser) return;
        
        // Cleanup previous listener
        if (this.cleanupFunctions.has('typing')) {
            this.cleanupFunctions.get('typing')();
        }
        
        const cleanup = realTimeService.setupTypingListener(
            this.currentChatId,
            this.currentChatUser.uid,
            (isTyping) => {
                this.updateTypingIndicator(isTyping);
            }
        );
        
        this.cleanupFunctions.set('typing', cleanup);
    }
    
    setupOnlineStatusListener() {
        if (!this.currentChatUser) return;
        
        // Cleanup previous listener
        if (this.cleanupFunctions.has('onlineStatus')) {
            this.cleanupFunctions.get('onlineStatus')();
        }
        
        const cleanup = realTimeService.setupOnlineStatusListener(
            this.currentChatUser.uid,
            (status) => {
                this.updateOnlineStatus(status);
            }
        );
        
        this.cleanupFunctions.set('onlineStatus', cleanup);
    }
    
    // ===== MESSAGES RENDERING =====
    
    renderMessages() {
        const messagesContainer = document.getElementById('chatMessages');
        if (!messagesContainer) return;
        
        // Clear existing messages
        utils.removeAllChildren(messagesContainer);
        
        if (this.messages.length === 0) {
            messagesContainer.innerHTML = `
                <div class="empty-state">
                    <iconify-icon icon="mdi:message-outline" class="empty-icon"></iconify-icon>
                    <h3>لا توجد رسائل</h3>
                    <p>ابدأ المحادثة الآن!</p>
                </div>
            `;
            return;
        }
        
        let lastDate = null;
        
        this.messages.forEach((message, index) => {
            // Skip messages deleted for current user
            if (message.deletedFor?.includes(this.currentUserId)) {
                return;
            }
            
            // Add date separator if needed
            const messageDate = message.timestamp?.toDate?.() || new Date();
            const messageDay = messageDate.toDateString();
            
            if (messageDay !== lastDate) {
                const dateSeparator = this.createDateSeparator(messageDate);
                messagesContainer.appendChild(dateSeparator);
                lastDate = messageDay;
            }
            
            // Create message element
            const messageElement = this.createMessageElement(message, index);
            messagesContainer.appendChild(messageElement);
        });
        
        // Scroll to bottom
        this.scrollToBottom();
    }
    
    createDateSeparator(date) {
        const separator = document.createElement('div');
        separator.className = 'message-date';
        separator.innerHTML = `
            <span class="date-separator">${utils.createDateSeparator(date)}</span>
        `;
        return separator;
    }
    
    createMessageElement(message, index) {
        const isSent = message.senderId === this.currentUserId;
        const messageElement = document.createElement('div');
        messageElement.className = `message ${isSent ? 'sent' : 'received'}`;
        messageElement.dataset.messageId = message.id;
        
        // Check if next message is from same sender
        const nextMessage = this.messages[index + 1];
        const showAvatar = !nextMessage || 
                          nextMessage.senderId !== message.senderId ||
                          this.shouldShowDateSeparator(message.timestamp, nextMessage.timestamp);
        
        messageElement.innerHTML = `
            ${!isSent && showAvatar ? this.createMessageAvatar() : ''}
            <div class="message-content">
                <div class="message-bubble ${message.edited ? 'edited' : ''}">
                    ${this.formatMessageText(message.text)}
                    ${this.createMessageStatus(message, isSent)}
                </div>
                ${this.createMessageTime(message)}
                ${this.createMessageReactions(message)}
            </div>
            ${isSent && showAvatar ? this.createMessageAvatar() : ''}
        `;
        
        // Add context menu
        messageElement.addEventListener('contextmenu', (e) => {
            e.preventDefault();
            this.showMessageContextMenu(e, message);
        });
        
        // Add click for reactions (mobile)
        if (utils.isMobile()) {
            messageElement.addEventListener('click', (e) => {
                if (e.target.closest('.message-bubble')) {
                    this.showReactionPicker(e, message);
                }
            });
        }
        
        return messageElement;
    }
    
    createMessageAvatar() {
        const user = this.currentChatUser;
        const currentUser = firebaseService.getCurrentUserData();
        
        const avatar = document.createElement('div');
        avatar.className = 'message-avatar';
        
        if (this.currentChatUser) {
            avatar.textContent = utils.getInitials(user.name);
            avatar.style.background = user.avatarColor || utils.getUserColor(user.uid);
        } else if (currentUser) {
            avatar.textContent = utils.getInitials(currentUser.name);
            avatar.style.background = currentUser.avatarColor || utils.getUserColor(currentUser.uid);
        }
        
        return avatar.outerHTML;
    }
    
    formatMessageText(text) {
        let formattedText = utils.escapeHtml(text);
        
        // Parse mentions
        formattedText = formattedText.replace(
            /@(\w+)/g,
            '<span class="mention">@$1</span>'
        );
        
        // Parse links
        formattedText = formattedText.replace(
            /(https?:\/\/[^\s]+)/g,
            '<a href="$1" target="_blank" rel="noopener noreferrer" class="message-link">$1</a>'
        );
        
        // Parse new lines
        formattedText = formattedText.replace(/\n/g, '<br>');
        
        return formattedText;
    }
    
    createMessageStatus(message, isSent) {
        if (!isSent) return '';
        
        const showReadReceipts = firebaseService.getCurrentUserData()?.readReceipts ?? true;
        
        if (!showReadReceipts) return '';
        
        let statusIcon = 'mdi:check';
        let statusText = 'تم الإرسال';
        
        if (message.read) {
            statusIcon = 'mdi:check-all';
            statusText = 'تمت القراءة';
        }
        
        return `
            <div class="message-status">
                <iconify-icon icon="${statusIcon}" class="status-icon"></iconify-icon>
                <span class="status-text">${statusText}</span>
            </div>
        `;
    }
    
    createMessageTime(message) {
        const time = message.timestamp ? utils.getReadableTime(message.timestamp) : '';
        
        return `
            <div class="message-time">
                ${time}
                ${message.edited ? '<span class="edited-text">(تم التعديل)</span>' : ''}
            </div>
        `;
    }
    
    createMessageReactions(message) {
        if (!message.reactions || message.reactions.length === 0) {
            return '';
        }
        
        // Group reactions by emoji
        const reactionCounts = {};
        message.reactions.forEach(reaction => {
            if (!reactionCounts[reaction.emoji]) {
                reactionCounts[reaction.emoji] = {
                    count: 0,
                    users: []
                };
            }
            reactionCounts[reaction.emoji].count++;
            reactionCounts[reaction.emoji].users.push(reaction.userId);
        });
        
        const reactions = Object.entries(reactionCounts).map(([emoji, data]) => {
            const isMyReaction = data.users.includes(this.currentUserId);
            return `
                <div class="reaction ${isMyReaction ? 'active' : ''}" data-emoji="${emoji}">
                    <span>${emoji}</span>
                    <span>${data.count}</span>
                </div>
            `;
        }).join('');
        
        return `<div class="message-reactions">${reactions}</div>`;
    }
    
    shouldShowDateSeparator(timestamp1, timestamp2) {
        if (!timestamp1 || !timestamp2) return true;
        
        const date1 = timestamp1.toDate ? timestamp1.toDate() : new Date(timestamp1);
        const date2 = timestamp2.toDate ? timestamp2.toDate() : new Date(timestamp2);
        
        const diffMinutes = Math.abs((date2 - date1) / (1000 * 60));
        return diffMinutes > 5; // Show separator if more than 5 minutes apart
    }
    
    scrollToBottom() {
        const messagesContainer = document.getElementById('chatMessages');
        if (messagesContainer) {
            messagesContainer.scrollTop = messagesContainer.scrollHeight;
        }
    }
    
    // ===== MESSAGE ACTIONS =====
    
    async sendMessage() {
        const chatInput = document.getElementById('chatInput');
        if (!chatInput || !this.currentChatId) return;
        
        const text = chatInput.value.trim();
        if (!text) return;
        
        try {
            // Send message
            const result = await firebaseService.sendMessage(this.currentChatId, this.currentUserId, text);
            
            if (result.success) {
                // Clear input
                chatInput.value = '';
                chatInput.style.height = 'auto';
                
                // Stop typing indicator
                await realTimeService.stopTyping(this.currentUserId, this.currentChatId);
                
                // Focus input
                setTimeout(() => chatInput.focus(), 10);
            } else {
                utils.createToast('فشل إرسال الرسالة', 'error');
            }
        } catch (error) {
            console.error('Send message error:', error);
            utils.createToast('حدث خطأ في إرسال الرسالة', 'error');
        }
    }
    
    async editMessage(messageId, newText) {
        try {
            const result = await realTimeService.editMessage(
                this.currentChatId,
                messageId,
                newText,
                this.currentUserId
            );
            
            if (result.success) {
                utils.createToast('تم تعديل الرسالة', 'success');
            } else {
                utils.createToast(result.error || 'فشل تعديل الرسالة', 'error');
            }
        } catch (error) {
            console.error('Edit message error:', error);
            utils.createToast('حدث خطأ في تعديل الرسالة', 'error');
        }
    }
    
    async deleteMessage(messageId, deleteForEveryone = false) {
        try {
            const result = await realTimeService.deleteMessage(
                this.currentChatId,
                messageId,
                this.currentUserId,
                deleteForEveryone
            );
            
            if (result.success) {
                const message = deleteForEveryone 
                    ? 'تم حذف الرسالة للجميع'
                    : 'تم حذف الرسالة عندك فقط';
                
                utils.createToast(message, 'success');
            } else {
                utils.createToast(result.error || 'فشل حذف الرسالة', 'error');
            }
        } catch (error) {
            console.error('Delete message error:', error);
            utils.createToast('حدث خطأ في حذف الرسالة', 'error');
        }
    }
    
    async addReaction(messageId, emoji) {
        try {
            const result = await realTimeService.addReaction(
                this.currentChatId,
                messageId,
                this.currentUserId,
                emoji
            );
            
            if (!result.success) {
                utils.createToast('فشل إضافة التفاعل', 'error');
            }
        } catch (error) {
            console.error('Add reaction error:', error);
        }
    }
    
    async removeReaction(messageId, emoji) {
        try {
            const result = await realTimeService.removeReaction(
                this.currentChatId,
                messageId,
                this.currentUserId,
                emoji
            );
            
            if (!result.success) {
                utils.createToast('فشل إزالة التفاعل', 'error');
            }
        } catch (error) {
            console.error('Remove reaction error:', error);
        }
    }
    
    // ===== CHAT ACTIONS =====
    
    async pinChat() {
        if (!this.currentChatId) return;
        
        try {
            const result = await realTimeService.pinChat(this.currentUserId, this.currentChatId);
            
            if (result.success) {
                this.updatePinButton(result.action === 'pinned');
            }
        } catch (error) {
            console.error('Pin chat error:', error);
        }
    }
    
    async muteChat(duration = null) {
        if (!this.currentChatId) return;
        
        try {
            const result = await realTimeService.muteChat(this.currentUserId, this.currentChatId, duration);
            
            if (result.success) {
                this.updateMuteButton(result.action === 'muted');
            }
        } catch (error) {
            console.error('Mute chat error:', error);
        }
    }
    
    async blockUser() {
        if (!this.currentChatUser) return;
        
        if (!confirm(`هل تريد حظر ${this.currentChatUser.name}؟`)) {
            return;
        }
        
        try {
            const result = await firebaseService.toggleBlockUser(
                this.currentUserId,
                this.currentChatUser.uid
            );
            
            if (result.success) {
                const message = result.action === 'blocked' 
                    ? `تم حظر ${this.currentChatUser.name}`
                    : `تم إلغاء حظر ${this.currentChatUser.name}`;
                
                utils.createToast(message, 'success');
                
                if (result.action === 'blocked') {
                    this.closeChat();
                }
                
                this.updateBlockButton(result.action === 'blocked');
            }
        } catch (error) {
            console.error('Block user error:', error);
            utils.createToast('فشل حظر المستخدم', 'error');
        }
    }
    
    async clearChat() {
        if (!this.currentChatId) return;
        
        if (!confirm('هل تريد مسح سجل المحادثة؟ هذا الإجراء لا يمكن التراجع عنه.')) {
            return;
        }
        
        try {
            const result = await realTimeService.clearChatHistory(this.currentChatId, this.currentUserId);
            
            if (result.success) {
                this.closeChat();
            }
        } catch (error) {
            console.error('Clear chat error:', error);
            utils.createToast('فشل مسح سجل المحادثة', 'error');
        }
    }
    
    // ===== UI UPDATES =====
    
    updateTypingIndicator(isTyping) {
        const typingIndicator = document.getElementById('typingIndicator');
        const statusText = document.getElementById('statusText');
        
        if (typingIndicator && statusText) {
            if (isTyping) {
                typingIndicator.classList.remove('hidden');
                statusText.classList.add('hidden');
            } else {
                typingIndicator.classList.add('hidden');
                statusText.classList.remove('hidden');
            }
        }
    }
    
    updateOnlineStatus(status) {
        const statusText = document.getElementById('statusText');
        const statusIndicator = document.getElementById('chatUserStatusIndicator');
        
        if (statusText) {
            statusText.textContent = this.formatOnlineStatus(status);
        }
        
        if (statusIndicator) {
            statusIndicator.className = 'status-indicator';
            statusIndicator.classList.add(status.isOnline ? 'online' : 'offline');
        }
    }
    
    formatOnlineStatus(status) {
        const showOnlineStatus = firebaseService.getCurrentUserData()?.showOnlineStatus ?? true;
        const showLastSeen = firebaseService.getCurrentUserData()?.showLastSeen ?? true;
        
        if (showOnlineStatus && status.isOnline) {
            return status.status || 'متصل الآن';
        } else if (showLastSeen) {
            return `آخر ظهور ${utils.formatLastSeen(status.lastSeen, false)}`;
        } else {
            return 'غير متصل';
        }
    }
    
    updateChatInfo(chatData) {
        // Update chat info if needed
        console.log('Chat updated:', chatData);
    }
    
    updateActiveChatInSidebar() {
        document.querySelectorAll('.chat-item').forEach(item => {
            item.classList.remove('active');
            if (item.dataset.chatId === this.currentChatId) {
                item.classList.add('active');
            }
        });
    }
    
    updatePinButton(isPinned) {
        const pinBtn = document.getElementById('pinChatBtn');
        if (pinBtn) {
            const icon = isPinned ? 'mdi:pin-off' : 'mdi:pin';
            const text = isPinned ? 'إلغاء التثبيت' : 'تثبيت المحادثة';
            
            pinBtn.innerHTML = `
                <iconify-icon icon="${icon}"></iconify-icon>
                <span>${text}</span>
            `;
        }
    }
    
    updateMuteButton(isMuted) {
        const muteBtn = document.getElementById('muteChatBtn');
        if (muteBtn) {
            const icon = isMuted ? 'mdi:volume-high' : 'mdi:volume-off';
            const text = isMuted ? 'إلغاء الكتم' : 'كتم المحادثة';
            
            muteBtn.innerHTML = `
                <iconify-icon icon="${icon}"></iconify-icon>
                <span>${text}</span>
            `;
        }
    }
    
    updateBlockButton(isBlocked) {
        const blockBtn = document.getElementById('blockUserBtn');
        if (blockBtn) {
            const text = isBlocked ? 'إلغاء الحظر' : 'حظر المستخدم';
            
            blockBtn.innerHTML = `
                <iconify-icon icon="mdi:block-helper"></iconify-icon>
                <span>${text}</span>
            `;
        }
    }
    
    // ===== CONTEXT MENUS =====
    
    showChatContextMenu(event, chat) {
        event.preventDefault();
        
        const menu = this.createChatContextMenu(chat);
        this.showContextMenu(event, menu);
    }
    
    createChatContextMenu(chat) {
        const userData = firebaseService.getCurrentUserData();
        const isPinned = userData?.pinnedChats?.includes(chat.id) || false;
        const isMuted = realTimeService.isChatMuted(chat.id);
        const isBlocked = userData?.blockedUsers?.includes(chat.otherUser.uid) || false;
        
        const menuItems = [
            {
                text: isPinned ? 'إلغاء التثبيت' : 'تثبيت المحادثة',
                icon: isPinned ? 'mdi:pin-off' : 'mdi:pin',
                action: () => this.pinChat()
            },
            {
                text: isMuted ? 'إلغاء الكتم' : 'كتم المحادثة',
                icon: isMuted ? 'mdi:volume-high' : 'mdi:volume-off',
                action: () => this.showMuteOptions()
            },
            {
                text: isBlocked ? 'إلغاء الحظر' : 'حظر المستخدم',
                icon: 'mdi:block-helper',
                className: 'danger',
                action: () => this.blockUser()
            },
            {
                text: 'مسح المحادثة',
                icon: 'mdi:delete',
                className: 'danger',
                action: () => this.clearChat()
            }
        ];
        
        return menuItems;
    }
    
    showMessageContextMenu(event, message) {
        event.preventDefault();
        
        const menu = this.createMessageContextMenu(message);
        this.showContextMenu(event, menu);
    }
    
    createMessageContextMenu(message) {
        const isSent = message.senderId === this.currentUserId;
        const menuItems = [];
        
        // Edit (only for sent messages)
        if (isSent) {
            menuItems.push({
                text: 'تعديل',
                icon: 'mdi:pencil',
                action: () => this.showEditMessage(message)
            });
        }
        
        // Copy
        menuItems.push({
            text: 'نسخ',
            icon: 'mdi:content-copy',
            action: () => this.copyMessage(message.text)
        });
        
        // Delete
        menuItems.push({
            text: 'حذف',
            icon: 'mdi:delete',
            className: 'danger',
            action: () => this.showDeleteOptions(message)
        });
        
        // Reactions
        const reactions = ['👍', '❤️', '😂', '😮', '😢', '😡'];
        menuItems.push({
            text: 'تفاعل',
            icon: 'mdi:emoticon',
            submenu: reactions.map(emoji => ({
                text: emoji,
                action: () => this.addReaction(message.id, emoji)
            }))
        });
        
        return menuItems;
    }
    
    showContextMenu(event, menuItems) {
        // Remove existing menu
        if (this.messageMenu) {
            this.messageMenu.remove();
        }
        
        // Create menu
        const menu = document.createElement('div');
        menu.className = 'context-menu';
        menu.style.position = 'fixed';
        menu.style.top = `${event.clientY}px`;
        menu.style.right = `${window.innerWidth - event.clientX}px`;
        menu.style.zIndex = '1000';
        
        // Add menu items
        menuItems.forEach(item => {
            if (item.submenu) {
                // Submenu item
                const submenuItem = document.createElement('div');
                submenuItem.className = 'context-menu-item';
                submenuItem.innerHTML = `
                    <iconify-icon icon="${item.icon}"></iconify-icon>
                    <span>${item.text}</span>
                    <iconify-icon icon="mdi:chevron-left"></iconify-icon>
                `;
                
                // Add hover for submenu
                submenuItem.addEventListener('mouseenter', () => {
                    this.showSubMenu(submenuItem, item.submenu);
                });
                
                menu.appendChild(submenuItem);
            } else {
                // Regular item
                const menuItem = document.createElement('button');
                menuItem.className = `context-menu-item ${item.className || ''}`;
                menuItem.innerHTML = `
                    <iconify-icon icon="${item.icon}"></iconify-icon>
                    <span>${item.text}</span>
                `;
                
                menuItem.addEventListener('click', () => {
                    item.action();
                    menu.remove();
                });
                
                menu.appendChild(menuItem);
            }
        });
        
        // Add to document
        document.body.appendChild(menu);
        this.messageMenu = menu;
        
        // Close menu when clicking outside
        const closeMenu = (e) => {
            if (!menu.contains(e.target)) {
                menu.remove();
                document.removeEventListener('click', closeMenu);
            }
        };
        
        setTimeout(() => {
            document.addEventListener('click', closeMenu);
        }, 100);
    }
    
    showSubMenu(parentItem, submenuItems) {
        // Remove existing submenu
        const existingSubmenu = document.querySelector('.context-submenu');
        if (existingSubmenu) {
            existingSubmenu.remove();
        }
        
        // Create submenu
        const submenu = document.createElement('div');
        submenu.className = 'context-submenu';
        
        // Position next to parent
        const rect = parentItem.getBoundingClientRect();
        submenu.style.position = 'fixed';
        submenu.style.top = `${rect.top}px`;
        submenu.style.right = `${rect.right + 5}px`;
        
        // Add submenu items
        submenuItems.forEach(item => {
            const submenuItem = document.createElement('button');
            submenuItem.className = 'context-menu-item';
            submenuItem.textContent = item.text;
            
            submenuItem.addEventListener('click', () => {
                item.action();
                document.querySelector('.context-menu')?.remove();
            });
            
            submenu.appendChild(submenuItem);
        });
        
        // Add to document
        document.body.appendChild(submenu);
        
        // Remove on mouse leave
        parentItem.addEventListener('mouseleave', () => {
            setTimeout(() => {
                if (!submenu.matches(':hover')) {
                    submenu.remove();
                }
            }, 100);
        });
        
        submenu.addEventListener('mouseleave', () => {
            submenu.remove();
        });
    }
    
    showMuteOptions() {
        const options = [
            { duration: 1, text: 'ساعة واحدة' },
            { duration: 8, text: '8 ساعات' },
            { duration: 24, text: 'يوم واحد' },
            { duration: null, text: 'دائماً' }
        ];
        
        const menu = document.createElement('div');
        menu.className = 'context-menu';
        
        options.forEach(option => {
            const menuItem = document.createElement('button');
            menuItem.className = 'context-menu-item';
            menuItem.textContent = option.text;
            
            menuItem.addEventListener('click', () => {
                this.muteChat(option.duration);
                menu.remove();
            });
            
            menu.appendChild(menuItem);
        });
        
        // Position near mute button
        const muteBtn = document.getElementById('muteChatBtn');
        if (muteBtn) {
            const rect = muteBtn.getBoundingClientRect();
            menu.style.position = 'fixed';
            menu.style.top = `${rect.bottom + 5}px`;
            menu.style.right = `${window.innerWidth - rect.right}px`;
            
            document.body.appendChild(menu);
            
            // Close on outside click
            setTimeout(() => {
                document.addEventListener('click', (e) => {
                    if (!menu.contains(e.target) && e.target !== muteBtn) {
                        menu.remove();
                    }
                });
            }, 100);
        }
    }
    
    showEditMessage(message) {
        const messageElement = document.querySelector(`[data-message-id="${message.id}"]`);
        if (!messageElement) return;
        
        const messageBubble = messageElement.querySelector('.message-bubble');
        if (!messageBubble) return;
        
        // Create edit input
        const editInput = document.createElement('textarea');
        editInput.className = 'message-edit-input';
        editInput.value = message.text;
        editInput.rows = 1;
        
        // Replace message bubble with edit input
        messageBubble.innerHTML = '';
        messageBubble.appendChild(editInput);
        
        // Auto resize and focus
        utils.autoResizeTextarea(editInput);
        editInput.focus();
        editInput.select();
        
        // Handle save on Enter
        editInput.addEventListener('keydown', async (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                const newText = editInput.value.trim();
                
                if (newText && newText !== message.text) {
                    await this.editMessage(message.id, newText);
                }
                
                // Restore message
                this.renderMessages();
            }
            
            if (e.key === 'Escape') {
                // Restore message
                this.renderMessages();
            }
        });
    }
    
    showDeleteOptions(message) {
        const deleteModal = document.getElementById('deleteMessageModal');
        if (!deleteModal) return;
        
        this.selectedMessageId = message.id;
        
        // Update modal text based on message ownership
        const isSent = message.senderId === this.currentUserId;
        
        if (isSent) {
            deleteModal.querySelector('.delete-options').innerHTML = `
                <button class="delete-option" id="deleteForMe">
                    حذف عندي فقط
                </button>
                <button class="delete-option danger" id="deleteForEveryone">
                    حذف للجميع
                </button>
            `;
        } else {
            deleteModal.querySelector('.delete-options').innerHTML = `
                <button class="delete-option" id="deleteForMe">
                    حذف عندي فقط
                </button>
            `;
        }
        
        // Show modal
        deleteModal.classList.add('active');
        
        // Setup event listeners
        const deleteForMeBtn = document.getElementById('deleteForMe');
        const deleteForEveryoneBtn = document.getElementById('deleteForEveryone');
        const cancelBtn = document.getElementById('cancelDelete');
        
        const closeModal = () => {
            deleteModal.classList.remove('active');
            this.selectedMessageId = null;
        };
        
        deleteForMeBtn?.addEventListener('click', async () => {
            await this.deleteMessage(this.selectedMessageId, false);
            closeModal();
        });
        
        deleteForEveryoneBtn?.addEventListener('click', async () => {
            await this.deleteMessage(this.selectedMessageId, true);
            closeModal();
        });
        
        cancelBtn?.addEventListener('click', closeModal);
    }
    
    showReactionPicker(event, message) {
        // Implementation for mobile reaction picker
        console.log('Show reaction picker for message:', message.id);
    }
    
    copyMessage(text) {
        utils.copyToClipboard(text).then(success => {
            if (success) {
                utils.createToast('تم نسخ الرسالة', 'success');
            } else {
                utils.createToast('فشل نسخ الرسالة', 'error');
            }
        });
    }
    
    // ===== EVENT LISTENERS =====
    
    setupEventListeners() {
        // Send message button
        const sendBtn = document.getElementById('sendMessageBtn');
        if (sendBtn) {
            sendBtn.addEventListener('click', () => this.sendMessage());
        }
        
        // Chat input
        const chatInput = document.getElementById('chatInput');
        if (chatInput) {
            // Send on Enter (without Shift)
            chatInput.addEventListener('keypress', (e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    this.sendMessage();
                }
            });
            
            // Typing indicator
            const typingHandler = utils.debounce(async () => {
                if (this.currentChatId && chatInput.value.trim()) {
                    await realTimeService.startTyping(this.currentUserId, this.currentChatId);
                }
            }, 500);
            
            chatInput.addEventListener('input', typingHandler);
            
            // Auto resize
            utils.autoResizeTextarea(chatInput);
        }
        
        // Chat back button
        const backBtn = document.getElementById('chatBackBtn');
        if (backBtn) {
            backBtn.addEventListener('click', () => this.closeChat());
        }
        
        // Chat action buttons
        this.setupChatActionButtons();
        
        // Global search
        const globalSearch = document.getElementById('globalSearch');
        if (globalSearch) {
            globalSearch.addEventListener('input', utils.debounce((e) => {
                this.searchChats(e.target.value);
            }, 300));
        }
    }
    
    setupChatActionButtons() {
        // Pin chat
        const pinBtn = document.getElementById('pinChatBtn');
        if (pinBtn) {
            pinBtn.addEventListener('click', () => this.pinChat());
        }
        
        // Mute chat
        const muteBtn = document.getElementById('muteChatBtn');
        if (muteBtn) {
            muteBtn.addEventListener('click', () => this.showMuteOptions());
        }
        
        // Block user
        const blockBtn = document.getElementById('blockUserBtn');
        if (blockBtn) {
            blockBtn.addEventListener('click', () => this.blockUser());
        }
        
        // Clear chat
        const clearBtn = document.getElementById('clearChatBtn');
        if (clearBtn) {
            clearBtn.addEventListener('click', () => this.clearChat());
        }
        
        // Search in chat
        const searchBtn = document.getElementById('chatSearchBtn');
        if (searchBtn) {
            searchBtn.addEventListener('click', () => this.toggleSearchInChat());
        }
        
        // Chat menu
        const menuBtn = document.getElementById('chatMenuBtn');
        const chatDropdown = document.getElementById('chatDropdown');
        if (menuBtn && chatDropdown) {
            menuBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                chatDropdown.classList.toggle('show');
            });
            
            // Close dropdown when clicking outside
            document.addEventListener('click', () => {
                chatDropdown.classList.remove('show');
            });
        }
    }
    
    // ===== SEARCH =====
    
    searchChats(query) {
        const chatItems = document.querySelectorAll('.chat-item');
        const normalizedQuery = query.toLowerCase().trim();
        
        chatItems.forEach(item => {
            const chatName = item.querySelector('.chat-name')?.textContent.toLowerCase() || '';
            const chatMessage = item.querySelector('.chat-message')?.textContent.toLowerCase() || '';
            
            if (chatName.includes(normalizedQuery) || chatMessage.includes(normalizedQuery)) {
                item.style.display = 'flex';
            } else {
                item.style.display = 'none';
            }
        });
    }
    
    toggleSearchInChat() {
        // Implementation for in-chat search
        console.log('Toggle search in chat');
    }
    
    // ===== CLEANUP =====
    
    closeChat() {
        this.currentChatId = null;
        this.currentChatUser = null;
        
        // Cleanup listeners
        this.cleanupFunctions.forEach(cleanup => {
            if (typeof cleanup === 'function') {
                cleanup();
            }
        });
        this.cleanupFunctions.clear();
        
        // Update UI
        const emptyState = document.getElementById('emptyState');
        const chatWindow = document.getElementById('chatWindow');
        
        if (emptyState) emptyState.classList.add('active');
        if (chatWindow) chatWindow.classList.remove('active');
        
        // Update active chat in sidebar
        document.querySelectorAll('.chat-item').forEach(item => {
            item.classList.remove('active');
        });
    }
    
    cleanup() {
        this.closeChat();
        
        // Remove message menu
        if (this.messageMenu) {
            this.messageMenu.remove();
            this.messageMenu = null;
        }
        
        this.selectedMessageId = null;
    }
}

// Create global ChatManager instance
const chatManager = new ChatManager();

// Export for use in other modules
export default chatManager;
