import User from '../../models/users/user.js';
import Event from '../../models/events/event.js';
import Booking from '../../models/payments/booking.js';
import Notification from '../../models/notifications/notification.js';
import AppError from '../../utils/AppError.js';
import HTTP_STATUS from '../../constant/statusCode.js';
import { getIO } from '../../utils/socket.js';
import { sendNotification } from '../../utils/notify.js';
import { PAYMENT_STATUS } from '../../constant/paymentConstants.js';


// ─── Admin Dashboard Stats ────────────────────────────────────────────────────
export const getDashboardStats = async () => {
    const [totalUsers, totalOrganizers, totalEvents, pendingEvents, completedBookings, recentEvents, allBookings] = await Promise.all([
        User.countDocuments({ role: 'user' }),
        User.countDocuments({ role: 'organizer' }),
        Event.countDocuments({ deleted: { $ne: true } }),
        Event.countDocuments({ status: 'pending' }),
        Booking.find({ paymentStatus: PAYMENT_STATUS.COMPLETED }).populate('event', 'category organizer title'),
        Event.find({ deleted: { $ne: true } })
            .sort({ createdAt: -1 })
            .limit(8)
            .populate('organizer', 'fullName organizationName')
            .lean(),
        Booking.find().lean()
    ]);

    const totalRevenue  = completedBookings.reduce((sum, b) => sum + b.totalAmount, 0);
    const totalBookings = allBookings.length;

    // ── Monthly Revenue Trend (last 6 months) ───────────────────────────────
    const sixMonthsAgo = new Date();
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 5);
    sixMonthsAgo.setDate(1); sixMonthsAgo.setHours(0, 0, 0, 0);

    const monthlyRevenueMap = {};
    for (let i = 5; i >= 0; i--) {
        const d = new Date();
        d.setMonth(d.getMonth() - i);
        const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
        monthlyRevenueMap[key] = 0;
    }
    completedBookings.forEach(b => {
        const d = new Date(b.bookingDate || b.createdAt);
        const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
        if (monthlyRevenueMap[key] !== undefined) monthlyRevenueMap[key] += b.totalAmount;
    });
    const monthLabels   = Object.keys(monthlyRevenueMap).map(k => {
        const [y, m] = k.split('-');
        return new Date(y, m - 1).toLocaleString('default', { month: 'short', year: '2-digit' });
    });
    const monthRevenues = Object.values(monthlyRevenueMap);

    // ── Monthly New Users ────────────────────────────────────────────────────
    const recentUsers = await User.find({ role: 'user', createdAt: { $gte: sixMonthsAgo } }).lean();
    const monthlyUsersMap = {};
    Object.keys(monthlyRevenueMap).forEach(k => { monthlyUsersMap[k] = 0; });
    recentUsers.forEach(u => {
        const d = new Date(u.createdAt);
        const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
        if (monthlyUsersMap[key] !== undefined) monthlyUsersMap[key]++;
    });
    const monthUsers = Object.values(monthlyUsersMap);

    // ── Booking Status Breakdown ─────────────────────────────────────────────
    const activeBookings    = allBookings.filter(b => b.status === 'active').length;
    const cancelledBookings = allBookings.filter(b => b.status === 'cancelled').length;
    const onHoldBookings    = allBookings.filter(b => b.status === 'on_hold').length;

    // ── Event Status Breakdown ───────────────────────────────────────────────
    const allEvents = await Event.find({ deleted: { $ne: true } }).lean();
    const eventStatusCounts = {};
    allEvents.forEach(e => { eventStatusCounts[e.status] = (eventStatusCounts[e.status] || 0) + 1; });

    // ── Category Distribution ────────────────────────────────────────────────
    const categoryMap = {};
    allEvents.forEach(e => {
        const cat = e.category || 'other';
        categoryMap[cat] = (categoryMap[cat] || 0) + 1;
    });
    const topCategories = Object.entries(categoryMap)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 6)
        .map(([cat, count]) => ({ cat, count }));

    // ── Top 5 Organizers by Revenue ──────────────────────────────────────────
    const orgRevenueMap = {};
    completedBookings.forEach(b => {
        const oid = b.event?.organizer?.toString();
        if (oid) orgRevenueMap[oid] = (orgRevenueMap[oid] || 0) + b.totalAmount;
    });
    const topOrgIds = Object.entries(orgRevenueMap).sort((a,b) => b[1]-a[1]).slice(0,5).map(([id]) => id);
    const topOrgUsers = await User.find({ _id: { $in: topOrgIds } }).select('fullName organizationName').lean();
    const topOrganizers = topOrgUsers
        .map(u => ({ name: u.organizationName || u.fullName, revenue: orgRevenueMap[u._id.toString()] || 0 }))
        .sort((a, b) => b.revenue - a.revenue);

    // ── Pending Cancellations Platform-Wide ──────────────────────────────────
    const pendingCancellations = await Booking.countDocuments({ 'cancellationRequest.status': 'pending' });

    return {
        totalUsers, totalOrganizers, totalEvents, pendingEvents,
        totalRevenue, totalBookings, recentEvents,
        monthLabels, monthRevenues, monthUsers,
        activeBookings, cancelledBookings, onHoldBookings,
        eventStatusCounts, topCategories, topOrganizers, pendingCancellations
    };
};


// ─── Update Organizer Status & Notify ──────────────────────────────────────────
export const updateOrganizerStatus = async (orgId, status) => {
    const updatedOrg = await User.findByIdAndUpdate(orgId, { status }, { new: true });
    if (!updatedOrg) throw new AppError('Organizer not found', HTTP_STATUS.NOT_FOUND);

    let notifStatus = 'info';
    if (status === 'approved') notifStatus = 'success';
    if (status === 'rejected') notifStatus = 'danger';

    await sendNotification(orgId.toString(), `Your organizer account application has been ${updatedOrg.status}!`, notifStatus);

    return updatedOrg;
};


// ─── Notifications ────────────────────────────────────────────────────────────
export const getNotifications = async (adminId) => {
    const notifications = await Notification.find({ recipient: adminId })
        .sort({ createdAt: -1 })
        .limit(20);

    const unreadCount = notifications.filter(n => !n.isRead).length;
    return { notifications, unreadCount };
};

export const markNotificationsRead = async (adminId) => {
    await Notification.updateMany(
        { recipient: adminId, isRead: false },
        { $set: { isRead: true } }
    );
};

export const deleteNotification = async (notificationId, adminId) => {
    await Notification.findOneAndDelete({ _id: notificationId, recipient: adminId });
};
