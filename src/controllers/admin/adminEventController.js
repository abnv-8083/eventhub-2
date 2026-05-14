import HTTP_STATUS from '../../constant/statusCode.js';
import * as adminEventService from '../../services/admin/adminEventService.js';


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
