// src/config/cloudinary.js
import { v2 as cloudinary } from 'cloudinary';
import { CloudinaryStorage } from 'multer-storage-cloudinary';
import multer from 'multer';
import dotenv from 'dotenv';
import AppError from '../utils/AppError.js';

dotenv.config();

// 1. Configure Cloudinary
cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET
});

const maxFileSize = parseInt(process.env.CLOUDINARY_MAX_FILE_SIZE, 10) || 5242880;

// --- 🚨 BACKEND VALIDATION FILTER ---
const fileFilter = (req, file, cb) => {
    // 1. Allowed ext
    const filetypes = /jpeg|jpg|png|webp/;
    // 2. Check mimetype
    const mimetype = filetypes.test(file.mimetype);

    if (mimetype) {
        return cb(null, true); // Accept the file
    } else {
        // Reject the file with a custom AppError
        cb(new AppError('Error: Images Only! (JPG, PNG, WEBP)', 400), false);
    }
};

// 2. Set up the Storage Engine
const storage = new CloudinaryStorage({
    cloudinary: cloudinary,
    params: {
        folder: 'eventhub_profiles',
        allowed_formats: ['jpg', 'jpeg', 'png', 'webp'],
        transformation: [{ width: 500, height: 500, crop: 'fill', gravity: 'face' }] // Auto-crops to a square focusing on the face
    }
});

// 3. Export the upload middleware
export const upload = multer({ 
    storage: storage,
    fileFilter: fileFilter,
    limits: {
        fileSize: maxFileSize
    }
});

// --- EVENT BANNER CONFIGURATION ---
const eventStorage = new CloudinaryStorage({
    cloudinary: cloudinary,
    params: {
        folder: 'eventhub_events',
        allowed_formats: ['jpg', 'jpeg', 'png', 'webp'],
        // Standard 16:9 ratio for banners
        transformation: [{ width: 1920, height: 1080, crop: 'limit' }] 
    }
});

export const eventUpload = multer({ 
    storage: eventStorage,
    fileFilter: fileFilter,
    limits: {
        fileSize:  maxFileSize
    }
});