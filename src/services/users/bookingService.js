import Razorpay from 'razorpay';
import crypto from 'crypto';
import Event from '../../models/events/event.js';
import Booking from '../../models/payments/booking.js';
import User from '../../models/users/user.js';
import AppError from '../../utils/AppError.js';
import HTTP_STATUS from '../../constant/statusCode.js';
import * as socketUtil from '../../utils/socket.js';
import { sendNotification } from '../../utils/notify.js';


// Razorpay instance
const razorpay = new Razorpay({
    key_id:     process.env.RAZORPAY_KEY_ID,
    key_secret: process.env.RAZORPAY_KEY_SECRET
});


// ─── HELPER: Emit Live Booking to Organizer ─────────────────────────────────
async function emitNewBookingToOrganizer(bookingId) {
    try {
        const booking = await Booking.findById(bookingId).populate('user', 'fullName email');
        if (booking && booking.status === 'active') {
            // Dynamically import socket to prevent circular dependency crashes
            const socketUtil = await import('../../utils/socket.js');
            const io = socketUtil.getIO();
            
            const eventRoomId = String(booking.event).trim();
            
            // ✨ DEBUG LOG: Check your terminal when you buy a ticket!
            console.log(`📢 LIVE BOOKING: Emitting to Event Room [${eventRoomId}]`);
            
            io.to(eventRoomId).emit('newBooking', { booking });
        }
    } catch (err) {
        console.error('❌ Socket emit error for new booking:', err.message);
    }
}

// ─── Shared Multi-Cart Validation Helper ────────────────────────────────────
// Loads the event once and resolves each cart item against event.tickets[].
// Returns the event doc itself so callers can use it for atomic $inc updates.
export const validateCartRequest = async (eventId, cart, userId) => {
    const event = await Event.findOne({ _id: eventId, status: 'approved', isBlocked: false });
    if (!event) throw new AppError('Event not found or not available', HTTP_STATUS.NOT_FOUND);

    const user = await User.findById(userId).select('wallet fullName email');
    let totalAmount = 0;
    let validatedItems = [];

    for (const item of cart) {
        // Find the ticket inside event.tickets array by subdoc _id
        const ticket = event.tickets.id(item.ticketId);
        if (!ticket) throw new AppError('A selected ticket type was not found', HTTP_STATUS.NOT_FOUND);

        const remaining = ticket.capacity - ticket.sold;
        if (item.quantity > remaining)    throw new AppError(`Only ${remaining} ${ticket.name} tickets remaining`, HTTP_STATUS.BAD_REQUEST);
        if (item.quantity > ticket.maxPerUser) throw new AppError(`Max ${ticket.maxPerUser} ${ticket.name} tickets per person`, HTTP_STATUS.BAD_REQUEST);

        totalAmount += ticket.price * item.quantity;
        validatedItems.push({ ticket, quantity: item.quantity });
    }

    return { event, user, totalAmount, validatedItems };
};


// ─── Get Checkout Page Data ──────────────────────────────────────────────────
export const getCheckoutData = async (eventId, cart, userId) => {
    const { event, user, totalAmount, validatedItems } = await validateCartRequest(eventId, cart, userId);

    return {
        event,
        // Shape each item so the checkout view can use item.ticket.name / item.ticket.price
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
export const createOrder = async (eventId, cart, userId) => {
    const { totalAmount } = await validateCartRequest(eventId, cart, userId);

    const order = await razorpay.orders.create({
        amount:   totalAmount * 100,
        currency: 'INR',
        receipt:  `cart_${Date.now()}`
    });

    return { order, amount: totalAmount };
};


// ─── Atomically Increment sold on an embedded ticket ────────────────────────
// Uses MongoDB's arrayFilters to $inc the correct subdoc in event.tickets.
// Returns the updated Event doc (with new.tickets reflecting the new sold count).
const incrementTicketSold = async (eventId, ticketId, quantity) => {
    return await Event.findOneAndUpdate(
        { _id: eventId, 'tickets._id': ticketId },
        { $inc: { 'tickets.$[t].sold': quantity } },
        {
            arrayFilters: [{ 't._id': ticketId }],
            new: true,          // return updated doc
            runValidators: false
        }
    );
};


// ─── Verify Razorpay Payment & Create Bookings ───────────────────────────────
export const verifyAndBook = async (eventId, userId, { razorpay_order_id, razorpay_payment_id, razorpay_signature, cart }) => {
    // 1. Verify Razorpay signature
    const expectedSignature = crypto
        .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET)
        .update(razorpay_order_id + '|' + razorpay_payment_id)
        .digest('hex');

    if (expectedSignature !== razorpay_signature) {
        throw new AppError('Payment verification failed.', HTTP_STATUS.BAD_REQUEST);
    }

    // 2. Re-validate cart against current DB state
    const { validatedItems, totalAmount } = await validateCartRequest(eventId, cart, userId);

    // 3. Build the tickets array and increment stock
    let ticketsArray = [];
    let updatedTickets = [];

    for (const item of validatedItems) {
        // Add to our new tickets array format
        ticketsArray.push({
            ticket:      item.ticket._id,
            ticketName:  item.ticket.name,
            ticketPrice: item.ticket.price,
            quantity:    item.quantity
        });

        // Atomic $inc on the embedded ticket subdoc
        const updatedEvent = await incrementTicketSold(eventId, item.ticket._id, item.quantity);
        updatedTickets.push(updatedEvent.tickets.id(item.ticket._id));
    }

    // 4. Create ONE single booking document for the entire cart
    const newBooking = await Booking.create({
        event:         eventId,
        user:          userId,
        tickets:       ticketsArray, // Pass the array here
        totalAmount:   totalAmount,
        paymentStatus: 'completed',
        paymentMethod: 'razorpay',
        paymentId:     razorpay_payment_id
    });


    await emitNewBookingToOrganizer(newBooking._id)

    // 5. Emit real-time stock update
    const io = socketUtil.getIO();
    io.to(eventId.toString()).emit('ticketStockUpdate', {
        tickets: updatedTickets.map(t => ({
            ticketId:    t._id.toString(),
            newCapacity: t.capacity - t.sold
        }))
    });

    // Notify the User:
    await sendNotification(newBooking.user._id, `Your tickets for "${event.title}" are confirmed!`, 'success');

    // Notify the Organizer:
    await sendNotification(
        event.organizer, // The Organizer's ID!
        `New Sale! ${newBooking.user.fullName} just bought tickets for "${event.title}".`, 
        'success'
    );

    // Return a single booking ID
    return { bookingId: newBooking._id };
};


// ─── Process Wallet Booking ──────────────────────────────────────────────────
export const bookWithWallet = async (eventId, userId, cart) => {
    const { event, user, totalAmount, validatedItems } = await validateCartRequest(eventId, cart, userId);

    const walletBalance = user.wallet?.balance || 0;
    if (walletBalance < totalAmount) {
        throw new AppError('Insufficient wallet balance.', HTTP_STATUS.BAD_REQUEST);
    }

    // Deduct wallet once for the whole cart
    user.wallet.balance -= totalAmount;
    user.wallet.transactions.push({
        type:        'debit',
        amount:      totalAmount,
        description: `Cart Booking: ${event.title}`
    });
    await user.save();

    const paymentId = `WALLET-${Date.now()}`;

    let ticketsArray = [];
    let updatedTickets = [];

    // Build tickets array and update stock
    for (const item of validatedItems) {
        ticketsArray.push({
            ticket:      item.ticket._id,
            ticketName:  item.ticket.name,
            ticketPrice: item.ticket.price,
            quantity:    item.quantity
        });

        const updatedEvent = await incrementTicketSold(eventId, item.ticket._id, item.quantity);
        updatedTickets.push(updatedEvent.tickets.id(item.ticket._id));
    }

    // Create ONE booking document
    const newBooking = await Booking.create({
        event:         eventId,
        user:          userId,
        tickets:       ticketsArray,
        totalAmount:   totalAmount,
        paymentStatus: 'completed',
        paymentMethod: 'wallet',
        paymentId
    });

    await emitNewBookingToOrganizer(newBooking._id)
    // Emit real-time stock update
    const io = socketUtil.getIO();
    io.to(eventId.toString()).emit('ticketStockUpdate', {
        tickets: updatedTickets.map(t => ({
            ticketId:    t._id.toString(),
            newCapacity: t.capacity - t.sold
        }))
    });

    // Notify the User:
    await sendNotification(newBooking.user._id, `Your tickets for "${event.title}" are confirmed!`, 'success');

    // Notify the Organizer:
    await sendNotification(
        event.organizer, // The Organizer's ID!
        `New Sale! ${newBooking.user.fullName} just bought tickets for "${event.title}".`, 
        'success'
    );


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
    else                             bookings = bookings.filter(b => b.paymentStatus === 'completed' || b.status !== 'active');

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

    // Mark cancelled
    booking.status        = 'cancelled';
    booking.cancelledAt   = new Date();
    booking.paymentStatus = 'refunded';
    await booking.save();

    // Loop through all tickets in the cart and release seats
    let updatedTicketsPayload = [];
    for (const tItem of booking.tickets) {
        if (tItem.status === 'cancelled') continue; // Skip if already individually cancelled
        
        tItem.status = 'cancelled'; // Mark sub-ticket as cancelled

        // Release seats atomically and return the updated document (new: true)
        const updatedEvent = await Event.findOneAndUpdate(
            { _id: booking.event._id, 'tickets._id': tItem.ticket },
            { $inc: { 'tickets.$[elem].sold': -tItem.quantity } },
            {
                arrayFilters: [{ 'elem._id': tItem.ticket }],
                runValidators: false,
                new: true // Important: gets the new stock
            }
        );

        if(updatedEvent) {
            const updatedT = updatedEvent.tickets.id(tItem.ticket);
            updatedTicketsPayload.push({
                ticketId: updatedT._id.toString(),
                newCapacity: updatedT.capacity - updatedT.sold
            });
        }
    }
    
    await booking.save(); // Save the sub-ticket statuses

    // Emit real-time stock update for restocking
    if (updatedTicketsPayload.length > 0) {
        const io = socketUtil.getIO();
        io.to(booking.event._id.toString()).emit('ticketStockUpdate', {
            tickets: updatedTicketsPayload
        });
    }

    // Refund to wallet if payment was via wallet
    if (booking.paymentMethod === 'wallet' || booking.paymentMethod === "razorpay") {
        const user = await User.findById(userId);
        user.wallet.balance += booking.totalAmount;
        user.wallet.transactions.push({
            type:        'credit',
            amount:      booking.totalAmount,
            description: `Refund: Full cancellation for ${booking.event?.title || 'Event'}`
        });
        await user.save();

        return {
            message:  `Booking cancelled. ₹${booking.totalAmount.toLocaleString('en-IN')} refunded to your wallet.`,
            refunded: true
        };
    }

    return {
        message:  'Booking cancelled. Razorpay refunds are processed within 5–7 business days.',
        refunded: false
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
export const cancelSingleTicketByUser = async (bookingId, ticketItemId, userId, cancelQty = 1) => {
    const booking = await Booking.findById(bookingId).populate('event', 'title');
    if (!booking) throw new AppError('Booking not found', HTTP_STATUS.NOT_FOUND);
    
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

    // 1. Calculate refund for the requested quantity
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

    // 3. Check if ALL tickets inside the booking are now cancelled
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
            new: true // Required to get the updated document
        }
    );

    // Emit Socket Update for restocking
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

    // 5. Process Wallet Refund
    if (booking.paymentMethod === 'wallet' || booking.paymentMethod === "razorpay") {
        const user = await User.findById(userId);
        if (user) {
            user.wallet.balance += refundAmount;
            user.wallet.transactions.push({
                type: 'credit',
                amount: refundAmount,
                description: `Refund: ${cancelQty}x ${ticketItem.ticketName} ticket(s) cancelled for ${booking.event.title}`
            });
            await user.save();
        }
        return { message: `${cancelQty}x ${ticketItem.ticketName} cancelled. ₹${refundAmount.toLocaleString('en-IN')} refunded to wallet.` };
    }

    return { message: `${cancelQty}x ${ticketItem.ticketName} cancelled. ₹${refundAmount.toLocaleString('en-IN')} will be refunded to your original payment method.` };
};