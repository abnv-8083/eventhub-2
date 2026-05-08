import { Router } from "express";
import * as organizerController from '../../controllers/organizers/organizerController.js';
import * as organizerAuthController from '../../controllers/organizers/organizerAuthController.js'
import { isOrganizerAuthenticated, isBlocked, isGuest} from '../../middlewares/authMiddleware.js';
import noCacheMiddleware from "../../middlewares/nocache.js";

const organizerRouter = Router();

// Apply security to ALL organizer routes globally so you don't have to repeat it
organizerRouter.use(isOrganizerAuthenticated, isBlocked) ;

// Dashboard Route -> www.yoursite.com/organizer/dashboard
organizerRouter.get('/', (req,res)=>{
    res.redirect('/organizer/dashboard')
})
organizerRouter.get('/dashboard' ,organizerController.getDashboard);

organizerRouter.post('/logout' ,organizerAuthController.postLogout )


export default organizerRouter;

