import * as userServices from '../../services/users/userService.js';
import * as userDashboardService from '../../services/users/userDashboardService.js';
import * as userEventService from '../../services/users/userEventService.js';
import Notification from '../../models/notifications/notification.js';
import HTTP_STATUS from '../../constant/statusCode.js';


// ─── Fetch User Notifications ───────────────────────────────────────────────
export const getMyNotifications = async (req, res, next) => {
    try {
        // Find latest 15 notifications for this user
        const notifications = await Notification.find({ recipient: req.session.user._id })
            .sort({ createdAt: -1 })
            .limit(15);
            
        // Count unread ones for the red dot
        const unreadCount = await Notification.countDocuments({ recipient: req.session.user._id, isRead: false });
        
        res.json({ success: true, notifications, unreadCount });
    } catch (error) {
        next(error);
    }
};

export const markNotificationsRead = async (req, res, next) => {
    try {
        await Notification.updateMany(
            { recipient: req.session.user._id, isRead: false },
            { $set: { isRead: true } }
        );
        res.json({ success: true });
    } catch (error) {
        next(error);
    }
};

export const clearNotifications = async (req, res, next) => {
    try {
        await Notification.deleteMany({ recipient: req.session.user._id });
        res.json({ success: true });
    } catch (error) {
        next(error);
    }
};

// ─── Delete Individual Notification ─────────────────────────────────────────
export const deleteNotification = async (req, res, next) => {
    try {
        const { id } = req.params;
        // Ensure the user can only delete their own notifications
        const deleted = await Notification.findOneAndDelete({
            _id: id,
        });

        if (!deleted) {
            return res.status(HTTP_STATUS.NOT_FOUND).json({ success: false, message: 'Notification not found' });
        }

        res.json({ success: true, message: 'Notification deleted' });
    } catch (error) {
        next(error);
    }
};

// ─── AI Avatar Generation ─────────────────────────────────────────────────────
export const generateAIAvatar = async (req, res, next) => {
    try {
        console.log('🤖 [AI] Request received for prompt:', req.body.prompt);
        const buffer = await userDashboardService.generateAIAvatar(req.body.prompt);
        console.log('✅ [AI] Image downloaded successfully!');
        res.set('Content-Type', 'image/jpeg');
        res.send(buffer);
    } catch (error) {
        console.error('❌ [AI] Backend Generation Error:', error.message);
        res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({ success: false, message: 'Failed to generate AI image' });
    }
};

// ─── AI Poster Generation ─────────────────────────────────────────────────────
export const generatePoster = async (req, res) => {
    try {
        const { prompt } = req.body;
        
        if (!prompt) {
            return res.status(HTTP_STATUS.BAD_REQUEST).json({ success: false, message: 'Prompt is required' });
        }

        const imageUrl = await userServices.generateAIPoster(prompt);
        
        res.json({ success: true, imageUrl });
    } catch (error) {
        console.error('Error in poster generation:', error);
        res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({ success: false, message: 'Failed to generate AI image' });
    }
};


// ─── Homepage ─────────────────────────────────────────────────────────────────
export const getHomepage = async (req, res, next) => {
    try {
        const userId = req.session?.user?._id;
        const latestEvents = await userEventService.getLatestEvents(userId);
        res.render('index', { latestEvents });
    } catch (error) {
        next(error);
    }
};


// ─── User Dashboard ───────────────────────────────────────────────────────────
export const getDashboard = async (req, res, next) => {
    try {
        const data = await userDashboardService.getDashboardData(req.session.user._id);
        res.render('users/dashboard', { title: 'User Dashboard', ...data });
    } catch (error) {
        next(error);
    }
};

// ─── User Calendar ────────────────────────────────────────────────────────────
export const getCalendar = async (req, res, next) => {
    try {
        const data = await userDashboardService.getDashboardData(req.session.user._id);
        res.render('users/calendar', { title: 'My Event Calendar', calendarEvents: data.calendarEvents });
    } catch (error) {
        next(error);
    }
};


// ─── Profile Page ─────────────────────────────────────────────────────────────
export const getUserProfile = async (req, res, next) => {
    try {
        const data = await userDashboardService.getDashboardData(req.session.user._id);
        const userWithPassword = await import('../../models/users/user.js').then(m => m.default.findById(req.session.user._id).select('+password'));
        const hasPassword = !!(userWithPassword && userWithPassword.password);
        res.render('users/profile', { title: 'My Profile', calendarEvents: data.calendarEvents, hasPassword });
    } catch (error) {
        next(error);
    }
};


// ─── Update Avatar ────────────────────────────────────────────────────────────
export const updateUserAvatar = async (req, res, next) => {
    try {
        if (!req.file || !req.file.path)
            return res.status(HTTP_STATUS.BAD_REQUEST).json({ success: false, message: 'No image provided' });

        const result = await userServices.updateUserAvatar(req.session.user._id, req.file.path);

        req.session.user.avatar = result.avatar;
        req.session.save((err) => {
            if (err) return next(err);
            res.status(HTTP_STATUS.OK).json({ success: true, message: 'Profile picture updated!', avatarUrl: result.avatar });
        });
    } catch (error) {
        next(error);
    }
};


// ─── Update Profile ───────────────────────────────────────────────────────────
export const updateUserProfile = async (req, res, next) => {
    try {
        const { fullName, dob = '', phone = '', address = '', bio = '' } = req.body;
        if (!fullName)
            return res.status(HTTP_STATUS.BAD_REQUEST).json({ success: false, message: 'Must Contain Full Name' });

        const updateData = {
            fullName: fullName.trim(),
            phone:    phone.trim(),
            address:  address.trim(),
            bio:      bio.trim(),
            dob:      dob.trim() !== '' ? new Date(dob) : null
        };

        const result = await userServices.updateUserProfile(req.session.user._id, updateData);
        if (!result)
            return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({ success: false, message: 'Internal Server Error' });

        req.session.user = result;
        req.session.save((err) => {
            if (err) return next(err);
            res.status(HTTP_STATUS.OK).json({ success: true, message: 'Profile updated Successfully!', updateUserData: result });
        });
    } catch (error) {
        next(error);
    }
};


// ─── Update Email ─────────────────────────────────────────────────────────────
export const updateUserEmail = async (req, res, next) => {
    try {
        if (req.session.user.googleId) {
            return res.status(HTTP_STATUS.FORBIDDEN).json({ success: false, message: 'Google users cannot change their email address.' });
        }
        const { newEmail } = req.body;
        if (newEmail === req.session.user.email) {
            return res.status(HTTP_STATUS.BAD_REQUEST).json({ success: false, message: 'Current email and new email cannot be the same.' });
        }
        req.session.tempData = { email: newEmail };

        const result = await userServices.updateUserEmail({ email: newEmail });
        if (!result)
            return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({ success: false, message: 'Internal Server Error' });

        req.session.save((err) => {
            if (err) return next(err);
            res.status(HTTP_STATUS.OK).json({
                success: true,
                message: 'OTP Sent To email Id',
                redirect: '/user/verify-otp?action=email-update'
            });
        });
    } catch (error) {
        next(error);
    }
};


// ─── Update Password ──────────────────────────────────────────────────────────
export const updatePassword = async (req, res, next) => {
    try {
        if (req.session.user.googleId) {
            return res.status(HTTP_STATUS.FORBIDDEN).json({ success: false, message: 'Google users cannot change their password.' });
        }
        const { currentPassword, newPassword, action } = req.body;
        const currentUserId = req.session.user._id;
        const result = await userServices.updatePassword(currentUserId, currentPassword, newPassword, action);
        if (!result)
            return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({ success: false, message: 'Internal Server Error' });

        req.session.user = result;
        req.session.save((err) => {
            if (err) return next(err);
            res.status(HTTP_STATUS.OK).json({ success: true, message: 'Password Saved Successfully' });
        });
    } catch (error) {
        next(error);
    }
};
