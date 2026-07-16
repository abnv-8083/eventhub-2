import User from '../models/users/user.model.js'

export const checkBlocked = async (req, res, next) => {
    try {
        // 1. Identify which session is active
        const userId = req.session.user?._id || req.session.organizer?._id || req.session.admin?._id;

        // 2. If no user is logged in, move to next (auth middleware will handle access)
        if (!userId) {
            return next();
        }

        // 3. Fetch fresh status from DB
        const user = await User.findById(userId);

        // 4. If user doesn't exist or is blocked, destroy session
        if (!user || user.isBlocked) {
            return req.session.destroy((err) => {
                if (err) console.error("Session destruction error:", err);
                
                // Redirect with a message
                const message = encodeURIComponent("Your account has been suspended. Please contact support.");
                if(user.role == 'user' || user.role == 'organizer'){
                    return res.redirect(`/user/login?error=${message}`);
                }else{
                    return res.redirect(`/admin/login?error=${message}`);
                }
            });
        }

        // 5. User is active, proceed
        next();
    } catch (error) {
        console.error("Blocked Check Middleware Error:", error);
        next();
    }
};