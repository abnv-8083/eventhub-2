import Event from '../../models/events/event.js';
import AppError from '../../utils/AppError.js';
import HTTP_STATUS from '../../constant/statusCode.js';
import { getIO } from '../../utils/socket.js';


// ─── Get Events (Filtered, Sorted, Paginated) ────────────────────────────────
export const getEvents = async ({ search = '', status = 'all', sort = 'newest', page = 1, limit = 10 }) => {
    const skip = (parseInt(page) - 1) * limit;

    const query = {};
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


// ─── Update Event Status & Notify Organizer ──────────────────────────────────
export const updateEventStatus = async (eventId, status) => {
    const event = await Event.findByIdAndUpdate(eventId, { status }, { new: true });
    if (!event) throw new AppError('Event not found', HTTP_STATUS.NOT_FOUND);

    // Notify the organizer in real-time
    const io = getIO();
    io.to(event.organizer.toString()).emit('notification', {
        type: 'event_status',
        message: `Your event "${event.title}" has been ${status}.`
    });

    return event;
};
