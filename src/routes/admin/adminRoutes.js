import { Router } from "express";
import * as adminController from '../../controllers/admin/adminController.js'
import * as categoryController from '../../controllers/admin/categoryController.js'
import * as adminEventController from '../../controllers/admin/adminEventController.js'
import * as adminPayoutController from '../../controllers/admin/adminPayoutController.js'
import { isAdminAuthenticated, isBlocked} from '../../middlewares/authMiddleware.js';
import noCacheMiddleware from "../../middlewares/nocache.js";
import { validateAdminLogin } from "../../middlewares/validate.js";

const adminRoutes = Router();
adminRoutes.use(isAdminAuthenticated, isBlocked, noCacheMiddleware)

adminRoutes.get('/dashboard',adminController.getAdminDashboard)

adminRoutes.get('/users', adminController.getAdminUser)

adminRoutes.post('/users/toggle-block',adminController.toggleUserBlock)

adminRoutes.post('/users/delete', adminController.deleteUser);

adminRoutes.get('/organizers', adminController.getAdminOrganizers)

adminRoutes.post('/organizers/update-status', adminController.updateOrganizerStatus)

adminRoutes.get('/notifications', adminController.getNotifications);

adminRoutes.post('/notifications/mark-read', adminController.markNotificationsRead);

adminRoutes.delete('/notifications/:notificationId', adminController.deleteNotification);

adminRoutes.get('/category', categoryController.getCategoryPage)
adminRoutes.post('/categories/add', categoryController.addCategory)
adminRoutes.post('/categories/update/:id', categoryController.updateCategory)
adminRoutes.delete('/categories/:id', categoryController.deleteCategory)
adminRoutes.post('/categories/toggle-block', categoryController.toggleCategoryBlock)

// Admin Events
adminRoutes.get('/events', adminEventController.getAdminEvents);
adminRoutes.post('/events/update-status', adminEventController.updateEventStatus);

// Admin Payouts
adminRoutes.get('/payouts', adminPayoutController.getAdminPayouts);
adminRoutes.post('/payouts/approve', adminPayoutController.approvePayout);

export default adminRoutes