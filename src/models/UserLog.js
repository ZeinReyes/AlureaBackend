import mongoose from 'mongoose';

const UserlogSchema = new mongoose.Schema({
    action: { type: String, required: true },
    performedBy: { type: String, required: true },
    targetUser: { type: String },
    details: { type: String },
    timestamp: { type: Date, default: Date.now },
});

const UserLog = mongoose.model('UserLog', UserlogSchema);
export default UserLog;