// src/utils/notify.js
import Notification from '../models/notifications/notification.js';
import * as socketUtil from './socket.js';

/**
 * Send a real-time notification to a specific user
 * * @param {String|ObjectId} userId - The ID of the user receiving the notification
 * @param {String} message - The main notification text
 * @param {String} status - 'success', 'warning', 'danger', or 'info'
 */
export const sendNotification = async (userId, message, status = 'info') => {
    try {
        const cleanUserId = String(userId).trim();

        // 1. Save permanently to MongoDB
        const newNotif = await Notification.create({
            recipient: cleanUserId,
            message: message,
            status: status
        });

        // 2. Emit instantly to the frontend (using your existing listener)
        const io = socketUtil.getIO();
        io.to(cleanUserId).emit('bookingStatusUpdate', {
            id: newNotif._id,
            message: message,
            status: status,
            date: newNotif.createdAt
        });

        return true;
    } catch (error) {
        console.error("❌ Failed to send notification:", error.message);
        return false;
    }
};