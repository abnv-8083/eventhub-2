import { Router } from "express";
import * as adminAuthController from '../../controllers/admin/adminAuthController.js'
import { isAdminAuthenticated} from '../../middlewares/authMiddleware.js';
import noCacheMiddleware from "../../middlewares/nocache.js";
import { validateAdminLogin } from "../../middlewares/validate.js";

const adminAuthRoutes = Router();

adminAuthRoutes.use(noCacheMiddleware);

adminAuthRoutes.get('/', (req,res)=>{
    res.redirect('/admin/login')
})

adminAuthRoutes.route('/login')
    .get(adminAuthController.getAdminLogin)
    .post(validateAdminLogin, adminAuthController.postAdminLogin)

adminAuthRoutes.use(isAdminAuthenticated)


adminAuthRoutes.post('/logout',adminAuthController.postLogout )


export default adminAuthRoutes;

