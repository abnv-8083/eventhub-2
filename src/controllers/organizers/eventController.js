import HTTP_STATUS from '../../constant/statusCode.js';
import { eventValidationSchema } from '../../validations/organizer/eventValidation.js';
import * as organizerEventService from '../../services/organizers/organizerEventService.js';
import Event from '../../models/events/event.js';
import Booking from '../../models/payments/booking.js';


// ─── Event Dashboard ──────────────────────────────────────────────────────────
export const getEventDashboard = async (req, res, next) => {
    try {
        const { search = '', status = 'all', sort = 'newest', page = 1 } = req.query;
        const { events, total, totalPages } = await organizerEventService.getOrganizerEvents(
            req.session.organizer._id, { search, status, sort, page }
        );

        res.render('organizer/events/index', {
            title: 'My Events',
            events,
            filters: { search, status, sort },
            totalPages,
            currentPage: parseInt(page),
            total
        });
    } catch (error) {
        next(error);
    }
};


// ─── Create Event Page ────────────────────────────────────────────────────────
export const getCreateEventPage = async (req, res, next) => {
    try {
        const categories = await organizerEventService.getActiveCategories();
        res.render('organizer/events/new', { title: 'Create Event', categories });
    } catch (error) {
        next(error);
    }
};


// ─── Create Event ─────────────────────────────────────────────────────────────
export const createEvent = async (req, res, next) => {
    try {
        let tickets = [];
        try {
            tickets = JSON.parse(req.body.tickets);
        } catch {
            return res.status(HTTP_STATUS.BAD_REQUEST).json({ success: false, message: 'Invalid tickets format' });
        }

        const eventData = {
            title:       req.body.title,
            description: req.body.description,
            category:    req.body.category,
            address:     req.body.address,
            lat:         parseFloat(req.body.lat),
            lng:         parseFloat(req.body.lng),
            startDate:   req.body.startDate,
            startTime:   req.body.startTime,
            endDate:     req.body.endDate,
            endTime:     req.body.endTime,
            isFeatured:  req.body.isFeatured === 'true',
            tickets
        };

        const { error, value } = eventValidationSchema.validate(eventData);
        if (error) return res.status(HTTP_STATUS.BAD_REQUEST).json({ success: false, message: error.details[0].message });

        if (!req.files || req.files.length === 0)
            return res.status(HTTP_STATUS.BAD_REQUEST).json({ success: false, message: 'At least 1 banner is required' });

        const bannerUrls = req.files.map(file => file.path);
        await organizerEventService.createEvent(req.session.organizer._id, value, bannerUrls, value.tickets);

        res.status(HTTP_STATUS.CREATED).json({ success: true, message: 'Event created and sent for admin approval' });
    } catch (error) {
        next(error);
    }
};


// ─── View Event Page ─────────────────────────────────────────────────────────
export const getEventViewPage = async (req, res, next) => {
    try {
        const eventId = req.params.id;
        const organizerId = req.session.organizer._id;

        // Fetch all data from the service layer
        const data = await organizerEventService.getEventViewData(eventId, organizerId);

        // If the service returns null, the event wasn't found or doesn't belong to the organizer
        if (!data) {
            return res.redirect('/organizer/events');
        }

        // Render the page with the returned data
        res.render('organizer/events/view', {
            title: data.event.title,
            event: data.event,
            tickets: data.tickets,
            bookings: data.bookings,
            totalRevenue: data.totalRevenue,
            totalTicketsSold: data.totalTicketsSold,
            totalCapacity: data.totalCapacity
        });
    } catch (error) {
        next(error);
    }
};

// ─── Edit Event Page ──────────────────────────────────────────────────────────
export const getEditEventPage = async (req, res, next) => {
    try {
        const { event, tickets } = await organizerEventService.getEventForEdit(req.params.id, req.session.organizer._id);
        const categories = await organizerEventService.getActiveCategories();
        res.render('organizer/events/edit', { title: 'Edit Event', event, categories, tickets });
    } catch (error) {
        next(error);
    }
};


// ─── Update Event ─────────────────────────────────────────────────────────────
export const updateEvent = async (req, res, next) => {
    try {
        let tickets = [];
        try {
            tickets = JSON.parse(req.body.tickets);
        } catch {
            return res.status(HTTP_STATUS.BAD_REQUEST).json({ success: false, message: 'Invalid tickets format' });
        }

        const eventData = {
            title:       req.body.title,
            description: req.body.description,
            category:    req.body.category,
            address:     req.body.address,
            lat:         parseFloat(req.body.lat),
            lng:         parseFloat(req.body.lng),
            startDate:   req.body.startDate,
            startTime:   req.body.startTime,
            endDate:     req.body.endDate,
            endTime:     req.body.endTime,
            isFeatured:  req.body.isFeatured === 'true',
            tickets
        };

        const { error, value } = eventValidationSchema.validate(eventData);
        if (error) return res.status(HTTP_STATUS.BAD_REQUEST).json({ success: false, message: error.details[0].message });

        await organizerEventService.updateEvent(req.params.id, req.session.organizer._id, value, req.files, value.tickets);

        res.status(HTTP_STATUS.OK).json({ success: true, message: 'Event updated successfully' });
    } catch (error) {
        next(error);
    }
};


// ─── Delete Event ─────────────────────────────────────────────────────────────
export const deleteEvent = async (req, res, next) => {
    try {
        await organizerEventService.deleteEvent(req.params.id, req.session.organizer._id);
        res.status(HTTP_STATUS.OK).json({ success: true, message: 'Event deleted permanently' });
    } catch (error) {
        next(error);
    }
};


// ─── Toggle Block Event ───────────────────────────────────────────────────────
export const toggleBlockEvent = async (req, res, next) => {
    try {
        const event = await organizerEventService.toggleBlockEvent(req.params.id, req.session.organizer._id);
        res.status(HTTP_STATUS.OK).json({
            success: true,
            message: `Event successfully ${event.isBlocked ? 'blocked' : 'unblocked'}.`
        });
    } catch (error) {
        next(error);
    }
};


// ─── Resubmit Event ───────────────────────────────────────────────────────────
export const resubmitEvent = async (req, res, next) => {
    try {
        await organizerEventService.resubmitEvent(req.params.id, req.session.organizer._id);
        res.status(HTTP_STATUS.OK).json({ success: true, message: 'Event resubmitted for admin review.' });
    } catch (error) {
        next(error);
    }
};
