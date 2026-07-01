// src/models/payments/booking.js
import mongoose from 'mongoose';
import { PAYMENT_STATUS } from '../../constant/paymentConstants.js';

const bookingSchema = new mongoose.Schema({
    event: { type: mongoose.Schema.Types.ObjectId, ref: 'Event', required: true },
    user:  { type: mongoose.Schema.Types.ObjectId, ref: 'User',  required: true },

    // ── Replace singular fields with an array of items ──
    tickets: [{
        ticket:      { type: mongoose.Schema.Types.ObjectId, required: true },
        ticketName:  { type: String, required: true },
        ticketPrice: { type: Number, required: true },
        quantity:    { type: Number, required: true, min: 1 },
        status:      { type: String, enum: ['active', 'cancelled'], default: 'active' }
    }],
    // ─────────────────────────────────────────────────────

    totalAmount:   { type: Number, required: true },
    paymentStatus: { type: String, enum: Object.values(PAYMENT_STATUS), default: PAYMENT_STATUS.PENDING },
    paymentId:     { type: String },
    paymentMethod: { type: String, enum: ['wallet', 'razorpay'], default: 'wallet' },
    coupon:        { type: mongoose.Schema.Types.ObjectId, ref: 'Coupon' },
    bookingDate:   { type: Date, default: Date.now },

    status:             { type: String, enum: ['active', 'on_hold', 'cancelled'], default: 'active' },
    cancelledAt:        { type: Date },
    cancellationReason: { type: String, default: '' },
    heldAt:             { type: Date },
    holdReason:         { type: String, default: '' },

    // ── QR Code Verification / Check-in State ──
    isCheckedIn:        { type: Boolean, default: false },
    checkedInAt:        { type: Date },

    // ── User-initiated cancellation request (awaiting organizer approval) ──
    cancellationRequest: {
        status:        { type: String, enum: ['none', 'pending', 'approved', 'rejected'], default: 'none' },
        reason:        { type: String, default: '' },
        requestedAt:   { type: Date },
        resolvedAt:    { type: Date },
        rejectionNote: { type: String, default: '' },
        isPartial:     { type: Boolean, default: false },
        requestedTickets: [{
            ticketId: { type: mongoose.Schema.Types.ObjectId }, // Refers to the specific item in tickets array
            quantity: { type: Number, min: 1 }
        }]
    }
}, { timestamps: true });

const Booking = mongoose.model('Booking', bookingSchema);
export default Booking;