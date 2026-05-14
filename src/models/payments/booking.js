// src/models/payments/booking.js
import mongoose from 'mongoose';

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
    paymentStatus: { type: String, enum: ['pending', 'completed', 'failed', 'refunded'], default: 'pending' },
    paymentId:     { type: String },
    paymentMethod: { type: String, enum: ['wallet', 'razorpay'], default: 'wallet' },
    bookingDate:   { type: Date, default: Date.now },

    status:             { type: String, enum: ['active', 'on_hold', 'cancelled'], default: 'active' },
    cancelledAt:        { type: Date },
    cancellationReason: { type: String, default: '' },
    heldAt:             { type: Date },
    holdReason:         { type: String, default: '' }
}, { timestamps: true });

const Booking = mongoose.model('Booking', bookingSchema);
export default Booking;