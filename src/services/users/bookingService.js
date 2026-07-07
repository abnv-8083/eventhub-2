import Razorpay from 'razorpay';
import crypto from 'crypto';
import mongoose from 'mongoose';
import Event from '../../models/events/event.js';
import Booking from '../../models/payments/booking.js';
import User from '../../models/users/user.js';
import AppError from '../../utils/AppError.js';
import HTTP_STATUS from '../../constant/statusCode.js';
import * as socketUtil from '../../utils/socket.js';
import { sendNotification } from '../../utils/notify.js';
import Coupon from '../../models/payments/coupon.js';
import { PAYMENT_STATUS } from '../../constant/paymentConstants.js';
import { grantReferralRewards } from './referralService.js';
import puppeteer from 'puppeteer';
import QRCodeLib from 'qrcode';

// Razorpay instance
const razorpay = new Razorpay({
    key_id:     process.env.RAZORPAY_KEY_ID,
    key_secret: process.env.RAZORPAY_KEY_SECRET
});


// ─── HELPER: Emit Live Booking to Organizer ─────────────────────────────────
async function emitNewBookingToOrganizer(bookingId) {
    try {
        const booking = await Booking.findById(bookingId)
            .populate('user', 'fullName email')
            .populate('event', 'organizer');
            
        if (booking && booking.status === 'active') {
            const socketUtil = await import('../../utils/socket.js');
            const io = socketUtil.getIO();
            
            const eventRoomId = String(booking.event._id).trim();
            const organizerId = String(booking.event.organizer).trim();
            
            console.log(`📢 LIVE BOOKING: Emitting to Event Room [${eventRoomId}] & Organizer [${organizerId}]`);
            
            // Emit to event-specific room
            io.to(eventRoomId).emit('newBooking', { booking });
            // Emit to organizer's personal room for dashboard updates
            io.to(organizerId).emit('dashboardUpdate', { booking });
        }
    } catch (err) {
        console.error('❌ Socket emit error for new booking:', err.message);
    }
}


// ─── Get Checkout Page Data ──────────────────────────────────────────────────
export const getCheckoutData = async (eventId, cart, userId) => {
    const { event, user, totalAmount, validatedItems } = await validateCartRequest(eventId, cart, userId);
    return {
        event,
        cartItems: validatedItems.map(i => ({
            ticket:   { _id: i.ticket._id, name: i.ticket.name, price: i.ticket.price },
            quantity: i.quantity
        })),
        totalAmount,
        walletBalance:  user.wallet?.balance || 0,
        userName:       user.fullName,
        userEmail:      user.email,
        razorpayKeyId:  process.env.RAZORPAY_KEY_ID
    };
};


// ─── Create Razorpay Order ───────────────────────────────────────────────────
export const createOrder = async (eventId, cart, userId, couponId, expectedTotal = null) => {
    const { totalAmount } = await validateCartRequest(eventId, cart, userId, couponId, expectedTotal); // Pass couponId

    const order = await razorpay.orders.create({
        amount:   totalAmount === 0 ? 100 : totalAmount * 100, // Razorpay fails on 0 amount
        currency: 'INR',
        receipt:  `cart_${Date.now()}`
    });

    return { order, amount: totalAmount };
};

// ─── Atomically Increment sold on an embedded ticket ────────────────────────
// Uses MongoDB's arrayFilters + $expr to ensure sold + quantity <= capacity.
const incrementTicketSold = async (eventId, ticketId, quantity) => {
    return await Event.findOneAndUpdate(
        {
            _id: eventId,
            'tickets._id': ticketId,
            $expr: {
                $let: {
                    vars: {
                        tObj: {
                            $first: {
                                $filter: {
                                    input: "$tickets",
                                    as: "t",
                                    cond: { $eq: ["$$t._id", new mongoose.Types.ObjectId(ticketId)] }
                                }
                            }
                        }
                    },
                    in: {
                        $gte: [
                            "$$tObj.capacity",
                            { $add: ["$$tObj.sold", quantity] }
                        ]
                    }
                }
            }
        },
        { $inc: { 'tickets.$[t].sold': quantity } },
        {
            arrayFilters: [{ 't._id': ticketId }],
            new: true,
            runValidators: false
        }
    );
};

// Helper: Increment stock for cart items or rollback if race condition exceeded capacity
const incrementTicketsOrRollback = async (eventId, validatedItems) => {
    let updatedTickets = [];
    let incrementedHistory = [];

    for (const item of validatedItems) {
        const updatedEvent = await incrementTicketSold(eventId, item.ticket._id, item.quantity);
        if (!updatedEvent) {
            // Rollback previously incremented stock in this loop
            for (const historyItem of incrementedHistory) {
                await Event.findOneAndUpdate(
                    { _id: eventId, 'tickets._id': historyItem.ticketId },
                    { $inc: { 'tickets.$[t].sold': -historyItem.quantity } },
                    { arrayFilters: [{ 't._id': historyItem.ticketId }] }
                );
            }
            const currentEvt = await Event.findById(eventId);
            const currentTicket = currentEvt?.tickets?.id(item.ticket._id);
            const remaining = currentTicket ? Math.max(0, currentTicket.capacity - currentTicket.sold) : 0;
            throw new AppError(
                remaining === 0
                    ? `Ticket tier "${item.ticket.name}" is completely Sold Out!`
                    : `Maximum capacity reached for "${item.ticket.name}". Only ${remaining} seat(s) left!`,
                HTTP_STATUS.BAD_REQUEST
            );
        }
        incrementedHistory.push({ ticketId: item.ticket._id, quantity: item.quantity });
        updatedTickets.push(updatedEvent.tickets.id(item.ticket._id));
    }
    return updatedTickets;
};


// ─── Verify Razorpay Payment & Create Bookings ───────────────────────────────
export const verifyAndBook = async (eventId, userId, { razorpay_order_id, razorpay_payment_id, razorpay_signature, cart, couponId, expectedTotal }) => {
    // 1. Verify Razorpay signature
    const expectedSignature = crypto
        .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET)
        .update(razorpay_order_id + '|' + razorpay_payment_id)
        .digest('hex');

    if (expectedSignature !== razorpay_signature) throw new AppError('Payment verification failed.', HTTP_STATUS.BAD_REQUEST);

    // 2. Re-validate cart and get applied coupon
    const { validatedItems, totalAmount, appliedCoupon, event } = await validateCartRequest(eventId, cart, userId, couponId, expectedTotal);

    // 3. Build the tickets array and atomically increment stock (with rollback on concurrent capacity overflow)
    const ticketsArray = validatedItems.map(item => ({
        ticket:      item.ticket._id,
        ticketName:  item.ticket.name,
        ticketPrice: item.ticket.price,
        quantity:    item.quantity
    }));
    const updatedTickets = await incrementTicketsOrRollback(eventId, validatedItems);

    // 4. Create Booking
    const newBooking = await Booking.create({
        event:         eventId,
        user:          userId,
        tickets:       ticketsArray,
        totalAmount:   totalAmount,
        paymentStatus: PAYMENT_STATUS.COMPLETED,
        paymentMethod: 'razorpay',
        paymentId:     razorpay_payment_id,
        coupon:        appliedCoupon ? appliedCoupon._id : undefined
    });

    // ✨ INCREMENT THE COUPON USAGE COUNT ✨
    if (appliedCoupon) {
        appliedCoupon.usedCount += 1;
        await appliedCoupon.save();
    }

    await emitNewBookingToOrganizer(newBooking._id);

    // Emit real-time stock update
    const io = socketUtil.getIO();
    io.to(eventId.toString()).emit('ticketStockUpdate', {
        tickets: updatedTickets.map(t => ({
            ticketId:    t._id.toString(),
            newCapacity: t.capacity - t.sold
        }))
    });

    await sendNotification(newBooking.user._id, `Your tickets for "${event.title}" are confirmed!`, 'success');
    await sendNotification(event.organizer, `New Sale! ${newBooking.user.fullName} just bought tickets for "${event.title}".`, 'success');

    // Grant referral rewards on first booking (non-blocking)
    grantReferralRewards(userId).catch(err => console.error('[Referral] Reward error:', err));

    return { bookingId: newBooking._id };
};


// ─── Process Wallet Booking ──────────────────────────────────────────────────
export const bookWithWallet = async (eventId, userId, cart, couponId, expectedTotal = null) => {
    // Re-validate and calculate final discount
    const { event, user, totalAmount, validatedItems, appliedCoupon } = await validateCartRequest(eventId, cart, userId, couponId, expectedTotal);

    const walletBalance = user.wallet?.balance || 0;
    if (walletBalance < totalAmount) {
        throw new AppError('Insufficient wallet balance.', HTTP_STATUS.BAD_REQUEST);
    }

    // 1. Allocate ticket inventory first (prevents overbooking & unnecessary wallet debit on race condition)
    const ticketsArray = validatedItems.map(item => ({
        ticket:      item.ticket._id,
        ticketName:  item.ticket.name,
        ticketPrice: item.ticket.price,
        quantity:    item.quantity
    }));
    const updatedTickets = await incrementTicketsOrRollback(eventId, validatedItems);

    // 2. Deduct from wallet balance atomically
    const updatedUser = await User.findOneAndUpdate(
        { _id: userId, 'wallet.balance': { $gte: totalAmount } },
        {
            $inc: { 'wallet.balance': -totalAmount },
            $push: {
                'wallet.transactions': {
                    type: 'debit',
                    amount: totalAmount,
                    description: `Cart Booking: ${event.title}`
                }
            }
        },
        { new: true }
    );

    if (!updatedUser) {
        // Rollback ticket stock allocation if wallet deduction fails due to concurrent race condition on balance
        for (const item of validatedItems) {
            await Event.findOneAndUpdate(
                { _id: eventId, 'tickets._id': item.ticket._id },
                { $inc: { 'tickets.$[t].sold': -item.quantity } },
                { arrayFilters: [{ 't._id': item.ticket._id }] }
            );
        }
        throw new AppError('Insufficient wallet balance to complete this transaction.', HTTP_STATUS.BAD_REQUEST);
    }

    const newBooking = await Booking.create({
        event:         eventId,
        user:          userId,
        tickets:       ticketsArray,
        totalAmount:   totalAmount,
        paymentStatus: PAYMENT_STATUS.COMPLETED,
        paymentMethod: 'wallet',
        paymentId:     `WALLET-${Date.now()}`,
        coupon:        appliedCoupon ? appliedCoupon._id : undefined
    });

    // ✨ INCREMENT THE COUPON USAGE COUNT ✨
    if (appliedCoupon) {
        appliedCoupon.usedCount += 1;
        await appliedCoupon.save();
    }

    await emitNewBookingToOrganizer(newBooking._id);

    const io = socketUtil.getIO();
    io.to(eventId.toString()).emit('ticketStockUpdate', {
        tickets: updatedTickets.map(t => ({
            ticketId:    t._id.toString(),
            newCapacity: t.capacity - t.sold
        }))
    });

    await sendNotification(newBooking.user._id, `Your tickets for "${event.title}" are confirmed!`, 'success');
    await sendNotification(event.organizer, `New Sale! ${newBooking.user.fullName} just bought tickets for "${event.title}".`, 'success');

    // Grant referral rewards on first booking (non-blocking)
    grantReferralRewards(userId).catch(err => console.error('[Referral] Reward error:', err));

    return { bookingId: newBooking._id };
};


// ─── Get Multiple Bookings for Success Page ───────────────────────────────────

export const getBookingsByIds = async (bookingIds, userId) => {
    const bookings = await Booking.find({ _id: { $in: bookingIds }, user: userId })
        .populate('event', 'title startDate startTime location banners')
        .sort({ createdAt: 1 });  // keep insertion order (VIP first, etc.)

    if (!bookings.length) throw new AppError('Booking not found.', HTTP_STATUS.NOT_FOUND);

    const totalAmount = bookings.reduce((sum, b) => sum + b.totalAmount, 0);
    const event       = bookings[0].event;  // same event for all items in a cart

    return { bookings, totalAmount, event };
};

// ─── Get Single Booking for Ticket Detail / Legacy ───────────────────────────
export const getBookingById = async (bookingId, userId) => {
    const booking = await Booking.findOne({ _id: bookingId, user: userId })
        .populate('event', 'title startDate startTime location banners');

    if (!booking) throw new AppError('Booking not found.', HTTP_STATUS.NOT_FOUND);

    return booking;
};


// ─── Get My Tickets (Filtered & Paginated) ───────────────────────────────────
export const getMyTickets = async (userId, filter = 'all', page = 1, limit = 10) => {
    const skip = (parseInt(page) - 1) * limit;

    let bookings = await Booking.find({ user: userId })
        .populate({ path: 'event', populate: { path: 'category', select: 'name' } })
        .sort({ createdAt: -1 });

    const now = new Date();

    if      (filter === 'upcoming')  bookings = bookings.filter(b => b.status === 'active'  && b.event && new Date(b.event.startDate) >= now);
    else if (filter === 'past')      bookings = bookings.filter(b => b.status === 'active'  && b.event && new Date(b.event.startDate) <  now);
    else if (filter === 'on_hold')   bookings = bookings.filter(b => b.status === 'on_hold');
    else if (filter === 'cancelled') bookings = bookings.filter(b => b.status === 'cancelled');
    else                             bookings = bookings.filter(b => b.paymentStatus === PAYMENT_STATUS.COMPLETED || b.status !== 'active');

    const total      = bookings.length;
    const totalPages = Math.ceil(total / limit);

    return { bookings: bookings.slice(skip, skip + limit), total, totalPages };
};


// ─── Get Booking Detail ───────────────────────────────────────────────────────
export const getTicketDetail = async (bookingId, userId) => {
    const booking = await Booking.findOne({ _id: bookingId, user: userId })
        .populate({ path: 'event', populate: [
            { path: 'category',  select: 'name' },
            { path: 'organizer', select: 'fullName organizationName' }
        ]});

    if (!booking) throw new AppError('Booking not found.', HTTP_STATUS.NOT_FOUND);

    return booking;
};


// ─── Cancel Booking (Full Booking) ───────────────────────────────────────────────
export const cancelBooking = async (bookingId, userId) => {
    const booking = await Booking.findOne({ _id: bookingId, user: userId })
        .populate('event', 'title startDate');

    if (!booking) throw new AppError('Booking not found.', HTTP_STATUS.NOT_FOUND);
    if (booking.status === 'cancelled') throw new AppError('This booking is already cancelled.', HTTP_STATUS.BAD_REQUEST);
    if (booking.status === 'on_hold') throw new AppError('Cannot cancel a booking that is currently on hold.', HTTP_STATUS.BAD_REQUEST);

    // Block cancellation if event has already started
    if (booking.event) {
        const eventDay = new Date(booking.event.startDate); 
        eventDay.setHours(0, 0, 0, 0);
        const today    = new Date(); 
        today.setHours(0, 0, 0, 0);
        if (eventDay < today) {
            throw new AppError('Cannot cancel a booking after the event has started.', HTTP_STATUS.BAD_REQUEST);
        }
    }

    // Mark cancelled — paymentStatus depends on payment method
    booking.status      = 'cancelled';
    booking.cancelledAt = new Date();
    // Wallet refunds are instant; Razorpay needs manual processing
    booking.paymentStatus = booking.paymentMethod === 'wallet' ? PAYMENT_STATUS.REFUNDED : PAYMENT_STATUS.PENDING_REFUND;
    await booking.save();

    // Decrement coupon usage count on full cancellation
    if (booking.coupon) {
        await Coupon.findByIdAndUpdate(booking.coupon, { $inc: { usedCount: -1 } });
    }

    // Release seats back to inventory for all active sub-tickets
    let updatedTicketsPayload = [];
    for (const tItem of booking.tickets) {
        if (tItem.status === 'cancelled') continue; // Already individually cancelled
        tItem.status = 'cancelled';

        const updatedEvent = await Event.findOneAndUpdate(
            { _id: booking.event._id, 'tickets._id': tItem.ticket },
            { $inc: { 'tickets.$[elem].sold': -tItem.quantity } },
            { arrayFilters: [{ 'elem._id': tItem.ticket }], runValidators: false, new: true }
        );
        if (updatedEvent) {
            const updatedT = updatedEvent.tickets.id(tItem.ticket);
            updatedTicketsPayload.push({ ticketId: updatedT._id.toString(), newCapacity: updatedT.capacity - updatedT.sold });
        }
    }
    await booking.save(); // Save sub-ticket statuses

    // Emit real-time stock update
    if (updatedTicketsPayload.length > 0) {
        const io = socketUtil.getIO();
        io.to(booking.event._id.toString()).emit('ticketStockUpdate', { tickets: updatedTicketsPayload });
    }

    // 100% Refund credited to wallet unconditionally
    const description = `Refund (100%): Cancelled booking for "${booking.event?.title || 'Event'}"`;
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
            io.to(String(userId).trim()).emit('walletUpdate', {
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

    return {
        message:  `Booking cancelled. \u20b9${booking.totalAmount.toLocaleString('en-IN')} (100% refund) credited to your wallet.`,
        refunded: true
    };
};


// ─── Hold Booking ────────────────────────────────────────────────────────
export const holdBooking = async (bookingId, userId) => {
    const booking = await Booking.findOne({ _id: bookingId, user: userId });

    if (!booking)                          throw new AppError('Booking not found.', HTTP_STATUS.NOT_FOUND);
    if (booking.status === 'cancelled')    throw new AppError('A cancelled booking cannot be put on hold.', HTTP_STATUS.BAD_REQUEST);
    if (booking.status === 'on_hold')      throw new AppError('This booking is already on hold.', HTTP_STATUS.BAD_REQUEST);

    booking.status   = 'on_hold';
    booking.heldAt   = new Date();
    await booking.save();

    return { message: 'Booking placed on hold successfully.' };
};


// ─── Resume (Unhold) Booking ───────────────────────────────────────────────
export const unholdBooking = async (bookingId, userId) => {
    const booking = await Booking.findOne({ _id: bookingId, user: userId });

    if (!booking)                        throw new AppError('Booking not found.', HTTP_STATUS.NOT_FOUND);
    if (booking.status !== 'on_hold')    throw new AppError('This booking is not on hold.', HTTP_STATUS.BAD_REQUEST);

    booking.status   = 'active';
    booking.heldAt   = undefined;
    await booking.save();

    return { message: 'Booking resumed successfully.' };
};


// ─── Cancel Individual Ticket by User ───────────────────────────────────────
export const cancelSingleTicketByUser = async (bookingId, ticketItemId, userId, cancelQty = 1, reason = "Partial Cancellation") => {
    const booking = await Booking.findById(bookingId).populate('event', 'title');
    if (!booking) throw new AppError('Booking not found', HTTP_STATUS.NOT_FOUND);
    if (booking.status === 'on_hold') throw new AppError('Cannot cancel tickets for a booking that is currently on hold.', HTTP_STATUS.BAD_REQUEST);
    
    if (booking.user.toString() !== userId.toString()) {
        throw new AppError('Unauthorized to modify this booking', HTTP_STATUS.FORBIDDEN);
    }

    const ticketItem = booking.tickets.id(ticketItemId);
    if (!ticketItem) throw new AppError('Ticket not found in this booking', HTTP_STATUS.NOT_FOUND);
    if (ticketItem.status === 'cancelled') throw new AppError('This ticket is already cancelled', HTTP_STATUS.BAD_REQUEST);

    // Validate the requested cancellation quantity
    cancelQty = parseInt(cancelQty, 10);
    if (isNaN(cancelQty) || cancelQty <= 0) {
        throw new AppError('Invalid cancellation quantity requested', HTTP_STATUS.BAD_REQUEST);
    }
    if (cancelQty > ticketItem.quantity) {
        throw new AppError(`Cannot cancel more than ${ticketItem.quantity} tickets`, HTTP_STATUS.BAD_REQUEST);
    }
    // Change to append a request
    if (!booking.cancellationRequest) {
        booking.cancellationRequest = { requestedTickets: [] };
    }

    if (booking.cancellationRequest.status === 'pending' && !booking.cancellationRequest.isPartial) {
        throw new AppError('A full booking cancellation request is already pending.', HTTP_STATUS.BAD_REQUEST);
    }

    // Initialize or reset if not pending
    if (booking.cancellationRequest.status !== 'pending') {
        booking.cancellationRequest.status = 'pending';
        booking.cancellationRequest.isPartial = true;
        booking.cancellationRequest.requestedAt = new Date();
        booking.cancellationRequest.resolvedAt = undefined;
        booking.cancellationRequest.reason = reason;
        booking.cancellationRequest.rejectionNote = '';
        booking.cancellationRequest.requestedTickets = [];
    }

    // Check if ticket is already in requestedTickets array
    const existingReq = booking.cancellationRequest.requestedTickets.find(rt => rt.ticketId.toString() === ticketItem._id.toString());
    if (existingReq) {
        if (existingReq.quantity + cancelQty > ticketItem.quantity) {
            throw new AppError(`Cannot request cancellation for more than ${ticketItem.quantity} tickets.`, HTTP_STATUS.BAD_REQUEST);
        }
        existingReq.quantity += cancelQty;
    } else {
        booking.cancellationRequest.requestedTickets.push({
            ticketId: ticketItem._id,
            quantity: cancelQty
        });
    }

    await booking.save();

    // Notify the event organizer
    const organizerId = booking.event?.organizer?._id || booking.event?.organizer;
    if (organizerId) {
        await sendNotification(
            String(organizerId).trim(),
            `⚠️ Partial Cancellation Request: A user has requested to cancel ${cancelQty}x "${ticketItem.ticketName}" for "${booking.event.title}". Please review it.`,
            'warning'
        );
    }

    return { message: `Cancellation request for ${cancelQty}x ${ticketItem.ticketName} submitted. The organizer will review it shortly.` };
};


// ─── Request Cancellation (User → Awaits Organizer Approval) ─────────────────
export const requestCancellation = async (bookingId, userId, reason) => {
    const booking = await Booking.findOne({ _id: bookingId, user: userId })
        .populate({ path: 'event', select: 'title organizer startDate', populate: { path: 'organizer', select: 'fullName organizationName' } });

    if (!booking) throw new AppError('Booking not found.', HTTP_STATUS.NOT_FOUND);
    if (booking.status === 'cancelled') throw new AppError('This booking is already cancelled.', HTTP_STATUS.BAD_REQUEST);
    if (booking.status === 'on_hold') throw new AppError('Cannot request cancellation for a booking that is currently on hold.', HTTP_STATUS.BAD_REQUEST);

    // Don't allow a new request if one is already pending
    if (booking.cancellationRequest?.status === 'pending') {
        throw new AppError('A cancellation request is already pending for this booking.', HTTP_STATUS.BAD_REQUEST);
    }

    if (!reason || reason.trim().length < 5) {
        throw new AppError('Please provide a valid reason (min 5 characters) for your cancellation request.', HTTP_STATUS.BAD_REQUEST);
    }

    // Update the cancellation request on the booking
    booking.cancellationRequest = {
        status:        'pending',
        reason:        reason.trim(),
        requestedAt:   new Date(),
        resolvedAt:    undefined,
        rejectionNote: '',
        isPartial:     false,
        requestedTickets: []
    };
    await booking.save();

    // Notify the event organizer
    const organizerId = booking.event?.organizer?._id || booking.event?.organizer;
    if (organizerId) {
        await sendNotification(
            String(organizerId).trim(),
            `\u26a0\ufe0f Cancellation Request: A user has requested cancellation for their booking at "${booking.event.title}". Reason: "${reason.trim()}". Please review and action it.`,
            'warning'
        );
    }

    return { message: 'Cancellation request submitted. The organizer will review it shortly.' };
};

// ─── Shared Multi-Cart Validation Helper ────────────────────────────────────
export const validateCartRequest = async (eventId, cart, userId, couponId = null, expectedTotal = null) => {
    const event = await Event.findOne({ _id: eventId, isBlocked: false });
    if (!event) throw new AppError('Event not found or not available', HTTP_STATUS.NOT_FOUND);
    if (event.status === 'cancelled') throw new AppError('This event has been cancelled by the organizer.', HTTP_STATUS.BAD_REQUEST);
    if (event.status !== 'approved' && event.status !== 'published') throw new AppError('Event not found or not available', HTTP_STATUS.NOT_FOUND);

    // ✨ Prevent booking if event is already finished
    const endDateObj = new Date(event.endDate);
    if (event.endTime) {
        const [hours, minutes] = event.endTime.split(':');
        endDateObj.setHours(parseInt(hours, 10), parseInt(minutes, 10), 0, 0);
    } else {
        endDateObj.setHours(23, 59, 59, 999);
    }
    
    if (new Date() > endDateObj) {
        throw new AppError('This event has already finished. Bookings are now closed.', HTTP_STATUS.BAD_REQUEST);
    }

    // Check registration time limit after event starts
    if (event.postStartRegistrationLimit !== null && event.postStartRegistrationLimit !== undefined) {
        const startDateObj = new Date(event.startDate);
        if (event.startTime) {
            const [startHours, startMinutes] = event.startTime.split(':');
            startDateObj.setHours(parseInt(startHours, 10), parseInt(startMinutes, 10), 0, 0);
        } else {
            startDateObj.setHours(0, 0, 0, 0);
        }
        const cutoff = new Date(startDateObj.getTime() + event.postStartRegistrationLimit * 60000);
        if (new Date() > cutoff) {
            if (event.postStartRegistrationLimit === 0) {
                throw new AppError('Registration closed once the event started.', HTTP_STATUS.BAD_REQUEST);
            } else {
                throw new AppError(`Registration closed ${event.postStartRegistrationLimit} minutes after the event started.`, HTTP_STATUS.BAD_REQUEST);
            }
        }
    }

    // Check bookingOpenTime and bookingCloseTime
    if (event.bookingOpenTime) {
        const startDateStr = new Date(event.startDate).toISOString().split('T')[0];
        const openDateObj = new Date(`${startDateStr}T${event.bookingOpenTime}:00+05:30`);
        if (new Date() < openDateObj) {
            throw new AppError(`Ticket sales for this event have not opened yet. Booking opens at ${event.bookingOpenTime}.`, HTTP_STATUS.BAD_REQUEST);
        }
    }
    if (event.bookingCloseTime) {
        const closeDateStr = new Date(event.endDate || event.startDate).toISOString().split('T')[0];
        const closeDateObj = new Date(`${closeDateStr}T${event.bookingCloseTime}:00+05:30`);
        if (new Date() > closeDateObj) {
            throw new AppError(`Ticket sales for this event closed at ${event.bookingCloseTime}.`, HTTP_STATUS.BAD_REQUEST);
        }
    }

    const user = await User.findById(userId).select('wallet fullName email');
    let totalAmount = 0;
    let validatedItems = [];

    for (const item of cart) {
        const ticket = event.tickets.id(item.ticketId);
        if (!ticket) throw new AppError('A selected ticket type was not found', HTTP_STATUS.NOT_FOUND);

        const remaining = ticket.capacity - ticket.sold;
        if (item.quantity > remaining) throw new AppError(`Only ${remaining} ${ticket.name} tickets remaining`, HTTP_STATUS.BAD_REQUEST);
        if (item.quantity > ticket.maxPerUser) throw new AppError(`Max ${ticket.maxPerUser} ${ticket.name} tickets per person in a single order`, HTTP_STATUS.BAD_REQUEST);

        // Prevent users from circumventing maxPerUser across multiple active bookings
        const userPreviousBookings = await Booking.find({ event: eventId, user: userId, status: { $ne: 'cancelled' } });
        let userExistingCount = 0;
        for (const prevB of userPreviousBookings) {
            for (const prevT of (prevB.tickets || [])) {
                if (String(prevT.ticket) === String(ticket._id) && prevT.status !== 'cancelled') {
                    userExistingCount += prevT.quantity;
                }
            }
        }
        if (userExistingCount + item.quantity > ticket.maxPerUser) {
            throw new AppError(`You already have ${userExistingCount} active "${ticket.name}" ticket(s). Maximum allowed per person is ${ticket.maxPerUser}.`, HTTP_STATUS.BAD_REQUEST);
        }

        totalAmount += ticket.price * item.quantity;
        validatedItems.push({ ticket, quantity: item.quantity });
    }

    let appliedCoupon = null;
    if (couponId) {
        const coupon = await Coupon.findById(couponId);
        if (coupon && coupon.isActive && String(coupon.event) === String(eventId)) {
            if (new Date(coupon.expiryDate) < new Date()) throw new AppError('This promo code has expired.', HTTP_STATUS.BAD_REQUEST);
            if (coupon.maxUses && coupon.usedCount >= coupon.maxUses) throw new AppError('This promo code has reached its usage limit.', HTTP_STATUS.BAD_REQUEST);
            
            if (coupon.maxPerUser) {
                const userUsageCount = await Booking.countDocuments({ user: userId, coupon: coupon._id, status: { $ne: 'cancelled' } });
                if (userUsageCount >= coupon.maxPerUser) throw new AppError(`Usage limit reached.`, HTTP_STATUS.BAD_REQUEST);
            }

            if (totalAmount < coupon.minOrderValue) throw new AppError(`Minimum order value of ₹${coupon.minOrderValue} required.`, HTTP_STATUS.BAD_REQUEST);

            let eligibleTotal = 0;
            for (const item of validatedItems) {
                if (coupon.applicableTickets.length === 0 || coupon.applicableTickets.some(id => id.toString() === item.ticket._id.toString())) {
                    eligibleTotal += item.ticket.price * item.quantity;
                }
            }
            if (eligibleTotal === 0) throw new AppError('Coupon not applicable for selected tickets.', HTTP_STATUS.BAD_REQUEST);

            let discountAmount = 0;
            if (coupon.discountType === 'percentage') {
                discountAmount = (eligibleTotal * coupon.discountValue) / 100;
                if (coupon.maxDiscountAmount) discountAmount = Math.min(discountAmount, coupon.maxDiscountAmount);
            } else if (coupon.discountType === 'flat') {
                discountAmount = coupon.discountValue;
            }
            
            discountAmount = Math.min(discountAmount, totalAmount);
            totalAmount -= discountAmount;
            appliedCoupon = coupon;
        }
    }

    if (expectedTotal !== null && expectedTotal !== undefined && totalAmount !== expectedTotal) {
        throw new AppError('Ticket prices or availability have been updated by the organizer. Please refresh the page to see the new total before proceeding.', HTTP_STATUS.CONFLICT);
    }

    return { event, user, totalAmount, validatedItems, appliedCoupon };
};

// ─── FETCH AVAILABLE PROMO CODES FOR USERS ──────────────────────────────────
export const getAvailableCouponsService = async (eventId) => {
    const currentDate = new Date();
    
    // Find active coupons that haven't expired
    const coupons = await Coupon.find({
        event: eventId,
        isActive: true,
        expiryDate: { $gt: currentDate }
    }).select('code discountType discountValue expiryDate maxUses usedCount minOrderValue maxDiscountAmount');

    // Filter out coupons that have reached their max usage limit
    return coupons.filter(c => !c.maxUses || c.usedCount < c.maxUses);
};

export const validatePromoCodeService = async (code, eventId, currentTotal, userId, cart) => {
    if (!code) throw new AppError('Please enter a code.', HTTP_STATUS.BAD_REQUEST);

    const coupon = await Coupon.findOne({ code: code.toUpperCase(), event: eventId, isActive: true });
    if (!coupon) throw new AppError('Invalid promo code.', HTTP_STATUS.NOT_FOUND);
    if (new Date(coupon.expiryDate) < new Date()) throw new AppError('This promo code has expired.', HTTP_STATUS.BAD_REQUEST);
    if (coupon.maxUses && coupon.usedCount >= coupon.maxUses) throw new AppError('This promo code has reached its usage limit.', HTTP_STATUS.BAD_REQUEST);

    if (coupon.maxPerUser) {
        const userUsageCount = await Booking.countDocuments({
            user: userId, coupon: coupon._id, status: { $ne: 'cancelled' }
        });
        if (userUsageCount >= coupon.maxPerUser) throw new AppError(`You have used this code the maximum allowed times.`, HTTP_STATUS.BAD_REQUEST);
    }

    // ✨ 1. Check Minimum Order Value (UPTO limit)
    if (currentTotal < coupon.minOrderValue) {
        throw new AppError(`This offer requires a minimum order value of ₹${coupon.minOrderValue}.`, HTTP_STATUS.BAD_REQUEST);
    }

    // ✨ 2. Check Applicable Tickets
    const event = await Event.findById(eventId);
    let eligibleTotal = 0;
    
    for (const item of cart) {
        const ticket = event.tickets.id(item.ticketId);
        if (!ticket) continue;
        
        // If applicableTickets is empty, it applies to all. Otherwise, check if this ticket is in the list.
        if (coupon.applicableTickets.length === 0 || coupon.applicableTickets.some(id => id.toString() === ticket._id.toString())) {
            eligibleTotal += ticket.price * item.quantity;
        }
    }

    if (eligibleTotal === 0) {
        throw new AppError('This promo code is not applicable for the selected tickets.', HTTP_STATUS.BAD_REQUEST);
    }

    // ✨ 3. Calculate Discount with Cap Amount
    let discountAmount = 0;
    if (coupon.discountType === 'percentage') {
        discountAmount = (eligibleTotal * coupon.discountValue) / 100;
        // Apply Cap Amount if it exists
        if (coupon.maxDiscountAmount) {
            discountAmount = Math.min(discountAmount, coupon.maxDiscountAmount);
        }
    } else if (coupon.discountType === 'flat') {
        discountAmount = coupon.discountValue;
    }

    discountAmount = Math.min(discountAmount, currentTotal); // Never discount more than total

    return { discountAmount, newTotal: currentTotal - discountAmount, couponId: coupon._id };
};


// ─── Generate Ticket PDF ──────────────────────────────────────────────────────
export const generateTicketPdf = async (bookingId, userId, hostUrl) => {
    // 1. Fetch booking with full event + organizer details
    const booking = await Booking.findOne({ _id: bookingId, user: userId })
        .populate({
            path: 'event',
            populate: [
                { path: 'category',  select: 'name' },
                { path: 'organizer', select: 'fullName organizationName' }
            ]
        })
        .populate('user', 'fullName email phone');

    if (!booking) throw new AppError('Booking not found.', HTTP_STATUS.NOT_FOUND);

    const { event, user } = booking;

    // 2. Generate QR code for active bookings (scan URL for organizer to verify)
    let qrDataUrl = '';
    if (booking.status === 'active') {
        const scanUrl = `${hostUrl}/organizer/verify-ticket/${booking._id}`;
        qrDataUrl = await QRCodeLib.toDataURL(scanUrl, {
            width:  200,
            margin: 1,
            color:  { dark: '#1a1a1a', light: '#ffffff' }
        });
    }

    // 3. Format helpers
    const fmt = (n) => `₹${Number(n).toLocaleString('en-IN')}`;
    const fmtDate = (d, opts = {}) =>
        new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric', ...opts });

    const bookingIdShort = booking._id.toString().slice(-8).toUpperCase();
    const bookedOn       = fmtDate(booking.bookingDate, { hour: '2-digit', minute: '2-digit' });
    const eventStart     = fmtDate(event.startDate, { weekday: 'short' });
    const eventEnd       = fmtDate(event.endDate,   { weekday: 'short' });

    // Determine if any individual sub-tickets are partially cancelled
    const hasPartialCancellation = booking.tickets.some(t => t.status === 'cancelled');
    const allSubTicketsCancelled  = booking.tickets.every(t => t.status === 'cancelled');

    // Status ribbon colour + label
    let statusColour, statusLabel;
    if (booking.status === 'cancelled') {
        statusColour = '#b02020';
        statusLabel  = 'CANCELLED';
    } else if (booking.status === 'on_hold') {
        statusColour = '#b07d00';
        statusLabel  = 'ON HOLD';
    } else if (hasPartialCancellation) {
        statusColour = '#c05000';
        statusLabel  = 'PARTIALLY CANCELLED';
    } else {
        statusColour = '#1a7a3e';
        statusLabel  = 'ACTIVE';
    }

    // All tickets (active + cancelled) — mirrors the web UI table
    const ticketRows = booking.tickets
        .map(t => {
            const isCancelled = t.status === 'cancelled';
            const rowBg       = isCancelled ? '#fff5f5' : 'transparent';
            const nameStyle   = isCancelled
                ? 'font-weight:600;color:#aaa;text-decoration:line-through;'
                : 'font-weight:700;color:#1a1a1a;';
            const numStyle    = isCancelled ? 'color:#ccc;text-decoration:line-through;' : 'color:#555;';
            const cancelBadge = isCancelled
                ? `<span style="display:inline-block;margin-left:8px;padding:2px 7px;border-radius:4px;font-size:10px;font-weight:700;background:#fde9e9;color:#b02020;letter-spacing:0.04em;">REFUNDED</span>`
                : '';
            return `
            <tr style="background:${rowBg};">
                <td style="padding:10px 14px;">
                    <span style="${nameStyle}">${t.ticketName}</span>${cancelBadge}
                </td>
                <td style="padding:10px 14px;text-align:center;${numStyle}">${t.quantity}</td>
                <td style="padding:10px 14px;text-align:right;${numStyle}">${fmt(t.ticketPrice)}</td>
                <td style="padding:10px 14px;text-align:right;font-weight:${isCancelled ? '500' : '700'};${numStyle}">${fmt(t.ticketPrice * t.quantity)}</td>
            </tr>`;
        }).join('');

    const totalTickets = booking.tickets
        .filter(t => t.status === 'active')
        .reduce((s, t) => s + t.quantity, 0);

    // 4. Build the HTML
    const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: 'Helvetica Neue', Arial, sans-serif; background: #f5f5f5; color: #1a1a1a; font-size: 13px; -webkit-print-color-adjust: exact; }
  .page { width: 794px; min-height: 1123px; background: white; margin: 0 auto; display: flex; flex-direction: column; }

  /* ── Header ── */
  .ticket-header {
    background: #1a1a1a;
    padding: 28px 36px;
    display: flex;
    justify-content: space-between;
    align-items: center;
  }
  .brand { font-size: 22px; font-weight: 900; letter-spacing: -0.5px; color: #E63946; }
  .brand span { color: white; }
  .header-right { text-align: right; }
  .header-right .label { font-size: 10px; color: rgba(255,255,255,0.4); text-transform: uppercase; letter-spacing: 0.1em; font-weight: 700; }
  .header-right .booking-id { font-size: 20px; font-weight: 900; color: white; letter-spacing: 1px; font-family: monospace; margin-top: 2px; }

  /* ── Status ribbon ── */
  .status-ribbon {
    background: ${statusColour};
    color: white;
    text-align: center;
    font-size: 11px;
    font-weight: 800;
    letter-spacing: 0.2em;
    padding: 7px;
  }

  /* ── Event hero ── */
  .event-hero {
    background: linear-gradient(135deg, #0f0f0f 0%, #1a1a1a 100%);
    padding: 32px 36px;
    display: flex;
    gap: 28px;
    align-items: flex-start;
  }
  .event-hero-info { flex: 1; min-width: 0; }
  .event-category {
    font-size: 10px; font-weight: 800; text-transform: uppercase;
    letter-spacing: 0.14em; color: #E63946; margin-bottom: 8px;
  }
  .event-title { font-size: 22px; font-weight: 900; color: white; line-height: 1.25; margin-bottom: 14px; }
  .event-meta { display: flex; flex-direction: column; gap: 8px; }
  .meta-row { display: flex; align-items: flex-start; gap: 10px; }
  .meta-icon { font-size: 12px; color: #E63946; margin-top: 1px; flex-shrink: 0; width: 16px; text-align: center; }
  .meta-label { font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.08em; color: rgba(255,255,255,0.4); }
  .meta-value { font-size: 12px; color: rgba(255,255,255,0.85); font-weight: 500; margin-top: 1px; }

  /* QR Code block */
  .qr-block {
    flex-shrink: 0;
    background: white;
    border-radius: 12px;
    padding: 14px;
    text-align: center;
    width: 160px;
  }
  .qr-block img { width: 130px; height: 130px; display: block; margin: 0 auto; }
  .qr-hint { font-size: 9px; color: #999; margin-top: 8px; line-height: 1.4; text-align: center; }

  /* ── Dashed divider (perforation effect) ── */
  .perforation {
    display: flex;
    align-items: center;
    margin: 0;
    background: #f5f5f5;
    position: relative;
  }
  .perf-circle {
    width: 28px; height: 28px; border-radius: 50%;
    background: white;
    flex-shrink: 0;
  }
  .perf-circle.left { margin-left: -14px; }
  .perf-circle.right { margin-right: -14px; }
  .perf-line {
    flex: 1;
    border-top: 2px dashed #ddd;
    margin: 14px 0;
  }

  /* ── Ticket body ── */
  .ticket-body { padding: 28px 36px; flex: 1; }

  /* Attendee + payment strip */
  .info-strip {
    display: grid;
    grid-template-columns: 1fr 1fr 1fr;
    gap: 16px;
    margin-bottom: 24px;
    padding: 18px 20px;
    background: #f9f9f9;
    border: 1px solid #eee;
    border-radius: 10px;
  }
  .info-cell .cell-label { font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.08em; color: #aaa; margin-bottom: 4px; }
  .info-cell .cell-value { font-size: 13px; font-weight: 700; color: #1a1a1a; word-break: break-all; }

  /* Ticket table */
  .ticket-table { width: 100%; border-collapse: collapse; margin-bottom: 20px; }
  .ticket-table thead th {
    background: #1a1a1a; color: white;
    padding: 10px 14px; font-size: 11px; font-weight: 700;
    text-transform: uppercase; letter-spacing: 0.06em; text-align: left;
  }
  .ticket-table thead th:nth-child(2) { text-align: center; }
  .ticket-table thead th:nth-child(3),
  .ticket-table thead th:nth-child(4) { text-align: right; }
  .ticket-table tbody tr:nth-child(even) td { background: #fafafa; }
  .ticket-table tbody td { border-bottom: 1px solid #f0f0f0; }

  /* Total row */
  .total-row {
    display: flex;
    justify-content: flex-end;
    align-items: center;
    gap: 24px;
    padding: 14px 20px;
    background: linear-gradient(135deg, #1a1a1a, #2a2a2a);
    border-radius: 10px;
    margin-bottom: 24px;
  }
  .total-label { font-size: 12px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.08em; color: rgba(255,255,255,0.5); }
  .total-amount { font-size: 24px; font-weight: 900; color: #2ecc71; }

  /* Organizer block */
  .organizer-block {
    display: flex;
    align-items: center;
    gap: 14px;
    padding: 14px 18px;
    border: 1px solid #eee;
    border-radius: 10px;
    margin-bottom: 24px;
    background: #fdfdfd;
  }
  .org-icon {
    width: 40px; height: 40px; border-radius: 50%;
    background: rgba(230,57,70,0.08);
    border: 1px solid rgba(230,57,70,0.2);
    display: flex; align-items: center; justify-content: center;
    font-size: 16px; color: #E63946; flex-shrink: 0;
  }
  .org-name { font-size: 13px; font-weight: 700; color: #1a1a1a; }
  .org-sub  { font-size: 11px; color: #888; margin-top: 2px; }

  /* Terms */
  .terms {
    padding: 14px 18px;
    background: #f9f9f9;
    border: 1px solid #eee;
    border-radius: 10px;
    font-size: 10px; color: #aaa; line-height: 1.6;
  }
  .terms strong { color: #888; }

  /* ── Footer ── */
  .ticket-footer {
    background: #f0f0f0;
    padding: 14px 36px;
    display: flex;
    justify-content: space-between;
    align-items: center;
    font-size: 10px; color: #aaa;
    border-top: 1px solid #e5e5e5;
  }
  .ticket-footer strong { color: #888; }
</style>
</head>
<body>
<div class="page">

  <!-- Header -->
  <div class="ticket-header">
    <div class="brand">Event<span>Hub</span></div>
    <div class="header-right">
      <div class="label">Booking Reference</div>
      <div class="booking-id">#${bookingIdShort}</div>
    </div>
  </div>

  <!-- Status ribbon -->
  <div class="status-ribbon">${statusLabel} TICKET</div>

  <!-- Event hero -->
  <div class="event-hero">
    <div class="event-hero-info">
      <div class="event-category">${event.category?.name || 'Event'}</div>
      <div class="event-title">${event.title}</div>
      <div class="event-meta">
        <div class="meta-row">
          <div class="meta-icon">◷</div>
          <div>
            <div class="meta-label">Starts</div>
            <div class="meta-value">${eventStart} &nbsp;·&nbsp; ${event.startTime || ''}</div>
          </div>
        </div>
        <div class="meta-row">
          <div class="meta-icon">⊙</div>
          <div>
            <div class="meta-label">Ends</div>
            <div class="meta-value">${eventEnd} &nbsp;·&nbsp; ${event.endTime || ''}</div>
          </div>
        </div>
        <div class="meta-row">
          <div class="meta-icon">⊕</div>
          <div>
            <div class="meta-label">Venue</div>
            <div class="meta-value">${event.location?.address || 'Venue TBD'}</div>
          </div>
        </div>
      </div>
    </div>

    <!-- QR Code -->
    ${qrDataUrl ? `
    <div class="qr-block">
      <img src="${qrDataUrl}" alt="Entry QR Code">
      <div class="qr-hint">Show at entry for verification</div>
    </div>` : `
    <div class="qr-block" style="background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.1);">
      <div style="width:130px;height:130px;display:flex;align-items:center;justify-content:center;flex-direction:column;gap:8px;margin:0 auto;">
        <div style="font-size:28px;color:rgba(255,255,255,0.2);">⊗</div>
        <div style="font-size:10px;color:rgba(255,255,255,0.3);text-align:center;text-transform:uppercase;letter-spacing:0.08em;">QR Unavailable</div>
      </div>
    </div>`}
  </div>

  <!-- Perforation -->
  <div class="perforation">
    <div class="perf-circle left"></div>
    <div class="perf-line"></div>
    <div class="perf-circle right"></div>
  </div>

  <!-- Ticket body -->
  <div class="ticket-body">

    <!-- Attendee + payment strip -->
    <div class="info-strip">
      <div class="info-cell">
        <div class="cell-label">Attendee</div>
        <div class="cell-value">${user?.fullName || 'N/A'}</div>
        <div style="font-size:11px;color:#888;margin-top:2px;">${user?.email || ''}</div>
      </div>
      <div class="info-cell">
        <div class="cell-label">Booked On</div>
        <div class="cell-value">${bookedOn}</div>
        <div style="font-size:11px;color:#888;margin-top:2px;">${booking.paymentMethod === 'wallet' ? 'Wallet' : 'Razorpay'}</div>
      </div>
      <div class="info-cell">
        <div class="cell-label">Tickets</div>
        <div class="cell-value">${totalTickets} ticket${totalTickets !== 1 ? 's' : ''}</div>
        <div style="font-size:11px;color:#888;margin-top:2px;">${booking.paymentId || 'N/A'}</div>
      </div>
    </div>

    <!-- Ticket table -->
    <table class="ticket-table">
      <thead>
        <tr>
          <th>Ticket Type</th>
          <th>Qty</th>
          <th>Price</th>
          <th>Subtotal</th>
        </tr>
      </thead>
      <tbody>
        ${ticketRows || '<tr><td colspan="4" style="text-align:center;padding:16px;color:#aaa;">All tickets have been cancelled.</td></tr>'}
      </tbody>
    </table>

    <!-- Total -->
    <div class="total-row">
      <div class="total-label">Total Paid</div>
      <div class="total-amount">${fmt(booking.totalAmount)}</div>
    </div>

    <!-- Organizer -->
    <div class="organizer-block">
      <div class="org-icon">🏢</div>
      <div>
        <div class="org-name">${event.organizer?.organizationName || event.organizer?.fullName || 'Organizer'}</div>
        <div class="org-sub">Event Organizer</div>
      </div>
    </div>

    <!-- Terms -->
    <div class="terms">
      <strong>Terms &amp; Conditions:</strong>
      This ticket is valid for the event stated above and is non-transferable.
      Present this ticket (digital or printed) along with a valid photo ID at the venue entry.
      No entry without verification. Refund policy as per organizer terms.
      EventHub is not responsible for event cancellations or rescheduling by the organizer.
    </div>
  </div>

  <!-- Footer -->
  <div class="ticket-footer">
    <div><strong>EventHub</strong> &nbsp;·&nbsp; Official E-Ticket</div>
    <div>Booking Ref: <strong>#${bookingIdShort}</strong></div>
    <div>Generated on ${new Date().toLocaleDateString('en-IN', { day:'numeric', month:'short', year:'numeric' })}</div>
  </div>

</div>
</body>
</html>`;

    // 5. Generate PDF with Puppeteer (same pattern as organizerEventService)
    const browser = await puppeteer.launch({
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-gpu', '--no-first-run']
    });
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: 'networkidle0' });
    const pdfBuffer = await page.pdf({
        width:           '794px',
        height:          '1123px',
        printBackground: true,
        margin:          { top: '0', right: '0', bottom: '0', left: '0' }
    });
    await browser.close();

    return { pdfBuffer, bookingIdShort };
};



