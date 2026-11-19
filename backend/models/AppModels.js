const mongoose = require('mongoose');
const { getNextSequence } = require('./counterModel');

// 1. Timetable / Faculty Timetable
const TimetableSchema = new mongoose.Schema({
    id: { type: Number, unique: true, index: true },
    student_id: { type: Number, index: true },
    mentor_id: { type: Number, index: true },
    faculty_id: { type: Number, index: true },
    course: { type: String },
    subject: { type: String },
    day_of_week: { type: String },
    date: { type: Date },
    start_time: { type: String },
    end_time: { type: String },
    status: { type: String, default: 'scheduled' }, // scheduled, completed, cancelled, missed
    class_type: { type: String, default: 'regular' },
    meeting_link: { type: String },
    notes: { type: String },
    session_rating: { type: Number },
    remarks: { type: String },
    is_rescheduled: { type: Boolean, default: false },
    created_at: { type: Date, default: Date.now },
    updated_at: { type: Date, default: Date.now }
}, { timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' } });

TimetableSchema.pre('save', async function() {
    if (!this.id) this.id = await getNextSequence('timetable');
});

// 2. Task Schema
const TaskSchema = new mongoose.Schema({
    id: { type: Number, unique: true, index: true },
    title: { type: String, required: true },
    description: { type: String },
    assigned_to: { type: Number, index: true }, // User ID
    assigned_by: { type: Number },
    due_date: { type: Date },
    priority: { type: String, default: 'medium' },
    status: { type: String, default: 'pending' },
    category: { type: String },
    created_at: { type: Date, default: Date.now },
    updated_at: { type: Date, default: Date.now }
}, { timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' } });

TaskSchema.pre('save', async function() {
    if (!this.id) this.id = await getNextSequence('tasks');
});

// 3. Student Exam & Marks Schema
const StudentExamSchema = new mongoose.Schema({
    id: { type: Number, unique: true, index: true },
    student_id: { type: Number, index: true },
    subject: { type: String },
    exam_name: { type: String },
    exam_date: { type: Date },
    total_marks: { type: Number, default: 100 },
    obtained_marks: { type: Number, default: 0 },
    grade: { type: String },
    feedback: { type: String },
    created_at: { type: Date, default: Date.now }
}, { timestamps: { createdAt: 'created_at' } });

StudentExamSchema.pre('save', async function() {
    if (!this.id) this.id = await getNextSequence('student_exams');
});

// 4. Student Marks Schema
const StudentMarkSchema = new mongoose.Schema({
    id: { type: Number, unique: true, index: true },
    student_id: { type: Number, index: true },
    subject: { type: String },
    marks: { type: Number },
    total: { type: Number, default: 100 },
    exam_type: { type: String },
    date: { type: Date },
    remarks: { type: String },
    created_at: { type: Date, default: Date.now }
});

StudentMarkSchema.pre('save', async function() {
    if (!this.id) this.id = await getNextSequence('student_marks');
});

// 5. Interaction Logs (Student, Mentor, Faculty)
const InteractionLogSchema = new mongoose.Schema({
    id: { type: Number, unique: true, index: true },
    student_id: { type: Number, index: true },
    mentor_id: { type: Number, index: true },
    faculty_id: { type: Number, index: true },
    type: { type: String }, // 'mentor_student', 'mentor_faculty', 'faculty_student', etc.
    topic: { type: String },
    feedback: { type: String },
    summary: { type: String },
    status: { type: String, default: 'completed' },
    date: { type: Date, default: Date.now },
    created_at: { type: Date, default: Date.now }
}, { timestamps: { createdAt: 'created_at' } });

InteractionLogSchema.pre('save', async function() {
    if (!this.id) this.id = await getNextSequence('interaction_logs');
});

// 6. Generic App Collection Model for dynamic/legacy schema storage
const AppCollectionSchema = new mongoose.Schema({
    id: { type: Number, index: true },
    collection_name: { type: String, required: true, index: true },
    data: { type: mongoose.Schema.Types.Mixed, default: {} },
    created_at: { type: Date, default: Date.now },
    updated_at: { type: Date, default: Date.now }
}, { timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' } });

AppCollectionSchema.pre('save', async function() {
    if (!this.id) this.id = await getNextSequence(`col_${this.collection_name}`);
});

module.exports = {
    Timetable: mongoose.models.Timetable || mongoose.model('Timetable', TimetableSchema),
    Task: mongoose.models.Task || mongoose.model('Task', TaskSchema),
    StudentExam: mongoose.models.StudentExam || mongoose.model('StudentExam', StudentExamSchema),
    StudentMark: mongoose.models.StudentMark || mongoose.model('StudentMark', StudentMarkSchema),
    InteractionLog: mongoose.models.InteractionLog || mongoose.model('InteractionLog', InteractionLogSchema),
    AppCollection: mongoose.models.AppCollection || mongoose.model('AppCollection', AppCollectionSchema)
};
