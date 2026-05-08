import { Router } from "express";
import * as adminController from '../../controllers/admin/adminController.js'
import { isAdminAuthenticated, isBlocked, isGuest} from '../../middlewares/authMiddleware.js';
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

export default adminRoutes