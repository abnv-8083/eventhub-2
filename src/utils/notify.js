// src/utils/notify.js
import Notification from '../models/notifications/notification.model.js';
import * as socketUtil from './socket.js';
import User from '../models/users/user.model.js'; // ✨ Imported the User model

export const sendNotification = async (userId, message, status = 'info') => {
    try {
        const cleanUserId = String(userId).trim();
        const newNotif = await Notification.create({ recipient: cleanUserId, message, status });

        const io = socketUtil.getIO();
        io.to(cleanUserId).emit('bookingStatusUpdate', {
            id: newNotif._id, message, status, date: newNotif.createdAt
        });
        return true;
    } catch (error) {
        console.error("❌ Failed to send notification:", error.message);
        return false;
    }
};

// ✨ NEW HELPER: Automatically notifies every Admin in the system
export const notifyAllAdmins = async (message, status = 'info') => {
    try {
        const admins = await User.find({ role: 'admin' });
        for (const admin of admins) {
            await sendNotification(admin._id, message, status);
        }
        return true;
    } catch (error) {
        console.error("❌ Failed to notify admins:", error.message);
        return false;
    }
};