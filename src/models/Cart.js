import mongoose from 'mongoose';

const cartItemSchema = new mongoose.Schema({
    productId: String,
    name: String,
    price: Number,
    quantity: Number,
    image: String,
});

const cartSchema = new mongoose.Schema({
    userId: { type: String, required: true },
    items: [cartItemSchema],
    updatedAt: { type: Date, default: Date.now },
});

const Cart = mongoose.model('Cart', cartSchema);
export default Cart;