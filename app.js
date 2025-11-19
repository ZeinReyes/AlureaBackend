import express from 'express';
import http from 'http';
import { Server } from 'socket.io';
import mongoose from 'mongoose';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

import authRoutes from './src/routes/authRoutes.js';
import productRoutes from './src/routes/productRoutes.js';
import userRoutes from './src/routes/userRoutes.js';
import orderRoutes from './src/routes/orderRoutes.js';
import cartRoutes from './src/routes/cartRoutes.js';

dotenv.config();

const app = express();
const server = http.createServer(app);

const io = new Server(server, {
    cors: {
        origin: 'http://localhost:3000',
        methods: ['GET', 'POST', 'PATCH'],
    },
});

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

app.use('/uploads/proofs', express.static(path.join(__dirname, 'uploads/proofs')));
app.use(cors());
app.use(express.json());

let riderLocation = { lat: 14.6091, lon: 121.0223 };
io.on('connection', (socket) => {
    console.log('⚡ New WebSocket connection');
    socket.emit('location', riderLocation);

    socket.on('update-location', (newLocation) => {
        riderLocation = newLocation;
        io.emit('location', riderLocation);
    });

    socket.on('disconnect', () => {
        console.log('🔌 WebSocket disconnected');
    });
});

app.use('/api/auth', authRoutes);
app.use('/api/products', productRoutes);
app.use('/api/cart', cartRoutes);
app.use('/api/users', userRoutes);
app.use('/api/orders', orderRoutes);

app.get('/api/rider/location', (req, res) => {
    res.json(riderLocation);
});

const PORT = process.env.PORT || 5000;

// ⚠ Verbose MongoDB connection with events
if (!process.env.MONGO_URI) {
    console.error('❌ MONGO_URI is not set in your .env file');
} else {
    console.log(`🔗 Attempting to connect to MongoDB at ${process.env.MONGO_URI}`);
}

mongoose.connection.on('connected', () => console.log('✅ Mongoose connected to DB'));
mongoose.connection.on('error', (err) => console.error('❌ Mongoose connection error:', err));
mongoose.connection.on('disconnected', () => console.warn('⚠ Mongoose disconnected'));

mongoose
    .connect(process.env.MONGO_URI)
    .then(() => {
        console.log('🎉 MongoDB connection successful');
        server.listen(PORT, () => {
            console.log(`🚀 Server with WebSocket running on port ${PORT}`);
        });
    })
    .catch((err) => {
        console.error('❌ Failed to connect MongoDB:', err);
    });

// Extra log to show server initialization
console.log('🔹 Server script loaded, waiting for DB connection...');
