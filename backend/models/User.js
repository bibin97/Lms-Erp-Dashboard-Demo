const mongoose = require('mongoose');
const { getNextSequence } = require('./counterModel');

const UserSchema = new mongoose.Schema({
    id: { type: Number, unique: true, index: true },
    name: { type: String, required: true },
    phone_number: { type: String, default: null, index: true },
    place: { type: String, default: null },
    email: { type: String, default: null, index: true },
    password: { type: String, required: true },
    role: { 
        type: String, 
        required: true, 
        enum: ['super_admin', 'admin', 'mentor_head', 'mentor', 'academic_head', 'aoe', 'faculty', 'student', 'user', 'ssc'],
        default: 'user',
        index: true
    },
    status: { type: String, default: 'pending' },
    isApproved: { type: Number, default: 0 },
    isActive: { type: Number, default: 1 },
    createdBy: { type: String, default: null },
    
    // Additional fields
    grade: { type: String, default: null },
    subject: { type: String, default: null },
    secondary_subjects: { type: mongoose.Schema.Types.Mixed, default: null },
    course: { type: String, default: null },
    hour: { type: String, default: null },
    mentor_name: { type: String, default: null },
    faculty_name: { type: String, default: null },
    next_installment_date: { type: Date, default: null },
    time_table: { type: String, default: null },
    enrollment_type: { type: String, default: null },
    badge: { type: String, default: null },
    meeting_link: { type: String, default: null },
    faculty_id_card: { type: String, default: null },
    section: { type: String, default: null },
    syllabus: { type: mongoose.Schema.Types.Mixed, default: null },
    languages_proficiency: { type: mongoose.Schema.Types.Mixed, default: null },
    qualification: { type: String, default: null },
    experience: { type: String, default: null },
    availability: { type: String, default: null },
    hourly_rate: { type: mongoose.Schema.Types.Mixed, default: 0 },
    teaching_mode: { type: String, default: null },
    joining_date: { type: Date, default: null },
    remarks: { type: String, default: null },

    // Student specific
    total_fees: { type: Number, default: 0 },
    total_paid: { type: Number, default: 0 },
    total_hours: { type: Number, default: 0 },
    admission_type: { type: String, default: 'new' },
    current_installment_amount: { type: Number, default: 0 },
    current_installment_start_hours: { type: Number, default: 0 },

    // Faculty rate splits
    lp_hour_rate: { type: Number, default: 0 },
    up_hour_rate: { type: Number, default: 0 },
    hs_hour_rate: { type: Number, default: 0 },
    hss_hour_rate: { type: Number, default: 0 },

    created_at: { type: Date, default: Date.now },
    updated_at: { type: Date, default: Date.now }
}, {
    timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' }
});

UserSchema.pre('save', async function() {
    if (!this.id) {
        this.id = await getNextSequence('users');
    }
});

module.exports = mongoose.model('User', UserSchema);
