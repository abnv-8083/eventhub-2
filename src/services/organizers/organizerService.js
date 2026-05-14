import Event from '../../models/events/event.js';
import Booking from '../../models/payments/booking.js';
import AppError from '../../utils/AppError.js';
import HTTP_STATUS from '../../constant/statusCode.js';


// ─── Organizer Dashboard Stats ────────────────────────────────────────────────
export const getDashboardData = async (organizerId) => {
    const events = await Event.find({ organizer: organizerId });
    const eventIds = events.map(e => e._id);

    const bookings = await Booking.find({ event: { $in: eventIds }, paymentStatus: 'completed' });

    const totalRevenue      = bookings.reduce((sum, b) => sum + b.totalAmount, 0);
    const totalTicketsSold  = bookings.reduce((sum, b) => sum + b.quantity, 0);
    const activeEvents      = events.filter(e => e.status === 'approved' && !e.isBlocked).length;

    const recentEvents = await Event.find({ organizer: organizerId })
        .sort({ createdAt: -1 })
        .limit(5)
        .populate('category', 'name');

    return { totalRevenue, totalTicketsSold, activeEvents, totalEvents: events.length, recentEvents };
};
