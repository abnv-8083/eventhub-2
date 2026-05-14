import HTTP_STATUS from '../../constant/statusCode.js';
import { bookingValidationSchema } from '../../validations/users/bookingValidation.js';
import * as bookingService from '../../services/users/bookingService.js';


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
        next(error);
    }
};


// ─── Create Razorpay Order ────────────────────────────────────────────────────
export const createRazorpayOrder = async (req, res, next) => {
    try {
        const { id } = req.params;
        const { cart } = req.body;

        // Joi validation
        const { error: valErr } = bookingValidationSchema.validate({ cart });
        if (valErr) return res.status(HTTP_STATUS.BAD_REQUEST).json({ success: false, message: valErr.details[0].message });

        const { order, amount } = await bookingService.createOrder(id, cart, req.session.user._id);
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
        const { cart } = req.body;

        // Now receives a single bookingId
        const { bookingId } = await bookingService.bookWithWallet(id, req.session.user._id, cart);

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


// ─── Ticket Detail ────────────────────────────────────────────────────────────
export const getTicketDetail = async (req, res, next) => {
    try {
        const booking = await bookingService.getTicketDetail(req.params.bookingId, req.session.user._id);

        res.render('users/tickets/detail', { title: 'Ticket Detail', booking });
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
        const { quantity } = req.body; // Extract quantity sent from frontend modal
        
        const result = await bookingService.cancelSingleTicketByUser(
            id, 
            ticketId, 
            req.session.user._id,
            quantity // Pass the quantity to your service layer
        );
        res.json({ success: true, ...result });
    } catch (error) {
        next(error);
    }
};