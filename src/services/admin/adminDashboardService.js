import User from '../../models/users/user.js';
import Event from '../../models/events/event.js';
import Booking from '../../models/payments/booking.js';
import Notification from '../../models/notifications/notification.js';
import AppError from '../../utils/AppError.js';
import HTTP_STATUS from '../../constant/statusCode.js';
import { getIO } from '../../utils/socket.js';


// ─── Admin Dashboard Stats ────────────────────────────────────────────────────
export const getDashboardStats = async () => {
    const [totalUsers, totalOrganizers, totalEvents, pendingEvents, completedBookings, recentEvents] = await Promise.all([
        User.countDocuments({ role: 'user' }),
        User.countDocuments({ role: 'organizer' }),
        Event.countDocuments(),
        Event.countDocuments({ status: 'pending' }),
        Booking.find({ paymentStatus: 'completed' }),
        Event.find()
            .sort({ createdAt: -1 })
            .limit(5)
            .populate('organizer', 'fullName organizationName')
            .populate('category', 'name')
    ]);

    const totalRevenue = completedBookings.reduce((sum, b) => sum + b.totalAmount, 0);
    const totalBookings = completedBookings.length;

    return { totalUsers, totalOrganizers, totalEvents, pendingEvents, totalRevenue, totalBookings, recentEvents };
};


// ─── Update Organizer Status & Notify ────────────────────────────────────────
export const updateOrganizerStatus = async (orgId, status) => {
    const updatedOrg = await User.findByIdAndUpdate(orgId, { status }, { new: true });
    if (!updatedOrg) throw new AppError('Organizer not found', HTTP_STATUS.NOT_FOUND);

    const io = getIO();
    io.to(orgId.toString()).emit('statusUpdate', {
        status: updatedOrg.status,
        message: `Your organizer account application has been ${updatedOrg.status}!`,
    });

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
