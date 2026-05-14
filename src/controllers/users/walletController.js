import HTTP_STATUS from '../../constant/statusCode.js';
import * as walletService from '../../services/users/walletService.js';


// ─── Wallet Page ──────────────────────────────────────────────────────────────
export const getWalletPage = async (req, res, next) => {
    try {
        const data = await walletService.getWalletData(req.session.user._id);
        res.render('users/wallet', {
            title: 'My Wallet',
            ...data,
            userEmail: req.session.user.email
        });
    } catch (error) {
        next(error);
    }
};


// ─── Create Razorpay Order for Top-up ────────────────────────────────────────
export const createWalletOrder = async (req, res, next) => {
    try {
        const { order, amount } = await walletService.createTopupOrder(req.body.amount);
        res.json({ success: true, order, amount });
    } catch (error) {
        next(error);
    }
};


// ─── Verify Payment & Credit Wallet ──────────────────────────────────────────
export const verifyWalletTopup = async (req, res, next) => {
    try {
        const result = await walletService.verifyAndCreditWallet(req.session.user._id, req.body);
        res.json({ success: true, ...result });
    } catch (error) {
        next(error);
    }
};


// ─── Top-up Success Page ──────────────────────────────────────────────────────
export const getTopupSuccess = (req, res) => {
    const { amount, balance, paymentId } = req.query;
    res.render('users/wallet-success', {
        title: 'Top-up Successful',
        amount: parseFloat(amount) || 0,
        balance: parseFloat(balance) || 0,
        paymentId: paymentId || ''
    });
};


// ─── Top-up Failed Page ───────────────────────────────────────────────────────
export const getTopupFailed = (req, res) => {
    const reason = req.query.reason || 'Your payment could not be processed.';
    res.render('users/wallet-failed', { title: 'Top-up Failed', reason });
};
