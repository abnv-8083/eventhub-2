import { Router } from "express";
import * as organizerController from '../../controllers/organizers/organizerController.js';
import * as organizerAuthController from '../../controllers/organizers/organizerAuthController.js'
import * as eventController from '../../controllers/organizers/eventController.js'
import * as bookingController from '../../controllers/organizers/bookingController.js'
import { isOrganizerAuthenticated, isBlocked, isOrganizerGuest} from '../../middlewares/authMiddleware.js';
import { eventUpload } from '../../config/cloudinary.js';

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

// Event Management
organizerRouter.get('/events', eventController.getEventDashboard);
organizerRouter.get('/events/new', eventController.getCreateEventPage);
organizerRouter.post('/events', eventUpload.array('banners', 2), eventController.createEvent);

organizerRouter.get('/events/:id', eventController.getEventViewPage);
organizerRouter.get('/events/:id/edit', eventController.getEditEventPage);
organizerRouter.post('/events/:id/update', eventUpload.array('banners', 2), eventController.updateEvent);
organizerRouter.delete('/events/:id', eventController.deleteEvent);
organizerRouter.post('/events/:id/toggle-block', eventController.toggleBlockEvent);
organizerRouter.post('/events/:id/resubmit', eventController.resubmitEvent);

// Event Bookings & Payouts
organizerRouter.get('/events/:id/bookings', bookingController.getEventBookings);
organizerRouter.get('/events/:id/bookings/:bookingId', bookingController.getBookingDetail);
organizerRouter.delete('/events/:id/bookings/:bookingId', bookingController.deleteBooking);
organizerRouter.post('/events/:id/bookings/:bookingId/cancel', bookingController.cancelBooking);
organizerRouter.post('/events/:id/bookings/:bookingId/hold', bookingController.holdBooking);
organizerRouter.post('/events/:id/bookings/:bookingId/unhold', bookingController.unholdBooking);
organizerRouter.post('/events/:id/bookings/:bookingId/tickets/:ticketId/cancel', bookingController.cancelSingleTicket);
organizerRouter.post('/events/payout/request', bookingController.requestPayout);

organizerRouter.get('/notifications', organizerController.getMyNotifications);
organizerRouter.post('/notifications/mark-read', organizerController.markNotificationsRead);
organizerRouter.delete('/notifications/:id', organizerController.deleteNotification);
export default organizerRouter;