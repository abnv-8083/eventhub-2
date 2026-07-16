import mongoose from 'mongoose';

const couponSchema = new mongoose.Schema({
    code: { type: String, required: true, uppercase: true, trim: true },
    event: { type: mongoose.Schema.Types.ObjectId, ref: 'Event', required: true },
    organizer: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    
    discountType: { type: String, enum: ['percentage', 'flat'], default: 'percentage' },
    discountValue: { type: Number, required: true }, 
    
    maxDiscountAmount: { type: Number, default: null }, 
    minOrderValue: { type: Number, default: 0 }, 
    applicableTickets: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Ticket' }], 
    
    maxUses: { type: Number, default: null }, 
    maxPerUser: { type: Number, default: 1 }, 
    usedCount: { type: Number, default: 0 },
    
    expiryDate: { type: Date, required: true },
    isActive: { type: Boolean, default: true }
}, { timestamps: true });

couponSchema.index({ code: 1, event: 1 }, { unique: true });

export default mongoose.model('Coupon', couponSchema);