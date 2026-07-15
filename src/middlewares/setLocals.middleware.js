/**
 * Global middleware to make session data accessible in all EJS files safely.
 */
export const setLocals = (req, res, next) => {
    // Regular users (including Passport.js if you use it)
    res.locals.user = req.session.user || null;
    
    // Organizers
    res.locals.organizer = req.session.organizer || null;

    // Admins
    res.locals.admin = req.session.admin || null;

    // Current User ID and Role for live sockets
    let currentUserId = null;
    let currentUserRole = null;
    if (res.locals.user) {
        currentUserId = res.locals.user._id;
        currentUserRole = 'user';
    } else if (res.locals.organizer) {
        currentUserId = res.locals.organizer._id;
        currentUserRole = 'organizer';
    } else if (res.locals.admin) {
        currentUserId = res.locals.admin._id;
        currentUserRole = 'admin';
    }
    res.locals.currentUserId = currentUserId;
    res.locals.currentUserRole = currentUserRole;

    // Time formatting helper (12-hour format: e.g. 18:00 -> 6:00 PM)
    res.locals.formatTime12 = (time24) => {
        if (!time24) return '';
        let [h, m] = time24.split(':');
        h = parseInt(h, 10);
        const ampm = h >= 12 ? 'PM' : 'AM';
        h = h % 12 || 12;
        return `${h}:${m} ${ampm}`;
    };

    next();
};