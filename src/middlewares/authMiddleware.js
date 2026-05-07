// src/middlewares/authMiddleware.js

import HTTP_STATUS from "../constant/statusCode.js";

/**
 * Ensures the user is NOT logged in.
 * Use this for routes like Login, Signup, Forgot Password.
 */
export const isGuest = (req, res, next) => {
    // If the session exists AND it has a user object attached...
    if (req.session && req.session.user) {
        // They are already logged in! Send them away.
        // (You can change '/' to '/dashboard' if you prefer)
        console.log('in auth guest middleware')
        return res.redirect('/'); 
    }
    
    // If they are not logged in, allow them to proceed to the login page.
    next();
};

/**
 * Ensures the user IS logged in.
 * Use this to protect private routes like Profile, Tickets, or Dashboard.
 */
export const isUserAuthenticated = (req, res, next) => {
    if (!req.session || (!req.session.user && !req.user)) {
        // They are not logged in, redirect them to the login page
        return res.redirect('/user/login/?message=Session Expired. Please log in.')
    }
    
    // They are logged in, allow them to proceed
    next();
};

export const isOrganizerAuthenticated = (req, res, next) => {
    if (!req.session || !req.session.organizer) {
        // They are not logged in, redirect them to the login page
        return res.redirect('/?message=Please log in.');
    }
    // They are logged in, allow them to proceed
    next();
};

export const isAdminAuthenticated = (req, res, next) => {
    if (!req.session || !req.session.admin) {
        // They are not logged in, redirect them to the login page
        return res.redirect('/admin/?message=Session Expired. Please log in.');
    }
    // They are logged in, allow them to proceed
    next();
};
