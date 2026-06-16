import HTTP_STATUS from '../../constant/statusCode.js';
import * as userEventService from '../../services/users/userEventService.js';


// ─── Browse Events ────────────────────────────────────────────────────────────
export const getBrowseEvents = async (req, res, next) => {
    try {
        const { search = '', category = 'all', sort = 'newest', page = 1, priceRange = 'all', dateRange = 'all' } = req.query;
        const userId = req.session.user?._id || null;

        const { events, categories, total, totalPages } = await userEventService.browseEvents(
            userId, { search, category, sort, page, priceRange, dateRange }
        );

        res.render('users/events/browse', {
            title: 'Browse Events',
            events,
            categories,
            filters: { search, category, sort, priceRange, dateRange },
            totalPages,
            currentPage: parseInt(page),
            total,
            isLoggedIn: !!req.session.user
        });
    } catch (error) {
        next(error);
    }
};


// ─── Event Detail ─────────────────────────────────────────────────────────────
export const getEventDetail = async (req, res, next) => {
    try {
        const userId = req.session.user?._id || null;
        const { event, tickets, isWishlisted } = await userEventService.getEventDetail(req.params.id, userId);
        res.render('users/events/detail', { title: event.title, event, tickets, isWishlisted });
    } catch (error) {
        next(error);
    }
};


// ─── Buy Tickets Page ─────────────────────────────────────────────────────────
export const getBuyTicketsPage = async (req, res, next) => {
    try {
        const { event, tickets } = await userEventService.getBuyTicketsData(req.params.id);
        res.render('users/events/buy-tickets', { title: `Buy Tickets - ${event.title}`, event, tickets });
    } catch (error) {
        next(error);
    }
};


// ─── Toggle Wishlist ──────────────────────────────────────────────────────────
export const toggleWishlist = async (req, res, next) => {
    try {
        const { wishlisted } = await userEventService.toggleWishlist(req.session.user._id, req.params.id);
        res.json({
            success: true,
            wishlisted,
            message: wishlisted ? 'Added to wishlist' : 'Removed from wishlist'
        });
    } catch (error) {
        next(error);
    }
};


// ─── Wishlist Page ────────────────────────────────────────────────────────────
export const getWishlistPage = async (req, res, next) => {
    try {
        const events = await userEventService.getWishlist(req.session.user._id);
        res.render('users/wishlist', { title: 'My Wishlist', events });
    } catch (error) {
        next(error);
    }
};

