import HTTP_STATUS from '../../constant/statusCode.js';
import * as organizerService from '../../services/organizers/organizerService.js';
import * as userServices from '../../services/users/userService.js';
import * as userDashboardService from '../../services/users/userDashboardService.js';
import Notification from '../../models/notifications/notification.js';
// ─── Organizer Dashboard ──────────────────────────────────────────────────────
export const getDashboard = async (req, res, next) => {
    try {
        const data = await organizerService.getDashboardData(req.session.organizer._id);
        res.render('organizer/dashboard', {
            title: 'Organizer Dashboard',
            user: req.session.organizer,
            organizer: req.session.organizer,
            ...data
        });
    } catch (error) {
        next(error);
    }
};


// ─── Fetch Organizer Notifications ──────────────────────────────────────────
export const getMyNotifications = async (req, res, next) => {
    try {
        const notifications = await Notification.find({ recipient: req.session.organizer._id })
            .sort({ createdAt: -1 })
            .limit(15);
            
        const unreadCount = await Notification.countDocuments({ recipient: req.session.organizer._id, isRead: false });
        
        res.json({ success: true, notifications, unreadCount });
    } catch (error) {
        next(error);
    }
};

// ─── Mark Notifications as Read ─────────────────────────────────────────────
export const markNotificationsRead = async (req, res, next) => {
    try {
        await Notification.updateMany(
            { recipient: req.session.organizer._id, isRead: false },
            { $set: { isRead: true } }
        );
        res.json({ success: true });
    } catch (error) {
        next(error);
    }
};

// ─── Delete Individual Notification ─────────────────────────────────────────
export const deleteNotification = async (req, res, next) => {
    try {
        const deleted = await Notification.findOneAndDelete({
            _id: req.params.id,
            recipient: req.session.organizer._id
        });

        if (!deleted) return res.status(HTTP_STATUS.NOT_FOUND).json({ success: false, message: 'Notification not found' });
        res.json({ success: true, message: 'Notification deleted' });
    } catch (error) {
        next(error);
    }
};

// ─── Profile Management ───────────────────────────────────────────────────────
export const getProfile = async (req, res, next) => {
    try {
        const userWithPassword = await import('../../models/users/user.js').then(m => m.default.findById(req.session.organizer._id).select('+password'));
        const hasPassword = !!(userWithPassword && userWithPassword.password);
        res.render('organizer/profile', {
            title: 'Organizer Profile',
            organizer: req.session.organizer,
            hasPassword
        });
    } catch (error) {
        next(error);
    }
};

export const updateProfile = async (req, res, next) => {
    try {
        const { organizationName, fullName, phone = '', address = '', bio = '' } = req.body;
        
        const updateData = {
            organizationName: organizationName?.trim(),
            fullName: fullName?.trim(),
            phone: phone?.trim(),
            address: address?.trim(),
            bio: bio?.trim()
        };

        const result = await userServices.updateUserProfile(req.session.organizer._id, updateData);
        if (!result) return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({ success: false, message: 'Internal Server Error' });

        req.session.organizer = result;
        req.session.save((err) => {
            if (err) return next(err);
            res.status(HTTP_STATUS.OK).json({ success: true, message: 'Profile updated Successfully!', updateUserData: result });
        });
    } catch (error) {
        next(error);
    }
};

export const updateAvatar = async (req, res, next) => {
    try {
        if (!req.file || !req.file.path)
            return res.status(HTTP_STATUS.BAD_REQUEST).json({ success: false, message: 'No image provided' });

        const result = await userServices.updateUserAvatar(req.session.organizer._id, req.file.path);

        req.session.organizer.avatar = result.avatar;
        req.session.save((err) => {
            if (err) return next(err);
            res.status(HTTP_STATUS.OK).json({ success: true, message: 'Profile picture updated!', avatarUrl: result.avatar });
        });
    } catch (error) {
        next(error);
    }
};

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

export const updateEmail = async (req, res, next) => {
    try {
        if (req.session.organizer.googleId) {
            return res.status(HTTP_STATUS.FORBIDDEN).json({ success: false, message: 'Google users cannot change their email address.' });
        }
        const { newEmail } = req.body;
        if (newEmail === req.session.organizer.email) {
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

export const updatePassword = async (req, res, next) => {
    try {
        if (req.session.organizer.googleId) {
            return res.status(HTTP_STATUS.FORBIDDEN).json({ success: false, message: 'Google users cannot change their password.' });
        }
        const { currentPassword, newPassword, action } = req.body;
        const currentUserId = req.session.organizer._id;
        const result = await userServices.updatePassword(currentUserId, currentPassword, newPassword, action);
        if (!result)
            return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({ success: false, message: 'Internal Server Error' });

        req.session.organizer = result;
        req.session.save((err) => {
            if (err) return next(err);
            res.status(HTTP_STATUS.OK).json({ success: true, message: 'Password Saved Successfully' });
        });
    } catch (error) {
        next(error);
    }
};