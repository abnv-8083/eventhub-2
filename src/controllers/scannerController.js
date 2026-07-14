// src/controllers/scannerController.js
import Event from '../models/events/event.js';
import Booking from '../models/payments/booking.js';
import mongoose from 'mongoose';
import { getIO } from '../utils/socket.js';

// ─── 1. Render Login Page ──────────────────────────────────────────────────
export const renderLogin = (req, res) => {
    if (req.session.scannerEventId) {
        return res.redirect(`/scanner/event/${req.session.scannerEventId}`);
    }
    res.render('scanner/login', { error: null });
};

// ─── 2. Handle PIN Login ───────────────────────────────────────────────────
export const login = async (req, res) => {
    try {
        const { code } = req.body;
        if (!code || !code.trim()) {
            return res.render('scanner/login', { error: 'Please enter a valid 6-digit scanning code.' });
        }

        const cleanCode = code.trim();
        const event = await Event.findOne({ scanningCode: cleanCode, deleted: false });

        if (!event) {
            return res.render('scanner/login', { error: 'Invalid Scanning Code. Please check the PIN and try again.' });
        }

        if (!event.isScanningActive) {
            return res.render('scanner/login', { error: 'Ticket scanning is currently disabled for this event by the organizer.' });
        }

        const inactiveStatuses = ['draft', 'rejected', 'cancelled', 'archived'];
        if (inactiveStatuses.includes(event.status)) {
            return res.render('scanner/login', { error: `Cannot scan tickets: This event is currently marked as ${event.status}.` });
        }

        // Store session
        req.session.scannerEventId = event._id.toString();
        req.session.scannerCode = cleanCode;
        req.session.scannerEventTitle = event.title;

        res.redirect(`/scanner/event/${event._id}`);
    } catch (err) {
        console.error('Scanner login error:', err);
        res.render('scanner/login', { error: 'An unexpected error occurred. Please try again.' });
    }
};

// ─── 3. Logout ─────────────────────────────────────────────────────────────
export const logout = (req, res) => {
    delete req.session.scannerEventId;
    delete req.session.scannerCode;
    delete req.session.scannerEventTitle;
    res.redirect('/scanner');
};

// ─── 4. Render Main Scanner Dashboard ──────────────────────────────────────
export const renderDashboard = async (req, res) => {
    try {
        const { eventId } = req.params;

        // Security check: ensure session matches requested eventId
        if (req.session.scannerEventId !== eventId) {
            return res.redirect('/scanner');
        }

        const event = await Event.findById(eventId);
        if (!event || event.deleted) {
            delete req.session.scannerEventId;
            return res.redirect('/scanner');
        }

        // Calculate live attendance metrics
        const bookings = await Booking.find({
            event: eventId,
            status: { $in: ['active', 'on_hold'] },
            paymentStatus: { $in: ['completed', 'PAID', 'pending'] } // include valid paid/free bookings
        });

        let totalSold = 0;
        let totalCheckedIn = 0;

        bookings.forEach(b => {
            b.tickets.forEach(t => {
                if (t.status === 'active') {
                    totalSold += t.quantity;
                    totalCheckedIn += (t.checkedInQuantity || 0);
                }
            });
        });

        res.render('scanner/dashboard', {
            event,
            totalSold,
            totalCheckedIn,
            scannerCode: req.session.scannerCode
        });
    } catch (err) {
        console.error('Render scanner dashboard error:', err);
        res.redirect('/scanner');
    }
};

// ─── 5. API: Verify Ticket / Lookup Booking ────────────────────────────────
export const verifyTicket = async (req, res) => {
    try {
        const { bookingRef } = req.params;
        const scannerEventId = req.session.scannerEventId;

        if (!scannerEventId) {
            return res.status(401).json({ success: false, message: 'Scanner session expired. Please log in again.' });
        }

        let query = {};
        let cleanRef = bookingRef.trim().replace(/^#/, '');

        // ─── Handle full QR URL (e.g. https://host/organizer/verify-ticket/<bookingId>) ───
        try {
            const parsed = new URL(cleanRef);
            // Extract last path segment as the booking ID
            const segments = parsed.pathname.split('/').filter(Boolean);
            cleanRef = segments[segments.length - 1];
        } catch (_) {
            // Not a URL — use cleanRef as-is
        }

        if (mongoose.Types.ObjectId.isValid(cleanRef) && cleanRef.length === 24) {
            query = { _id: cleanRef };
        } else {
            // Search all bookings for this event and match short hex ID
            const allBookings = await Booking.find({ event: scannerEventId }).populate('user', 'fullName email phone');
            const match = allBookings.find(b => 
                b._id.toString().slice(-6).toLowerCase() === cleanRef.toLowerCase() ||
                b._id.toString().toLowerCase() === cleanRef.toLowerCase()
            );
            if (match) {
                query = { _id: match._id };
            } else {
                return res.status(404).json({ success: false, message: `No ticket found matching ID #${cleanRef.toUpperCase()}` });
            }
        }

        const booking = await Booking.findOne(query).populate('user', 'fullName email phone');

        if (!booking) {
            return res.status(404).json({ success: false, message: `Ticket #${cleanRef.toUpperCase()} not found.` });
        }

        // Check event mismatch
        if (booking.event.toString() !== scannerEventId) {
            return res.status(400).json({ 
                success: false, 
                message: '⚠️ INVALID EVENT! This ticket belongs to a completely different event.' 
            });
        }

        // Prepare ticket items with remaining check-in quantities
        const items = booking.tickets.map(t => {
            const checkedInQty = t.checkedInQuantity || 0;
            const remainingQty = t.status === 'active' ? Math.max(0, t.quantity - checkedInQty) : 0;
            return {
                _id: t._id.toString(),
                ticketId: t.ticket,
                ticketName: t.ticketName,
                price: t.ticketPrice,
                totalQty: t.quantity,
                checkedInQty,
                remainingQty,
                status: t.status
            };
        });

        // Normalize cancellationRequest — legacy bookings may not have this field
        const rawCancel = booking.cancellationRequest;
        const cancellationRequest = {
            status:           rawCancel?.status        || 'none',
            isPartial:        rawCancel?.isPartial     || false,
            reason:           rawCancel?.reason        || '',
            requestedAt:      rawCancel?.requestedAt   || null,
            requestedTickets: (rawCancel?.requestedTickets || []).map(rt => ({
                ticketId: rt.ticketId?.toString(),
                quantity: rt.quantity
            }))
        };

        console.log(`[Scanner] verifyTicket — booking ${booking._id} — cancellationRequest.status: ${cancellationRequest.status}`);

        res.json({
            success: true,
            booking: {
                _id: booking._id,
                bookingRef: booking._id.toString().slice(-6).toUpperCase(),
                user: booking.user || { fullName: 'Guest Attendee', email: 'N/A', phone: 'N/A' },
                totalAmount: booking.totalAmount,
                paymentStatus: booking.paymentStatus,
                paymentMethod: booking.paymentMethod,
                status: booking.status,
                isCheckedIn: booking.isCheckedIn,
                checkedInAt: booking.checkedInAt,
                bookingDate: booking.bookingDate,
                items,
                cancellationRequest
            }
        });
    } catch (err) {
        console.error('Verify ticket error:', err);
        res.status(500).json({ success: false, message: 'Server error while verifying ticket.' });
    }
};

// ─── 6. API: Execute Ticket Check-In ───────────────────────────────────────
export const checkInTicket = async (req, res) => {
    try {
        const { bookingId, checkInItems } = req.body;
        const scannerEventId = req.session.scannerEventId;

        if (!scannerEventId) {
            return res.status(401).json({ success: false, message: 'Scanner session expired. Please log in again.' });
        }

        if (!bookingId || !Array.isArray(checkInItems) || checkInItems.length === 0) {
            return res.status(400).json({ success: false, message: 'Invalid check-in request data.' });
        }

        const booking = await Booking.findById(bookingId).populate('user', 'fullName email').populate('event', 'title organizer');

        if (!booking) {
            return res.status(404).json({ success: false, message: 'Booking not found.' });
        }

        if (booking.event._id.toString() !== scannerEventId) {
            return res.status(400).json({ success: false, message: 'Event mismatch.' });
        }

        if (booking.status !== 'active') {
            return res.status(400).json({ success: false, message: `Cannot check in: Booking status is ${booking.status.toUpperCase()}` });
        }

        if (booking.cancellationRequest && booking.cancellationRequest.status === 'pending') {
            return res.status(400).json({ success: false, message: 'Cannot check in: A cancellation request is currently pending for this booking.' });
        }

        const validPayments = ['completed', 'PAID', 'pending']; // allow free or wallet/razorpay paid
        if (!validPayments.includes(booking.paymentStatus)) {
            return res.status(400).json({ success: false, message: `Cannot check in: Payment status is ${booking.paymentStatus}` });
        }

        let totalCheckedInThisScan = 0;
        const newLogs = [];

        for (const reqItem of checkInItems) {
            const ticketItem = booking.tickets.find(t => t._id.toString() === reqItem.itemId || t.ticket.toString() === reqItem.itemId);
            if (ticketItem && ticketItem.status === 'active') {
                const qtyToScan = parseInt(reqItem.quantityToScan, 10) || 0;
                if (qtyToScan > 0) {
                    const currentCheckedIn = ticketItem.checkedInQuantity || 0;
                    if (currentCheckedIn + qtyToScan > ticketItem.quantity) {
                        return res.status(400).json({ 
                            success: false, 
                            message: `Cannot check in ${qtyToScan} for "${ticketItem.ticketName}". Only ${ticketItem.quantity - currentCheckedIn} remaining.` 
                        });
                    }

                    ticketItem.checkedInQuantity = currentCheckedIn + qtyToScan;
                    totalCheckedInThisScan += qtyToScan;

                    const logEntry = {
                        ticketId: ticketItem.ticket,
                        ticketName: ticketItem.ticketName,
                        quantity: qtyToScan,
                        checkedInAt: new Date(),
                        scannedByCode: req.session.scannerCode || 'GATE_PIN'
                    };
                    booking.checkInLogs.push(logEntry);
                    newLogs.push(logEntry);
                }
            }
        }

        if (totalCheckedInThisScan === 0) {
            return res.status(400).json({ success: false, message: 'Please select at least 1 ticket quantity to check in.' });
        }

        // Check if all active tickets in this booking are now fully checked in
        const allCheckedIn = booking.tickets.every(t => t.status !== 'active' || (t.checkedInQuantity || 0) >= t.quantity);
        if (allCheckedIn) {
            booking.isCheckedIn = true;
            booking.checkedInAt = new Date();
        }

        await booking.save();

        // ── Real-time Socket.io Broadcast to Organizer Dashboard ──
        try {
            const io = getIO();
            const payload = {
                bookingId: booking._id,
                bookingRef: booking._id.toString().slice(-6).toUpperCase(),
                attendeeName: booking.user?.fullName || 'Guest Attendee',
                attendeeEmail: booking.user?.email || '',
                checkedInAt: new Date(),
                scannedByCode: req.session.scannerCode || 'GATE_PIN',
                totalCheckedInThisScan,
                newLogs,
                allCheckedIn
            };
            
            // Emit to event scan room and organizer room
            io.to(`scan_${booking.event._id.toString()}`).emit('ticket_checked_in', payload);
            io.to(booking.event._id.toString()).emit('ticket_checked_in', payload);
            if (booking.event.organizer) {
                io.to(booking.event.organizer.toString()).emit('ticket_checked_in', payload);
            }
        } catch (socketErr) {
            console.error('Socket broadcast error during check-in:', socketErr.message);
        }

        res.json({
            success: true,
            message: `Successfully checked in ${totalCheckedInThisScan} ticket(s)!`,
            booking: {
                _id: booking._id,
                bookingRef: booking._id.toString().slice(-6).toUpperCase(),
                isCheckedIn: booking.isCheckedIn,
                checkedInAt: booking.checkedInAt,
                totalCheckedInThisScan
            }
        });
    } catch (err) {
        console.error('Check-in execution error:', err);
        res.status(500).json({ success: false, message: 'Server error while processing check-in.' });
    }
};
