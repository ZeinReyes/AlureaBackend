import mongoose from 'mongoose';

const ProductlogSchema = new mongoose.Schema({
    action: { type: String, required: true },
    performedBy: { type: String, required: true },
    targetProduct: { type: String },
    details: { type: String },
    timestamp: { type: Date, default: Date.now },
});

const ProductLog = mongoose.model('ProductLog', ProductlogSchema);
export default ProductLog;