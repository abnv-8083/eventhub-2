document.addEventListener('DOMContentLoaded', () => {
    // 1. Element References
    const userBtn = document.getElementById('userMenuBtn');
    const userMenu = document.getElementById('userDropdown');
    
    const notifBtn = document.getElementById('notificationBell');
    const notifMenu = document.querySelector('#notificationDropdown .dropdown-menu');

    // 2. Profile Menu Positioning
    function positionUserMenu() {
        if (!userBtn || !userMenu) return;
        const rect = userBtn.getBoundingClientRect();
        userMenu.style.top = (rect.bottom + 12) + 'px';
        userMenu.style.right = (window.innerWidth - rect.right) + 'px';
        userMenu.style.left = 'auto';
    }

    // 3. Unified Click Handler for Menus
    document.addEventListener('click', (e) => {
        // --- Handle Profile Menu Click ---
        if (userBtn && (userBtn === e.target || userBtn.contains(e.target))) {
            e.preventDefault();
            if (notifMenu) notifMenu.classList.remove('show'); // Close notifications if open
            
            if (userMenu.style.display === 'flex') {
                userMenu.style.display = 'none';
            } else {
                positionUserMenu();
                userMenu.style.display = 'flex';
            }
        } 
        // --- Handle Notification Bell Click ---
        else if (notifBtn && (notifBtn === e.target || notifBtn.contains(e.target))) {
            e.preventDefault();
            if (userMenu) userMenu.style.display = 'none'; // Close profile if open
            
            if (notifMenu) notifMenu.classList.toggle('show');
        } 
        // --- Clicked Outside ---
        else {
            if (userMenu && !userMenu.contains(e.target)) userMenu.style.display = 'none';
            if (notifMenu && !notifMenu.contains(e.target)) notifMenu.classList.remove('show');
        }
    });

    // Recalculate on window resize
    window.addEventListener('resize', () => {
        if (userMenu && userMenu.style.display === 'flex') positionUserMenu();
    });

    // Centralized Logout Logic
    const handleLogout = async (route) => {
        try {
            const response = await axios.post(route);
            if (response.data.success) window.location.href = route.includes('admin') ? '/admin' : '/';
        } catch (error) { console.error("Logout failed", error); }
    };

    document.getElementById('userLogoutButton')?.addEventListener('click', () => handleLogout('/user/logout'));
    document.getElementById('adminLogoutButton')?.addEventListener('click', () => handleLogout('/admin/logout'));
    document.getElementById('organizerLogoutButton')?.addEventListener('click', () => handleLogout('/organizer/logout'));
});

// --- DATABASE & SOCKET NOTIFICATION UI LOGIC ---

// 1. Function to inject a single notification into the HTML
function injectNotificationHTML(data, prepend = true) {
    const list = document.getElementById('notificationList');
    const emptyMsg = document.getElementById('emptyNotificationMsg');
    
    if (emptyMsg) emptyMsg.style.display = 'none';

    // Figure out the styling and icon based on the status
    let iconClass = 'info';
    let iconHtml = '<i class="fi fi-rr-info"></i>';
    
    if (data.status === 'approved' || data.status === 'success') {
        iconClass = 'success';
        iconHtml = '<i class="fi fi-rr-check-circle"></i>';
    }
    if (data.status === 'rejected' || data.status === 'danger') {
        iconClass = 'danger';
        iconHtml = '<i class="fi fi-rr-cross-circle"></i>';
    }

    if (data.isRead) {
        iconClass = 'read';
        iconHtml = '<i class="fi fi-rr-envelope-open"></i>';
    }

    // Format the time
    const timeText = data.createdAt ? new Date(data.createdAt).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'}) : 'Just now';

    const itemHtml = `
        <div class="notification-item ${data.isRead ? '' : 'unread'}" id="notif-${data._id}" animate-fade-in>
            <div class="notif-icon-wrapper ${iconClass}">
                ${iconHtml}
            </div>
            <div class="notif-content">
                <p class="notif-message">${data.message}</p>
                <span class="notif-time">${timeText}</span>
            </div>
            <button onclick="deleteNotification(event, '${data._id}')" class="btn-close-notif" style="background: none; border: none; color: rgba(255,255,255,0.3); cursor: pointer; padding: 5px;">
                <i class="fi fi-rr-cross-small"></i>
            </button>
        </div>
    `;

    if (list) {
        if (prepend) {
            list.insertAdjacentHTML('afterbegin', itemHtml);
        } else {
            list.insertAdjacentHTML('beforeend', itemHtml);
        }
    }
}

// 2. Main Page Load Listener
document.addEventListener('DOMContentLoaded', async () => {
    const dot = document.getElementById('notificationDot');
    
    // === A. FETCH HISTORICAL NOTIFICATIONS FROM DATABASE ===
    try {
        // Only attempt to fetch if we are actually on a dashboard that has the notification UI
        if (document.getElementById('notificationList')) {
            const response = await axios.get('/admin/notifications');
            
            if (response.data.success && response.data.notifications.length > 0) {
                // Show the red dot if there are unread messages
                if (response.data.unreadCount > 0 && dot) {
                    dot.style.display = 'block';
                }

                // Inject them all into the UI
                response.data.notifications.forEach(notif => {
                    injectNotificationHTML(notif, false); // false = append to bottom
                });
            }
        }
    } catch (error) {
        console.error("Failed to load past notifications:", error);
    }

    // === B. HANDLE "MARK ALL READ" BUTTON ===
    const clearBtn = document.getElementById('clearAllNotifications');
    if (clearBtn) {
        clearBtn.addEventListener('click', async (e) => {
            e.stopPropagation(); // Stop the dropdown from closing
            try {
                await axios.post('/admin/notifications/mark-read');
                
                // Hide the red dot
                if (dot) dot.style.display = 'none';
                
                // Remove the "unread" styling and update icons for all currently visible items
                document.querySelectorAll('.notification-item.unread').forEach(item => {
                    item.classList.remove('unread');
                    const iconWrapper = item.querySelector('.notif-icon-wrapper');
                    if (iconWrapper) {
                        iconWrapper.className = 'notif-icon-wrapper read';
                        iconWrapper.innerHTML = '<i class="fi fi-rr-envelope-open"></i>';
                    }
                });
                
            } catch (err) {
                console.error("Could not mark notifications read", err);
            }
        });
    }

    // === C. LISTEN FOR NEW LIVE NOTIFICATIONS VIA SOCKET ===
    if (window.socket) {
        window.socket.on('statusUpdate', (data) => {
            // 1. Show the red dot
            const dot = document.getElementById('notificationDot');
            if (dot) dot.style.display = 'block';

            // 2. Inject the HTML into the list immediately
            if (typeof injectNotificationHTML === 'function') {
                injectNotificationHTML({
                    message: data.message,
                    status: data.status,
                    isRead: false,
                    createdAt: new Date()
                }, true); // 'true' means put it at the top
            }

            // 3. Show the Toast alert
            if (typeof Toast !== 'undefined') {
                Toast.info(data.message);
            }
        });
    }
});

async function deleteNotification(event, notifId) {
    // Prevent the dropdown from closing when clicking the delete button
    event.stopPropagation(); 

    try {
        const response = await axios.delete(`/admin/notifications/${notifId}`);
        
        if (response.data.success) {
            // 1. Find the specific notification element using the ID we set in the template
            const element = document.getElementById(`notif-${notifId}`);
            
            if (element) {
                // 2. Add a smooth fade-out effect before removing
                element.style.transition = 'all 0.3s ease';
                element.style.opacity = '0';
                element.style.transform = 'translateX(20px)';
                
                // 3. Remove the element from the DOM after the animation
                setTimeout(() => {
                    element.remove();
                    
                    // 4. If the list is now empty, show the "All caught up" message
                    const remainingItems = document.querySelectorAll('.notification-item');
                    if (remainingItems.length === 0) {
                        const emptyMsg = document.getElementById('emptyNotificationMsg');
                        if (emptyMsg) emptyMsg.style.display = 'block';
                        
                        // Also hide the red notification dot
                        const dot = document.getElementById('notificationDot');
                        if (dot) dot.style.display = 'none';
                    }
                }, 300);
            }
        }
    } catch (error) {
        console.error("Failed to delete notification:", error);
    }
}