import HTTP_STATUS from "../../constant/statusCode.js";
import * as adminServices from '../../services/admin/adminServices.js'
import User from "../../models/users/user.js";
import { getIO, getActiveUsers } from "../../utils/socket.js";
import Notification from "../../models/notifications/notification.js";

export const getAdminDashboard = (req,res,next)=>{
    try {
        res.render('admin/dashboard',{title: 'Admin Dashboard'})
    } catch (error) {
        next(error)
    }
}

export const getAdminUser = async (req,res,next)=>{
    try {
        const { search, status, sort, page = 1 } = req.query

        const limit = 10

        const userQuery = { 
            role: 'user',
            search: search || '',
            status: status || 'all',
            sort: sort || 'newest',
            page: parseInt(page),
            limit: limit,
        }
        const {dbUsers, totalUsers, bannedUsers, totalPages, currentPage} = await adminServices.fetchAllUsers(userQuery)
        console.log
        res.render('admin/users/index', {dbUsers, totalUsers, bannedUsers, filters: {search, status, sort}, totalPages, currentPage})
    } catch (error) {
        next(error)
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

export const toggleUserBlock = async (req, res, next) => {
    try {
        const { userId } = req.body;
        
        if (!userId) {
            return res.status(HTTP_STATUS.BAD_REQUEST).json({
                success: false,
                message: 'User ID is required'
            });
        }

        const updatedUser = await adminServices.toggleUserBlockStatus(userId);
        
        return res.status(HTTP_STATUS.OK).json({
            success: true,
            // Dynamically set the success message based on the new status
            message: `User successfully ${updatedUser.isBlocked ? 'blocked' : 'unblocked'}.`
        });
    } catch (error) {
        next(error);
    }
};

export const deleteUser = async (req, res, next) => {
    try {
        const { userId } = req.body;
        if (!userId) {
            return res.status(HTTP_STATUS.BAD_REQUEST).json({ success: false, message: 'User ID is required' });
        }

        await adminServices.deleteUserById(userId);
        
        return res.status(HTTP_STATUS.OK).json({
            success: true,
            message: 'User account permanently deleted.'
        });
    } catch (error) {
        next(error);
    }
};

export const getAdminOrganizers = async (req, res, next) => {
    try {
        const { search, status, sort, page = 1 } = req.query;
        const limit = 10;

        // Force the role to 'organizer' specifically
        const organizerQuery = {
            role: 'organizer', 
            search: search || '',
            status: status || 'all',
            sort: sort || 'newest',
            page: parseInt(page),
            limit: limit
        };

        const { dbUsers, totalUsers, bannedUsers, totalPages, currentPage } = 
            await adminServices.fetchAllUsers(organizerQuery);

        res.render('admin/organizers/index', {
            organizers: dbUsers, // Reusing the dbUsers result as organizers
            totalOrganizers: totalUsers,
            totalPages,
            currentPage,
            filters: { search, status, sort }
        });
    } catch (error) {
        next(error);
    }
};

export const updateOrganizerStatus = async (req, res, next) => {
    try {
        const { orgId, status } = req.body; // status: 'approved' | 'rejected'
        
        // 1. Update the database
        const updatedOrg = await User.findByIdAndUpdate(orgId, { status }, { new: true });

        // ==========================================
        // 2. SOCKET NOTIFICATION
        // ==========================================
        const io = getIO();

        // Emit to the Organizer's room (supports multiple tabs)
        io.to(orgId.toString()).emit('statusUpdate', {
            status: updatedOrg.status,
            message: `Your organizer account application has been ${updatedOrg.status}!`,
        });

        return res.status(HTTP_STATUS.OK).json({ 
            success: true, 
            message: `Organizer successfully marked as ${status}.` 
        });
    } catch (error) {
        next(error);
    }
};

export const getNotifications = async (req, res, next) => {
    try {
        const adminId = req.session.admin._id;
        
        // Fetch the 20 most recent notifications for this admin
        const notifications = await Notification.find({ recipient: adminId })
                                              .sort({ createdAt: -1 })
                                              .limit(20);
                                              
        const unreadCount = notifications.filter(n => !n.isRead).length;

        return res.status(200).json({
            success: true,
            notifications,
            unreadCount
        });
    } catch (error) {
        next(error);
    }
};

export const markNotificationsRead = async (req, res, next) => {
    try {
        const adminId = req.session.admin._id;
        
        // Update all unread notifications for this admin to 'isRead: true'
        await Notification.updateMany(
            { recipient: adminId, isRead: false },
            { $set: { isRead: true } }
        );

        return res.status(200).json({ success: true });
    } catch (error) {
        next(error);
    }
};

export const deleteNotification = async (req, res, next) => {
    try {
        const { notificationId } = req.params;
        const adminId = req.session.admin._id;

        // Delete only if it belongs to the current admin
        await Notification.findOneAndDelete({ 
            _id: notificationId, 
            recipient: adminId 
        });

        return res.status(200).json({ 
            success: true, 
            message: 'Notification deleted' 
        });
    } catch (error) {
        next(error);
    }
};
