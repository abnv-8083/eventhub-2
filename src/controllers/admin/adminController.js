import HTTP_STATUS from '../../constant/statusCode.js';
import * as adminServices from '../../services/admin/adminServices.js';
import * as dashboardService from '../../services/admin/adminDashboardService.js';


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
}
export const getAdminOrganizer = async (req,res, next)=>{
    try {
        const {search, status, sort, page = 1} = req.query

        const limit = 10

        const organizerQuery = {
            role: 'organizer',
            search: search || '',
            status: status || 'all',
            sort: sort || 'newest',
            page: parseInt(page),
            limit: limit,
        }

        const { dbOrganizers, totalOrganizers, pendingApprovals, totalPages, currentPage } = 
            await adminServices.fetchAllOrganizers(organizerQuery);

        res.render('admin/organizers/index', {
            organizers: dbOrganizers,
            totalOrganizers,
            pendingApprovals,
            totalPages,
            currentPage,
            filters: { search, status, sort }
        });

    } catch (error) {
        next(error)
    }
}


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


// ─── Notifications ────────────────────────────────────────────────────────────
export const getNotifications = async (req, res, next) => {
    try {
        const result = await dashboardService.getNotifications(req.session.admin._id);
        res.status(200).json({ success: true, ...result });
    } catch (error) {
        next(error);
    }
};

export const markNotificationsRead = async (req, res, next) => {
    try {
        await dashboardService.markNotificationsRead(req.session.admin._id);
        res.status(200).json({ success: true });
    } catch (error) {
        next(error);
    }
};

export const deleteNotification = async (req, res, next) => {
    try {
        await dashboardService.deleteNotification(req.params.notificationId, req.session.admin._id);
        res.status(200).json({ success: true, message: 'Notification deleted' });
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
