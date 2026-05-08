// src/middlewares/authMiddleware.js

import HTTP_STATUS from "../constant/statusCode.js";
import User from "../models/users/user.js";
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
        return res.redirect('/?message=Session Expired. Please log in.');
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


export const isBlocked = async (req, res, next) => {
    try {
        let redirected = false;

        // 1. Check if an Admin is logged in
        if (req.session && req.session.admin) {
            const adminData = await User.findById(req.session.admin._id);
            if (!adminData || adminData.isBlocked) {
                delete req.session.admin;
                redirected = true;
                req.session.save(() => {
                    res.redirect('/admin/?message=Your account has been suspended.');
                });
            }
        }

        // If we just redirected, stop executing to prevent double-headers
        if (redirected) return;

        // 2. Check if an Organizer is logged in
        if (req.session && req.session.organizer) {
            const organizerData = await User.findById(req.session.organizer._id);
            if (!organizerData || organizerData.isBlocked) {
                delete req.session.organizer;
                redirected = true;
                req.session.save(() => {
                    res.redirect('/user/login?message=Your organizer account has been blocked by the admin.');
                });
            }
        }

        if (redirected) return;

        // 3. Check if a Regular User is logged in
        if (req.session && req.session.user) {
            const userData = await User.findById(req.session.user._id);
            if (!userData || userData.isBlocked) {
                delete req.session.user;
                redirected = true;
                req.session.save(() => {
                    res.redirect('/user/login?message=Your account has been blocked.');
                });
            }
        }

        if (redirected) return;

        // 4. If we reach this point, nobody is blocked!
        next();

    } catch (error) {
        console.error("isBlocked Middleware Error:", error);
        next(error);
    }
};