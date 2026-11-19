const mongoose = require('mongoose');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/Lms-Erp-Demo';

const connectDB = async () => {
    try {
        await mongoose.connect(MONGODB_URI);
        console.log(`✅ MongoDB Connected to: ${MONGODB_URI}`);
    } catch (error) {
        console.error('❌ MongoDB Connection Error:', error.message);
        process.exit(1);
    }
};

module.exports = { connectDB, mongoose };
