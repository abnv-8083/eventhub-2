// src/models/events/event.js
import mongoose from 'mongoose';

// ─── Embedded Ticket Sub-Schema ───────────────────────────────────────────────
// Each ticket tier lives inside the event document.
const ticketSubSchema = new mongoose.Schema({
    name:        { type: String, required: true, trim: true },
    price:       { type: Number, required: true, min: 0 },
    capacity:    { type: Number, required: true, min: 1 },
    maxPerUser:  { type: Number, required: true, min: 1 },
    minPerUser:  { type: Number, default: 1, min: 1 },
    sold:        { type: Number, default: 0 },
    saleStart:   { type: Date },
    saleEnd:     { type: Date },
    description: { type: String, trim: true },
    refundable:  { type: Boolean, default: false },
    seatType:    { type: String, enum: ['unreserved', 'reserved', 'standing', 'vip', 'balcony', 'box', 'general'], default: 'general' },
    colourBadge: { type: String, default: '#E63946' },
    benefits:    { type: [String], default: [] },
    stadiumSide: { 
        type: String, 
        enum: ['north', 'south', 'east', 'west', 'general'], 
        default: 'general' 
    }
}, { _id: true });

// ─── Embedded Schedule Sub-Schema ─────────────────────────────────────────────
const scheduleSubSchema = new mongoose.Schema({
    date:          { type: Date },
    startTime:     { type: String },
    endTime:       { type: String },
    doorsOpenTime: { type: String },
    lastEntryTime: { type: String },
    scheduleType:  { type: String, enum: ['single', 'multi', 'recurring'], default: 'single' }
}, { _id: true });

// ─── Event Schema ─────────────────────────────────────────────────────────────
const eventSchema = new mongoose.Schema({
    title:          { type: String, required: true, trim: true },
    description:    { type: String, required: function() { return this.status !== 'draft'; } },
    category:       { type: String, required: function() { return this.status !== 'draft'; } },
    subcategory:    { type: String, trim: true },
    language:       { type: String, trim: true, default: 'English' },
    ageRestriction: { type: String, enum: ['All Ages', '13+', '16+', '18+', '21+'], default: 'All Ages' },
    tags:           { type: [String], default: [] },
    shortSummary:   { type: String, trim: true },
    visibility:     { type: String, enum: ['public', 'private', 'unlisted'], default: 'public' },

    location: {
        isOnline:             { type: Boolean, default: false },
        onlinePlatform:       { type: String, enum: ['Zoom', 'Google Meet', 'YouTube Live', 'Custom Link', null], default: null },
        onlineLink:           { type: String, trim: true },
        venueName:            { type: String, trim: true },
        address:              { type: String, required: function() { return this.status !== 'draft' && !this.location?.isOnline; } },
        landmark:             { type: String, trim: true },
        city:                 { type: String, trim: true },
        state:                { type: String, trim: true },
        pincode:              { type: String, trim: true },
        lat:                  { type: Number, required: function() { return this.status !== 'draft' && !this.location?.isOnline; } },
        lng:                  { type: Number, required: function() { return this.status !== 'draft' && !this.location?.isOnline; } },
        parkingAvailable:     { type: Boolean, default: false },
        wheelchairAccessible: { type: Boolean, default: false }
    },

    startDate: { type: Date,   required: function() { return this.status !== 'draft'; } },
    startTime: { type: String, required: function() { return this.status !== 'draft'; } },
    endDate:   { type: Date,   required: function() { return this.status !== 'draft'; } },
    endTime:   { type: String, required: function() { return this.status !== 'draft'; } },
    schedule:  { type: [scheduleSubSchema], default: [] },

    banners: {
        type: [String],
        validate: [arrayLimit, 'You can only upload up to 2 banners']
    },
    thumbnail:     { type: String },
    galleryImages: { type: [String], default: [] },
    promoVideo:    { type: String, trim: true },

    // ── Rich Text & Sections ──
    aboutEvent:      { type: String },
    agenda:          { type: String },
    artists:         { type: String },
    guests:          { type: String },
    faqs:            { type: String },
    thingsToCarry:   { type: String },
    notAllowedItems: { type: String },

    // ── Organizer Information Override ──
    organizerInfo: {
        name:         { type: String, trim: true },
        logo:         { type: String },
        email:        { type: String, trim: true },
        phone:        { type: String, trim: true },
        website:      { type: String, trim: true },
        instagram:    { type: String, trim: true },
        facebook:     { type: String, trim: true },
        twitter:      { type: String, trim: true },
        supportEmail: { type: String, trim: true },
        supportPhone: { type: String, trim: true }
    },

    // ── Policies ──
    policies: {
        cancellation:       { type: String, enum: ['no_refund', 'partial', '100_before_48'], default: 'no_refund' },
        terms:              { type: String },
        privacyPolicy:      { type: String },
        covidGuidelines:    { type: String },
        photographyConsent: { type: Boolean, default: true },
        foodPolicy:         { type: String },
        parkingPolicy:      { type: String },
        childrenPolicy:     { type: String }
    },

    venueLayout: { 
        type: String, 
        enum: ['standard', 'stadium-2', 'stadium-3', 'stadium-4'], 
        default: 'standard' 
    },

    tickets: { type: [ticketSubSchema], default: [] },

    isFeatured: { type: Boolean, default: false },
    postStartRegistrationLimit: { type: Number, min: 0, default: null },
    organizer:  { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },

    status: { 
        type: String, 
        enum: ['draft', 'pending', 'under_review', 'changes_requested', 'approved', 'scheduled', 'published', 'sales_closed', 'completed', 'archived', 'rejected', 'inactive', 'cancelled'], 
        default: 'draft' 
    },
    isBlocked: { type: Boolean, default: false }
}, { timestamps: true });


function arrayLimit(val) {
    return val.length <= 2;
}

const Event = mongoose.model('Event', eventSchema);
export default Event;