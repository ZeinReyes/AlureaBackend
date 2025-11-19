import mongoose from 'mongoose';

const orderSchema = new mongoose.Schema({
    name: { type: String, required: true },
    address: { type: String, required: true },
    contact: { type: String, required: true },
    payment_method: { type: String, default: 'Cash on Delivery' },
    items: [
        {
            _id: mongoose.Schema.Types.ObjectId,
            name: String,
            quantity: Number,
            price: Number,
        },
    ],
    totalAmount: { type: Number, required: true },
    status: {
        type: String,
        enum: ['Pending', 'Delivering', 'Delivered'],
        default: 'Pending'
    },
    date: { type: Date, default: Date.now },
    latitude: { type: Number, required: true },
    longitude: { type: Number, required: true },
    proofPhoto: { type: String }
});

const Order = mongoose.model('Order', orderSchema);

export default Order;