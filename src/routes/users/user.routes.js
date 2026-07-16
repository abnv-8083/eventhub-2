import { Router } from "express";
import * as userController from '../../controllers/users/user.controller.js'
import * as eventController from '../../controllers/users/event.controller.js'
import * as bookingController from '../../controllers/users/booking.controller.js'
import * as walletController from '../../controllers/users/wallet.controller.js'
import * as referralController from '../../controllers/users/referral.controller.js'
const userRouter = Router()
import { isUserAuthenticated, isBlocked, isUserLogged } from "../../middlewares/auth.middleware.js";
import { upload } from "../../config/cloudinary.js";
import { validateUpdateProfile, validatePasswordUpdate } from "../../middlewares/validate.middleware.js";
import noCacheMiddleware from "../../middlewares/nocache.middleware.js";

// ==========================================
// PUBLIC ROUTES (no login needed)
// ==========================================
userRouter.get('/', userController.getHomepage)

// Browse & Event Detail (public)
userRouter.get('/events', eventController.getBrowseEvents)
userRouter.get('/events/:id', eventController.getEventDetail)

userRouter.get('/events/:id/buy-tickets', eventController.getBuyTicketsPage)

userRouter.use(isUserAuthenticated, isBlocked, noCacheMiddleware)

// Public Referral Validation
userRouter.post('/refer/validate-code', referralController.validateReferralCode)


// ==========================================
// PROTECTED ROUTES (login required)
// ==========================================

// ─── NOTIFICATIONS ──────────────────────────────────────────────────────────
userRouter.get('/notifications', userController.getMyNotifications);
userRouter.post('/notifications/mark-read', userController.markNotificationsRead);
userRouter.delete('/notifications/:id', userController.deleteNotification);

// ─── DASHBOARD & PROFILE ────────────────────────────────────────────────────
userRouter.route('/dashboard').get(userController.getDashboard)
userRouter.route('/calendar').get(userController.getCalendar)
userRouter.route('/profile')
    .get(userController.getUserProfile)
    .post(validateUpdateProfile, userController.updateUserProfile)
userRouter.post("/avatar", upload.single('avatar'), userController.updateUserAvatar)
userRouter.post("/generate-ai", userController.generateAIAvatar)
userRouter.post('/update-email', userController.updateUserEmail)
userRouter.post('/update-password', validatePasswordUpdate, userController.updatePassword)

// ─── WISHLIST ───────────────────────────────────────────────────────────────
userRouter.post('/events/:id/wishlist', eventController.toggleWishlist)
userRouter.get('/wishlist', eventController.getWishlistPage)


// ─── PROMO CODES (MUST be placed before Checkout Flow) ──────────────────────
userRouter.get('/checkout/events/:eventId/coupons', bookingController.getAvailableCoupons);
userRouter.post('/checkout/validate-coupon', bookingController.validatePromoCode);


// ─── CHECKOUT & BOOKING FLOW ────────────────────────────────────────────────
userRouter.get('/events/:id/checkout', bookingController.getCheckoutPage)
userRouter.post('/events/:id/book', bookingController.processBooking)
userRouter.post('/events/:id/razorpay-order', bookingController.createRazorpayOrder)
userRouter.post('/events/:id/verify-payment', bookingController.verifyRazorpayBooking)
userRouter.get('/booking/success', bookingController.getSuccessPage)
userRouter.get('/booking/failed', bookingController.getFailedPage)

// ─── MY TICKETS ─────────────────────────────────────────────────────────────
userRouter.get('/tickets', bookingController.getMyTickets)
userRouter.get('/tickets/:bookingId/download-pdf', bookingController.downloadTicketPdf)
userRouter.get('/tickets/:bookingId', bookingController.getTicketDetail)
userRouter.post('/tickets/:bookingId/cancel', bookingController.cancelBooking)
userRouter.post('/tickets/:bookingId/request-cancel', bookingController.requestCancellation)
userRouter.post('/tickets/:id/tickets/:ticketId/cancel', bookingController.cancelSingleTicket);
userRouter.post('/tickets/:bookingId/hold', bookingController.holdBooking)
userRouter.post('/tickets/:bookingId/unhold', bookingController.unholdBooking)


// ─── WALLET ─────────────────────────────────────────────────────────────────
userRouter.get('/wallet', walletController.getWalletPage)
userRouter.post('/wallet/razorpay-order', walletController.createWalletOrder)
userRouter.post('/wallet/verify-topup', walletController.verifyWalletTopup)
userRouter.get('/wallet/topup/success', walletController.getTopupSuccess)
userRouter.get('/wallet/topup/failed', walletController.getTopupFailed)

// ─── REFERRAL ────────────────────────────────────────────────────────────────
userRouter.get('/refer', referralController.getReferralPage)

export default userRouter;