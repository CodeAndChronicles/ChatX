// js/utils.js

// ===== UTILITY FUNCTIONS =====

class Utils {
    constructor() {
        this.debounceTimers = new Map();
        this.throttleFlags = new Map();
    }

    // Debounce function
    debounce(func, wait = 300) {
        return (...args) => {
            const key = func.toString();
            clearTimeout(this.debounceTimers.get(key));
            this.debounceTimers.set(key, setTimeout(() => func.apply(this, args), wait));
        };
    }

    // Throttle function
    throttle(func, limit = 300) {
        return (...args) => {
            const key = func.toString();
            if (!this.throttleFlags.get(key)) {
                func.apply(this, args);
                this.throttleFlags.set(key, true);
                setTimeout(() => {
                    this.throttleFlags.set(key, false);
                }, limit);
            }
        };
    }

    // Format time
    formatTime(timestamp) {
        if (!timestamp) return '';
        
        try {
            let date;
            if (timestamp.toDate) {
                date = timestamp.toDate();
            } else if (timestamp instanceof Date) {
                date = timestamp;
            } else {
                return '';
            }
            
            const now = new Date();
            const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
            const messageDate = new Date(date.getFullYear(), date.getMonth(), date.getDate());
            
            const diffMs = now - date;
            const diffMins = Math.floor(diffMs / 60000);
            const diffHours = Math.floor(diffMs / 3600000);
            const diffDays = Math.floor(diffMs / 86400000);
            
            if (diffMins < 1) return 'الآن';
            if (diffMins < 60) return `منذ ${diffMins} دقيقة`;
            if (diffHours < 24) return `منذ ${diffHours} ساعة`;
            if (diffDays === 1) return 'أمس';
            if (diffDays < 7) return `منذ ${diffDays} يوم`;
            if (diffDays < 30) return `منذ ${Math.floor(diffDays / 7)} أسبوع`;
            
            return date.toLocaleDateString('ar-EG');
        } catch (error) {
            console.error('Error formatting time:', error);
            return '';
        }
    }

    // Format last seen
    formatLastSeen(timestamp, showExact = false) {
        if (!timestamp) return 'غير متاح';
        
        try {
            let date;
            if (timestamp.toDate) {
                date = timestamp.toDate();
            } else if (timestamp instanceof Date) {
                date = timestamp;
            } else {
                return 'غير متاح';
            }
            
            const now = new Date();
            const diffMs = now - date;
            const diffMins = Math.floor(diffMs / 60000);
            const diffHours = Math.floor(diffMs / 3600000);
            
            if (diffMins < 2) return 'الآن';
            if (diffMins < 60) return `منذ ${diffMins} دقيقة`;
            if (diffHours < 24) return `منذ ${diffHours} ساعة`;
            
            if (!showExact) {
                if (diffHours < 48) return 'أمس';
                return date.toLocaleDateString('ar-EG', { 
                    month: 'short', 
                    day: 'numeric'
                });
            }
            
            return date.toLocaleDateString('ar-EG', { 
                weekday: 'long',
                year: 'numeric',
                month: 'long',
                day: 'numeric',
                hour: '2-digit',
                minute: '2-digit'
            });
        } catch (error) {
            console.error('Error formatting last seen:', error);
            return 'غير متاح';
        }
    }

    // Generate chat ID
    generateChatId(userId1, userId2) {
        return userId1 < userId2 ? `${userId1}_${userId2}` : `${userId2}_${userId1}`;
    }

    // Generate unique ID
    generateId(length = 20) {
        const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
        let result = '';
        for (let i = 0; i < length; i++) {
            result += chars.charAt(Math.floor(Math.random() * chars.length));
        }
        return result;
    }

    // Get initials from name
    getInitials(name) {
        if (!name) return 'م';
        const names = name.split(' ');
        let initials = names[0].charAt(0);
        if (names.length > 1) {
            initials += names[names.length - 1].charAt(0);
        }
        return initials;
    }

    // Validate email
    validateEmail(email) {
        const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        return re.test(email);
    }

    // Validate password strength
    validatePassword(password) {
        if (password.length < 6) return 'كلمة المرور يجب أن تكون 6 أحرف على الأقل';
        if (!/[A-Z]/.test(password)) return 'يجب أن تحتوي على حرف كبير واحد على الأقل';
        if (!/[0-9]/.test(password)) return 'يجب أن تحتوي على رقم واحد على الأقل';
        return null;
    }

    // Sanitize input
    sanitizeInput(input) {
        const div = document.createElement('div');
        div.textContent = input;
        return div.innerHTML;
    }

    // Copy to clipboard
    async copyToClipboard(text) {
        try {
            await navigator.clipboard.writeText(text);
            return true;
        } catch (err) {
            console.error('Failed to copy:', err);
            return false;
        }
    }

    // Load image with fallback
    loadImage(url, fallbackUrl) {
        return new Promise((resolve, reject) => {
            const img = new Image();
            img.onload = () => resolve(url);
            img.onerror = () => {
                if (fallbackUrl) {
                    const fallbackImg = new Image();
                    fallbackImg.onload = () => resolve(fallbackUrl);
                    fallbackImg.onerror = () => reject('Failed to load image');
                    fallbackImg.src = fallbackUrl;
                } else {
                    reject('Failed to load image');
                }
            };
            img.src = url;
        });
    }

    // Create toast notification
    createToast(message, type = 'info', duration = 3000) {
        const container = document.getElementById('toastContainer');
        if (!container) return;

        const toast = document.createElement('div');
        toast.className = `toast ${type}`;
        
        let icon = 'mdi:information';
        if (type === 'success') icon = 'mdi:check-circle';
        if (type === 'error') icon = 'mdi:alert-circle';
        if (type === 'warning') icon = 'mdi:alert';
        
        toast.innerHTML = `
            <iconify-icon icon="${icon}" class="toast-icon"></iconify-icon>
            <div class="toast-content">${message}</div>
        `;
        
        container.appendChild(toast);
        
        setTimeout(() => {
            toast.classList.add('show');
        }, 10);
        
        setTimeout(() => {
            toast.classList.remove('show');
            setTimeout(() => {
                toast.remove();
            }, 300);
        }, duration);
    }

    // Create loading overlay
    createLoadingOverlay(container, message = 'جاري التحميل...') {
        const overlay = document.createElement('div');
        overlay.className = 'loading-overlay';
        overlay.innerHTML = `
            <div class="loading-content">
                <div class="loading-spinner"></div>
                <p class="loading-message">${message}</p>
            </div>
        `;
        
        container.style.position = 'relative';
        container.appendChild(overlay);
        
        setTimeout(() => {
            overlay.classList.add('active');
        }, 10);
        
        return {
            hide: () => {
                overlay.classList.remove('active');
                setTimeout(() => overlay.remove(), 300);
            }
        };
    }

    // Get user color from string
    getUserColor(str) {
        const colors = [
            '#8B5CF6', '#3B82F6', '#10B981', 
            '#EF4444', '#F59E0B', '#EC4899',
            '#06B6D4', '#84CC16', '#F97316'
        ];
        
        if (!str) return colors[0];
        
        let hash = 0;
        for (let i = 0; i < str.length; i++) {
            hash = str.charCodeAt(i) + ((hash << 5) - hash);
        }
        
        return colors[Math.abs(hash) % colors.length];
    }

    // Check if device is mobile
    isMobile() {
        return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
    }

    // Check if device is iOS
    isIOS() {
        return /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
    }

    // Check if device is Android
    isAndroid() {
        return /Android/.test(navigator.userAgent);
    }

    // Check if online
    isOnline() {
        return navigator.onLine;
    }

    // Format file size
    formatFileSize(bytes) {
        if (bytes === 0) return '0 بايت';
        const k = 1024;
        const sizes = ['بايت', 'كيلوبايت', 'ميجابايت', 'جيجابايت'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    }

    // Create date separator for messages
    createDateSeparator(date) {
        const now = new Date();
        const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        const yesterday = new Date(today);
        yesterday.setDate(yesterday.getDate() - 1);
        
        const messageDate = new Date(date.getFullYear(), date.getMonth(), date.getDate());
        
        if (messageDate.getTime() === today.getTime()) {
            return 'اليوم';
        } else if (messageDate.getTime() === yesterday.getTime()) {
            return 'أمس';
        } else {
            return date.toLocaleDateString('ar-EG', {
                year: 'numeric',
                month: 'long',
                day: 'numeric'
            });
        }
    }

    // Parse message text for mentions
    parseMentions(text) {
        const mentionRegex = /@(\w+)/g;
        return text.replace(mentionRegex, '<span class="mention">@$1</span>');
    }

    // Parse message text for links
    parseLinks(text) {
        const urlRegex = /(https?:\/\/[^\s]+)/g;
        return text.replace(urlRegex, '<a href="$1" target="_blank" rel="noopener noreferrer" class="message-link">$1</a>');
    }

    // Get readable time from timestamp
    getReadableTime(timestamp) {
        if (!timestamp) return '';
        
        const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
        return date.toLocaleTimeString('ar-EG', {
            hour: '2-digit',
            minute: '2-digit',
            hour12: true
        });
    }

    // Calculate message preview
    getMessagePreview(text, maxLength = 30) {
        if (!text) return '';
        if (text.length <= maxLength) return text;
        return text.substring(0, maxLength) + '...';
    }

    // Check if two dates are same day
    isSameDay(date1, date2) {
        if (!date1 || !date2) return false;
        
        const d1 = date1.toDate ? date1.toDate() : new Date(date1);
        const d2 = date2.toDate ? date2.toDate() : new Date(date2);
        
        return d1.getDate() === d2.getDate() &&
               d1.getMonth() === d2.getMonth() &&
               d1.getFullYear() === d2.getFullYear();
    }

    // Escape HTML
    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    // Deep clone object
    deepClone(obj) {
        return JSON.parse(JSON.stringify(obj));
    }

    // Merge objects
    mergeObjects(target, source) {
        for (const key in source) {
            if (source[key] && typeof source[key] === 'object' && !Array.isArray(source[key])) {
                if (!target[key] || typeof target[key] !== 'object') {
                    target[key] = {};
                }
                this.mergeObjects(target[key], source[key]);
            } else {
                target[key] = source[key];
            }
        }
        return target;
    }

    // Get query parameter
    getQueryParam(name) {
        const urlParams = new URLSearchParams(window.location.search);
        return urlParams.get(name);
    }

    // Set query parameter
    setQueryParam(name, value) {
        const url = new URL(window.location);
        url.searchParams.set(name, value);
        window.history.pushState({}, '', url);
    }

    // Remove query parameter
    removeQueryParam(name) {
        const url = new URL(window.location);
        url.searchParams.delete(name);
        window.history.pushState({}, '', url);
    }

    // Debounced scroll handler
    createScrollHandler(container, callback) {
        let isScrolling;
        container.addEventListener('scroll', () => {
            clearTimeout(isScrolling);
            isScrolling = setTimeout(() => {
                callback();
            }, 100);
        });
    }

    // Observe element visibility
    observeElement(element, callback, options = {}) {
        const observer = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    callback(entry);
                }
            });
        }, options);
        
        observer.observe(element);
        return observer;
    }

    // Create auto-resize textarea
    autoResizeTextarea(textarea) {
        textarea.style.height = 'auto';
        textarea.style.height = Math.min(textarea.scrollHeight, 120) + 'px';
        
        textarea.addEventListener('input', function() {
            this.style.height = 'auto';
            this.style.height = Math.min(this.scrollHeight, 120) + 'px';
        });
    }

    // Get browser language
    getBrowserLanguage() {
        return navigator.language || navigator.userLanguage || 'ar';
    }

    // Check if RTL language
    isRTLLanguage(lang) {
        const rtlLanguages = ['ar', 'he', 'fa', 'ur'];
        return rtlLanguages.includes(lang.split('-')[0]);
    }

    // Format number with commas
    formatNumber(num) {
        return num.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
    }

    // Calculate time ago
    timeAgo(date) {
        const now = new Date();
        const past = new Date(date);
        const diffMs = now - past;
        const diffSecs = Math.floor(diffMs / 1000);
        const diffMins = Math.floor(diffSecs / 60);
        const diffHours = Math.floor(diffMins / 60);
        const diffDays = Math.floor(diffHours / 24);

        if (diffSecs < 60) return 'الآن';
        if (diffMins < 60) return `منذ ${diffMins} دقيقة`;
        if (diffHours < 24) return `منذ ${diffHours} ساعة`;
        if (diffDays === 1) return 'أمس';
        if (diffDays < 7) return `منذ ${diffDays} يوم`;
        if (diffDays < 30) return `منذ ${Math.floor(diffDays / 7)} أسبوع`;
        if (diffDays < 365) return `منذ ${Math.floor(diffDays / 30)} شهر`;
        return `منذ ${Math.floor(diffDays / 365)} سنة`;
    }

    // Generate gradient from color
    generateGradient(color) {
        const gradients = {
            '#8B5CF6': 'linear-gradient(135deg, #8B5CF6, #7C3AED)',
            '#3B82F6': 'linear-gradient(135deg, #3B82F6, #2563EB)',
            '#10B981': 'linear-gradient(135deg, #10B981, #059669)',
            '#EF4444': 'linear-gradient(135deg, #EF4444, #DC2626)',
            '#F59E0B': 'linear-gradient(135deg, #F59E0B, #D97706)',
            '#EC4899': 'linear-gradient(135deg, #EC4899, #DB2777)'
        };
        
        return gradients[color] || gradients['#8B5CF6'];
    }

    // Check if color is dark
    isColorDark(color) {
        const hex = color.replace('#', '');
        const r = parseInt(hex.substr(0, 2), 16);
        const g = parseInt(hex.substr(2, 2), 16);
        const b = parseInt(hex.substr(4, 2), 16);
        const brightness = (r * 299 + g * 587 + b * 114) / 1000;
        return brightness < 128;
    }

    // Get contrast color
    getContrastColor(color) {
        return this.isColorDark(color) ? '#FFFFFF' : '#000000';
    }

    // Create avatar with initials
    createAvatarElement(name, color, size = 'md') {
        const div = document.createElement('div');
        div.className = `avatar avatar-${size}`;
        div.style.background = color;
        div.textContent = this.getInitials(name);
        return div;
    }

    // Create status indicator
    createStatusIndicator(status, size = 'md') {
        const div = document.createElement('div');
        div.className = `status-indicator ${status}`;
        return div;
    }

    // Create typing indicator
    createTypingIndicator() {
        const container = document.createElement('div');
        container.className = 'typing-indicator';
        container.innerHTML = `
            <div class="typing-dots">
                <span></span>
                <span></span>
                <span></span>
            </div>
            <span>يكتب...</span>
        `;
        return container;
    }

    // Create skeleton loader
    createSkeletonLoader(type = 'text', count = 1) {
        const container = document.createElement('div');
        
        for (let i = 0; i < count; i++) {
            const skeleton = document.createElement('div');
            skeleton.className = `skeleton skeleton-${type}`;
            container.appendChild(skeleton);
        }
        
        return container;
    }

    // Remove all children from element
    removeAllChildren(element) {
        while (element.firstChild) {
            element.removeChild(element.firstChild);
        }
    }

    // Add class with prefix
    addClassWithPrefix(element, className, prefix = '') {
        const classes = className.split(' ');
        classes.forEach(cls => {
            element.classList.add(prefix + cls);
        });
    }

    // Remove class with prefix
    removeClassWithPrefix(element, className, prefix = '') {
        const classes = className.split(' ');
        classes.forEach(cls => {
            element.classList.remove(prefix + cls);
        });
    }

    // Toggle class with prefix
    toggleClassWithPrefix(element, className, prefix = '') {
        const classes = className.split(' ');
        classes.forEach(cls => {
            element.classList.toggle(prefix + cls);
        });
    }

    // Get element position
    getElementPosition(element) {
        const rect = element.getBoundingClientRect();
        return {
            top: rect.top + window.pageYOffset,
            right: rect.right + window.pageXOffset,
            bottom: rect.bottom + window.pageYOffset,
            left: rect.left + window.pageXOffset,
            width: rect.width,
            height: rect.height
        };
    }

    // Check if element is in viewport
    isElementInViewport(element) {
        const rect = element.getBoundingClientRect();
        return (
            rect.top >= 0 &&
            rect.left >= 0 &&
            rect.bottom <= (window.innerHeight || document.documentElement.clientHeight) &&
            rect.right <= (window.innerWidth || document.documentElement.clientWidth)
        );
    }

    // Scroll to element smoothly
    scrollToElement(element, offset = 0) {
        const elementPosition = this.getElementPosition(element);
        window.scrollTo({
            top: elementPosition.top - offset,
            behavior: 'smooth'
        });
    }

    // Lock body scroll
    lockBodyScroll() {
        document.body.style.overflow = 'hidden';
        document.body.style.paddingRight = this.getScrollbarWidth() + 'px';
    }

    // Unlock body scroll
    unlockBodyScroll() {
        document.body.style.overflow = '';
        document.body.style.paddingRight = '';
    }

    // Get scrollbar width
    getScrollbarWidth() {
        const outer = document.createElement('div');
        outer.style.visibility = 'hidden';
        outer.style.overflow = 'scroll';
        document.body.appendChild(outer);

        const inner = document.createElement('div');
        outer.appendChild(inner);

        const scrollbarWidth = outer.offsetWidth - inner.offsetWidth;
        outer.parentNode.removeChild(outer);

        return scrollbarWidth;
    }

    // Create DOM element from string
    createElementFromString(htmlString) {
        const div = document.createElement('div');
        div.innerHTML = htmlString.trim();
        return div.firstChild;
    }

    // Get CSS variable value
    getCssVariable(name) {
        return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
    }

    // Set CSS variable value
    setCssVariable(name, value) {
        document.documentElement.style.setProperty(name, value);
    }

    // Remove CSS variable
    removeCssVariable(name) {
        document.documentElement.style.removeProperty(name);
    }

    // Batch update CSS variables
    updateCssVariables(variables) {
        Object.entries(variables).forEach(([name, value]) => {
            this.setCssVariable(name, value);
        });
    }

    // Get theme from localStorage
    getTheme() {
        return localStorage.getItem('chatx-theme') || 'dark';
    }

    // Set theme to localStorage
    setTheme(theme) {
        localStorage.setItem('chatx-theme', theme);
    }

    // Get color theme from localStorage
    getColorTheme() {
        return localStorage.getItem('chatx-color-theme') || 'purple';
    }

    // Set color theme to localStorage
    setColorTheme(colorTheme) {
        localStorage.setItem('chatx-color-theme', colorTheme);
    }

    // Get user data from localStorage
    getUserData() {
        const data = localStorage.getItem('chatx-user');
        return data ? JSON.parse(data) : null;
    }

    // Set user data to localStorage
    setUserData(user) {
        localStorage.setItem('chatx-user', JSON.stringify(user));
    }

    // Remove user data from localStorage
    removeUserData() {
        localStorage.removeItem('chatx-user');
    }

    // Clear all app data from localStorage
    clearAppData() {
        localStorage.removeItem('chatx-theme');
        localStorage.removeItem('chatx-color-theme');
        localStorage.removeItem('chatx-user');
        localStorage.removeItem('chatx-settings');
    }

    // Check if user is authenticated
    isAuthenticated() {
        return !!this.getUserData();
    }

    // Get auth token
    getAuthToken() {
        const user = this.getUserData();
        return user ? user.token : null;
    }

    // Set auth token
    setAuthToken(token) {
        const user = this.getUserData();
        if (user) {
            user.token = token;
            this.setUserData(user);
        }
    }

    // Remove auth token
    removeAuthToken() {
        const user = this.getUserData();
        if (user) {
            delete user.token;
            this.setUserData(user);
        }
    }

    // Create API headers
    createApiHeaders() {
        const token = this.getAuthToken();
        const headers = {
            'Content-Type': 'application/json',
            'Accept-Language': this.getBrowserLanguage()
        };
        
        if (token) {
            headers['Authorization'] = `Bearer ${token}`;
        }
        
        return headers;
    }

    // Make API request
    async makeApiRequest(url, options = {}) {
        const defaultOptions = {
            headers: this.createApiHeaders(),
            credentials: 'include'
        };

        const mergedOptions = { ...defaultOptions, ...options };
        
        try {
            const response = await fetch(url, mergedOptions);
            
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            
            const data = await response.json();
            return data;
        } catch (error) {
            console.error('API request failed:', error);
            throw error;
        }
    }

    // Handle API error
    handleApiError(error) {
        if (error.message.includes('401')) {
            this.removeUserData();
            window.location.href = '/auth.html';
            return 'انتهت جلستك، يرجى تسجيل الدخول مرة أخرى';
        } else if (error.message.includes('403')) {
            return 'ليس لديك صلاحية للقيام بهذا الإجراء';
        } else if (error.message.includes('404')) {
            return 'المورد غير موجود';
        } else if (error.message.includes('500')) {
            return 'حدث خطأ في الخادم، يرجى المحاولة لاحقاً';
        } else if (error.message.includes('network')) {
            return 'خطأ في الاتصال بالشبكة، يرجى التحقق من اتصالك بالإنترنت';
        } else {
            return 'حدث خطأ غير متوقع';
        }
    }

    // Create error handler
    createErrorHandler() {
        return (error) => {
            const message = this.handleApiError(error);
            this.createToast(message, 'error');
            console.error('Error:', error);
        };
    }

    // Retry function with exponential backoff
    async retryWithBackoff(fn, maxRetries = 3, delay = 1000) {
        let lastError;
        
        for (let i = 0; i < maxRetries; i++) {
            try {
                return await fn();
            } catch (error) {
                lastError = error;
                if (i < maxRetries - 1) {
                    await new Promise(resolve => setTimeout(resolve, delay * Math.pow(2, i)));
                }
            }
        }
        
        throw lastError;
    }

    // Create cache manager
    createCacheManager() {
        const cache = new Map();
        const maxAge = 5 * 60 * 1000; // 5 minutes
        
        return {
            set: (key, value) => {
                cache.set(key, {
                    value,
                    timestamp: Date.now()
                });
            },
            
            get: (key) => {
                const item = cache.get(key);
                if (!item) return null;
                
                if (Date.now() - item.timestamp > maxAge) {
                    cache.delete(key);
                    return null;
                }
                
                return item.value;
            },
            
            delete: (key) => {
                cache.delete(key);
            },
            
            clear: () => {
                cache.clear();
            }
        };
    }

    // Create event emitter
    createEventEmitter() {
        const events = new Map();
        
        return {
            on: (event, callback) => {
                if (!events.has(event)) {
                    events.set(event, []);
                }
                events.get(event).push(callback);
            },
            
            off: (event, callback) => {
                if (!events.has(event)) return;
                
                const callbacks = events.get(event);
                const index = callbacks.indexOf(callback);
                
                if (index > -1) {
                    callbacks.splice(index, 1);
                }
            },
            
            emit: (event, data) => {
                if (!events.has(event)) return;
                
                events.get(event).forEach(callback => {
                    try {
                        callback(data);
                    } catch (error) {
                        console.error(`Error in event handler for ${event}:`, error);
                    }
                });
            },
            
            once: (event, callback) => {
                const onceCallback = (data) => {
                    this.off(event, onceCallback);
                    callback(data);
                };
                this.on(event, onceCallback);
            }
        };
    }

    // Create state manager
    createStateManager(initialState = {}) {
        let state = { ...initialState };
        const subscribers = new Set();
        
        return {
            getState: () => ({ ...state }),
            
            setState: (newState) => {
                state = { ...state, ...newState };
                subscribers.forEach(callback => callback(state));
            },
            
            subscribe: (callback) => {
                subscribers.add(callback);
                return () => subscribers.delete(callback);
            }
        };
    }

    // Create form validator
    createFormValidator(rules) {
        return {
            validate: (data) => {
                const errors = {};
                
                Object.entries(rules).forEach(([field, fieldRules]) => {
                    const value = data[field];
                    
                    fieldRules.forEach(rule => {
                        if (rule.required && !value) {
                            errors[field] = rule.message || 'هذا الحقل مطلوب';
                        }
                        
                        if (rule.minLength && value && value.length < rule.minLength) {
                            errors[field] = rule.message || `يجب أن يكون ${rule.minLength} أحرف على الأقل`;
                        }
                        
                        if (rule.maxLength && value && value.length > rule.maxLength) {
                            errors[field] = rule.message || `يجب أن يكون ${rule.maxLength} أحرف كحد أقصى`;
                        }
                        
                        if (rule.pattern && value && !rule.pattern.test(value)) {
                            errors[field] = rule.message || 'القيمة غير صالحة';
                        }
                        
                        if (rule.validate && value) {
                            const customError = rule.validate(value, data);
                            if (customError) {
                                errors[field] = customError;
                            }
                        }
                    });
                });
                
                return {
                    isValid: Object.keys(errors).length === 0,
                    errors
                };
            }
        };
    }

    // Create file uploader
    createFileUploader() {
        return {
            upload: async (file, onProgress) => {
                return new Promise((resolve, reject) => {
                    // This is a mock implementation
                    // In a real app, you would upload to a server
                    
                    let progress = 0;
                    const interval = setInterval(() => {
                        progress += 10;
                        if (onProgress) onProgress(progress);
                        
                        if (progress >= 100) {
                            clearInterval(interval);
                            resolve({
                                url: URL.createObjectURL(file),
                                name: file.name,
                                size: file.size,
                                type: file.type
                            });
                        }
                    }, 100);
                });
            }
        };
    }
}

// Create global utils instance
const utils = new Utils();

// Export for use in other modules
export default utils;
