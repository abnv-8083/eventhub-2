document.addEventListener('DOMContentLoaded', () => {
    const btn = document.getElementById('userMenuBtn');
    const menu = document.getElementById('userDropdown');

    function positionMenu() {
        if (!btn || !menu) return;
        const rect = btn.getBoundingClientRect();
        menu.style.top = (rect.bottom + 12) + 'px';
        menu.style.right = (window.innerWidth - rect.right) + 'px';
        menu.style.left = 'auto';
    }

    document.addEventListener('click', (e) => {
        if (!btn || !menu) return;
        if (btn === e.target || btn.contains(e.target)) {
            e.preventDefault();
            if (menu.style.display === 'flex') {
                menu.style.display = 'none';
            } else {
                positionMenu();
                menu.style.display = 'flex';
            }
        } else if (!menu.contains(e.target)) {
            menu.style.display = 'none';
        }
    });

    window.addEventListener('resize', () => {
        if (menu && menu.style.display === 'flex') positionMenu();
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