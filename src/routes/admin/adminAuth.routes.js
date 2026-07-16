import { Router } from "express";
import * as adminAuthController from '../../controllers/admin/adminAuth.controller.js'
import { isAdminAuthenticated, isAdminGuest} from '../../middlewares/auth.middleware.js';
import noCacheMiddleware from "../../middlewares/nocache.middleware.js";
import { validateAdminLogin } from "../../middlewares/validate.middleware.js";

const adminAuthRoutes = Router();

adminAuthRoutes.get('/', (req,res)=>{
    res.redirect('/admin/login')
})

adminAuthRoutes.route('/login')
    .get(isAdminGuest, adminAuthController.getAdminLogin)
    .post(validateAdminLogin, adminAuthController.postAdminLogin)

adminAuthRoutes.use(isAdminAuthenticated)


adminAuthRoutes.all('/logout', adminAuthController.postLogout);


export default adminAuthRoutes;

