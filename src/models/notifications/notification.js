import mongoose from 'mongoose';

const notificationSchema = new mongoose.Schema({
    recipient: { 
        type: mongoose.Schema.Types.ObjectId, 
        ref: 'User', 
        required: true 
    },
    message: { 
        type: String, 
        required: true 
    },
    status: { 
        type: String, 
        enum: ['info', 'success', 'warning', 'danger'], 
        default: 'info' 
    },
    isRead: { 
        type: Boolean, 
        default: false 
    }
}, { timestamps: true });

export default mongoose.model('Notification', notificationSchema);