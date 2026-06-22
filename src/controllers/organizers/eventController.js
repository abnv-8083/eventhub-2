import HTTP_STATUS from '../../constant/statusCode.js';
import { eventValidationSchema, draftEventValidationSchema } from '../../validations/organizer/eventValidation.js';
import * as organizerEventService from '../../services/organizers/organizerEventService.js';
import * as organizerCouponService from '../../services/organizers/organizerCouponService.js';
import Event from '../../models/events/event.js';
import Booking from '../../models/payments/booking.js';
import Coupon from '../../models/payments/coupon.js';

// ─── Sales Report Page ────────────────────────────────────────────────────────
export const getSalesReport = async (req, res, next) => {
    try {
        const { startDate, endDate } = req.query;
        const reportData = await organizerEventService.getEventSalesReport(
            req.params.id, req.session.organizer._id, { startDate, endDate }
        );
        if (!reportData) return res.redirect('/organizer/events');

        res.render('organizer/events/sales-report', {
            title: `Sales Report — ${reportData.event.title}`,
            startDate, endDate,
            ...reportData,
        });
    } catch (error) {
        next(error);
    }
};

// ─── Export Sales Report as Excel ─────────────────────────────────────────────
export const exportSalesReportExcel = async (req, res, next) => {
    try {
        const { startDate, endDate } = req.query;
        const workbook = await organizerEventService.exportSalesReportExcel(
            req.params.id, req.session.organizer._id, { startDate, endDate }
        );
        const eventSlug = req.params.id.toString().slice(-6);
        const fileName  = `sales-report-${eventSlug}-${Date.now()}.xlsx`;

        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
        await workbook.xlsx.write(res);
        res.end();
    } catch (error) {
        next(error);
    }
};

// ─── Export Sales Report as PDF ───────────────────────────────────────────────
export const exportSalesReportPdf = async (req, res, next) => {
    try {
        const { startDate, endDate } = req.query;
        const pdfBuffer = await organizerEventService.exportSalesReportPdf(
            req.params.id, req.session.organizer._id, { startDate, endDate }
        );
        const eventSlug = req.params.id.toString().slice(-6);
        const fileName  = `sales-report-${eventSlug}-${Date.now()}.pdf`;

        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
        res.send(pdfBuffer);
    } catch (error) {
        next(error);
    }
};


// ─── Export Global Sales Report as Excel ──────────────────────────────────────
export const exportGlobalSalesReportExcel = async (req, res, next) => {
    try {
        const { startDate, endDate } = req.query;
        const workbook = await organizerEventService.exportGlobalSalesReportExcel(
            req.session.organizer._id, { startDate, endDate }
        );
        const fileName = `global-sales-report-${Date.now()}.xlsx`;

        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
        await workbook.xlsx.write(res);
        res.end();
    } catch (error) {
        next(error);
    }
};

// ─── Export Global Sales Report as PDF ────────────────────────────────────────
export const exportGlobalSalesReportPdf = async (req, res, next) => {
    try {
        const { startDate, endDate } = req.query;
        const pdfBuffer = await organizerEventService.exportGlobalSalesReportPdf(
            req.session.organizer._id, { startDate, endDate }
        );
        const fileName = `global-sales-report-${Date.now()}.pdf`;

        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
        res.send(pdfBuffer);
    } catch (error) {
        next(error);
    }
};

// ─── Global Sales Report Page ─────────────────────────────────────────────────
export const getGlobalSalesReport = async (req, res, next) => {
    try {
        const { startDate, endDate } = req.query;
        const reportData = await organizerEventService.getGlobalSalesReport(
            req.session.organizer._id, { startDate, endDate }
        );
        
        // If organizer has no events or no data, provide fallback
        if (!reportData) {
            return res.render('organizer/events/global-sales-report', {
                title: 'Global Sales Report',
                startDate, endDate,
                eventsCount: 0,
                totalRevenue: 0, platformFee: 0, netRevenue: 0, totalBookings: 0,
                activeBookingCount: 0, cancelledCount: 0, onHoldCount: 0, totalTicketsSold: 0,
                totalCapacity: 0, fillRate: 0, avgOrderValue: 0, dailyRevenueTrend: [],
                eventPerformance: [], paymentMethodMap: {}, statusDistribution: {}, recentTransactions: []
            });
        }

        res.render('organizer/events/global-sales-report', {
            title: 'Global Sales Report',
            startDate, endDate,
            ...reportData
        });
    } catch (error) {
        next(error);
    }
};



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
        const action = req.body.action || 'publish';
        let tickets = [];
        try {
            if (req.body.tickets) tickets = JSON.parse(req.body.tickets);
        } catch {
            return res.status(HTTP_STATUS.BAD_REQUEST).json({ success: false, message: 'Invalid tickets format' });
        }

        const eventData = {
            title:       req.body.title,
            description: req.body.description,
            category:    req.body.category,
            address:     req.body.address,
            lat:         req.body.lat ? parseFloat(req.body.lat) : null,
            lng:         req.body.lng ? parseFloat(req.body.lng) : null,
            startDate:   req.body.startDate,
            startTime:   req.body.startTime,
            endDate:     req.body.endDate,
            endTime:     req.body.endTime,
            isFeatured:  req.body.isFeatured === 'true',
            tickets
        };

        const schema = action === 'draft' ? draftEventValidationSchema : eventValidationSchema;
        const { error, value } = schema.validate(eventData);
        if (error) return res.status(HTTP_STATUS.BAD_REQUEST).json({ success: false, message: error.details[0].message });

        if (action !== 'draft' && (!req.files || req.files.length === 0))
            return res.status(HTTP_STATUS.BAD_REQUEST).json({ success: false, message: 'At least 1 banner is required' });

        const bannerUrls = req.files ? req.files.map(file => file.path) : [];
        const status = action === 'draft' ? 'draft' : 'pending';
        const newEvent = await organizerEventService.createEvent(req.session.organizer._id, value, bannerUrls, value.tickets, status);

        if (action === 'draft') {
            res.status(HTTP_STATUS.CREATED).json({ success: true, message: 'Draft saved successfully', eventId: newEvent._id });
        } else {
            res.status(HTTP_STATUS.CREATED).json({ success: true, message: 'Event created and sent for admin approval' });
        }
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
        const action = req.body.action || 'publish';
        let tickets = [];
        try {
            if (req.body.tickets) tickets = JSON.parse(req.body.tickets);
        } catch {
            return res.status(HTTP_STATUS.BAD_REQUEST).json({ success: false, message: 'Invalid tickets format' });
        }

        const eventData = {
            title:       req.body.title,
            description: req.body.description,
            category:    req.body.category,
            address:     req.body.address,
            lat:         req.body.lat ? parseFloat(req.body.lat) : null,
            lng:         req.body.lng ? parseFloat(req.body.lng) : null,
            startDate:   req.body.startDate,
            startTime:   req.body.startTime,
            endDate:     req.body.endDate,
            endTime:     req.body.endTime,
            isFeatured:  req.body.isFeatured === 'true',
            existingBanners: req.body.existingBanners || [],
            tickets
        };

        const { updateEventValidationSchema, draftEventValidationSchema } = await import('../../validations/organizer/eventValidation.js');
        const schema = action === 'draft' ? draftEventValidationSchema : updateEventValidationSchema;
        const { error, value } = schema.validate(eventData);
        
        if (error) return res.status(HTTP_STATUS.BAD_REQUEST).json({ success: false, message: error.details[0].message });

        const status = action === 'draft' ? 'draft' : 'pending';
        await organizerEventService.updateEvent(req.params.id, req.session.organizer._id, value, req.files, value.tickets, status);

        if (action === 'draft') {
            res.status(HTTP_STATUS.OK).json({ success: true, message: 'Draft updated successfully' });
        } else {
            res.status(HTTP_STATUS.OK).json({ success: true, message: 'Event updated successfully' });
        }
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


// ─── COUPON MANAGEMENT ─────────────────────────────────────────

// Get all coupons for a specific event
export const getEventCoupons = async (req, res, next) => {
    try {
        const coupons = await organizerCouponService.getCouponsByEvent(
            req.params.eventId,
            req.session.organizer._id
        );
        res.json({ success: true, coupons });
    } catch (error) {
        next(error);
    }
};

// Create a new coupon
export const createCoupon = async (req, res, next) => {
    try {
        const coupon = await organizerCouponService.createEventCoupon(
            req.params.eventId,
            req.session.organizer._id,
            req.body
        );
        res.json({ success: true, message: 'Promo code created successfully!', coupon });
    } catch (error) {
        next(error);
    }
};

// Toggle active status or delete coupon
export const toggleCouponStatus = async (req, res, next) => {
    try {
        const coupon = await organizerCouponService.toggleEventCouponStatus(
            req.params.couponId,
            req.session.organizer._id
        );
        res.json({ success: true, message: `Coupon is now ${coupon.isActive ? 'Active' : 'Inactive'}` });
    } catch (error) {
        next(error);
    }
};

// ─── Get Manage Coupons Page ────────────────────────────────────────────────
export const getManageCouponsPage = async (req, res, next) => {
    try {
        const eventId = req.params.id;
        const event = await Event.findOne({ _id: eventId, organizer: req.session.organizer._id });
        if (!event) return res.redirect('/organizer/events');

        const coupons = await organizerCouponService.getCouponsByEvent(eventId, req.session.organizer._id);

        res.render('organizer/events/coupons', {
            title: `Manage Offers - ${event.title}`,
            event,
            coupons
        });
    } catch (error) {
        next(error);
    }
};

// ─── Edit Existing Coupon ───────────────────────────────────────────────────
export const editCoupon = async (req, res, next) => {
    try {
        const coupon = await organizerCouponService.updateEventCoupon(
            req.params.couponId, req.session.organizer._id, req.body
        );
        res.json({ success: true, message: 'Offer updated successfully!', coupon });
    } catch (error) {
        next(error);
    }
};

// ─── Delete Coupon ──────────────────────────────────────────────────────────
export const deleteCoupon = async (req, res, next) => {
    try {
        await organizerCouponService.deleteEventCoupon(
            req.params.couponId, req.session.organizer._id
        );
        res.json({ success: true, message: 'Offer deleted permanently!' });
    } catch (error) {
        next(error);
    }
};