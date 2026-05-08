// src/utils/socket.js
import { Server } from 'socket.io';

let io;
const activeUsers = new Map();

export const initSocket = (httpServer) => {
    io = new Server(httpServer, {
        cors: {
            origin: "*", // Adjust this based on your security needs
            methods: ["GET", "POST"]
        }
    });

    io.on('connection', (socket) => {
        console.log('⚡ New Socket Connected:', socket.id);

        // Listen for the client registering their Database User ID
        socket.on('register', (userId) => {
            activeUsers.set(userId, socket.id);
        });

        // Handle Disconnections
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

// Getter function to use IO anywhere in the app
export const getIO = () => {
    if (!io) {
        throw new Error("Socket.io has not been initialized!");
    }
    return io;
};

// Getter function for the active users map
export const getActiveUsers = () => {
    return activeUsers;
};