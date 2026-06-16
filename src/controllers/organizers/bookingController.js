import HTTP_STATUS from '../../constant/statusCode.js';
import * as organizerBookingService from '../../services/organizers/organizerBookingService.js';


// ─── Event Bookings Page ──────────────────────────────────────────────────────
export const getEventBookings = async (req, res, next) => {
    try {
        const { search = '', sort = 'newest', status = 'all', page = 1 } = req.query;
        const data = await organizerBookingService.getEventBookings(
            req.params.id, req.session.organizer._id, { search, sort, status, page }
        );

        res.render('organizer/events/event-bookings', {
            title: 'Event Bookings',
            filters: { search, sort, status },
            currentPage: parseInt(page),
            ...data
        });
    } catch (error) {
        next(error);
    }
};

// ─── Event Cancellations Page ──────────────────────────────────────────────────
export const getEventCancellations = async (req, res, next) => {
    try {
        const { search = '', sort = 'newest', status = 'all', page = 1 } = req.query;
        const data = await organizerBookingService.getEventCancellations(
            req.params.id, req.session.organizer._id, { search, sort, status, page }
        );

        res.render('organizer/events/event-cancellations', {
            title: 'Event Cancellations',
            filters: { search, sort, status },
            currentPage: parseInt(page),
            ...data
        });
    } catch (error) {
        next(error);
    }
};


// ─── Get Single Booking Detail (JSON for modal) ───────────────────────────────
export const getBookingDetail = async (req, res, next) => {
    try {
        const booking = await organizerBookingService.getBookingDetail(
            req.params.bookingId, req.session.organizer._id
        );
        res.json({ success: true, booking });
    } catch (error) {
        next(error);
    }
};


// ─── Cancel a Booking ─────────────────────────────────────────────────────────
export const cancelBooking = async (req, res, next) => {
    try {
        const result = await organizerBookingService.cancelBookingByOrganizer(
            req.params.bookingId, req.session.organizer._id
        );
        res.json({ success: true, ...result });
    } catch (error) {
        next(error);
    }
};


// ─── Hold a Booking ───────────────────────────────────────────────────────────
export const holdBooking = async (req, res, next) => {
    try {
        const { reason } = req.body; // <-- Get reason from frontend

        const result = await organizerBookingService.holdBookingByOrganizer(
            req.params.bookingId, 
            req.session.organizer._id,
            reason // <-- Pass it to the service
        );
        res.json({ success: true, ...result });
    } catch (error) {
        next(error);
    }
};


// ─── Unhold a Booking ─────────────────────────────────────────────────────────
export const unholdBooking = async (req, res, next) => {
    try {
        const result = await organizerBookingService.unholdBookingByOrganizer(
            req.params.bookingId, req.session.organizer._id
        );
        res.json({ success: true, ...result });
    } catch (error) {
        next(error);
    }
};


// ─── Request Payout ───────────────────────────────────────────────────────────
export const requestPayout = async (req, res, next) => {
    try {
        await organizerBookingService.requestPayout(req.body.eventId, req.session.organizer._id);
        res.status(HTTP_STATUS.OK).json({ success: true, message: 'Payout requested successfully. Awaiting admin approval.' });
    } catch (error) {
        next(error);
    }
};

// ─── Delete Cancelled Booking ───────────────────────────────────────────────
export const deleteBooking = async (req, res, next) => {
    try {
        const result = await organizerBookingService.deleteCancelledBooking(
            req.params.id, req.params.bookingId, req.session.organizer._id
        );
        res.json({ success: true, ...result });
    } catch (error) {
        next(error);
    }
};

export const cancelSingleTicket = async (req, res, next) => {
    try {
        // Fallback checks to match whatever your route params are actually named!
        const eventId = req.params.eventId || req.params.id;
        const bookingId = req.params.bookingId;
        const ticketItemId = req.params.ticketId || req.params.ticketItemId;
        
        const organizerId = req.session.organizer._id;
        const { quantity } = req.body; 

        const result = await organizerBookingService.cancelSingleTicketByOrganizer(
            eventId, 
            bookingId, 
            ticketItemId, 
            organizerId, 
            quantity 
        );
        res.json({ success: true, ...result });
    } catch (error) {
        next(error);
    }
};

// ─── QR Code Scanner ──────────────────────────────────────────────────────────
export const getScannerPage = (req, res) => {
    res.render('organizer/events/scanner', { title: 'Ticket Scanner' });
};

export const verifyTicketScan = async (req, res, next) => {
    try {
        const booking = await organizerBookingService.verifyTicketScan(
            req.params.bookingId, req.session.organizer._id
        );
        
        // If it's an API request from the in-app scanner, return JSON
        if (req.xhr || (req.headers.accept && req.headers.accept.indexOf('json') > -1)) {
            res.json({ success: true, booking });
        } else {
            // If it's an external scanner that opened the browser directly
            res.render('organizer/events/scan-result', { 
                title: 'Scan Result', 
                success: true, 
                booking,
                message: 'Access Granted'
            });
        }
    } catch (error) {
        // If it's an API request from the scanner, return JSON
        if (req.xhr || (req.headers.accept && req.headers.accept.indexOf('json') > -1)) {
            res.status(HTTP_STATUS.BAD_REQUEST).json({ success: false, message: error.message });
        } else {
            // If it's an external scanner that opened the browser directly
            res.render('organizer/events/scan-result', { 
                title: 'Scan Result', 
                success: false, 
                message: error.message 
            });
        }
    }
};

// ─── Cancellation Requests Page ───────────────────────────────────────────────
export const getCancellationRequests = async (req, res, next) => {
    try {
        const { page = 1 } = req.query;
        const data = await organizerBookingService.getPendingCancellationRequests(
            req.session.organizer._id,
            { page }
        );
        res.render('organizer/cancellation-requests', {
            title: 'Cancellation Requests',
            ...data
        });
    } catch (error) {
        next(error);
    }
};

// ─── Approve Cancellation Request ─────────────────────────────────────────────
export const approveCancellation = async (req, res, next) => {
    try {
        const result = await organizerBookingService.approveCancellationRequest(
            req.params.bookingId,
            req.session.organizer._id
        );
        res.json({ success: true, ...result });
    } catch (error) {
        next(error);
    }
};

// ─── Reject Cancellation Request ──────────────────────────────────────────────
export const rejectCancellation = async (req, res, next) => {
    try {
        const { rejectionNote } = req.body;
        const result = await organizerBookingService.rejectCancellationRequest(
            req.params.bookingId,
            req.session.organizer._id,
            rejectionNote
        );
        res.json({ success: true, ...result });
    } catch (error) {
        next(error);
    }
};