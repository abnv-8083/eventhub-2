import { Router } from "express";
import * as adminController from '../../controllers/admin/adminController.js'
import { isAdminAuthenticated} from '../../middlewares/authMiddleware.js';
import noCacheMiddleware from "../../middlewares/nocache.js";
import { validateAdminLogin } from "../../middlewares/validate.js";

const adminRoutes = Router();
adminRoutes.use(isAdminAuthenticated)

adminRoutes.get('/dashboard',adminController.getAdminDashboard)

adminRoutes.get('/users', adminController.getAdminUser)

adminRoutes.post('/users/toggle-block',adminController.toggleUserBlock)

adminRoutes.post('/users/delete', adminController.deleteUser);

adminRoutes.get('/organizers', adminController.getAdminOrganizer)
export default adminRoutes