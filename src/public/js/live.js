/**
 * EventHub Global Live Event Manager
 * Included on all portal pages to handle real-time WebSocket events.
 */

document.addEventListener('DOMContentLoaded', () => {
    // Check if socket.io is loaded
    if (typeof io === 'undefined') return;

    // Initialize global socket
    const socket = io();
    window.socket = socket;

    // 1. Get user context from meta tags
    const userIdMeta = document.querySelector('meta[name="user-id"]');
    const userRoleMeta = document.querySelector('meta[name="user-role"]');
    
    if (userIdMeta && userIdMeta.content) {
        // Register personal room (used for notifications and personal events)
        socket.emit('register', userIdMeta.content);
        
        // If admin, join the admin room to receive system-wide events
        if (userRoleMeta && userRoleMeta.content === 'admin') {
            socket.emit('joinAdmin');
        }
    }

    // 2. Global Event Listeners & Dispatchers
    // We listen to socket events and dispatch them as native CustomEvents 
    // so individual pages can listen to what they care about without coupling to socket.io.

    socket.on('new_booking', (data) => {
        window.dispatchEvent(new CustomEvent('eh:new_booking', { detail: data }));
    });

    socket.on('booking_cancelled', (data) => {
        window.dispatchEvent(new CustomEvent('eh:booking_cancelled', { detail: data }));
    });

    socket.on('cancellation_update', (data) => {
        // Fallback toast if page isn't handling it
        if (typeof Toast !== 'undefined') {
            if (data.status === 'approved') {
                Toast.success(`✅ Cancellation Approved: ${data.message}`);
            } else {
                Toast.error(`❌ Cancellation Rejected: ${data.message}`);
            }
        }
        window.dispatchEvent(new CustomEvent('eh:cancellation_update', { detail: data }));
    });

    socket.on('event_status_update', (data) => {
        if (typeof Toast !== 'undefined') {
            Toast.success(`📢 Event Status Updated: ${data.title} is now ${data.status}`);
        }
        window.dispatchEvent(new CustomEvent('eh:event_status_update', { detail: data }));
    });

    socket.on('user_blocked', (data) => {
        if (typeof Toast !== 'undefined') {
            Toast.error('🚨 Your account has been suspended by an administrator. Logging out...');
        } else {
            alert('Your account has been suspended by an administrator.');
        }
        setTimeout(() => {
            window.location.href = '/user/logout';
        }, 3000);
    });

    socket.on('wallet_update', (data) => {
        window.dispatchEvent(new CustomEvent('eh:wallet_update', { detail: data }));
    });

    // Admin events for Event CRUD
    socket.on('event_created', (data) => {
        window.dispatchEvent(new CustomEvent('eh:event_created', { detail: data }));
    });
    
    socket.on('event_updated', (data) => {
        window.dispatchEvent(new CustomEvent('eh:event_updated', { detail: data }));
    });
    
    socket.on('event_deleted', (data) => {
        window.dispatchEvent(new CustomEvent('eh:event_deleted', { detail: data }));
    });

});
