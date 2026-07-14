import Event from '../../models/events/event.js';
import Notification from '../../models/notifications/notification.js';
import Booking from '../../models/payments/booking.js';
import Payout from '../../models/payments/payout.js';
import User from '../../models/users/user.js';
import Coupon from '../../models/payments/coupon.js';
import AppError from '../../utils/AppError.js';
import HTTP_STATUS from '../../constant/statusCode.js';
import Platform from '../../models/admin/platform.js';
import * as socketUtil from '../../utils/socket.js';
import { sendNotification, notifyAllAdmins } from '../../utils/notify.js';
import { PAYMENT_STATUS } from '../../constant/paymentConstants.js';

// ─── Helper: Calculate Strict Refund with Coupons ─────────────────────────────
const calculatePartialRefund = async (booking, cancelledTicketsConfig) => {
    // cancelledTicketsConfig: Array of { ticketId, quantity }
    
    // 1. Calculate the base value of all ACTIVE tickets BEFORE this cancellation
    const originalBaseTotal = booking.tickets
        .filter(t => t.status === 'active')
        .reduce((sum, t) => sum + (t.ticketPrice * t.quantity), 0);

    // 2. Calculate the base value of the tickets being kept
    let newBaseTotal = originalBaseTotal;
    for (const cancel of cancelledTicketsConfig) {
        const ticketItem = booking.tickets.id(cancel.ticketId) || booking.tickets.find(t => t.ticket.toString() === cancel.ticketId.toString());
        if (ticketItem) {
            newBaseTotal -= (ticketItem.ticketPrice * cancel.quantity);
        }
    }
    newBaseTotal = Math.max(0, newBaseTotal);

    let newDiscount = 0;
    
    // 3. Re-evaluate Coupon
    if (booking.coupon) {
        const coupon = await Coupon.findById(booking.coupon);
        if (coupon && newBaseTotal >= coupon.minPurchase) {
            if (coupon.discountType === 'percentage') {
                newDiscount = (newBaseTotal * coupon.discountValue) / 100;
            } else {
                newDiscount = coupon.discountValue;
            }
            if (coupon.maxDiscount > 0 && newDiscount > coupon.maxDiscount) {
                newDiscount = coupon.maxDiscount;
            }
        }
    }

    const newCartTotal = Math.max(0, newBaseTotal - newDiscount);
    
    // 4. Refund is whatever was paid minus the new required total
    let refundAmount = booking.totalAmount - newCartTotal;
    
    // If the new cart total is somehow larger than what they originally paid (e.g. lost a massive flat discount)
    if (refundAmount < 0) refundAmount = 0;
    
    return {
        refundAmount: Math.round(refundAmount * 100) / 100,
        newCartTotal: Math.round(newCartTotal * 100) / 100
    };
};

export const getEventBookings = async (eventId, organizerId, { search = '', sort = 'newest', status = 'all', page = 1, limit = 10 }) => {
    const skip = (parseInt(page) - 1) * limit;

    const event = await Event.findOne({ _id: eventId, organizer: organizerId });
    if (!event) throw new AppError('Event not found', HTTP_STATUS.NOT_FOUND);

    const revenueData = await Booking.aggregate([
        { $match: { event: event._id, paymentStatus: PAYMENT_STATUS.COMPLETED } },
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

    // Count pending cancellation requests for this event
    const pendingCancelCount = await Booking.countDocuments({
        event: event._id,
        'cancellationRequest.status': 'pending'
    });

    return { event, bookings: bookings[0].data, totalRevenue, payout, total, totalPages, counts, pendingCancelCount };
};

export const getEventCancellations = async (eventId, organizerId, { search = '', sort = 'newest', status = 'all', page = 1, limit = 10 }) => {
    const skip = (parseInt(page) - 1) * limit;

    const event = await Event.findOne({ _id: eventId, organizer: organizerId });
    if (!event) throw new AppError('Event not found', HTTP_STATUS.NOT_FOUND);

    // Initial match: must belong to event and have some form of cancellation
    const matchStage = {
        event: event._id,
        $or: [
            { status: 'cancelled' },
            { 'cancellationRequest.status': { $ne: 'none' } },
            { 'tickets.status': 'cancelled' }
        ]
    };

    if (status !== 'all') {
        if (status === 'direct') {
            matchStage.status = 'cancelled';
            matchStage['cancellationRequest.status'] = 'none';
        } else {
            matchStage['cancellationRequest.status'] = status;
        }
    }

    const sortStage = {};
    if (sort === 'oldest') sortStage['cancellationRequest.requestedAt'] = 1;
    else sortStage['cancellationRequest.requestedAt'] = -1; // newest first by default

    const bookings = await Booking.aggregate([
        { $match: matchStage },
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
                    { "tickets.ticketName": { $regex: search, $options: 'i' } }
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
    
    // Status counts
    const statusCounts = await Booking.aggregate([
        { 
            $match: {
                event: event._id,
                $or: [
                    { status: 'cancelled' },
                    { 'cancellationRequest.status': { $ne: 'none' } },
                    { 'tickets.status': 'cancelled' }
                ]
            } 
        },
        { 
            $group: { 
                _id: {
                    $cond: [
                        { $eq: ["$cancellationRequest.status", "none"] },
                        "direct",
                        "$cancellationRequest.status"
                    ]
                }, 
                count: { $sum: 1 } 
            } 
        }
    ]);

    const counts = { all: 0, pending: 0, approved: 0, rejected: 0, direct: 0 };
    statusCounts.forEach(item => {
        if (item._id) counts[item._id] = item.count;
        counts.all += item.count;
    });

    return {
        event,
        cancellations: bookings[0].data,
        total,
        totalPages: Math.ceil(total / limit) || 1,
        currentPage: parseInt(page),
        counts
    };
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
    if (booking.status === 'on_hold') throw new AppError('Booking is on hold and cannot be cancelled.', HTTP_STATUS.BAD_REQUEST);

    booking.status      = 'cancelled';
    booking.cancelledAt = new Date();
    // Wallet refunds are instant; Razorpay needs manual processing
    booking.paymentStatus = booking.paymentMethod === 'wallet' ? PAYMENT_STATUS.REFUNDED : PAYMENT_STATUS.PENDING_REFUND;
    await booking.save();

    // <--- Release seats properly for Shopping Cart Array --->
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

    const userId = String(booking.user).trim();
    const description = `Organizer refund (100%): ${booking.event?.title || 'Event'}`;
    
    const updatedUser = await User.findByIdAndUpdate(userId, {
        $inc: { 'wallet.balance': booking.totalAmount },
        $push: {
            'wallet.transactions': {
                type: 'credit',
                amount: booking.totalAmount,
                description
            }
        }
    }, { new: true });

    if (updatedUser) {
        try {
            const io = socketUtil.getIO();
            io.to(userId).emit('walletUpdate', {
                newBalance: updatedUser.wallet.balance,
                transaction: {
                    type: 'credit',
                    amount: booking.totalAmount,
                    description
                }
            });
        } catch (err) {
            console.error('Socket emit error:', err);
        }
    }

    await sendNotification(
        userId,
        `Your ${booking.event?.title || 'Event'} booking has been cancelled by the organizer. ₹${booking.totalAmount.toLocaleString('en-IN')} (100% refund) credited to your wallet.`,
        'info'
    );

    return { message: `Booking cancelled. ₹${booking.totalAmount.toLocaleString('en-IN')} (100% refund) credited to user's wallet.` };
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
    console.log("🚀 Backend emitting notification to Room ID:", `[${userId}]`);

    await sendNotification(userId, notifMessage, 'success');

    return { message: 'Booking resumed successfully.' };
};


export const requestPayout = async (eventId, organizerId) => {
    const event = await Event.findOne({ _id: eventId, organizer: organizerId });
    if (!event) throw new AppError('Event not found', HTTP_STATUS.NOT_FOUND);

    const now = new Date();
    const eventEnd = new Date(event.endDate || event.startDate);
    
    // We check if the current date is past the event end date
    // We add 1 day (24 hours) to the end date to ensure the full day has passed, or just check the dates.
    // If we want exact time, we'd parse event.endTime. For now, simple date comparison is robust.
    // Actually, setting eventEnd to end of day is safer:
    eventEnd.setHours(23, 59, 59, 999);
    
    if (now < eventEnd) {
        throw new AppError('Payouts can only be requested after the event has completely finished.', HTTP_STATUS.BAD_REQUEST);
    }

    const existing = await Payout.findOne({ event: eventId });
    if (existing) throw new AppError('Payout already requested', HTTP_STATUS.BAD_REQUEST);

    const bookings = await Booking.find({ event: eventId, paymentStatus: PAYMENT_STATUS.COMPLETED });
    const totalRevenue = bookings.reduce((sum, b) => sum + b.totalAmount, 0);

    if (totalRevenue === 0) throw new AppError('No revenue to payout', HTTP_STATUS.BAD_REQUEST);

    let platformFeePercentage = 5;
    const platform = await Platform.findOne();
    if (platform && platform.platformFeePercentage !== undefined) {
        platformFeePercentage = platform.platformFeePercentage;
    }

    const platformFee  = totalRevenue * (platformFeePercentage / 100);
    const payoutAmount = totalRevenue - platformFee;

    const newPayout = new Payout({ organizer: organizerId, event: eventId, totalRevenue, platformFee, payoutAmount, status: 'pending' });
    await newPayout.save();

    // Notify all admins about the new payout request
    const net = payoutAmount.toLocaleString('en-IN', { minimumFractionDigits: 2 });
    await notifyAllAdmins(
        `💰 Payout Request: Organizer for "${event.title}" has requested a payout of ₹${net}. Please review it.`,
        'info'
    );

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
    if (booking.status === 'on_hold') throw new AppError('Booking is on hold and tickets cannot be cancelled.', HTTP_STATUS.BAD_REQUEST);

    cancelQty = parseInt(cancelQty, 10);
    if (isNaN(cancelQty) || cancelQty <= 0 || cancelQty > ticketItem.quantity) {
        throw new AppError('Invalid cancellation quantity', HTTP_STATUS.BAD_REQUEST);
    }

    // 1. Calculate strict refund
    const refundData = await calculatePartialRefund(booking, [{ ticketId: ticketItem._id, quantity: cancelQty }]);
    const refundAmount = refundData.refundAmount;
    booking.totalAmount = refundData.newCartTotal;

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
        booking.paymentStatus = PAYMENT_STATUS.REFUNDED;
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

    // 5. Process 100% Wallet Refund unconditionally
    const userId = String(booking.user._id || booking.user).trim();
    const description = `Partial Refund (100%): ${cancelQty}x ${ticketItem.ticketName} cancelled for ${booking.event.title}`;
    const updatedUser = await User.findByIdAndUpdate(userId, {
        $inc: { 'wallet.balance': refundAmount },
        $push: {
            'wallet.transactions': {
                type: 'credit',
                amount: refundAmount,
                description
            }
        }
    }, { new: true });

    if (updatedUser) {
        try {
            const io = socketUtil.getIO();
            io.to(userId).emit('walletUpdate', {
                newBalance: updatedUser.wallet.balance,
                transaction: {
                    type: 'credit',
                    amount: refundAmount,
                    description
                }
            });
        } catch (err) {
            console.error('Socket emit error:', err);
        }
    }

    // 6. Notify the User
    const notifMessage = `Organizer has cancelled ${cancelQty}x "${ticketItem.ticketName}" tickets for ${booking.event.title}. ₹${refundAmount.toLocaleString('en-IN')} (100% refund) credited to your wallet.`;
    await sendNotification(userId, notifMessage, 'danger');

    return { message: `Successfully cancelled ${cancelQty}x ${ticketItem.ticketName} and credited ₹${refundAmount.toLocaleString('en-IN')} (100% refund) to wallet.` };
};

export const verifyTicketScan = async (bookingId, organizerId) => {
    const booking = await Booking.findById(bookingId).populate('user', 'fullName email phone').populate('event', 'title organizer');
    if (!booking) throw new AppError('Invalid QR Code. Booking not found.', HTTP_STATUS.NOT_FOUND);

    if (booking.event.organizer.toString() !== organizerId.toString()) {
        throw new AppError('This ticket belongs to another event/organizer.', HTTP_STATUS.FORBIDDEN);
    }

    if (booking.status === 'cancelled') {
        throw new AppError('This ticket has been cancelled and is invalid.', HTTP_STATUS.BAD_REQUEST);
    }
    
    if (booking.status === 'on_hold') {
        throw new AppError('This ticket is currently on hold.', HTTP_STATUS.BAD_REQUEST);
    }

    // Single-use QR check-in enforcement
    if (booking.isCheckedIn) {
        const timeStr = booking.checkedInAt 
            ? new Date(booking.checkedInAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
            : 'an earlier time';
        throw new AppError(`Ticket already used at ${timeStr}. Single-use entry has already been claimed.`, HTTP_STATUS.BAD_REQUEST);
    }

    booking.isCheckedIn = true;
    booking.checkedInAt = new Date();
    await booking.save();

    return booking;
};


// ─── Get All Pending Cancellation Requests (Across Organizer's Events) ────────
export const getPendingCancellationRequests = async (organizerId, { page = 1, limit = 15, status = 'pending' } = {}) => {
    const skip = (parseInt(page) - 1) * limit;

    // 1. Find all events owned by this organizer
    const organizerEvents = await Event.find({ organizer: organizerId }).select('_id title');
    const eventIds        = organizerEvents.map(e => e._id);

    if (!eventIds.length) return { requests: [], total: 0, totalPages: 1, counts: { pending: 0, approved: 0, rejected: 0, all: 0 } };

    // 2. Build match query based on requested status
    const query = { event: { $in: eventIds } };
    if (status === 'all') {
        query.$or = [
            { 'cancellationRequest.status': { $in: ['pending', 'approved', 'rejected'] } },
            { status: 'cancelled' },
            { 'tickets.status': 'cancelled' }
        ];
    } else if (status === 'pending') {
        query['cancellationRequest.status'] = 'pending';
    } else if (status === 'approved') {
        query.$or = [
            { 'cancellationRequest.status': 'approved' },
            { status: 'cancelled' },
            { 'tickets.status': 'cancelled' }
        ];
    } else if (status === 'rejected') {
        query['cancellationRequest.status'] = 'rejected';
    } else {
        query['cancellationRequest.status'] = status;
    }

    // 3. Status counts aggregation across all events
    const statusCountsAgg = await Booking.aggregate([
        {
            $match: {
                event: { $in: eventIds },
                $or: [
                    { 'cancellationRequest.status': { $in: ['pending', 'approved', 'rejected'] } },
                    { status: 'cancelled' },
                    { 'tickets.status': 'cancelled' }
                ]
            }
        },
        {
            $group: {
                _id: {
                    $cond: [
                        { $eq: ["$cancellationRequest.status", "pending"] },
                        "pending",
                        {
                            $cond: [
                                { $eq: ["$cancellationRequest.status", "rejected"] },
                                "rejected",
                                "approved"
                            ]
                        }
                    ]
                },
                count: { $sum: 1 }
            }
        }
    ]);

    const counts = { pending: 0, approved: 0, rejected: 0, all: 0 };
    statusCountsAgg.forEach(item => {
        if (item._id === 'pending') counts.pending = item.count;
        else if (item._id === 'approved') counts.approved += item.count;
        else if (item._id === 'rejected') counts.rejected = item.count;
    });
    counts.all = counts.pending + counts.approved + counts.rejected;

    const [requests, total] = await Promise.all([
        Booking.find(query)
            .populate('user',  'fullName email phone profilePic')
            .populate('event', 'title startDate banners')
            .sort({ 'cancellationRequest.requestedAt': -1, updatedAt: -1 })
            .skip(skip)
            .limit(limit),
        Booking.countDocuments(query)
    ]);

    return {
        requests,
        total,
        totalPages: Math.ceil(total / limit) || 1,
        currentPage: parseInt(page),
        counts,
        currentStatus: status
    };
};


// ─── Approve Cancellation Request ─────────────────────────────────────────────
export const approveCancellationRequest = async (bookingId, organizerId) => {
    const booking = await Booking.findById(bookingId)
        .populate('event', 'title organizer');

    if (!booking) throw new AppError('Booking not found', HTTP_STATUS.NOT_FOUND);
    if (booking.event?.organizer?.toString() !== organizerId.toString())
        throw new AppError('Unauthorized', HTTP_STATUS.FORBIDDEN);

    if (booking.cancellationRequest?.status !== 'pending')
        throw new AppError('No pending cancellation request for this booking.', HTTP_STATUS.BAD_REQUEST);

    if (booking.status === 'cancelled')
        throw new AppError('Booking is already cancelled.', HTTP_STATUS.BAD_REQUEST);

    if (booking.cancellationRequest.isPartial) {
        let ticketsCancelledMessage = [];
        
        // Filter valid cancellations first
        const validCancellations = booking.cancellationRequest.requestedTickets.filter(reqTicket => {
            const ticketItem = booking.tickets.id(reqTicket.ticketId);
            return ticketItem && ticketItem.status !== 'cancelled' && reqTicket.quantity <= ticketItem.quantity;
        });

        // Calculate strict refund using helper
        const refundData = await calculatePartialRefund(booking, validCancellations);
        const totalRefund = refundData.refundAmount;
        booking.totalAmount = refundData.newCartTotal;

        // Loop through each valid requested ticket cancellation to update array
        for (const reqTicket of validCancellations) {
            const ticketItem = booking.tickets.id(reqTicket.ticketId);
            const cancelQty = reqTicket.quantity;

            // Split ticket if partial, else mark full
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

            ticketsCancelledMessage.push(`${cancelQty}x ${ticketItem.ticketName}`);

            // Release inventory seats
            await Event.findOneAndUpdate(
                { _id: booking.event._id, 'tickets._id': ticketItem.ticket },
                { $inc: { 'tickets.$[elem].sold': -cancelQty } },
                { arrayFilters: [{ 'elem._id': ticketItem.ticket }], runValidators: false }
            );
        }

        // Check if ALL tickets inside the booking are now cancelled
        const allCancelled = booking.tickets.every(t => t.status === 'cancelled');
        if (allCancelled) {
            booking.status      = 'cancelled';
            booking.cancelledAt = new Date();
            booking.paymentStatus = PAYMENT_STATUS.REFUNDED;
        }

        // Mark the request as approved
        booking.cancellationRequest.status     = 'approved';
        booking.cancellationRequest.resolvedAt = new Date();
        booking.markModified('cancellationRequest');
        await booking.save();

        // Emit live socket stock update
        const io = socketUtil.getIO();
        io.to(booking.event._id.toString()).emit('ticketStockUpdate', {});

        // Wallet refund
        const userId = String(booking.user._id || booking.user).trim();
        const description = `Refund: Partial cancellation approved (${ticketsCancelledMessage.join(', ')}) for "${booking.event.title}"`;
        
        if (totalRefund > 0) {
            const updatedUser = await User.findByIdAndUpdate(
                userId,
                {
                    $inc: { 'wallet.balance': totalRefund },
                    $push: { 'wallet.transactions': { type: 'credit', amount: totalRefund, description } }
                },
                { new: true }
            );

            if (updatedUser) {
                io.to(userId).emit('walletUpdate', {
                    newBalance: updatedUser.wallet.balance,
                    transaction: { type: 'credit', amount: totalRefund, description }
                });
            }
        }

        await sendNotification(
            userId,
            `✅ Your partial cancellation request for "${booking.event.title}" has been approved. ₹${totalRefund.toLocaleString('en-IN')} has been refunded to your wallet.`,
            'success'
        );

        // Direct socket emit so the user's ticket page reloads live
        try {
            io.to(userId).emit('cancellationResolved', {
                bookingId: booking._id,
                action: 'approved',
                isPartial: true,
                refund: totalRefund
            });
        } catch (_) {}

        return { message: `Partial cancellation approved. ₹${totalRefund.toLocaleString('en-IN')} refunded to user's wallet.` };

    } else {
        // ── Perform full cancellation ──────────────────────────────────────────────
        booking.status      = 'cancelled';
        booking.cancelledAt = new Date();
        booking.paymentStatus = PAYMENT_STATUS.REFUNDED;

        // Mark the request as approved
        booking.cancellationRequest.status     = 'approved';
        booking.cancellationRequest.resolvedAt = new Date();
        booking.markModified('cancellationRequest');
        await booking.save();

        // Release inventory seats
        for (const t of booking.tickets) {
            if (t.status === 'cancelled') continue;
            t.status = 'cancelled';
            await Event.findOneAndUpdate(
                { _id: booking.event._id, 'tickets._id': t.ticket },
                { $inc: { 'tickets.$[elem].sold': -t.quantity } },
                { arrayFilters: [{ 'elem._id': t.ticket }], runValidators: false }
            );
        }
        await booking.save();

        // Emit live socket stock update
        const io = socketUtil.getIO();
        io.to(booking.event._id.toString()).emit('ticketStockUpdate', {});

        // ── Wallet refund unconditionally ────────────────────────────────────────────
        const userId = String(booking.user._id || booking.user).trim();
        const description = `Refund: Cancellation approved for "${booking.event.title}"`;
        
        const updatedUser = await User.findByIdAndUpdate(
            userId,
            {
                $inc: { 'wallet.balance': booking.totalAmount },
                $push: { 'wallet.transactions': { type: 'credit', amount: booking.totalAmount, description } }
            },
            { new: true } // Return updated document to broadcast the new balance
        );

        if (updatedUser) {
            io.to(userId).emit('walletUpdate', {
                newBalance: updatedUser.wallet.balance,
                transaction: { type: 'credit', amount: booking.totalAmount, description }
            });
        }

        await sendNotification(
            userId,
            `✅ Your cancellation request for "${booking.event.title}" has been approved. ₹${booking.totalAmount.toLocaleString('en-IN')} has been refunded to your wallet.`,
            'success'
        );

        // Direct socket emit so the user's ticket page reloads live
        try {
            io.to(userId).emit('cancellationResolved', {
                bookingId: booking._id,
                action: 'approved',
                isPartial: false,
                refund: booking.totalAmount
            });
        } catch (_) {}

        return { message: `Cancellation approved. ₹${booking.totalAmount.toLocaleString('en-IN')} refunded to user's wallet.` };
    }
};


// ─── Reject Cancellation Request ──────────────────────────────────────────────
export const rejectCancellationRequest = async (bookingId, organizerId, rejectionNote) => {
    const booking = await Booking.findById(bookingId)
        .populate('event', 'title organizer');

    if (!booking) throw new AppError('Booking not found', HTTP_STATUS.NOT_FOUND);
    if (booking.event?.organizer?.toString() !== organizerId.toString())
        throw new AppError('Unauthorized', HTTP_STATUS.FORBIDDEN);

    if (booking.cancellationRequest?.status !== 'pending')
        throw new AppError('No pending cancellation request for this booking.', HTTP_STATUS.BAD_REQUEST);

    // Mark the request as rejected
    booking.cancellationRequest.status        = 'rejected';
    booking.cancellationRequest.resolvedAt    = new Date();
    booking.cancellationRequest.rejectionNote = (rejectionNote || 'Request denied by organizer.').trim();
    booking.markModified('cancellationRequest');
    await booking.save();

    const userId = String(booking.user._id || booking.user).trim();
    await sendNotification(
        userId,
        `❌ Your cancellation request for "${booking.event.title}" was rejected. ${booking.cancellationRequest.rejectionNote}`,
        'danger'
    );

    // Direct socket emit so the user's ticket page updates live
    try {
        const io = socketUtil.getIO();
        io.to(userId).emit('cancellationResolved', {
            bookingId: booking._id,
            action: 'rejected',
            note: booking.cancellationRequest.rejectionNote
        });
    } catch (_) {}

    return { message: 'Cancellation request rejected and user has been notified.' };
};