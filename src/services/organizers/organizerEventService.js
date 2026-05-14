import Event from '../../models/events/event.js';
import Booking from '../../models/payments/booking.js';
import Category from '../../models/categories/category.js';
import AppError from '../../utils/AppError.js';
import HTTP_STATUS from '../../constant/statusCode.js';




// ─── Get Events for Organizer Dashboard ──────────────────────────────────────
export const getOrganizerEvents = async (organizerId, { search = '', status = 'all', sort = 'newest', page = 1, limit = 10 }) => {
    const skip = (parseInt(page) - 1) * limit;

    const query = { organizer: organizerId };
    if (search) query.title = { $regex: search, $options: 'i' };
    if (status === 'blocked') {
        query.isBlocked = true;
    } else if (status !== 'all') {
        query.status = status;
        query.isBlocked = { $ne: true };
    }

    const sortMap = {
        newest:      { createdAt: -1 },
        oldest:      { createdAt: 1 },
        'title-asc': { title: 1 },
    };
    const sortOption = sortMap[sort] || { createdAt: -1 };

    const [events, total] = await Promise.all([
        Event.find(query).populate('category', 'name').sort(sortOption).skip(skip).limit(limit),
        Event.countDocuments(query)
    ]);

    return { events, total, totalPages: Math.ceil(total / limit) };
};

// ─── Get Event View Data ─────────────────────────────────────────────────────
export const getEventViewData = async (eventId, organizerId) => {
    // 1. Fetch the event
    const event = await Event.findOne({ _id: eventId, organizer: organizerId })
        .populate('category', 'name')
        .lean();

    if (!event) {
        return null; // Return null so the controller knows to redirect
    }

    const tickets = event.tickets || [];

    // 2. Fetch the recent bookings
    const bookings = await Booking.find({ event: event._id, status: { $ne: 'cancelled' } })
        .populate('user', 'fullName email profilePic')
        .sort({ bookingDate: -1 }) // Make sure your DB field is 'bookingDate' or 'createdAt'
        .limit(10)
        .lean();

    // 3. Calculate metrics
    const totalRevenue     = bookings.reduce((s, b) => s + b.totalAmount, 0);
    
    // Note: If your bookings now use a 'tickets' array (from cart), you might need to change 
    // b.quantity to b.tickets.reduce((sum, t) => sum + t.quantity, 0). 
    // Kept as b.quantity here to match your original code.
    const totalTicketsSold = bookings.reduce((s, b) => s + (b.quantity || 0), 0); 
    const totalCapacity    = tickets.reduce((s, t) => s + t.capacity, 0);

    return {
        event,
        tickets,
        bookings,
        totalRevenue,
        totalTicketsSold,
        totalCapacity
    };
};


// ─── Get Active Categories for Form Dropdowns ─────────────────────────────────
export const getActiveCategories = async () => {
    return await Category.find({ isActive: true });
};


// ─── Create Event ─────────────────────────────────────────────────────────────
// Tickets are embedded directly — no separate insertMany needed.
export const createEvent = async (organizerId, eventData, bannerUrls, ticketData) => {
    const newEvent = new Event({
        title:       eventData.title,
        description: eventData.description,
        category:    eventData.category,
        location: {
            address: eventData.address,
            lat:     eventData.lat,
            lng:     eventData.lng
        },
        startDate:  eventData.startDate,
        startTime:  eventData.startTime,
        endDate:    eventData.endDate,
        endTime:    eventData.endTime,
        isFeatured: eventData.isFeatured,
        banners:    bannerUrls,
        organizer:  organizerId,
        status:     'pending',
        // Embed tickets; `sold` defaults to 0 per sub-schema
        tickets:    ticketData.map(t => ({
            name:       t.name,
            price:      t.price,
            capacity:   t.capacity,
            maxPerUser: t.maxPerUser,
            sold:       0
        }))
    });

    return await newEvent.save();
};


// ─── Get Event for Edit Page ──────────────────────────────────────────────────
// Tickets are part of the event document, no extra query needed.
export const getEventForEdit = async (eventId, organizerId) => {
    const event = await Event.findOne({ _id: eventId, organizer: organizerId });
    if (!event) throw new AppError('Event not found', HTTP_STATUS.NOT_FOUND);

    // Return event.tickets directly as the "tickets" variable for the edit form
    return { event, tickets: event.tickets };
};


// ─── Update Event ─────────────────────────────────────────────────────────────
// Strategy for tickets on edit:
//   • Keep existing tiers that already have sold > 0 (protect sold-out data).
//   • Remove tiers with sold == 0 that are not in the new list.
//   • Add any brand-new tiers that don't exist yet (matched by name).
export const updateEvent = async (eventId, organizerId, eventData, newBannerFiles, ticketData) => {
    const event = await Event.findOne({ _id: eventId, organizer: organizerId });
    if (!event) throw new AppError('Event not found', HTTP_STATUS.NOT_FOUND);

    event.title       = eventData.title;
    event.description = eventData.description;
    event.category    = eventData.category;
    event.location    = { address: eventData.address, lat: eventData.lat, lng: eventData.lng };
    event.startDate   = eventData.startDate;
    event.startTime   = eventData.startTime;
    event.endDate     = eventData.endDate;
    event.endTime     = eventData.endTime;
    event.isFeatured  = eventData.isFeatured;

    if (newBannerFiles && newBannerFiles.length > 0) {
        const newBanners = newBannerFiles.map(file => file.path);
        event.banners = [...event.banners, ...newBanners].slice(0, 2);
    }

    // Determine which existing tiers are "protected" (have been sold)
    const soldTiers     = event.tickets.filter(t => t.sold > 0);
    const soldTierNames = new Set(soldTiers.map(t => t.name));

    // Build new tier list:
    // 1. All incoming tiers that are NOT already sold (fresh / unsold tiers)
    // 2. Plus all sold tiers that were NOT supplied in new data (keep them intact)
    const incomingNames = new Set(ticketData.map(t => t.name));

    const preservedSoldTiers = soldTiers.filter(t => !incomingNames.has(t.name));

    const freshTiers = ticketData.map(t => {
        // If this name matches a sold tier, update capacity/maxPerUser but keep sold count
        const existingSold = soldTiers.find(s => s.name === t.name);
        if (existingSold) {
            existingSold.price      = t.price;
            existingSold.capacity   = t.capacity;
            existingSold.maxPerUser = t.maxPerUser;
            return existingSold;
        }
        // Brand-new tier
        return { name: t.name, price: t.price, capacity: t.capacity, maxPerUser: t.maxPerUser, sold: 0 };
    });

    event.tickets = [...freshTiers, ...preservedSoldTiers];

    return await event.save();
};


// ─── Delete Event ─────────────────────────────────────────────────────────────
// Embedded tickets are automatically removed when the event is deleted.
export const deleteEvent = async (eventId, organizerId) => {
    const event = await Event.findOne({ _id: eventId, organizer: organizerId });
    if (!event) throw new AppError('Event not found', HTTP_STATUS.NOT_FOUND);

    await event.deleteOne();
};


// ─── Toggle Block Event ───────────────────────────────────────────────────────
export const toggleBlockEvent = async (eventId, organizerId) => {
    const event = await Event.findOne({ _id: eventId, organizer: organizerId });
    if (!event) throw new AppError('Event not found', HTTP_STATUS.NOT_FOUND);

    event.isBlocked = !event.isBlocked;
    await event.save();
    return event;
};


// ─── Resubmit Event for Review ────────────────────────────────────────────────
export const resubmitEvent = async (eventId, organizerId) => {
    const event = await Event.findOne({ _id: eventId, organizer: organizerId });
    if (!event) throw new AppError('Event not found', HTTP_STATUS.NOT_FOUND);

    if (event.status !== 'rejected') {
        throw new AppError('Only rejected events can be resubmitted', HTTP_STATUS.BAD_REQUEST);
    }

    event.status = 'pending';
    await event.save();
    return event;
};
