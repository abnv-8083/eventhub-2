import Booking from '../../models/payments/booking.model.js';
import User from '../../models/users/user.model.js';
import AppError from '../../utils/AppError.js';
import HTTP_STATUS from '../../constant/statusCode.js';
import { PAYMENT_STATUS } from '../../constant/paymentConstants.js';


// ─── User Dashboard Stats ─────────────────────────────────────────────────────
export const getDashboardData = async (userId) => {
    const now = new Date();

    const allBookings = await Booking.find({ user: userId, paymentStatus: PAYMENT_STATUS.COMPLETED })
        .populate({ path: 'event', populate: { path: 'category', select: 'name' } })
        .sort({ createdAt: -1 });

    const upcomingBookings = allBookings.filter(b => b.event && new Date(b.event.startDate) >= now);
    const totalTickets     = allBookings.reduce((sum, b) => sum + (b.tickets ? b.tickets.reduce((acc, t) => acc + (t.quantity || 0), 0) : (b.quantity || 0)), 0);

    const nextBooking = [...upcomingBookings].sort(
        (a, b) => new Date(a.event.startDate) - new Date(b.event.startDate)
    )[0] || null;

    const calendarEvents = allBookings.map(b => ({
        title: b.event?.title || 'Unknown Event',
        start: b.event?.startDate || new Date(),
        url: `/user/tickets/${b._id}`,
        backgroundColor: b.status === 'active' ? '#4361ee' : (b.status === 'on_hold' ? '#f39c12' : '#e63946'),
        borderColor: 'transparent'
    }));

    return { upcomingCount: upcomingBookings.length, totalTickets, nextBooking, calendarEvents };
};


// ─── Generate AI Avatar ───────────────────────────────────────────────────────
export const generateAIAvatar = async (prompt) => {
    if (!prompt) throw new AppError('Prompt is required', HTTP_STATUS.BAD_REQUEST);

    const enhancedPrompt = `${prompt}, highly detailed digital art, avatar portrait, centered, clean background, 4k`;
    const randomSeed     = Math.floor(Math.random() * 1000000);
    const aiUrl          = `https://image.pollinations.ai/prompt/${encodeURIComponent(enhancedPrompt)}?width=500&height=500&nologo=true&seed=${randomSeed}`;

    const fetchResponse = await fetch(aiUrl);
    if (!fetchResponse.ok) throw new Error(`Pollinations API Error: ${fetchResponse.status}`);

    const arrayBuffer = await fetchResponse.arrayBuffer();
    return Buffer.from(arrayBuffer);
};
