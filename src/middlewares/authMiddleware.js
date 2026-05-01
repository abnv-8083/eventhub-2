// src/middlewares/authMiddleware.js

/**
 * Ensures the user is NOT logged in.
 * Use this for routes like Login, Signup, Forgot Password.
 */
export const isGuest = (req, res, next) => {
    // If the session exists AND it has a user object attached...
    if (req.session && req.session.user) {
        // They are already logged in! Send them away.
        // (You can change '/' to '/dashboard' if you prefer)
        return res.redirect('/'); 
    }
    
    // If they are not logged in, allow them to proceed to the login page.
    next();
};

/**
 * Ensures the user IS logged in.
 * Use this to protect private routes like Profile, Tickets, or Dashboard.
 */
export const isAuthenticated = (req, res, next) => {
    if (!req.session || !req.session.user) {
        // They are not logged in, redirect them to the login page
        return res.redirect('/user/login?message=Please log in to access this page');
    }
    
    // They are logged in, allow them to proceed
    next();
};