import { S3Client } from '@aws-sdk/client-s3';
import multerS3 from 'multer-s3';
import multer from 'multer';
import dotenv from 'dotenv';
import AppError from '../utils/AppError.js';

dotenv.config();

// 1. Configure the AWS S3 Client
const s3Client = new S3Client({
    region: process.env.AWS_REGION,
    credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
    }
});

const maxFileSize = parseInt(process.env.MAX_FILE_SIZE, 10) || 5242880;

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

// 2. Set up the Storage Engine for Profiles
const profileStorage = multerS3({
    s3: s3Client,
    bucket: process.env.AWS_S3_BUCKET_NAME,
    contentType: multerS3.AUTO_CONTENT_TYPE, // Crucial: Ensures images render in the browser instead of downloading
    metadata: function (req, file, cb) {
        cb(null, { fieldName: file.fieldname });
    },
    key: function (req, file, cb) {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
        const sanitizedFileName = file.originalname.replace(/\s+/g, '_');
        // Setting the folder structure using the key
        cb(null, `eventhub_profiles/${uniqueSuffix}-${sanitizedFileName}`);
    }
});

// 3. Export the profile upload middleware
export const upload = multer({ 
    storage: profileStorage,
    fileFilter: fileFilter,
    limits: {
        fileSize: maxFileSize
    }
});

// --- EVENT BANNER CONFIGURATION ---
const eventStorage = multerS3({
    s3: s3Client,
    bucket: process.env.AWS_S3_BUCKET_NAME,
    contentType: multerS3.AUTO_CONTENT_TYPE,
    metadata: function (req, file, cb) {
        cb(null, { fieldName: file.fieldname });
    },
    key: function (req, file, cb) {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
        const sanitizedFileName = file.originalname.replace(/\s+/g, '_');
        // Setting the folder structure using the key
        cb(null, `eventhub_events/${uniqueSuffix}-${sanitizedFileName}`);
    }
});

export const eventUpload = multer({ 
    storage: eventStorage,
    fileFilter: fileFilter,
    limits: {
        fileSize: maxFileSize
    }
});