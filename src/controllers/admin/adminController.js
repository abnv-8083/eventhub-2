import HTTP_STATUS from '../../constant/statusCode.js';
import * as adminServices from '../../services/admin/adminServices.js';
import * as dashboardService from '../../services/admin/adminDashboardService.js';
import Notification from '../../models/notifications/notification.js';

// ─── Admin Dashboard ──────────────────────────────────────────────────────────
export const getAdminDashboard = async (req, res, next) => {
    try {
        const stats = await dashboardService.getDashboardStats();
        res.render('admin/dashboard', { title: 'Admin Dashboard', ...stats });
    } catch (error) {
        next(error);
    }
};


// ─── Users List ───────────────────────────────────────────────────────────────
export const getAdminUser = async (req, res, next) => {
    try {
        const { search, status, sort, page = 1 } = req.query;
        const userQuery = {
            role:   'user',
            search: search || '',
            status: status || 'all',
            sort:   sort   || 'newest',
            page:   parseInt(page),
            limit:  10
        };
        const { dbUsers, totalUsers, bannedUsers, totalPages, currentPage } = await adminServices.fetchAllUsers(userQuery);
        res.render('admin/users/index', { dbUsers, totalUsers, bannedUsers, filters: { search, status, sort }, totalPages, currentPage });
    } catch (error) {
        next(error);
    }
};


// ─── Toggle User Block ────────────────────────────────────────────────────────
export const toggleUserBlock = async (req, res, next) => {
    try {
        const { userId } = req.body;
        if (!userId) return res.status(HTTP_STATUS.BAD_REQUEST).json({ success: false, message: 'User ID is required' });

        const updatedUser = await adminServices.toggleUserBlockStatus(userId);
        res.status(HTTP_STATUS.OK).json({
            success: true,
            message: `User successfully ${updatedUser.isBlocked ? 'blocked' : 'unblocked'}.`
        });
    } catch (error) {
        next(error);
    }
};


// ─── Delete User ──────────────────────────────────────────────────────────────
export const deleteUser = async (req, res, next) => {
    try {
        const { userId } = req.body;
        if (!userId) return res.status(HTTP_STATUS.BAD_REQUEST).json({ success: false, message: 'User ID is required' });

        await adminServices.deleteUserById(userId);
        res.status(HTTP_STATUS.OK).json({ success: true, message: 'User account permanently deleted.' });
    } catch (error) {
        next(error);
    }
};


// ─── Organizers List ──────────────────────────────────────────────────────────
export const getAdminOrganizers = async (req, res, next) => {
    try {
        const { search, status, sort, page = 1 } = req.query;
        const organizerQuery = {
            role:   'organizer',
            search: search || '',
            status: status || 'all',
            sort:   sort   || 'newest',
            page:   parseInt(page),
            limit:  10
        };
        const { dbUsers, totalUsers, totalPages, currentPage } = await adminServices.fetchAllUsers(organizerQuery);
        res.render('admin/organizers/index', {
            organizers: dbUsers,
            totalOrganizers: totalUsers,
            totalPages,
            currentPage,
            filters: { search, status, sort }
        });
    } catch (error) {
        next(error);
    }
};


// ─── Update Organizer Status ──────────────────────────────────────────────────
export const updateOrganizerStatus = async (req, res, next) => {
    try {
        const { orgId, status } = req.body;
        await dashboardService.updateOrganizerStatus(orgId, status);
        res.status(HTTP_STATUS.OK).json({ success: true, message: `Organizer successfully marked as ${status}.` });
    } catch (error) {
        next(error);
    }
};



// ─── Category Page (simple render) ───────────────────────────────────────────
export const getCategoryPage = (req, res, next) => {
    try {
        res.render('admin/categories/index', { title: 'Category Management', categories: null });
    } catch (error) {
        next(error);
    }
};

// ─── Fetch Admin Notifications ──────────────────────────────────────────────
export const getMyNotifications = async (req, res, next) => {
    try {
        const notifications = await Notification.find({ recipient: req.session.admin._id })
            .sort({ createdAt: -1 })
            .limit(15);
            
        const unreadCount = await Notification.countDocuments({ recipient: req.session.admin._id, isRead: false });
        res.json({ success: true, notifications, unreadCount });
    } catch (error) {
        next(error);
    }
};

// ─── Mark Notifications as Read ─────────────────────────────────────────────
export const markNotificationsRead = async (req, res, next) => {
    try {
        await Notification.updateMany(
            { recipient: req.session.admin._id, isRead: false },
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
            recipient: req.session.admin._id
        });
        if (!deleted) return res.status(404).json({ success: false, message: 'Notification not found' });
        res.json({ success: true, message: 'Notification deleted' });
    } catch (error) {
        next(error);
    }
};