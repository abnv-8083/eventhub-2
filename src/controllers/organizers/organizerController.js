import HTTP_STATUS from '../../constant/statusCode.js';
import * as organizerService from '../../services/organizers/organizerService.js';
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

        if (!deleted) return res.status(404).json({ success: false, message: 'Notification not found' });
        res.json({ success: true, message: 'Notification deleted' });
    } catch (error) {
        next(error);
    }
};