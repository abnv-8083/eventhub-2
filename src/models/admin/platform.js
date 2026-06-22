import mongoose from 'mongoose';

const platformSchema = new mongoose.Schema({
    platformFeePercentage: {
        type: Number,
        required: true,
        default: 5,
        min: 0,
        max: 100
    },
    supportEmail: {
        type: String,
        default: 'support@eventhub.com'
    },
    supportPhone: {
        type: String,
        default: '+91 9000000000'
    },
    blockedCategories: {
        type: [String],
        default: []
    }
}, { timestamps: true });

const Platform = mongoose.model('Platform', platformSchema);

export default Platform;
