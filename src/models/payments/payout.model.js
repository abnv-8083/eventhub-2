import mongoose from 'mongoose';

const payoutSchema = new mongoose.Schema({
    organizer: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    event: { type: mongoose.Schema.Types.ObjectId, ref: 'Event', required: true },
    totalRevenue: { type: Number, required: true },
    platformFee: { type: Number, required: true }, // calculated automatically (5%)
    payoutAmount: { type: Number, required: true }, // totalRevenue - platformFee
    status: { type: String, enum: ['pending', 'approved', 'paid', 'rejected'], default: 'pending' }
}, { timestamps: true });

const Payout = mongoose.model('Payout', payoutSchema);
export default Payout;
