import { Router } from "express";
import * as adminController from '../../controllers/admin/adminController.js'
import * as adminEventController from '../../controllers/admin/adminEventController.js'
import * as adminPayoutController from '../../controllers/admin/adminPayoutController.js'
import { isAdminAuthenticated, isBlocked} from '../../middlewares/authMiddleware.js';
import noCacheMiddleware from "../../middlewares/nocache.js";
import { validateAdminLogin, validatePasswordUpdate } from "../../middlewares/validate.js";
import { upload } from "../../config/cloudinary.js";
import * as adminSettingsController from '../../controllers/admin/adminSettingsController.js';
import * as adminCategoryController from '../../controllers/admin/categoryController.js';

const adminRoutes = Router();
adminRoutes.use(isAdminAuthenticated, isBlocked, noCacheMiddleware)

// Admin Settings & Profile
adminRoutes.get('/settings', adminSettingsController.getSettings);
adminRoutes.post('/profile', adminSettingsController.updateProfile);
adminRoutes.post('/avatar', upload.single('avatar'), adminSettingsController.updateAvatar);
adminRoutes.post('/update-password', validatePasswordUpdate, adminSettingsController.updatePassword);
adminRoutes.post('/platform-settings', adminSettingsController.updatePlatformSettings);

// Admin Categories
adminRoutes.get('/categories', adminCategoryController.getCategoriesPage);
adminRoutes.post('/categories/block', adminCategoryController.updateBlockedCategories);

adminRoutes.get('/dashboard',adminController.getAdminDashboard)

adminRoutes.get('/users', adminController.getAdminUser)

adminRoutes.get('/users/:id', adminController.getAdminUserDetail)

adminRoutes.post('/users/toggle-block',adminController.toggleUserBlock)

adminRoutes.post('/users/delete', adminController.deleteUser);

adminRoutes.get('/organizers', adminController.getAdminOrganizers)

adminRoutes.get('/organizers/:id', adminController.getAdminOrganizerDetail)

adminRoutes.post('/organizers/update-status', adminController.updateOrganizerStatus)

adminRoutes.post('/organizers/toggle-block', adminController.toggleOrganizerBlock)

// Admin Events
adminRoutes.get('/events', adminEventController.getAdminEvents);
adminRoutes.get('/events/:id', adminEventController.getAdminEventDetail);
adminRoutes.post('/events/update-status', adminEventController.updateEventStatus);

adminRoutes.post('/events/toggle-block', adminEventController.toggleEventBlock);

// Admin Payouts
adminRoutes.get('/payouts', adminPayoutController.getAdminPayouts);
adminRoutes.post('/payouts/approve', adminPayoutController.approvePayout);
adminRoutes.post('/payouts/reject', adminPayoutController.rejectPayout);

// Admin Notifications
adminRoutes.get('/notifications', adminController.getMyNotifications);
adminRoutes.post('/notifications/mark-read', adminController.markNotificationsRead);
adminRoutes.delete('/notifications/:id', adminController.deleteNotification);

export default adminRoutes