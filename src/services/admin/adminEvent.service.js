import Event from '../../models/events/event.model.js';
import AppError from '../../utils/AppError.js';
import HTTP_STATUS from '../../constant/statusCode.js';
import { getIO } from '../../utils/socket.js';
import { sendNotification } from '../../utils/notify.js';


// ─── Get Events (Filtered, Sorted, Paginated) ────────────────────────────────
export const getEvents = async ({ search = '', status = 'all', sort = 'newest', page = 1, limit = 10 }) => {
    const skip = (parseInt(page) - 1) * limit;

    const query = { deleted: { $ne: true } };
    if (search) query.$or = [{ title: { $regex: search, $options: 'i' } }];
    if (status !== 'all') query.status = status;

    const sortMap = {
        newest:      { createdAt: -1 },
        oldest:      { createdAt: 1 },
        'title-asc': { title: 1 },
    };
    const sortOption = sortMap[sort] || { createdAt: -1 };

    const [events, total] = await Promise.all([
        Event.find(query)
            .populate('organizer', 'fullName email')
            .populate('category', 'name')
            .sort(sortOption)
            .skip(skip)
            .limit(limit),
        Event.countDocuments(query)
    ]);

    return { events, total, totalPages: Math.ceil(total / limit) };
};


// ─── Get Single Event (Full Detail for Admin Review) ────────────────────────
export const getEventById = async (eventId) => {
    const event = await Event.findById(eventId)
        .populate('organizer', 'fullName email organizationName phone city avatar')
        .populate('category', 'name');
    if (!event) throw new AppError('Event not found', HTTP_STATUS.NOT_FOUND);
    return event;
};


// ─── Update Event Status & Notify Organizer ──────────────────────────────────
export const updateEventStatus = async (eventId, status) => {
    const event = await Event.findByIdAndUpdate(eventId, { status }, { new: true });
    if (!event) throw new AppError('Event not found', HTTP_STATUS.NOT_FOUND);

    // Notify the organizer
    let notifStatus = 'info';
    if (status === 'approved') notifStatus = 'success';
    if (status === 'rejected') notifStatus = 'danger';
    
    await sendNotification(event.organizer.toString(), `Your event "${event.title}" has been ${status}.`, notifStatus);

    // Emit live event status update
    getIO().to(event.organizer.toString()).emit('event_status_update', { 
        eventId: event._id, 
        title: event.title, 
        status 
    });

    return event;
};

// ─── Toggle Event Block Status ───────────────────────────────────────────────
export const toggleEventBlockStatus = async (eventId) => {
    const event = await Event.findById(eventId).populate('organizer', 'email');
    if (!event) throw new AppError('Event not found', HTTP_STATUS.NOT_FOUND);

    event.isBlocked = !event.isBlocked;
    await event.save();

    // Notify the organizer
    const statusMsg = event.isBlocked ? 'blocked by administration' : 'unblocked and is now visible';
    const notifStatus = event.isBlocked ? 'danger' : 'success';
    await sendNotification(event.organizer._id.toString(), `Your event "${event.title}" has been ${statusMsg}.`, notifStatus);

    return event;
};
