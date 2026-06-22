import HTTP_STATUS from '../../constant/statusCode.js';
import { bookingValidationSchema } from '../../validations/users/bookingValidation.js';
import * as bookingService from '../../services/users/bookingService.js';
import QRCode from 'qrcode';
import Booking from '../../models/payments/booking.js';
import User from '../../models/users/user.js';

// ─── Checkout Page ────────────────────────────────────────────────────────────
export const getCheckoutPage = async (req, res, next) => {
    try {
        const { id } = req.params;
        const cartParam = req.query.cart;

        if (!cartParam) return res.redirect(`/user/events/${id}`);

        const cart = JSON.parse(decodeURIComponent(cartParam));
        if (cart.length === 0) return res.redirect(`/user/events/${id}`);

        const data = await bookingService.getCheckoutData(id, cart, req.session.user._id);

        res.render('users/events/checkout', { title: 'Checkout', ...data });
    } catch (error) {
        if (error.isOperational) {
            return res.redirect(`/user/events?message=${encodeURIComponent(error.message)}`);
        }
        next(error);
    }
};


// ─── Create Razorpay Order ────────────────────────────────────────────────────
export const createRazorpayOrder = async (req, res, next) => {
    try {
        const { id } = req.params;
        const { cart, couponId, expectedTotal } = req.body;

        // Joi validation
        const { error: valErr } = bookingValidationSchema.validate({ cart });
        if (valErr) return res.status(HTTP_STATUS.BAD_REQUEST).json({ success: false, message: valErr.details[0].message });

        const { order, amount } = await bookingService.createOrder(id, cart, req.session.user._id, couponId, expectedTotal);
        res.status(HTTP_STATUS.OK)
        res.json({ success: true, order, amount });
    } catch (error) {
        next(error);
    }
};


// ─── Verify Razorpay & Create Bookings ───────────────────────────────────────
export const verifyRazorpayBooking = async (req, res, next) => {
    try {
        const { id } = req.params;

        // Now receives a single bookingId
        const { bookingId } = await bookingService.verifyAndBook(id, req.session.user._id, req.body);

        // Redirect with a single 'id' parameter
        res.json({ success: true, message: 'Tickets Booked!', redirectUrl: `/user/booking/success?id=${bookingId}` });
    } catch (error) {
        next(error);
    }
};


// ─── Process Wallet Booking ───────────────────────────────────────────────────
export const processBooking = async (req, res, next) => {
    try {
        const { id } = req.params;
        const { cart, couponId, expectedTotal } = req.body;

        // Now receives a single bookingId
        const { bookingId } = await bookingService.bookWithWallet(id, req.session.user._id, cart, couponId, expectedTotal);

        // Redirect with a single 'id' parameter
        res.json({ success: true, message: 'Tickets Booked!', redirectUrl: `/user/booking/success?id=${bookingId}` });
    } catch (error) {
        next(error);
    }
};

// ─── Payment Success Page ─────────────────────────────────────────────────────
export const getSuccessPage = async (req, res, next) => {
    try {
        // ID is passed as ?id=single_id
        const bookingId = req.query.id;

        if (!bookingId) return res.redirect('/user/tickets');

        // Fetch the single booking
        const booking = await bookingService.getBookingById(bookingId, req.session.user._id);

        res.render('users/booking/success', { 
            title: 'Booking Confirmed!', 
            booking, 
            totalAmount: booking.totalAmount, 
            event: booking.event 
        });
    } catch (error) {
        next(error);
    }
};


// ─── Payment Failed Page ──────────────────────────────────────────────────────
export const getFailedPage = (req, res) => {
    const reason = req.query.reason || 'Payment could not be processed.';
    res.render('users/booking/failed', { title: 'Booking Failed', reason });
};


// ─── My Tickets ───────────────────────────────────────────────────────────────
export const getMyTickets = async (req, res, next) => {
    try {
        const { filter = 'all', page = 1 } = req.query;

        const { bookings, total, totalPages } = await bookingService.getMyTickets(
            req.session.user._id, filter, parseInt(page)
        );

        res.render('users/tickets/index', {
            title: 'My Tickets',
            bookings,
            filter,
            totalPages,
            currentPage: parseInt(page),
            total
        });
    } catch (error) {
        next(error);
    }
};


export const getTicketDetail = async (req, res, next) => {
    try {
        const booking = await bookingService.getTicketDetail(req.params.bookingId, req.session.user._id);

        let qrCodeDataUrl = '';
        if (booking.status === 'active') {
            const scanUrl = `${req.protocol}://${req.get('host')}/organizer/verify-ticket/${booking._id}`;
            qrCodeDataUrl = await QRCode.toDataURL(scanUrl, {
                width: 150,
                margin: 1,
                color: {
                    dark: '#000000',
                    light: '#ffffff'
                }
            });
        }

        res.render('users/tickets/detail', { title: 'Ticket Detail', booking, qrCodeDataUrl });
    } catch (error) {
        next(error);
    }
};


// ─── Cancel Booking ───────────────────────────────────────────────────────────
export const cancelBooking = async (req, res, next) => {
    try {
        const result = await bookingService.cancelBooking(req.params.bookingId, req.session.user._id);

        res.json({ success: true, ...result });
    } catch (error) {
        next(error);
    }
};


// ─── Hold Booking ─────────────────────────────────────────────────────────────
export const holdBooking = async (req, res, next) => {
    try {
        const result = await bookingService.holdBooking(req.params.bookingId, req.session.user._id);
        res.json({ success: true, ...result });
    } catch (error) {
        next(error);
    }
};


// ─── Unhold (Resume) Booking ──────────────────────────────────────────────────
export const unholdBooking = async (req, res, next) => {
    try {
        const result = await bookingService.unholdBooking(req.params.bookingId, req.session.user._id);
        res.json({ success: true, ...result });
    } catch (error) {
        next(error);
    }
};


export const cancelSingleTicket = async (req, res, next) => {
    try {
        const { id, ticketId } = req.params;
        const { quantity, reason } = req.body; 
        
        const result = await bookingService.cancelSingleTicketByUser(
            id, 
            ticketId, 
            req.session.user._id,
            quantity,
            reason
        );
        res.json({ success: true, ...result });
    } catch (error) {
        next(error);
    }
};


// ─── GET AVAILABLE PROMO CODES ──────────────────────────────────────────────
export const getAvailableCoupons = async (req, res, next) => {
    try {
        const coupons = await bookingService.getAvailableCouponsService(req.params.eventId);
        res.json({ success: true, coupons });
    } catch (error) {
        next(error);
    }
};

// ─── VALIDATE PROMO CODE ────────────────────────────────────────────────────
export const validatePromoCode = async (req, res, next) => {
    try {
        const { code, eventId, currentTotal, cart } = req.body; // ✨ GET CART
        const userId = req.session.user._id; 
        
        // ✨ Pass cart to service
        const result = await bookingService.validatePromoCodeService(code, eventId, currentTotal, userId, cart);

        res.json({ success: true, message: 'Promo code applied!', ...result });
    } catch (error) {
        next(error);
    }
};         

// ─── Download Ticket as PDF ──────────────────────────────────────────────────
export const downloadTicketPdf = async (req, res, next) => {
    try {
        const hostUrl = `${req.protocol}://${req.get('host')}`;
        const { pdfBuffer, bookingIdShort } = await bookingService.generateTicketPdf(
            req.params.bookingId,
            req.session.user._id,
            hostUrl
        );

        res.set({
            'Content-Type':        'application/pdf',
            'Content-Disposition': `attachment; filename="EventHub-Ticket-${bookingIdShort}.pdf"`,
            'Content-Length':      pdfBuffer.length
        });
        res.end(pdfBuffer, 'binary');
    } catch (error) {
        next(error);
    }
};

// ─── Request Cancellation (User → Organizer Approval) ───────────────────────
export const requestCancellation = async (req, res, next) => {
    try {
        const { reason } = req.body;
        const result = await bookingService.requestCancellation(
            req.params.bookingId,
            req.session.user._id,
            reason
        );
        res.json({ success: true, ...result });
    } catch (error) {
        next(error);
    }
};



