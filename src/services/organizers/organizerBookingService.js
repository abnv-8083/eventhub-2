import Event from '../../models/events/event.js';
import Notification from '../../models/notifications/notification.js';
import Booking from '../../models/payments/booking.js';
import Payout from '../../models/payments/payout.js';
import User from '../../models/users/user.js';
import AppError from '../../utils/AppError.js';
import HTTP_STATUS from '../../constant/statusCode.js';
import * as socketUtil from '../../utils/socket.js';
import { sendNotification } from '../../utils/notify.js';

export const getEventBookings = async (eventId, organizerId, { search = '', sort = 'newest', status = 'all', page = 1, limit = 10 }) => {
    const skip = (parseInt(page) - 1) * limit;

    const event = await Event.findOne({ _id: eventId, organizer: organizerId });
    if (!event) throw new AppError('Event not found', HTTP_STATUS.NOT_FOUND);

    const revenueData = await Booking.aggregate([
        { $match: { event: event._id, paymentStatus: 'completed' } },
        { $group: { _id: null, total: { $sum: "$totalAmount" } } }
    ]);
    const totalRevenue = revenueData[0]?.total || 0;

    const matchStage = { event: event._id };
    if (status !== 'all') matchStage.status = status;

    const sortStage = {};
    if (sort === 'amount-high') sortStage.totalAmount = -1;
    else if (sort === 'amount-low') sortStage.totalAmount = 1;
    else if (sort === 'oldest') sortStage.createdAt = 1;
    else sortStage.createdAt = -1;

    const bookings = await Booking.aggregate([
        { $match: matchStage },
        {
            $group: {
                _id: "$_id",
                user: { $first: "$user" },
                tickets: { $first: "$tickets" },       // <--- NEW: Grab tickets array
                ticketName: { $first: "$ticketName" }, // Legacy fallback
                quantity: { $first: "$quantity" },     // Legacy fallback
                bookingDate: { $first: "$bookingDate" },
                totalAmount: { $first: "$totalAmount" },
                status: { $first: "$status" },
                createdAt: { $first: "$createdAt" },
                payments: { $push: { id: "$paymentId", status: "$paymentStatus" } }
            }
        },
        {
            $lookup: {
                from: 'users',
                localField: 'user',
                foreignField: '_id',
                as: 'user'
            }
        },
        { $unwind: { path: "$user", preserveNullAndEmptyArrays: true } },
        {
            $match: search ? {
                $or: [
                    { "user.fullName": { $regex: search, $options: 'i' } },
                    { "user.email": { $regex: search, $options: 'i' } },
                    { "tickets.ticketName": { $regex: search, $options: 'i' } }, // <--- NEW search mapping
                    { ticketName: { $regex: search, $options: 'i' } }
                ]
            } : {}
        },
        { $sort: sortStage },
        {
            $facet: {
                metadata: [{ $count: "total" }],
                data: [{ $skip: skip }, { $limit: limit }]
            }
        }
    ]);

    const total = bookings[0].metadata[0]?.total || 0;
    const totalPages = Math.ceil(total / limit) || 1;
    const payout = await Payout.findOne({ event: eventId });

    const statusCounts = await Booking.aggregate([
        { $match: { event: event._id } },
        { $group: { _id: "$status", count: { $sum: 1 } } }
    ]);

    const counts = { all: 0, active: 0, on_hold: 0, cancelled: 0 };
    statusCounts.forEach(item => {
        if (item._id) counts[item._id] = item.count;
        counts.all += item.count;
    });

    return { event, bookings: bookings[0].data, totalRevenue, payout, total, totalPages, counts };
};


export const getBookingDetail = async (bookingId, organizerId) => {
    const booking = await Booking.findById(bookingId)
        .populate('user', 'fullName email profilePic phone')
        .populate('event', 'title organizer');

    if (!booking) throw new AppError('Booking not found', HTTP_STATUS.NOT_FOUND);

    if (booking.event?.organizer?.toString() !== organizerId.toString())
        throw new AppError('Unauthorized', HTTP_STATUS.FORBIDDEN);

    return booking;
};


export const cancelBookingByOrganizer = async (bookingId, organizerId) => {
    const booking = await Booking.findById(bookingId).populate('event', 'title organizer startDate');

    if (!booking) throw new AppError('Booking not found', HTTP_STATUS.NOT_FOUND);
    if (booking.event?.organizer?.toString() !== organizerId.toString()) throw new AppError('Unauthorized', HTTP_STATUS.FORBIDDEN);
    if (booking.status === 'cancelled') throw new AppError('Booking is already cancelled', HTTP_STATUS.BAD_REQUEST);

    booking.status        = 'cancelled';
    booking.cancelledAt   = new Date();
    booking.paymentStatus = 'refunded';
    await booking.save();

    // <--- NEW: Release seats properly for Shopping Cart Array --->
    if (booking.tickets && booking.tickets.length > 0) {
        for (const t of booking.tickets) {
            await Event.findOneAndUpdate(
                { _id: booking.event._id, 'tickets._id': t.ticket },
                { $inc: { 'tickets.$[elem].sold': -t.quantity } },
                { arrayFilters: [{ 'elem._id': t.ticket }], runValidators: false }
            );
        }
    } else if (booking.ticket) {
        // Legacy fallback
        await Event.findOneAndUpdate(
            { _id: booking.event._id, 'tickets._id': booking.ticket },
            { $inc: { 'tickets.$[t].sold': -booking.quantity } },
            { arrayFilters: [{ 't._id': booking.ticket }], runValidators: false }
        );
    }

    if (booking.paymentMethod === 'wallet') {
        const user = await User.findById(booking.user);
        if (user) {
            user.wallet.balance += booking.totalAmount;
            user.wallet.transactions.push({
                type: 'credit',
                amount: booking.totalAmount,
                description: `Organizer refund: ${booking.event?.title || 'Event'}`
            });
            await user.save();
        }

        const userId = String(user._id).trim()

        await sendNotification(
            userId,
            `Your ${booking.event?.title || 'Event'} Total ${booking.totalAmount} is successfully Refunded to Your Wallet`        )

        return { message: `Booking cancelled. ₹${booking.totalAmount.toLocaleString('en-IN')} refunded to user's wallet.` };
    }

    const organizer = await User.findById(organizerId)

    const userId = String(booking.user).trim()
    await sendNotification(
        userId,
        `Your ${booking.event?.title || 'Event'} has Cancelled By ${organizer.organizationName}`
    )

    return { message: 'Booking cancelled. Wallet refund will be processed within 5-7 business days.' };
};


export const holdBookingByOrganizer = async (bookingId, organizerId, reason) => {
    const booking = await Booking.findById(bookingId).populate('event', 'organizer title');

    if (!booking) throw new AppError('Booking not found', HTTP_STATUS.NOT_FOUND);
    if (booking.event?.organizer?.toString() !== organizerId.toString()) throw new AppError('Unauthorized', HTTP_STATUS.FORBIDDEN);
    
    booking.status = 'on_hold';
    booking.heldAt = new Date();
    booking.holdReason = reason || 'No reason provided';
    await booking.save();

    
    const userId = String(booking.user._id || booking.user).trim();
    const eventTitle = booking.event ? booking.event.title : 'an event';
    const notifMessage = `Your booking for "${eventTitle}" has been put on hold. Reason: ${reason || 'No reason provided'}`;

    await sendNotification(userId, notifMessage)

    return { message: 'Booking placed on hold.' };
};

export const unholdBookingByOrganizer = async (bookingId, organizerId) => {
    const booking = await Booking.findById(bookingId).populate('event', 'organizer title');

    if (!booking) throw new AppError('Booking not found', HTTP_STATUS.NOT_FOUND);
    if (booking.event?.organizer?.toString() !== organizerId.toString()) throw new AppError('Unauthorized', HTTP_STATUS.FORBIDDEN);
    if (booking.status !== 'on_hold') throw new AppError('Booking is not on hold.', HTTP_STATUS.BAD_REQUEST);

    booking.status = 'active';
    booking.heldAt = undefined;
    await booking.save();

    // -- Emit Socket Notification for Unhold --
    const io = socketUtil.getIO();
    const userId = String(booking.user._id || booking.user).trim();
    const eventTitle = booking.event ? booking.event.title : 'an event';
    const notifMessage = `Good news! Your booking for "${eventTitle}" is now active again.`;

    // 1. Save to Database
    const newNotif = await Notification.create({
        recipient: userId,
        message: notifMessage,
        status: 'success' // Matches your schema enum
    });

    console.log("📢 Backend emitting notification to Room ID:", `[${userId}]`);

    // 2. Emit Real-Time Socket
    io.to(userId).emit('bookingStatusUpdate', {
        id: newNotif._id,
        title: 'Booking Resumed',
        message: notifMessage,
        status: 'success',
        date: newNotif.createdAt
    });

    return { message: 'Booking resumed successfully.' };
};


export const requestPayout = async (eventId, organizerId) => {
    const event = await Event.findOne({ _id: eventId, organizer: organizerId });
    if (!event) throw new AppError('Event not found', HTTP_STATUS.NOT_FOUND);

    const existing = await Payout.findOne({ event: eventId });
    if (existing) throw new AppError('Payout already requested', HTTP_STATUS.BAD_REQUEST);

    const bookings = await Booking.find({ event: eventId, paymentStatus: 'completed' });
    const totalRevenue = bookings.reduce((sum, b) => sum + b.totalAmount, 0);

    if (totalRevenue === 0) throw new AppError('No revenue to payout', HTTP_STATUS.BAD_REQUEST);

    const platformFee  = totalRevenue * 0.05;
    const payoutAmount = totalRevenue - platformFee;

    const newPayout = new Payout({ organizer: organizerId, event: eventId, totalRevenue, platformFee, payoutAmount, status: 'pending' });
    await newPayout.save();
    return newPayout;
};

// ─── Delete a Cancelled Booking ───────────────────────────────────────────────
export const deleteCancelledBooking = async (eventId, bookingId, organizerId) => {
    const booking = await Booking.findOne({ _id: bookingId, event: eventId });
    if (!booking) throw new AppError('Booking not found', HTTP_STATUS.NOT_FOUND);

    const event = await Event.findById(eventId);
    if (event.organizer.toString() !== organizerId.toString()) {
        throw new AppError('Unauthorized', HTTP_STATUS.FORBIDDEN);
    }

    if (booking.status !== 'cancelled') {
        throw new AppError('Only fully cancelled bookings can be deleted from records.', HTTP_STATUS.BAD_REQUEST);
    }

    await Booking.findByIdAndDelete(bookingId);
    return { message: 'Booking permanently removed from records.' };
};

// ─── Cancel an Individual Ticket (By Organizer) ──────────────────────────────
export const cancelSingleTicketByOrganizer = async (eventId, bookingId, ticketItemId, organizerId, cancelQty = 1) => {
    const booking = await Booking.findById(bookingId).populate('event', 'title organizer startDate');
    if (!booking) throw new AppError('Booking not found', HTTP_STATUS.NOT_FOUND);
    
    if (booking.event.organizer.toString() !== organizerId.toString()) {
        throw new AppError('Unauthorized', HTTP_STATUS.FORBIDDEN);
    }

    const ticketItem = booking.tickets.id(ticketItemId) || 
                       booking.tickets.find(t => t.ticket.toString() === ticketItemId.toString());
                       
    if (!ticketItem) throw new AppError('Ticket not found in this booking', HTTP_STATUS.NOT_FOUND);
    if (ticketItem.status === 'cancelled') throw new AppError('This ticket is already cancelled', HTTP_STATUS.BAD_REQUEST);

    cancelQty = parseInt(cancelQty, 10);
    if (isNaN(cancelQty) || cancelQty <= 0 || cancelQty > ticketItem.quantity) {
        throw new AppError('Invalid cancellation quantity', HTTP_STATUS.BAD_REQUEST);
    }

    // 1. Refund the correct quantity
    const refundAmount = ticketItem.ticketPrice * cancelQty;
    booking.totalAmount = Math.max(0, booking.totalAmount - refundAmount);

    // 2. Split the ticket or mark it fully cancelled
    if (ticketItem.quantity > cancelQty) {
        ticketItem.quantity -= cancelQty; 

        const existingCancelled = booking.tickets.find(t => 
            t.ticket.toString() === ticketItem.ticket.toString() && t.status === 'cancelled'
        );
        
        if (existingCancelled) {
            existingCancelled.quantity += cancelQty;
        } else {
            booking.tickets.push({
                ticket: ticketItem.ticket,
                ticketName: ticketItem.ticketName,
                ticketPrice: ticketItem.ticketPrice,
                quantity: cancelQty,
                status: 'cancelled'
            });
        }
    } else {
        ticketItem.status = 'cancelled';
    }

    // 3. Check if ALL tickets are now cancelled
    const allCancelled = booking.tickets.every(t => t.status === 'cancelled');
    if (allCancelled) {
        booking.status = 'cancelled';
        booking.cancelledAt = new Date();
        booking.paymentStatus = 'refunded';
    }

    await booking.save();

    // 4. Release inventory seats and trigger socket update
    const updatedEvent = await Event.findOneAndUpdate(
        { _id: booking.event._id, 'tickets._id': ticketItem.ticket },
        { $inc: { 'tickets.$[elem].sold': -cancelQty } },
        { 
            arrayFilters: [{ 'elem._id': ticketItem.ticket }], 
            runValidators: false,
            new: true 
        }
    );

    // Emit Socket Update for live stock changes
    if(updatedEvent) {
        const updatedT = updatedEvent.tickets.id(ticketItem.ticket);
        const io = socketUtil.getIO();
        io.to(booking.event._id.toString()).emit('ticketStockUpdate', {
            tickets: [{
                ticketId: updatedT._id.toString(),
                newCapacity: updatedT.capacity - updatedT.sold
            }]
        });
    }

    // 5. Process Wallet Refund (If applicable)
    if (booking.paymentMethod === 'wallet' || booking.paymentMethod === 'razorpay') {
        const user = await User.findById(booking.user);
        if (user) {
            user.wallet.balance += refundAmount;
            user.wallet.transactions.push({
                type: 'credit',
                amount: refundAmount,
                description: `Partial Refund: ${cancelQty}x ${ticketItem.ticketName} cancelled for ${booking.event.title}`
            });
            await user.save();
        }
    }

    // 6. Notify the User (Using your notify.js utility!)
    const userId = String(booking.user._id || booking.user).trim();
    const notifMessage = `organizer has cancelled ${cancelQty}x "${ticketItem.ticketName}" tickets for ${booking.event.title}. ₹${refundAmount.toLocaleString('en-IN')} will be refunded.`;
    await sendNotification(userId, notifMessage, 'danger');

    return { message: `Successfully cancelled ${cancelQty}x ${ticketItem.ticketName} and refunded ₹${refundAmount.toLocaleString('en-IN')}.` };
};