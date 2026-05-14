import Event from '../../models/events/event.js';
import Category from '../../models/categories/category.js';
import User from '../../models/users/user.js';
import AppError from '../../utils/AppError.js';
import HTTP_STATUS from '../../constant/statusCode.js';


// ─── Browse Events ────────────────────────────────────────────────────────────
export const browseEvents = async (userId, { search = '', category = 'all', sort = 'newest', page = 1, limit = 12 }) => {
    const skip = (parseInt(page) - 1) * limit;

    const query = { status: 'approved', isBlocked: false };
    if (search)           query.title    = { $regex: search, $options: 'i' };
    if (category !== 'all') query.category = category;

    const sortMap = {
        newest:     { createdAt: -1 },
        oldest:     { createdAt: 1 },
        'date-asc': { startDate: 1 },
    };
    const sortOption = sortMap[sort] || { createdAt: -1 };

    const [events, total, categories] = await Promise.all([
        Event.find(query)
            .populate('category', 'name')
            .populate('organizer', 'fullName')
            .sort(sortOption)
            .skip(skip)
            .limit(limit),
        Event.countDocuments(query),
        Category.find({ isActive: true })
    ]);

    // Attach ticket info (min price, availability) — tickets are embedded in the event
    const eventsWithMeta = events.map(ev => {
        const tickets      = ev.tickets || [];
        const minPrice     = tickets.length ? Math.min(...tickets.map(t => t.price)) : 0;
        const hasAvailability = tickets.some(t => t.sold < t.capacity);
        return { ...ev.toObject(), minPrice, hasAvailability };
    });

    // Attach wishlist flags
    let wishlistIds = new Set();
    if (userId) {
        const u = await User.findById(userId).select('wishlist');
        wishlistIds = new Set((u?.wishlist || []).map(id => id.toString()));
    }

    const eventsWithWishlist = eventsWithMeta.map(ev => ({
        ...ev,
        isWishlisted: wishlistIds.has(ev._id.toString())
    }));

    return { events: eventsWithWishlist, categories, total, totalPages: Math.ceil(total / limit) };
};


// ─── Get Event Detail ─────────────────────────────────────────────────────────
export const getEventDetail = async (eventId, userId) => {
    const event = await Event.findOne({ _id: eventId, status: 'approved', isBlocked: false })
        .populate('category', 'name')
        .populate('organizer', 'fullName organizationName');

    if (!event) throw new AppError('Event not found', HTTP_STATUS.NOT_FOUND);

    // Tickets live inside event.tickets — expose them separately for the view
    const tickets = event.tickets || [];

    let isWishlisted = false;
    if (userId) {
        const user = await User.findById(userId).select('wishlist');
        isWishlisted = user.wishlist.some(wId => wId.toString() === eventId);
    }

    return { event, tickets, isWishlisted };
};


// ─── Get Buy Tickets Page Data ────────────────────────────────────────────────
export const getBuyTicketsData = async (eventId) => {
    const event = await Event.findOne({ _id: eventId, status: 'approved', isBlocked: false })
        .populate('category', 'name')
        .populate('organizer', 'fullName organizationName');

    if (!event) throw new AppError('Event not found', HTTP_STATUS.NOT_FOUND);

    // Compute remaining capacity for display (capacity - sold)
    const tickets = (event.tickets || []).map(t => ({
        _id:        t._id,
        name:       t.name,
        price:      t.price,
        maxPerUser: t.maxPerUser,
        capacity:   t.capacity - t.sold  // ← available seats shown to the user
    }));

    return { event, tickets };
};


// ─── Toggle Wishlist ──────────────────────────────────────────────────────────
export const toggleWishlist = async (userId, eventId) => {
    const user = await User.findById(userId).select('wishlist');
    const isAlreadyWishlisted = user.wishlist.some(wId => wId.toString() === eventId);

    if (isAlreadyWishlisted) {
        user.wishlist = user.wishlist.filter(wId => wId.toString() !== eventId);
    } else {
        user.wishlist.push(eventId);
    }

    await user.save();
    return { wishlisted: !isAlreadyWishlisted };
};


// ─── Get Wishlist Page ────────────────────────────────────────────────────────
export const getWishlist = async (userId) => {
    const user = await User.findById(userId).populate({
        path: 'wishlist',
        match: { status: 'approved', isBlocked: false },
        populate: [
            { path: 'category',  select: 'name' },
            { path: 'organizer', select: 'fullName' }
        ]
    });

    const events = (user.wishlist || []).map(ev => {
        if (!ev) return null;
        const tickets  = ev.tickets || [];
        const minPrice = tickets.length ? Math.min(...tickets.map(t => t.price)) : 0;
        return { ...ev.toObject(), minPrice };
    });

    return events.filter(Boolean);
};
