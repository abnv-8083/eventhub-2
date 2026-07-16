import * as referralService from '../../services/users/referral.service.js';
import HTTP_STATUS from '../../constant/statusCode.js';


// ─── Get Referral Dashboard Data ─────────────────────────────────────────────
export const getReferralPage = async (req, res, next) => {
    try {
        const stats = await referralService.getReferralStats(req.session.user._id);
        const baseUrl = `${req.protocol}://${req.get('host')}`;
        const referralLink = `${baseUrl}/user/signup?ref=${stats.referralCode}`;

        res.render('users/referral', {
            title: 'Refer & Earn',
            ...stats,
            referralLink
        });
    } catch (error) {
        next(error);
    }
};


// ─── Validate Referral Code (AJAX) ───────────────────────────────────────────
export const validateReferralCode = async (req, res, next) => {
    try {
        const { code } = req.body;
        const referrer = await referralService.validateReferralCode(code);
        res.json({ success: true, message: `Valid code! You'll earn ₹50 wallet bonus after your first booking.`, referrerName: referrer.fullName });
    } catch (error) {
        res.status(HTTP_STATUS.BAD_REQUEST).json({ success: false, message: error.message });
    }
};
