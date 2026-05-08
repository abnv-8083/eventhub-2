console.log("🚀 ===========================");
console.log("🚀 SERVER IS BOOTING UP!");
console.log("🚀 ===========================");

import dotenv from 'dotenv';
import express from 'express';
import mongoose from 'mongoose';
import morgan from 'morgan';
import path from 'path';
import { fileURLToPath } from 'url';
import session from 'express-session';
import http from 'http';
import { initSocket } from './src/utils/socket.js';
import MongoStore from 'connect-mongo';
import passport from 'passport';
const {authenticate} = passport
import AppError from './src/utils/AppError.js';
import errorHandler from './src/middlewares/errorHandler.js';
import './src/config/passport.js'
import noCacheMiddleware from './src/middlewares/nocache.js';

//Routes Import
import userAuthRouter from './src/routes/users/userAuthRoutes.js';
import userRouter from './src/routes/users/userRoutes.js';
import organizerRouter from './src/routes/organizers/organizerRoutes.js';
import adminAuthRoutes from './src/routes/admin/adminAuthRoutes.js';
import adminRoutes from './src/routes/admin/adminRoutes.js';
import { setLocals } from './src/middlewares/setLocals.js';
import * as userController from './src/controllers/users/userController.js';

// Initialize environment variables
dotenv.config();

// Recreate __dirname for ES Modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Initialize Express app
const app = express();
const server = http.createServer(app);

initSocket(server)

// ==========================================
// 1. Database Connection
// ==========================================
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/eventhub2';

mongoose.connect(MONGODB_URI)
    .then(() => console.log('✅ MongoDB Connected Successfully'))
    .catch((err) => console.error('❌ MongoDB Connection Error:', err));


// ==========================================
// 2. Middleware & View Engine Setup
// ==========================================
// Parse JSON and URL-encoded data from forms
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Set EJS as the templating engine
app.set('view engine', 'ejs');
// Set EJS as the templating engine
app.set('views', path.join(__dirname, 'src', 'views'));

// Serve static files (CSS, JS, Images) from the 'public' directory
app.use(express.static(path.join(__dirname, 'src', 'public')));


// ==========================================
// 3. Session & Authentication Setup
// ==========================================
app.set('trust proxy', 1);

app.use(session({
    secret: process.env.SESSION_SECRET || 'eventhub_super_secret_key_2026',
    resave: false,
    saveUninitialized: false,
    rolling:true,
    store: MongoStore.create({
        clientPromise: mongoose.connection.asPromise().then(m => m.getClient()),
        dbName: 'eventhub2',
        collectionName: 'sessions'
    }),
    cookie: {
        secure: process.env.NODE_ENV === 'production', // true if using https in production
        sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax',
        httpOnly: true
    }
}));

app.use(noCacheMiddleware)

// Initialize Passport for Auth
app.use(passport.initialize());
app.use(passport.session());

app.use(setLocals)

if (process.env.NODE_ENV === 'development') {
    app.use(morgan('dev')); 
} else {
    app.use(morgan('combined'));
}



app.get('/', userController.getHomepage);
app.use('/user', userAuthRouter)
app.use('/user', userRouter)
app.use('/organizer', organizerRouter)
app.use('/admin', adminAuthRoutes)
app.use('/admin', adminRoutes)


// 404 Error Handler
app.use((req, res, next) => {
    next(new AppError(`Can't find ${req.originalUrl} on this server!`, 404));
});

app.use(errorHandler);

// ==========================================
// 5. Start Server
// ==========================================
const PORT = process.env.PORT || 8083;

server.listen(PORT, () => {
    console.log(`🚀 EventHub Server is running on http://localhost:${PORT} or https://justly-mocha-preorder.ngrok-free.dev`);
    console.log(`⏱️  Environment: ${process.env.NODE_ENV || 'development'}`);
});