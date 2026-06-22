// src/services/organizers/organizerCouponService.js
import Coupon from '../../models/payments/coupon.js';
import AppError from '../../utils/AppError.js';
import HTTP_STATUS from '../../constant/statusCode.js';

// ─── Fetch All Coupons for an Event ─────────────────────────────────────────
export const getCouponsByEvent = async (eventId, organizerId) => {
    return await Coupon.find({ 
        event: eventId, 
        organizer: organizerId 
    }).sort({ createdAt: -1 });
};

// ─── Create a New Coupon ────────────────────────────────────────────────────
export const createEventCoupon = async (eventId, organizerId, couponData) => {
    const { code, discountType, discountValue, maxUses, maxPerUser, expiryDate, maxDiscountAmount, minOrderValue, applicableTickets } = couponData;

    if (!expiryDate) throw new AppError('Expiry date is required.', HTTP_STATUS.BAD_REQUEST);
    const parsedExp = new Date(expiryDate);
    if (isNaN(parsedExp.getTime())) throw new AppError('Invalid expiry date.', HTTP_STATUS.BAD_REQUEST);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    parsedExp.setHours(0, 0, 0, 0);
    if (parsedExp < today) throw new AppError('Expiry date cannot be in the past.', HTTP_STATUS.BAD_REQUEST);

    const existing = await Coupon.findOne({ event: eventId, code: code.toUpperCase() });
    if (existing) throw new AppError('This promo code already exists for this event.', HTTP_STATUS.BAD_REQUEST);

    if (discountType === 'flat') {
        const minVal = minOrderValue || 0;
        if (minVal <= discountValue) {
            throw new AppError(`For flat discounts, the Minimum Purchase Amount must be strictly greater than the discount value (₹${discountValue}).`, HTTP_STATUS.BAD_REQUEST);
        }
    }

    const coupon = await Coupon.create({
        code: code.toUpperCase(),
        event: eventId,
        organizer: organizerId,
        discountType,
        discountValue,
        maxDiscountAmount: maxDiscountAmount || null,
        minOrderValue: minOrderValue || 0,
        applicableTickets: applicableTickets || [],
        maxUses: maxUses || null,
        maxPerUser: maxPerUser || null,
        expiryDate
    });

    return coupon;
};

// ─── Toggle Coupon Status ───────────────────────────────────────────────────
export const toggleEventCouponStatus = async (couponId, organizerId) => {
    const coupon = await Coupon.findOne({ 
        _id: couponId, 
        organizer: organizerId 
    });

    if (!coupon) {
        throw new AppError('Coupon not found or unauthorized', HTTP_STATUS.NOT_FOUND);
    }

    coupon.isActive = !coupon.isActive;
    await coupon.save();

    return coupon;
};

// ─── Update an Existing Coupon ──────────────────────────────────────────────
export const updateEventCoupon = async (couponId, organizerId, couponData) => {
    const { code, discountType, discountValue, maxUses, maxPerUser, expiryDate, maxDiscountAmount, minOrderValue, applicableTickets } = couponData;
    
    const coupon = await Coupon.findOne({ _id: couponId, organizer: organizerId });
    if (!coupon) throw new AppError('Coupon not found', HTTP_STATUS.NOT_FOUND);

    if (expiryDate) {
        const parsedExp = new Date(expiryDate);
        if (isNaN(parsedExp.getTime())) throw new AppError('Invalid expiry date.', HTTP_STATUS.BAD_REQUEST);
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        parsedExp.setHours(0, 0, 0, 0);
        if (parsedExp < today) throw new AppError('Expiry date cannot be in the past.', HTTP_STATUS.BAD_REQUEST);
    }

    if (code && code.toUpperCase() !== coupon.code) {
        const existing = await Coupon.findOne({ event: coupon.event, code: code.toUpperCase() });
        if (existing) throw new AppError('This promo code already exists for this event.', HTTP_STATUS.BAD_REQUEST);
        coupon.code = code.toUpperCase();
    }

    const updatedType = discountType || coupon.discountType;
    const updatedDiscount = discountValue !== undefined ? discountValue : coupon.discountValue;
    const updatedMinOrder = minOrderValue !== undefined ? minOrderValue : coupon.minOrderValue;

    if (updatedType === 'flat') {
        const minVal = updatedMinOrder || 0;
        if (minVal <= updatedDiscount) {
            throw new AppError(`For flat discounts, the Minimum Purchase Amount must be strictly greater than the discount value (₹${updatedDiscount}).`, HTTP_STATUS.BAD_REQUEST);
        }
    }

    if (discountType) coupon.discountType = discountType;
    if (discountValue) coupon.discountValue = discountValue;
    if (maxUses !== undefined) coupon.maxUses = maxUses || null;
    if (maxPerUser !== undefined) coupon.maxPerUser = maxPerUser || null;
    if (maxDiscountAmount !== undefined) coupon.maxDiscountAmount = maxDiscountAmount || null;
    if (minOrderValue !== undefined) coupon.minOrderValue = minOrderValue || 0;
    if (applicableTickets !== undefined) coupon.applicableTickets = applicableTickets || [];
    if (expiryDate) coupon.expiryDate = expiryDate;

    await coupon.save();
    return coupon;
};

// ─── Delete a Coupon ────────────────────────────────────────────────────────
export const deleteEventCoupon = async (couponId, organizerId) => {
    const coupon = await Coupon.findOneAndDelete({ _id: couponId, organizer: organizerId });
    if (!coupon) throw new AppError('Coupon not found', HTTP_STATUS.NOT_FOUND);
    return coupon;
};