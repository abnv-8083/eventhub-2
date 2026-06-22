import HTTP_STATUS from '../../constant/statusCode.js';
import * as userServices from '../../services/users/userService.js';
import Platform from '../../models/admin/platform.js';


export const getSettings = async (req, res, next) => {
    try {
        let platform = await Platform.findOne();
        if (!platform) {
            platform = await Platform.create({
                platformFeePercentage: 5,
                supportEmail: 'support@eventhub.com',
                supportPhone: '+91 9000000000'
            });
        }

        res.render('admin/settings', {
            title: 'Admin Settings',
            admin: req.session.admin,
            platform
        });
    } catch (error) {
        next(error);
    }
};

export const updateProfile = async (req, res, next) => {
    try {
        const { fullName } = req.body;
        
        const updateData = {
            fullName: fullName?.trim()
        };

        const result = await userServices.updateUserProfile(req.session.admin._id, updateData);
        if (!result) return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({ success: false, message: 'Internal Server Error' });

        req.session.admin = result;
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

        const result = await userServices.updateUserAvatar(req.session.admin._id, req.file.path);

        req.session.admin.avatar = result.avatar;
        req.session.save((err) => {
            if (err) return next(err);
            res.status(HTTP_STATUS.OK).json({ success: true, message: 'Profile picture updated!', avatarUrl: result.avatar });
        });
    } catch (error) {
        next(error);
    }
};

export const updatePassword = async (req, res, next) => {
    try {
        if (req.session.admin.googleId) {
            return res.status(HTTP_STATUS.FORBIDDEN).json({ success: false, message: 'Google users cannot change their password.' });
        }
        const { currentPassword, newPassword } = req.body;
        const currentUserId = req.session.admin._id;
        const result = await userServices.updatePassword(currentUserId, currentPassword, newPassword, 'update');
        if (!result)
            return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({ success: false, message: 'Internal Server Error' });

        req.session.admin = result;
        req.session.save((err) => {
            if (err) return next(err);
            res.status(HTTP_STATUS.OK).json({ success: true, message: 'Password Saved Successfully' });
        });
    } catch (error) {
        next(error);
    }
};

export const updatePlatformSettings = async (req, res, next) => {
    try {
        const { platformFeePercentage, supportEmail, supportPhone } = req.body;

        if (platformFeePercentage < 0 || platformFeePercentage > 100) {
            return res.status(HTTP_STATUS.BAD_REQUEST).json({ success: false, message: 'Invalid platform fee percentage' });
        }

        let platform = await Platform.findOne();
        if (!platform) {
            platform = new Platform();
        }

        platform.platformFeePercentage = Number(platformFeePercentage);
        platform.supportEmail = supportEmail?.trim();
        platform.supportPhone = supportPhone?.trim();

        await platform.save();

        res.status(HTTP_STATUS.OK).json({ success: true, message: 'Platform settings updated successfully!' });
    } catch (error) {
        next(error);
    }
};
