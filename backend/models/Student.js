const mongoose = require('mongoose');
const { getNextSequence } = require('./counterModel');

const StudentSchema = new mongoose.Schema({
    id: { type: Number, unique: true, index: true },
    user_id: { type: Number, index: true },
    name: { type: String, required: true },
    email: { type: String, default: null },
    password: { type: String },
    contact: { type: String, default: null },
    phone_number: { type: String, default: null },
    grade: { type: String, default: null },
    course: { type: String, default: null },
    admission_type: { type: String, default: 'new' },
    total_fees: { type: Number, default: 0 },
    total_paid: { type: Number, default: 0 },
    total_hours: { type: Number, default: 0 },
    current_installment_amount: { type: Number, default: 0 },
    current_installment_start_hours: { type: Number, default: 0 },
    status: { type: String, default: 'pending' },
    isApproved: { type: Number, default: 0 },
    priority_category: { type: String, default: 'Stable' },
    enrollment_type: { type: String, default: null },
    badge: { type: String, default: null },
    subjects_json: { type: mongoose.Schema.Types.Mixed, default: null },
    mentor_id: { type: Number, default: null },
    mentor_name: { type: String, default: null },
    faculty_id: { type: Number, default: null },
    faculty_name: { type: String, default: null },
    time_table: { type: String, default: null },
    created_at: { type: Date, default: Date.now },
    updated_at: { type: Date, default: Date.now }
}, {
    timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' }
});

StudentSchema.pre('save', async function() {
    if (!this.id) {
        this.id = await getNextSequence('students');
    }
});

module.exports = mongoose.model('Student', StudentSchema);
