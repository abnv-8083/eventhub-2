import User from '../../models/users/user.js';
import AppError from '../../utils/AppError.js';
import HTTP_STATUS from '../../constant/statusCode.js';
import { sendNotification } from '../../utils/notify.js';
import * as socketUtil from '../../utils/socket.js';

// Config
const REFERRER_REWARD  = 100; // ₹100 credited to the person who shared the code
const REFEREE_REWARD   = 50;  // ₹50 credited to the new user who used the code


// ─── Generate a Unique Referral Code ────────────────────────────────────────
export const generateUniqueReferralCode = async () => {
    const characters = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // Remove ambiguous chars
    let code;
    let isUnique = false;

    while (!isUnique) {
        code = Array.from({ length: 8 }, () =>
            characters.charAt(Math.floor(Math.random() * characters.length))
        ).join('');

        const existing = await User.findOne({ referralCode: code });
        if (!existing) isUnique = true;
    }
    return code;
};


// ─── Validate Referral Code (called at registration) ─────────────────────────
export const validateReferralCode = async (code) => {
    if (!code) return null;
    const referrer = await User.findOne({ referralCode: code.toUpperCase().trim(), role: 'user' });
    if (!referrer) throw new AppError('Invalid referral code. Please check and try again.', HTTP_STATUS.BAD_REQUEST);
    return referrer;
};


// ─── Grant Referral Rewards (called after new user's FIRST booking) ──────────
export const grantReferralRewards = async (newUserId) => {
    const newUser = await User.findById(newUserId);
    if (!newUser) return;

    // Already rewarded or no referrer
    if (newUser.referralRewardGiven || !newUser.referredBy) return;

    const referrer = await User.findById(newUser.referredBy);
    if (!referrer) return;

    // 1. Credit the NEW USER (referee)
    await User.findByIdAndUpdate(newUserId, {
        $inc: { 'wallet.balance': REFEREE_REWARD },
        $push: { 'wallet.transactions': { type: 'credit', amount: REFEREE_REWARD, description: 'Referral Bonus: Welcome reward for joining via referral!' } },
        $set: { referralRewardGiven: true }
    });

    // 2. Credit the REFERRER
    await User.findByIdAndUpdate(referrer._id, {
        $inc: { 'wallet.balance': REFERRER_REWARD },
        $push: { 'wallet.transactions': { type: 'credit', amount: REFERRER_REWARD, description: `Referral Bonus: ${newUser.fullName} made their first booking using your code!` } }
    });

    // 3. Notify both via socket + DB notification
    const io = socketUtil.getIO();

    // Notify referee (new user)
    const updatedNewUserBal = (newUser.wallet?.balance || 0) + REFEREE_REWARD;
    io.to(String(newUserId).trim()).emit('walletUpdate', {
        newBalance: updatedNewUserBal,
        transaction: { type: 'credit', amount: REFEREE_REWARD, description: `Referral Bonus: Welcome reward!` }
    });
    await sendNotification(
        String(newUserId).trim(),
        `🎁 You earned ₹${REFEREE_REWARD} in your wallet as a referral welcome bonus!`,
        'success'
    );

    // Notify referrer
    const updatedReferrerBal = (referrer.wallet?.balance || 0) + REFERRER_REWARD;
    io.to(String(referrer._id).trim()).emit('walletUpdate', {
        newBalance: updatedReferrerBal,
        transaction: { type: 'credit', amount: REFERRER_REWARD, description: `Referral Bonus: ${newUser.fullName} made their first booking!` }
    });
    await sendNotification(
        String(referrer._id).trim(),
        `🎉 ${newUser.fullName} just made their first booking using your referral code! ₹${REFERRER_REWARD} has been credited to your wallet.`,
        'success'
    );
};


// ─── Get Referral Stats for Profile Page ─────────────────────────────────────
export const getReferralStats = async (userId) => {
    const user = await User.findById(userId).select('referralCode referredBy referralRewardGiven fullName');
    if (!user) throw new AppError('User not found', HTTP_STATUS.NOT_FOUND);

    // Generate referral code for existing/Google users who lack one
    if (!user.referralCode) {
        user.referralCode = await generateUniqueReferralCode();
        await user.save();
    }

    // Count how many users have been referred by this user
    const totalReferrals = await User.countDocuments({ referredBy: userId });

    // Count how many have completed their first booking (i.e. rewarded)
    const rewardedReferrals = await User.countDocuments({ referredBy: userId, referralRewardGiven: true });

    // Total earned from referrals
    const totalEarned = rewardedReferrals * REFERRER_REWARD;

    return {
        referralCode: user.referralCode,
        referrerReward: REFERRER_REWARD,
        refereeReward: REFEREE_REWARD,
        totalReferrals,
        rewardedReferrals,
        totalEarned
    };
};
