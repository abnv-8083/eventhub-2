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

if (typeof socket !== 'undefined') {
    socket.on('statusUpdate', (data) => {
        const dot = document.getElementById('notificationDot');
        const list = document.getElementById('notificationList');
        const emptyMsg = document.getElementById('emptyNotificationMsg');

        if (dot) dot.style.display = 'block';
        if (emptyMsg) emptyMsg.remove();

        const isApproved = data.status === 'approved';

        const itemHtml = `
            <div class="notification-item unread animate-fade-in">
                <div class="notif-icon-wrapper ${isApproved ? 'success' : 'danger'}">
                    
                    <img src="/images/notification.png" alt="Alert" style="width: 20px; height: 20px; object-fit: contain;">
                    
                </div>
                <div class="flex-grow-1" style="display: flex; flex-direction: column; justify-content: center;">
                    <p class="text-white mb-1" style="font-size: 0.9rem; line-height: 1.4; margin: 0;">${data.message}</p>
                    <span class="text-dim" style="font-size: 0.75rem;">Just now</span>
                </div>
            </div>
        `;

        if (list) {
            list.insertAdjacentHTML('afterbegin', itemHtml);
        }
        
        // Show Toast fallback
        if (typeof Toast !== 'undefined') {
            if (data.status === 'approved') Toast.success(data.message);
            else if (data.status === 'rejected') Toast.error(data.message);
            else Toast.info(data.message);
        }
    });
}