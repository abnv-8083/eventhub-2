import HTTP_STATUS from '../../constant/statusCode.js';
import Platform from '../../models/admin/platform.js';
import { EVENT_CATEGORIES } from '../../constant/categories.js';

export const getCategoriesPage = async (req, res, next) => {
    try {
        let platform = await Platform.findOne().lean() || {};
        
        res.render('admin/categories/index', {
            title: 'Manage Categories',
            admin: req.session.admin,
            categories: EVENT_CATEGORIES,
            blockedCategories: platform.blockedCategories || []
        });
    } catch (error) {
        next(error);
    }
};

export const updateBlockedCategories = async (req, res, next) => {
    try {
        const { blockedCategories } = req.body;
        
        let platform = await Platform.findOne();
        if (!platform) {
            platform = new Platform();
        }

        // Ensure blockedCategories is an array
        if (blockedCategories !== undefined) {
            platform.blockedCategories = Array.isArray(blockedCategories) ? blockedCategories : [blockedCategories];
        } else if (req.body.hasOwnProperty('blockedCategories')) {
            // If it was explicitly sent as empty
            platform.blockedCategories = [];
        } else {
             // If no body was sent with the key due to checkboxes
             platform.blockedCategories = [];
        }

        await platform.save();

        res.status(HTTP_STATUS.OK).json({ success: true, message: 'Category settings updated successfully!' });
    } catch (error) {
        next(error);
    }
};
