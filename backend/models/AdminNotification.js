const mongoose = require('mongoose');
const { getNextSequence } = require('./counterModel');

const AdminNotificationSchema = new mongoose.Schema({
    id: { type: Number, unique: true, index: true },
    message: { type: String, required: true },
    is_read: { type: Number, default: 0 },
    created_at: { type: Date, default: Date.now }
});

AdminNotificationSchema.pre('save', async function() {
    if (!this.id) {
        this.id = await getNextSequence('admin_notifications');
    }
});

module.exports = mongoose.model('AdminNotification', AdminNotificationSchema);
