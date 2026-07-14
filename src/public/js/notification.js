/**
 * EventHub Notification Manager
 * Mapped to custom Flawless CSS UI
 */
class NotificationManager {
    constructor() {
        this.notifList = document.getElementById('notificationList');
        this.emptyMsg = document.getElementById('emptyNotificationMsg');
        this.redDot = document.getElementById('notificationDot');
        this.clearBtn = document.getElementById('clearAllNotifications');

        this.init();
    }

    init() {
        if (!this.notifList) return;
        this.setupSocketListeners();
        this.loadSavedNotifications();
        this.setupEventListeners();
    }

    // --- Utility: Time Ago Formatter ---
    timeAgo(date) {
        const seconds = Math.floor((new Date() - new Date(date)) / 1000);
        let interval = seconds / 31536000;
        if (interval > 1) return Math.floor(interval) + "y ago";
        interval = seconds / 2592000;
        if (interval > 1) return Math.floor(interval) + "mo ago";
        interval = seconds / 86400;
        if (interval > 1) return Math.floor(interval) + "d ago";
        interval = seconds / 3600;
        if (interval > 1) return Math.floor(interval) + "h ago";
        interval = seconds / 60;
        if (interval > 1) return Math.floor(interval) + "m ago";
        return "Just now";
    }

    // --- 1. Listen for Live Socket Events ---
    setupSocketListeners() {
        if (!window.socket) return;
        
        window.socket.on('bookingStatusUpdate', (data) => {
            console.log("🔥 [LIVE NOTIFICATION RECEIVED]:", data); // Added debug log

            try {
                // Safe Toast Fallback
                if (typeof Toast !== 'undefined') {
                    if (data.status === 'success') Toast.success(`✅ ${data.message}`);
                    else if (data.status === 'warning' || data.status === 'danger') Toast.error(`⚠️ ${data.message}`);
                    else {
                        // Fallback for 'info'
                        if (Toast.info) Toast.info(`ℹ️ ${data.message}`);
                        else Toast.success(`ℹ️ ${data.message}`);
                    }
                }

                // Update UI Elements
                if (this.emptyMsg) this.emptyMsg.style.display = 'none';
                if (this.redDot) this.redDot.style.display = 'block';

                // Build and inject HTML
                const html = this.buildNotificationHtml(data, false);
                this.notifList.insertAdjacentHTML('afterbegin', html);

                // Dispatch custom event for smooth in-place DOM updates without page reloads
                window.dispatchEvent(new CustomEvent('liveBookingUpdate', { detail: data }));
            } catch (err) {
                console.error("❌ Error rendering live notification:", err);
            }
        });

        window.socket.on('cancellationResolved', (data) => {
            console.log("🔥 [CANCELLATION RESOLVED RECEIVED]:", data);
            if (typeof Toast !== 'undefined') {
                if (data.action === 'approved') {
                    Toast.success(`✅ Your cancellation was approved! Refund of ₹${(data.refund||0).toLocaleString('en-IN')} is on its way.`);
                } else {
                    Toast.error('❌ Your cancellation request was rejected by the organizer.');
                }
            }
            // Dispatch custom event for smooth in-place DOM updates without page reloads
            window.dispatchEvent(new CustomEvent('liveCancellationResolved', { detail: data }));
            }
        });
    }

    // --- 2. Fetch Initial Notifications on Load ---
    async loadSavedNotifications() {

        // ✨ FIX: Added the admin path check here!
        if (!window.location.pathname.startsWith('/user') && 
            !window.location.pathname.startsWith('/organizer') && 
            !window.location.pathname.startsWith('/admin')) {
            return;
        }
        let basePath = '/user';
        if (window.location.pathname.startsWith('/organizer')) basePath = '/organizer';
        if (window.location.pathname.startsWith('/admin')) basePath = '/admin';
        try {
            const res = await axios.get(`${basePath}/notifications`);
            if (res.data.success) {
                const { notifications, unreadCount } = res.data;
                
                if (this.redDot) this.redDot.style.display = unreadCount > 0 ? 'block' : 'none';

                if (notifications.length > 0) {
                    if (this.emptyMsg) this.emptyMsg.style.display = 'none';
                    this.notifList.innerHTML = ''; 

                    notifications.forEach(notif => {
                        const html = this.buildNotificationHtml({
                            id: notif._id,
                            status: notif.status,
                            message: notif.message,
                            date: notif.createdAt
                        }, notif.isRead);
                        
                        this.notifList.insertAdjacentHTML('beforeend', html);
                    });
                }
            }
        } catch (error) {
            console.error('Failed to load notifications:', error);
        }
    }

    // --- HTML Builder Function (MAPPED TO YOUR CSS) ---
    buildNotificationHtml(data, isRead = false) {
        // Map status to your CSS icon wrapper themes
        let iconTheme = 'info'; 
        let iconClass = 'fi-rr-bell';

        if (data.status === 'success') {
            iconTheme = 'success';
            iconClass = 'fi-rr-check-circle';
        } else if (data.status === 'warning' || data.status === 'danger') {
            iconTheme = 'danger';
            iconClass = 'fi-rr-triangle-warning';
        }

        // Override theme if it has already been read
        if (isRead) iconTheme = 'read';

        // Apply unread class based on state
        const readStateClass = isRead ? '' : 'unread';
        const dateText = data.date ? this.timeAgo(data.date) : "Just now";

        return `
            <div class="notification-item ${readStateClass} position-relative" id="notif-${data.id}">
                <button onclick="window.notificationManager.deleteNotification('${data.id}', event)" class="position-absolute top-0 end-0 m-2 btn btn-link p-0 text-decoration-none notif-close-btn" style="z-index: 10;" title="Delete">
                    <i class="fi fi-rr-cross-small"></i>
                </button>
                
                <div class="notif-icon-wrapper ${iconTheme}">
                    <i class="fi ${iconClass}"></i>
                </div>
                
                <div class="notif-content pe-3">
                    <p class="notif-message">${data.message}</p>
                    <span class="notif-time">${dateText}</span>
                </div>
            </div>
        `;
    }

    // --- 3. Delete Individual Notification ---
    async deleteNotification(notifId, event) {
        event.stopPropagation(); // Keep dropdown open
        let basePath = '/user';
        if (window.location.pathname.startsWith('/organizer')) basePath = '/organizer';
        if (window.location.pathname.startsWith('/admin')) basePath = '/admin';
        try {
            const el = document.getElementById(`notif-${notifId}`);
            if (el) {
                el.style.opacity = '0'; // Smooth fade out
                setTimeout(() => el.remove(), 300); 
            }

            // Hit Backend
            await axios.delete(`${basePath}/notifications/${notifId}`);
            
            // Check if it was the last one, restore empty state
            setTimeout(() => {
                if (document.querySelectorAll('.notification-item').length === 0) {
                    this.notifList.innerHTML = `
                        <div class="p-5 text-center text-dim" id="emptyNotificationMsg">
                            <i class="fi fi-rr-envelope-open d-block mb-2 opacity-50" style="font-size: 2rem;"></i>
                            <p class="small m-0">All caught up!</p>
                        </div>
                    `;
                    if(this.redDot) this.redDot.style.display = 'none';
                }
            }, 350);
        } catch (err) {
            console.error("Failed to delete notification", err);
        }
    }

    // --- 4. Event Listeners ---
    setupEventListeners() {
        // 1. Mark All Read Button Logic
        if (this.clearBtn) {
            this.clearBtn.addEventListener('click', async (e) => {
                e.stopPropagation(); 
                let basePath = '/user';
                if (window.location.pathname.startsWith('/organizer')) basePath = '/organizer';
                if (window.location.pathname.startsWith('/admin')) basePath = '/admin';
                try {
                    await axios.post(`${basePath}/notifications/mark-read`);
                    if (this.redDot) this.redDot.style.display = 'none';
                    this.loadSavedNotifications(); // Reload list to trigger read styles
                } catch(err) {
                    console.error(err);
                }
            });
        }

        // 2. ✨ THE MISSING TOGGLE LOGIC ✨
        const bellBtn = document.querySelector('.nav-bell-btn');
        const dropdownMenu = document.querySelector('#notificationDropdown .dropdown-menu');

        if (bellBtn && dropdownMenu) {
            // Toggle dropdown when clicking the bell
            bellBtn.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation(); // Stop click from bubbling up
                dropdownMenu.classList.toggle('show');
            });

            // Close dropdown if user clicks anywhere else on the screen
            document.addEventListener('click', (e) => {
                if (!bellBtn.contains(e.target) && !dropdownMenu.contains(e.target)) {
                    dropdownMenu.classList.remove('show');
                }
            });
        }
    }
}

// Initialize when the DOM is fully loaded
document.addEventListener('DOMContentLoaded', () => {
    window.notificationManager = new NotificationManager();
});