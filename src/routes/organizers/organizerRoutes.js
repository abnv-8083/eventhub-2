import { Router } from "express";
import * as organizerController from '../../controllers/organizers/organizerController.js';
import * as organizerAuthController from '../../controllers/organizers/organizerAuthController.js'
import * as eventController from '../../controllers/organizers/eventController.js'
import * as bookingController from '../../controllers/organizers/bookingController.js'
import { isOrganizerAuthenticated, isBlocked, isOrganizerGuest} from '../../middlewares/authMiddleware.js';
import { validateUpdateOrganizerProfile, validatePasswordUpdate } from '../../middlewares/validate.js';
import { eventUpload } from '../../config/cloudinary.js';

const organizerRouter = Router();

// Dashboard Route -> www.yoursite.com/organizer/dashboard
organizerRouter.get('/', (req,res)=>{
    res.redirect('/organizer/login');
});

// ==========================================
// ALIAS ROUTES (Bypassing the User Controller)
// ==========================================
organizerRouter.get('/login', isOrganizerGuest, (req, res) => {
    res.render('users/auth/login', { title: 'Organizer Login' });
});

organizerRouter.get('/signup', isOrganizerGuest, (req, res) => {
    res.render('users/auth/register', { title: 'Organizer Signup' });
});

organizerRouter.get('/apply', isOrganizerGuest, (req, res) => {
    res.redirect('/organizer/login?message=Please sign in or create an Organizer account to host events.');
});


// ==========================================
// PROTECTED ROUTES
// ==========================================
organizerRouter.use(isOrganizerAuthenticated, isBlocked);

organizerRouter.get('/dashboard', organizerController.getDashboard);
organizerRouter.post('/logout', organizerAuthController.postLogout);

// Profile Management
organizerRouter.route('/profile')
    .get(organizerController.getProfile)
    .post(validateUpdateOrganizerProfile, organizerController.updateProfile);
organizerRouter.post('/avatar', eventUpload.single('avatar'), organizerController.updateAvatar);
organizerRouter.post('/generate-ai', organizerController.generateAIAvatar);
organizerRouter.post('/update-email', organizerController.updateEmail);
organizerRouter.post('/update-password', validatePasswordUpdate, organizerController.updatePassword);

// Event Management
organizerRouter.get('/events', eventController.getEventDashboard);
organizerRouter.get('/events/new', eventController.getCreateEventPage);
organizerRouter.post('/events', eventUpload.array('banners', 2), eventController.createEvent);

// Global Sales Report
organizerRouter.get('/sales-report', eventController.getGlobalSalesReport);
organizerRouter.get('/sales-report/export/excel', eventController.exportGlobalSalesReportExcel);
organizerRouter.get('/sales-report/export/pdf', eventController.exportGlobalSalesReportPdf);

// ✨ PROMO CODE MANAGEMENT ✨
organizerRouter.get('/events/:id/manage-coupons', eventController.getManageCouponsPage);
organizerRouter.post('/events/:eventId/coupons', eventController.createCoupon);
organizerRouter.put('/events/coupons/:couponId', eventController.editCoupon);
organizerRouter.patch('/events/coupons/:couponId/toggle', eventController.toggleCouponStatus);
organizerRouter.delete('/events/coupons/:couponId', eventController.deleteCoupon);


organizerRouter.get('/events/:id/scanning-report',            eventController.getScanningReport);
organizerRouter.post('/events/:id/regenerate-scanning-code',   eventController.regenerateScanningCode);
organizerRouter.get('/events/:id/sales-report',            eventController.getSalesReport);
organizerRouter.get('/events/:id/sales-report/export/excel', eventController.exportSalesReportExcel);
organizerRouter.get('/events/:id/sales-report/export/pdf',   eventController.exportSalesReportPdf);
organizerRouter.get('/events/:id', eventController.getEventViewPage);
organizerRouter.get('/events/:id/edit', eventController.getEditEventPage);
organizerRouter.post('/events/:id/update', eventUpload.array('banners', 2), eventController.updateEvent);
organizerRouter.delete('/events/:id', eventController.deleteEvent);
organizerRouter.post('/events/:id/cancel', eventController.cancelEvent);
organizerRouter.post('/events/:id/toggle-block', eventController.toggleBlockEvent);
organizerRouter.post('/events/:id/resubmit', eventController.resubmitEvent);
organizerRouter.post('/events/:id/duplicate', eventController.duplicateEvent);
organizerRouter.post('/events/:id/withdraw', eventController.withdrawReview);
organizerRouter.post('/events/:id/archive', eventController.archiveEvent);
organizerRouter.post('/events/:id/extend', eventController.extendEventSchedule);

// Event Bookings & Payouts
organizerRouter.get('/events/:id/bookings', bookingController.getEventBookings);
organizerRouter.get('/events/:id/bookings-cancellations', bookingController.getEventCancellations);
organizerRouter.get('/events/:id/bookings/:bookingId', bookingController.getBookingDetail);
organizerRouter.delete('/events/:id/bookings/:bookingId', bookingController.deleteBooking);
organizerRouter.post('/events/:id/bookings/:bookingId/cancel', bookingController.cancelBooking);
organizerRouter.post('/events/:id/bookings/:bookingId/hold', bookingController.holdBooking);
organizerRouter.post('/events/:id/bookings/:bookingId/unhold', bookingController.unholdBooking);
organizerRouter.post('/events/:id/bookings/:bookingId/tickets/:ticketId/cancel', bookingController.cancelSingleTicket);
organizerRouter.post('/events/payout/request', bookingController.requestPayout);

// QR Code Scanner
organizerRouter.get('/scanner', bookingController.getScannerPage);
organizerRouter.get('/verify-ticket/:bookingId', bookingController.verifyTicketScan);

// Cancellation Requests
organizerRouter.get('/cancellation-requests', bookingController.getCancellationRequests);
organizerRouter.post('/bookings/:bookingId/approve-cancel', bookingController.approveCancellation);
organizerRouter.post('/bookings/:bookingId/reject-cancel', bookingController.rejectCancellation);


// Notifications
organizerRouter.get('/notifications', organizerController.getMyNotifications);
organizerRouter.post('/notifications/mark-read', organizerController.markNotificationsRead);
organizerRouter.delete('/notifications/:id', organizerController.deleteNotification);

export default organizerRouter;