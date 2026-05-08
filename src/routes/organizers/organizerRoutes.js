import { Router } from "express";
import * as organizerController from '../../controllers/organizers/organizerController.js';
import * as organizerAuthController from '../../controllers/organizers/organizerAuthController.js'
import { isOrganizerAuthenticated, isBlocked, isOrganizerGuest} from '../../middlewares/authMiddleware.js';

const organizerRouter = Router();

// Dashboard Route -> www.yoursite.com/organizer/dashboard
organizerRouter.get('/', (req,res)=>{
    res.redirect('/organizer/login');
});

// ==========================================
// ALIAS ROUTES (Bypassing the User Controller)
// ==========================================
// By rendering the views directly here, we prevent any hidden 
// "User" session checks from ruining our simultaneous logins!
organizerRouter.get('/login', isOrganizerGuest, (req, res) => {
    res.render('users/auth/login', { title: 'Organizer Login' });
});

organizerRouter.get('/signup', isOrganizerGuest, (req, res) => {
    res.render('users/auth/register', { title: 'Organizer Signup' });
});


// ==========================================
// PROTECTED ROUTES
// ==========================================
// Apply security to ALL organizer routes globally so you don't have to repeat it
organizerRouter.use(isOrganizerAuthenticated, isBlocked);

organizerRouter.get('/dashboard', organizerController.getDashboard);
organizerRouter.post('/logout', organizerAuthController.postLogout);

export default organizerRouter;