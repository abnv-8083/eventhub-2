import HTTP_STATUS from "../../constant/statusCode.js";
import * as adminServices from '../../services/admin/adminServices.js'
import User from "../../models/users/user.js";


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


        return res.status(HTTP_STATUS.OK).json({ 
            success: true, 
            message: `Organizer successfully marked as ${status}.` 
        });
    } catch (error) {
        next(error);
    }
};