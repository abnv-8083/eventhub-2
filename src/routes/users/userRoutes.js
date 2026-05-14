import { Router } from "express";
import * as userController from '../../controllers/users/userController.js'
import * as eventController from '../../controllers/users/eventController.js'
import * as bookingController from '../../controllers/users/bookingController.js'
import * as walletController from '../../controllers/users/walletController.js'
const userRouter = Router()
import { isUserAuthenticated, isBlocked } from "../../middlewares/authMiddleware.js";
import { upload } from "../../config/cloudinary.js";
import { validateUpdateProfile } from "../../middlewares/validate.js";
import noCacheMiddleware from "../../middlewares/nocache.js";

// ==========================================
// PUBLIC ROUTES (no login needed)
// ==========================================
userRouter.get('/', userController.getHomepage)

// Browse & Event Detail (public)
userRouter.get('/events', eventController.getBrowseEvents)
userRouter.get('/events/:id', eventController.getEventDetail)
userRouter.get('/events/:id/buy-tickets', eventController.getBuyTicketsPage)
// ==========================================
// PROTECTED ROUTES (login required)
// ==========================================
userRouter.use(isUserAuthenticated, isBlocked, noCacheMiddleware)

userRouter.get('/notifications', userController.getMyNotifications);
userRouter.post('/notifications/mark-read', userController.markNotificationsRead);
userRouter.delete('/notifications/:id', userController.deleteNotification);

// Dashboard & Profile
userRouter.route('/dashboard').get(userController.getDashboard)
userRouter.route('/profile')
    .get(userController.getUserProfile)
    .post(validateUpdateProfile, userController.updateUserProfile)
userRouter.post("/avatar", upload.single('avatar'), userController.updateUserAvatar)
userRouter.post("/generate-ai", userController.generateAIAvatar)
userRouter.post('/update-email', userController.updateUserEmail)
userRouter.post('/update-password', userController.updatePassword)

// Wishlist
userRouter.post('/events/:id/wishlist', eventController.toggleWishlist)
userRouter.get('/wishlist', eventController.getWishlistPage)

// Booking Flow
userRouter.get('/events/:id/checkout', bookingController.getCheckoutPage)
userRouter.post('/events/:id/book', bookingController.processBooking)
userRouter.post('/events/:id/razorpay-order', bookingController.createRazorpayOrder)
userRouter.post('/events/:id/verify-payment', bookingController.verifyRazorpayBooking)
userRouter.get('/booking/success', bookingController.getSuccessPage)
userRouter.get('/booking/failed', bookingController.getFailedPage)

// My Tickets
userRouter.get('/tickets', bookingController.getMyTickets)
userRouter.get('/tickets/:bookingId', bookingController.getTicketDetail)
userRouter.post('/tickets/:bookingId/cancel', bookingController.cancelBooking)
userRouter.post('/tickets/:id/tickets/:ticketId/cancel', bookingController.cancelSingleTicket);
userRouter.post('/tickets/:bookingId/hold',   bookingController.holdBooking)
userRouter.post('/tickets/:bookingId/unhold', bookingController.unholdBooking)

// Wallet
userRouter.get('/wallet', walletController.getWalletPage)
userRouter.post('/wallet/razorpay-order', walletController.createWalletOrder)
userRouter.post('/wallet/verify-topup', walletController.verifyWalletTopup)
userRouter.get('/wallet/topup/success', walletController.getTopupSuccess)
userRouter.get('/wallet/topup/failed', walletController.getTopupFailed)

export default userRouter