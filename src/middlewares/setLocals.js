/**
 * Global middleware to make session data accessible in all EJS files safely.
 */
export const setLocals = (req, res, next) => {
    // Regular users (including Passport.js if you use it)
    res.locals.user = req.session.user || req.user || null;
    
    // Organizers
    res.locals.organizer = req.session.organizer || null;
    
    next();
};