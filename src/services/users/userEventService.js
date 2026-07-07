import Event from '../../models/events/event.js';
import { EVENT_CATEGORIES, getCategoryName } from '../../constant/categories.js';
import User from '../../models/users/user.js';
import Platform from '../../models/admin/platform.js';
import AppError from '../../utils/AppError.js';
import HTTP_STATUS from '../../constant/statusCode.js';


// ─── Get Featured Events for Homepage ─────────────────────────────────────────
export const getFeaturedEvents = async (userId) => {
    const events = await Event.find({ status: { $in: ['approved', 'published'] }, isBlocked: false, deleted: { $ne: true } })
        .populate('organizer', 'fullName')
        .sort({ isFeatured: -1, createdAt: -1 })
        .limit(4);

    const eventsWithMeta = events.map(ev => {
        const tickets = ev.tickets || [];
        const minPrice = tickets.length ? Math.min(...tickets.map(t => t.price)) : 0;
        const hasAvailability = tickets.some(t => t.sold < t.capacity);
        return { ...ev.toObject(), category: { name: getCategoryName(ev.category) }, minPrice, hasAvailability };
    });

    let wishlistIds = new Set();
    if (userId) {
        const u = await User.findById(userId).select('wishlist');
        wishlistIds = new Set((u?.wishlist || []).map(id => id.toString()));
    }

    return eventsWithMeta.map(ev => ({
        ...ev,
        isWishlisted: wishlistIds.has(ev._id.toString())
    }));
};

// ─── Get Latest Events for Homepage ─────────────────────────────────────────
export const getLatestEvents = async (userId) => {
    const events = await Event.find({ status: { $in: ['approved', 'published'] }, isBlocked: false, deleted: { $ne: true } })
        .populate('organizer', 'fullName')
        .sort({ createdAt: -1 }) // strictly by newest
        .limit(5);

    const eventsWithMeta = events.map(ev => {
        const tickets = ev.tickets || [];
        const minPrice = tickets.length ? Math.min(...tickets.map(t => t.price)) : 0;
        const hasAvailability = tickets.some(t => t.sold < t.capacity);
        return { ...ev.toObject(), category: { name: getCategoryName(ev.category) }, minPrice, hasAvailability };
    });

    let wishlistIds = new Set();
    if (userId) {
        const u = await User.findById(userId).select('wishlist');
        wishlistIds = new Set((u?.wishlist || []).map(id => id.toString()));
    }

    return eventsWithMeta.map(ev => ({
        ...ev,
        isWishlisted: wishlistIds.has(ev._id.toString())
    }));
};

// ─── Browse Events ────────────────────────────────────────────────────────────
export const browseEvents = async (userId, { search = '', category = 'all', sort = 'newest', page = 1, limit = 12, priceRange = 'all', dateRange = 'all' }) => {
    const skip = (parseInt(page) - 1) * limit;

    const query = { status: { $in: ['approved', 'published'] }, isBlocked: false, deleted: { $ne: true } };
    if (search) query.title = { $regex: search, $options: 'i' };
    if (category !== 'all') query.category = category;

    // Price Filter
    if (priceRange !== 'all') {
        if (priceRange === 'free') {
            query.tickets = { $elemMatch: { price: 0 } };
        } else if (priceRange === 'under500') {
            query.tickets = { $elemMatch: { price: { $lte: 500 } } };
        } else if (priceRange === '500-2000') {
            query.tickets = { $elemMatch: { price: { $gte: 500, $lte: 2000 } } };
        } else if (priceRange === 'above2000') {
            query.tickets = { $elemMatch: { price: { $gte: 2000 } } };
        }
    }

    // Date Filter
    if (dateRange !== 'all') {
        const now = new Date();
        if (dateRange === 'today') {
            const endOfDay = new Date(now);
            endOfDay.setHours(23, 59, 59, 999);
            query.startDate = { $gte: now, $lte: endOfDay };
        } else if (dateRange === 'weekend') {
            const dayOfWeek = now.getDay();
            const daysUntilFriday = dayOfWeek <= 5 ? 5 - dayOfWeek : 6;
            const thisFriday = new Date(now);
            thisFriday.setDate(now.getDate() + daysUntilFriday);
            thisFriday.setHours(0, 0, 0, 0);

            const thisSunday = new Date(thisFriday);
            thisSunday.setDate(thisFriday.getDate() + 2);
            thisSunday.setHours(23, 59, 59, 999);

            query.startDate = { $gte: thisFriday, $lte: thisSunday };
        } else if (dateRange === 'month') {
            const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
            query.startDate = { $gte: now, $lte: endOfMonth };
        }
    }

    const sortMap = {
        newest: { createdAt: -1 },
        oldest: { createdAt: 1 },
        'date-asc': { startDate: 1 },
        'date-desc': { startDate: -1 },
        'price-asc': { 'tickets.price': 1 },
        'price-desc': { 'tickets.price': -1 },
    };
    const sortOption = sortMap[sort] || { createdAt: -1 };

    const [events, total, platform] = await Promise.all([
        Event.find(query)
            .populate('organizer', 'fullName')
            .sort(sortOption)
            .skip(skip)
            .limit(limit),
        Event.countDocuments(query),
        Platform.findOne().lean()
    ]);

    const blocked = (platform || {}).blockedCategories || [];
    const categories = EVENT_CATEGORIES.filter(c => !blocked.includes(c.id));

    // Attach ticket info (min price, availability) — tickets are embedded in the event
    const eventsWithMeta = events.map(ev => {
        const tickets = ev.tickets || [];
        const minPrice = tickets.length ? Math.min(...tickets.map(t => t.price)) : 0;
        const hasAvailability = tickets.some(t => t.sold < t.capacity);
        return { ...ev.toObject(), category: { name: getCategoryName(ev.category) }, minPrice, hasAvailability };
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
export const getEventById = async (eventId, userId) => {
    const event = await Event.findOne({ _id: eventId, status: { $in: ['approved', 'published'] }, isBlocked: false, deleted: { $ne: true } })
        .populate('organizer', 'fullName organizationName')
        .lean();

    if (event) {
        event.category = { name: getCategoryName(event.category) };
    }

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
export const getEventDetail = getEventById;


// ─── Get Buy Tickets Page Data ────────────────────────────────────────────────
export const getBuyTicketsData = async (eventId) => {
    const event = await Event.findOne({ _id: eventId, status: { $in: ['approved', 'published'] }, isBlocked: false, deleted: { $ne: true } })
        .populate('organizer', 'fullName organizationName')
        .lean();

    if (event) {
        event.category = { name: getCategoryName(event.category) };
    }

    if (!event) throw new AppError('Event not found', HTTP_STATUS.NOT_FOUND);

    // Compute remaining capacity for display (capacity - sold)
    const tickets = (event.tickets || []).map(t => ({
        _id: t._id,
        name: t.name,
        price: t.price,
        maxPerUser: t.maxPerUser,
        capacity: t.capacity - t.sold  // ← available seats shown to the user
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
        match: { status: { $in: ['approved', 'published'] }, isBlocked: false },
        populate: [
            { path: 'organizer', select: 'fullName' }
        ]
    });

    const events = (user.wishlist || []).map(ev => {
        if (!ev) return null;
        const tickets = ev.tickets || [];
        const minPrice = tickets.length ? Math.min(...tickets.map(t => t.price)) : 0;
        return { ...ev.toObject(), category: { name: getCategoryName(ev.category) }, minPrice };
    });

    return events.filter(Boolean);
};

