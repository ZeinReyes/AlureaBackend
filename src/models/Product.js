import mongoose from 'mongoose';

const productSchema = new mongoose.Schema({
    name: { type: String, required: true },
    description: { type: String },
    type: {
        type: String,
        enum: ['Necklace', 'Ring', 'Bracelet', 'Earrings', 'Set'],
        required: true
    },
    material: {
        type: String,
        enum: ['Gold', 'Silver', 'Platinum', 'Rose Gold', 'White Gold', 'Titanium'],
        default: 'Gold'
    },
    price: { type: Number, required: true },
    image: { type: String },
    stock: { type: Number, default: 0 },
    createdAt: { type: Date, default: Date.now },
});

const Product = mongoose.model('Product', productSchema);
export default Product;
