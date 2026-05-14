// src/utils/socket.js
import { Server } from 'socket.io';

let io;
const activeUsers = new Map();

export const initSocket = (httpServer) => {
    io = new Server(httpServer, {
        cors: {
            origin: "*", 
            methods: ["GET", "POST"]
        }
    });

    io.on('connection', (socket) => {
        console.log('⚡ New Socket Connected:', socket.id);

        // Listen for the client registering their Database User ID
        socket.on('register', (userId) => {
            // 1. Force to string and clean whitespace
            const cleanId = String(userId).trim(); 
            
            socket.join(cleanId);
            activeUsers.set(cleanId, socket.id);
            console.log(`✅ Backend placed user in Socket Room: [${cleanId}]`);
        });

        socket.on('joinEvent', (eventId) => {
            socket.join(String(eventId).trim());
            console.log(`🎟️ Socket ${socket.id} joined event room: ${eventId}`);
        });

        socket.on('disconnect', () => {
            for (let [userId, socketId] of activeUsers.entries()) {
                if (socketId === socket.id) {
                    activeUsers.delete(userId);
                    break;
                }
            }
        });
    });
    return io;
};

export const getIO = () => {
    if (!io) throw new Error("Socket.io has not been initialized!");
    return io;
};

export const getActiveUsers = () => {
    return activeUsers;
};