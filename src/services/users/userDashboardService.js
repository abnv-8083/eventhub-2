import Booking from '../../models/payments/booking.js';
import User from '../../models/users/user.js';
import AppError from '../../utils/AppError.js';
import HTTP_STATUS from '../../constant/statusCode.js';


// ─── User Dashboard Stats ─────────────────────────────────────────────────────
export const getDashboardData = async (userId) => {
    const now = new Date();

    const allBookings = await Booking.find({ user: userId, paymentStatus: 'completed' })
        .populate({ path: 'event', populate: { path: 'category', select: 'name' } })
        .sort({ createdAt: -1 });

    const upcomingBookings = allBookings.filter(b => b.event && new Date(b.event.startDate) >= now);
    const totalTickets     = allBookings.reduce((sum, b) => sum + b.quantity, 0);

    const nextBooking = [...upcomingBookings].sort(
        (a, b) => new Date(a.event.startDate) - new Date(b.event.startDate)
    )[0] || null;

    return { upcomingCount: upcomingBookings.length, totalTickets, nextBooking };
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
