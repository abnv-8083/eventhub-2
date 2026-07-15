import HTTP_STATUS from '../../constant/statusCode.js';
import * as adminEventService from '../../services/admin/adminEvent.service.js';


// ─── Events List ──────────────────────────────────────────────────────────────
export const getAdminEvents = async (req, res, next) => {
    try {
        const { search = '', status = 'all', sort = 'newest', page = 1 } = req.query;
        const { events, total, totalPages } = await adminEventService.getEvents({ search, status, sort, page });

        res.render('admin/events/index', {
            title: 'Manage Events',
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


// ─── Event Detail Page ──────────────────────────────────────────────────────────────────────
export const getAdminEventDetail = async (req, res, next) => {
    try {
        const event = await adminEventService.getEventById(req.params.id);
        res.render('admin/events/view', {
            title: `Review: ${event.title}`,
            event
        });
    } catch (error) {
        next(error);
    }
};


// ─── Update Event Status ──────────────────────────────────────────────────────
export const updateEventStatus = async (req, res, next) => {
    try {
        const { eventId, status } = req.body;
        await adminEventService.updateEventStatus(eventId, status);
        res.status(HTTP_STATUS.OK).json({ success: true, message: `Event marked as ${status}` });
    } catch (error) {
        next(error);
    }
};

// ─── Toggle Event Block Status ────────────────────────────────────────────────
export const toggleEventBlock = async (req, res, next) => {
    try {
        const { eventId } = req.body;
        if (!eventId) return res.status(HTTP_STATUS.BAD_REQUEST).json({ success: false, message: 'Event ID is required' });

        const updatedEvent = await adminEventService.toggleEventBlockStatus(eventId);
        res.status(HTTP_STATUS.OK).json({
            success: true,
            message: `Event successfully ${updatedEvent.isBlocked ? 'blocked' : 'unblocked'}.`
        });
    } catch (error) {
        next(error);
    }
};
