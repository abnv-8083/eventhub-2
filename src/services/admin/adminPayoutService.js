import Payout from '../../models/payments/payout.js';
import AppError from '../../utils/AppError.js';
import HTTP_STATUS from '../../constant/statusCode.js';
import { getIO } from '../../utils/socket.js';


// ─── Get Payouts (Filtered, Sorted, Paginated) ───────────────────────────────
export const getPayouts = async ({ search = '', status = 'all', sort = 'newest', page = 1, limit = 10 }) => {
    const skip = (parseInt(page) - 1) * limit;

    const sortMap = {
        newest:       { createdAt: -1 },
        oldest:       { createdAt: 1 },
        'amount-high': { payoutAmount: -1 },
        'amount-low':  { payoutAmount: 1 },
    };
    const sortOption = sortMap[sort] || { createdAt: -1 };

    let allPayouts = await Payout.find()
        .populate('organizer', 'fullName email')
        .populate('event', 'title')
        .sort(sortOption);

    if (status !== 'all') {
        allPayouts = allPayouts.filter(p => p.status === status);
    }

    if (search) {
        const s = search.toLowerCase();
        allPayouts = allPayouts.filter(p =>
            p.organizer?.fullName?.toLowerCase().includes(s) ||
            p.event?.title?.toLowerCase().includes(s) ||
            p.organizer?.email?.toLowerCase().includes(s)
        );
    }

    const total = allPayouts.length;
    const totalPages = Math.ceil(total / limit);

    return { payouts: allPayouts.slice(skip, skip + limit), total, totalPages };
};


// ─── Approve Payout & Notify Organizer ──────────────────────────────────────
export const approvePayout = async (payoutId) => {
    const payout = await Payout.findById(payoutId).populate('organizer').populate('event');
    if (!payout) throw new AppError('Payout not found', HTTP_STATUS.NOT_FOUND);
    if (payout.status === 'paid') throw new AppError('Payout already paid', HTTP_STATUS.BAD_REQUEST);

    payout.status = 'paid';
    await payout.save();

    // Notify organizer in real-time
    const io = getIO();
    io.to(payout.organizer._id.toString()).emit('notification', {
        type: 'payout_status',
        message: `Your payout of ₹${payout.payoutAmount} for event "${payout.event.title}" has been processed.`
    });

    return payout;
};
