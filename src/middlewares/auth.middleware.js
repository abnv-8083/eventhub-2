import HTTP_STATUS from "../constant/statusCode.js";
import User from "../models/users/user.model.js";

// ==========================================
// 1. GUEST MIDDLEWARES (For Login/Signup Pages)
// ==========================================
export const isUserGuest = (req, res, next) => {
    if (req.session && req.session.user) return res.redirect('/'); 
    next();
};

export const isOrganizerGuest = (req, res, next) => {
    if (req.session && req.session.organizer) return res.redirect('/organizer/dashboard'); 
    next();
};

export const isAdminGuest = (req, res, next) => {
    if (req.session && req.session.admin) return res.redirect('/admin/dashboard'); 
    next();
};

export const isUserLogged = (req,res,next) =>{
    if(!req.session.user){
        return res.redirect('/user/login')
    }
    next()
}

// ==========================================
// 2. AUTHENTICATION MIDDLEWARES (For Protected Routes)
// ==========================================
export const isUserAuthenticated = (req, res, next) => {
    if (!req.session || (!req.session.user && !req.user)) {
        // Return JSON for AJAX/API calls, redirect for browser navigation
        const isAjax = req.xhr || req.headers.accept?.includes('application/json');
        if (isAjax) {
            return res.status(HTTP_STATUS.UNAUTHORIZED).json({ success: false, message: 'Please log in to continue.' });
        }
        return res.redirect('/user/login?message=Please log in to continue.');
    }
    next();
};

export const isOrganizerAuthenticated = (req, res, next) => {
    if (!req.session || !req.session.organizer) {
        return res.redirect('/organizer/login?message=Please sign in as an Organizer to access this area.');
    }
    next();
};

export const isAdminAuthenticated = (req, res, next) => {
    if (!req.session || !req.session.admin) {
        return res.redirect('/admin?message=Please sign in as Admin to access the dashboard.');
    }
    next();
};

// ==========================================
// 3. BLOCKED USER MIDDLEWARE
// ==========================================
export const isBlocked = async (req, res, next) => {
    try {
        let redirected = false;

        if (req.session && req.session.admin) {
            const adminData = await User.findById(req.session.admin._id);
            if (!adminData || adminData.isBlocked) {
                delete req.session.admin;
                redirected = true;
                req.session.save(() => res.redirect('/admin/?message=Your account has been suspended.'));
            }
        }
        if (redirected) return;

        if (req.session && req.session.organizer) {
            const organizerData = await User.findById(req.session.organizer._id);
            if (!organizerData || organizerData.isBlocked) {
                delete req.session.organizer;
                redirected = true;
                req.session.save(() => res.redirect('/organizer/login?message=Your organizer account has been blocked.'));
            }
        }
        if (redirected) return;

        if (req.session && req.session.user) {
            const userData = await User.findById(req.session.user._id);
            if (!userData || userData.isBlocked) {
                delete req.session.user;
                redirected = true;
                req.session.save(() => res.redirect('/user/login?message=Your account has been blocked.'));
            }
        }
        if (redirected) return;

        next();
    } catch (error) {
        console.error("isBlocked Middleware Error:", error);
        next(error);
    }
};