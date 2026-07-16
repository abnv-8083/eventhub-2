import Event from '../../models/events/event.model.js';
import Booking from '../../models/payments/booking.model.js';
import AppError from '../../utils/AppError.js';
import HTTP_STATUS from '../../constant/statusCode.js';
import { PAYMENT_STATUS } from '../../constant/paymentConstants.js';


// ─── Organizer Dashboard Stats ────────────────────────────────────────────────
export const getDashboardData = async (organizerId) => {
    const events = await Event.find({ organizer: organizerId, deleted: { $ne: true } });
    const eventIds = events.map(e => e._id);

    const bookings = await Booking.find({ event: { $in: eventIds }, paymentStatus: PAYMENT_STATUS.COMPLETED });

    const totalRevenue     = bookings.reduce((sum, b) => sum + b.totalAmount, 0);
    const totalTicketsSold = bookings.reduce((sum, b) => sum + (b.tickets ? b.tickets.reduce((acc, t) => acc + (t.status !== 'cancelled' ? (t.quantity || 0) : 0), 0) : (b.status !== 'cancelled' ? (b.quantity || 0) : 0)), 0);
    const activeEvents     = events.filter(e => e.status === 'approved' && !e.isBlocked).length;

    const recentEvents = await Event.find({ organizer: organizerId, deleted: { $ne: true } })
        .sort({ createdAt: -1 })
        .limit(5)
        .populate('category', 'name');

    // ── Monthly Revenue Trend (last 6 months) ───────────────────────────────
    const sixMonthsAgo = new Date();
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 5);
    sixMonthsAgo.setDate(1);
    sixMonthsAgo.setHours(0, 0, 0, 0);

    const monthlyBookings = bookings.filter(b => new Date(b.bookingDate || b.createdAt) >= sixMonthsAgo);
    const monthlyRevenueMap = {};
    for (let i = 5; i >= 0; i--) {
        const d = new Date();
        d.setMonth(d.getMonth() - i);
        const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
        monthlyRevenueMap[key] = 0;
    }
    monthlyBookings.forEach(b => {
        const d = new Date(b.bookingDate || b.createdAt);
        const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
        if (monthlyRevenueMap[key] !== undefined) {
            monthlyRevenueMap[key] += b.totalAmount;
        }
    });
    const monthLabels   = Object.keys(monthlyRevenueMap).map(k => {
        const [y, m] = k.split('-');
        return new Date(y, m - 1).toLocaleString('default', { month: 'short', year: '2-digit' });
    });
    const monthRevenues = Object.values(monthlyRevenueMap);

    // ── Event Status Breakdown ───────────────────────────────────────────────
    const statusCounts = {};
    events.forEach(e => { statusCounts[e.status] = (statusCounts[e.status] || 0) + 1; });

    // ── Top 5 Events by Revenue ──────────────────────────────────────────────
    const revenueByEvent = {};
    bookings.forEach(b => {
        const eid = b.event.toString();
        revenueByEvent[eid] = (revenueByEvent[eid] || 0) + b.totalAmount;
    });
    const topEventIds = Object.entries(revenueByEvent)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([id]) => id);
    const topEvents = events
        .filter(e => topEventIds.includes(e._id.toString()))
        .map(e => ({
            title: e.title,
            revenue: revenueByEvent[e._id.toString()] || 0,
            status: e.status
        }))
        .sort((a, b) => b.revenue - a.revenue);

    // ── Pending Cancellations ────────────────────────────────────────────────
    const pendingCancellations = await Booking.countDocuments({
        event: { $in: eventIds },
        'cancellationRequest.status': 'pending'
    });

    // ── Booking Status Breakdown ─────────────────────────────────────────────
    const allBookings = await Booking.find({ event: { $in: eventIds } });
    const activeBookings    = allBookings.filter(b => b.status === 'active').length;
    const cancelledBookings = allBookings.filter(b => b.status === 'cancelled').length;
    const onHoldBookings    = allBookings.filter(b => b.status === 'on_hold').length;
    const totalBookings     = allBookings.length;

    return {
        totalRevenue, totalTicketsSold, activeEvents, totalEvents: events.length, recentEvents,
        monthLabels, monthRevenues,
        statusCounts, topEvents,
        pendingCancellations,
        totalBookings, activeBookings, cancelledBookings, onHoldBookings
    };
};
