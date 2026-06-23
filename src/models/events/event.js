// src/models/events/event.js
import mongoose from 'mongoose';

// ─── Embedded Ticket Sub-Schema ───────────────────────────────────────────────
// Each ticket tier lives inside the event document.
// Mongoose automatically assigns a unique _id to every sub-document,
// which we use as the ticketId throughout the booking flow.
const ticketSubSchema = new mongoose.Schema({
    name:       { type: String, required: true, trim: true },
    price:      { type: Number, required: true, min: 0 },
    capacity:   { type: Number, required: true, min: 1 },
    maxPerUser: { type: Number, required: true, min: 1 },
    sold:       { type: Number, default: 0 },
    
    // ── NEW: Tells the stadium map which side this ticket belongs to ──
    stadiumSide: { 
        type: String, 
        enum: ['north', 'south', 'east', 'west', 'general'], 
        default: 'general' 
    }
}, { _id: true });   // _id: true is the default; kept explicit for clarity


// ─── Event Schema ─────────────────────────────────────────────────────────────
const eventSchema = new mongoose.Schema({
    title:       { type: String, required: true, trim: true },
    description: { type: String, required: function() { return this.status !== 'draft'; } },
    category:    { type: String, required: function() { return this.status !== 'draft'; } },

    location: {
        address: { type: String, required: function() { return this.status !== 'draft'; } },
        lat:     { type: Number, required: function() { return this.status !== 'draft'; } },
        lng:     { type: Number, required: function() { return this.status !== 'draft'; } }
    },

    startDate: { type: Date,   required: function() { return this.status !== 'draft'; } },
    startTime: { type: String, required: function() { return this.status !== 'draft'; } },
    endDate:   { type: Date,   required: function() { return this.status !== 'draft'; } },
    endTime:   { type: String, required: function() { return this.status !== 'draft'; } },

    banners: {
        type: [String],
        validate: [arrayLimit, 'You can only upload up to 2 banners']
    },

    // ── Defines the overall shape of the stadium map ──
    venueLayout: { 
        type: String, 
        enum: ['standard', 'stadium-2', 'stadium-3', 'stadium-4'], 
        default: 'standard' 
    },

    // ── Embedded ticket tiers ────────────────────────────────────────────────
    tickets: { type: [ticketSubSchema], default: [] },

    isFeatured: { type: Boolean, default: false },
    dateChanged: { type: Boolean, default: false },
    organizer:  { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },

    status:    { type: String, enum: ['draft', 'pending', 'approved', 'rejected', 'inactive'], default: 'draft' },
    isBlocked: { type: Boolean, default: false }
}, { timestamps: true });


function arrayLimit(val) {
    return val.length <= 2;
}

const Event = mongoose.model('Event', eventSchema);
export default Event;