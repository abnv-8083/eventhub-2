import Razorpay from 'razorpay';
import crypto from 'crypto';
import User from '../../models/users/user.js';
import AppError from '../../utils/AppError.js';
import HTTP_STATUS from '../../constant/statusCode.js';
import * as socketUtil from '../../utils/socket.js';

const razorpay = new Razorpay({
    key_id: process.env.RAZORPAY_KEY_ID,
    key_secret: process.env.RAZORPAY_KEY_SECRET
});


// ─── Get Wallet Page Data ─────────────────────────────────────────────────────
export const getWalletData = async (userId) => {
    const user = await User.findById(userId).select('wallet fullName');
    const transactions = [...(user.wallet?.transactions || [])].reverse();

    return {
        balance: user.wallet?.balance || 0,
        transactions,
        userName: user.fullName,
        razorpayKeyId: process.env.RAZORPAY_KEY_ID
    };
};


// ─── Create Razorpay Order for Top-up ────────────────────────────────────────
export const createTopupOrder = async (amount) => {
    const parsedAmount = parseFloat(amount);

    if (!parsedAmount || parsedAmount <= 0)
        throw new AppError('Enter a valid amount', HTTP_STATUS.BAD_REQUEST);
    if (parsedAmount > 50000)
        throw new AppError('Maximum ₹50,000 per transaction', HTTP_STATUS.BAD_REQUEST);

    const order = await razorpay.orders.create({
        amount: Math.round(parsedAmount * 100),
        currency: 'INR',
        receipt: `wallet_${Date.now()}`
    });

    return { order, amount: parsedAmount };
};


// ─── Verify Payment & Credit Wallet ──────────────────────────────────────────
export const verifyAndCreditWallet = async (userId, { razorpay_order_id, razorpay_payment_id, razorpay_signature, amount }) => {
    const expected = crypto
        .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET)
        .update(razorpay_order_id + '|' + razorpay_payment_id)
        .digest('hex');

    if (expected !== razorpay_signature)
        throw new AppError('Payment verification failed', HTTP_STATUS.BAD_REQUEST);

    const parsedAmount = parseFloat(amount);
    const updatedUser = await User.findByIdAndUpdate(userId, {
        $inc: { 'wallet.balance': parsedAmount },
        $push: {
            'wallet.transactions': {
                type: 'credit',
                amount: parsedAmount,
                description: 'Money added to wallet'
            }
        }
    }, { new: true });

    if (!updatedUser) {
        throw new AppError('User not found.', HTTP_STATUS.NOT_FOUND);
    }

    const io = socketUtil.getIO();
    io.to(String(userId).trim()).emit('walletUpdate', {
        newBalance: updatedUser.wallet.balance,
        transaction: {
            type: 'credit',
            amount: parsedAmount,
            description: 'Money added to wallet'
        }
    });

    return {
        message: `₹${parsedAmount.toLocaleString('en-IN')} added to wallet!`,
        newBalance: updatedUser.wallet.balance,
        paymentId: razorpay_payment_id
    };
};
