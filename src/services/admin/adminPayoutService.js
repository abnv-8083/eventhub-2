import Payout from '../../models/payments/payout.js';
import AppError from '../../utils/AppError.js';
import HTTP_STATUS from '../../constant/statusCode.js';
import { sendNotification } from '../../utils/notify.js';


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


import User from '../../models/users/user.js';

// ─── Approve Payout & Notify Organizer ──────────────────────────────────────
export const approvePayout = async (payoutId) => {
    const payout = await Payout.findById(payoutId).populate('organizer').populate('event');
    if (!payout) throw new AppError('Payout not found', HTTP_STATUS.NOT_FOUND);
    if (payout.status === 'paid') throw new AppError('Payout already paid', HTTP_STATUS.BAD_REQUEST);

    payout.status = 'paid';
    await payout.save();

    const organizerId = String(payout.organizer._id).trim();
    
    // Credit the organizer's wallet atomically
    await User.findByIdAndUpdate(organizerId, {
        $inc: { 'wallet.balance': payout.payoutAmount },
        $push: {
            'wallet.transactions': {
                type: 'credit',
                amount: payout.payoutAmount,
                description: `Event Payout for "${payout.event.title}"`
            }
        }
    });

    // Notify organizer — saves DB record + emits 'bookingStatusUpdate' via notify.js
    const netFormatted = payout.payoutAmount.toLocaleString('en-IN', { minimumFractionDigits: 2 });
    await sendNotification(
        organizerId,
        `✅ Payout of ₹${netFormatted} for "${payout.event.title}" has been approved and credited to your wallet!`,
        'success'
    );

    return payout;
};


// ─── Reject Payout ────────────────────────────────────────────────────────────
export const rejectPayout = async (payoutId, reason) => {
    const payout = await Payout.findById(payoutId).populate('organizer').populate('event');
    if (!payout) throw new AppError('Payout not found', HTTP_STATUS.NOT_FOUND);
    if (payout.status !== 'pending') throw new AppError('Only pending payouts can be rejected', HTTP_STATUS.BAD_REQUEST);

    payout.status = 'rejected';
    await payout.save();

    // Notify organizer
    const organizerId = String(payout.organizer._id).trim();
    const rejectionNote = reason ? ` Reason: ${reason}` : '';
    await sendNotification(
        organizerId,
        `⚠️ Your payout request for "${payout.event.title}" was rejected.${rejectionNote} Please contact support.`,
        'danger'
    );

    return payout;
};
