import * as userServices from '../../services/users/userService.js';
import * as userDashboardService from '../../services/users/userDashboardService.js';
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

// ─── Delete Individual Notification ─────────────────────────────────────────
export const deleteNotification = async (req, res, next) => {
    try {
        const { id } = req.params;
        // Ensure the user can only delete their own notifications
        const deleted = await Notification.findOneAndDelete({
            _id: id,
        });

        if (!deleted) {
            return res.status(404).json({ success: false, message: 'Notification not found' });
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
        res.status(500).json({ success: false, message: 'Failed to generate AI image' });
    }
};


// ─── Homepage ─────────────────────────────────────────────────────────────────
export const getHomepage = (req, res, next) => {
    try {
        res.render('index');
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


// ─── Profile Page ─────────────────────────────────────────────────────────────
export const getUserProfile = (req, res, next) => {
    res.render('users/profile', { title: 'My Profile' });
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
        const { newEmail } = req.body;
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
        const { currentPassword, currentUserId, newPassword, action } = req.body;
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
