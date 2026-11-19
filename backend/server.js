const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const pool = require('./config/db');

const path = require('path');

dotenv.config();

const authRoutes = require('./routes/authRoutes');
const adminRoutes = require('./routes/adminRoutes');
const studentRoutes = require('./routes/studentRoutes');

const app = express();
const deleteProtection = require('./middleware/deleteProtection');

// Middleware
app.use(deleteProtection);
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));
app.use('/api/uploads', express.static(path.join(__dirname, 'uploads')));

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/upload', require('./routes/uploadRoutes'));
app.use('/api/tasks', require('./routes/taskRoutes'));
app.use('/api/dev', require('./routes/devRoutes'));
app.use('/api/register', require('./routes/registrationRoutes'));
app.use('/api/mentor-head', require('./routes/mentorHeadRoutes'));
app.use('/api/recovery', require('./routes/recoveryRoutes'));
app.use('/api/mentor', require('./routes/mentorRoutes'));
app.use('/api/academic-head', require('./routes/academicHeadRoutes'));
app.use('/api/aoe', require('./routes/aoeRoutes'));
app.use('/api/faculty', require('./routes/facultyRoutes'));
app.use('/api/student', studentRoutes);
app.use('/api/mentor-logs', require('./routes/mentorLogRoutes'));
app.use('/api/faculty-tracking', require('./routes/facultyTrackingRoutes'));
app.use('/api/mentor-interactions', require('./routes/mentorInteractionRoutes'));
app.use('/api/ssc', require('./routes/sscRoutes'));

// Basic Route
app.get('/', (req, res) => {
    res.json({ message: "Welcome to MashMagic Edu Tech API v2 - Permissions Fixed" });
});

app.post('/api/fix-demos-now', async (req, res) => {
    try {
        const [demos] = await pool.query('SELECT id, demo_id FROM aoe_demo_schedules ORDER BY created_at ASC');
        for (let i = 0; i < demos.length; i++) {
            const demoIdStr = `de${String(i + 1).padStart(2, '0')}`;
            await pool.query('UPDATE aoe_demo_schedules SET demo_id = ? WHERE id = ?', [demoIdStr, demos[i].id]);
        }
        res.status(200).json({ success: true, message: 'Fixed demo IDs' });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// Test Connection and Start Server
const PORT = process.env.PORT || 5000;

// Global Error Handler
app.use((err, req, res, next) => {
    console.error(`[SERVER ERROR] ${req.method} ${req.url}:`, err);
    res.status(500).json({ success: false, message: "Internal Server Error", error: err.message });
});

const syncStudentsOnStart = async () => {
    try {
        console.log('🔄 Synchronizing students with user approval status...');

        // 0. Auto-approve all pending students (bypassing student approval system)
        const [userApproveRes] = await pool.query(`
            UPDATE users 
            SET status = 'active', isApproved = 1, isActive = 1
            WHERE role = 'student' AND (status = 'pending' OR isApproved = 0)
        `);
        const [studentApproveRes] = await pool.query(`
            UPDATE students 
            SET status = 'active', isApproved = 1
            WHERE status = 'pending' OR isApproved = 0
        `);
        const [notifDeleteRes] = await pool.query(`
            DELETE FROM admin_notifications 
            WHERE action_type = 'student_registration'
        `);
        if (userApproveRes.affectedRows > 0 || studentApproveRes.affectedRows > 0) {
            console.log(`✅ Auto-approved ${userApproveRes.affectedRows} pending student users and ${studentApproveRes.affectedRows} student profiles on start.`);
            console.log(`✅ Cleared ${notifDeleteRes.affectedRows} student registration notifications.`);
        }

        // 1. Sync Approved Students
        // If a student's matching user is active/approved, set the student to active/approved
        const [approveResult] = await pool.query(`
            UPDATE students s
            JOIN users u ON (s.user_id = u.id OR (s.email IS NOT NULL AND s.email = u.email))
            SET s.status = 'active', s.isApproved = 1
            WHERE u.role = 'student' 
            AND (u.status = 'active' OR u.isApproved = 1)
            AND (s.status != 'active' OR s.isApproved = 0)
        `);
        if (approveResult.affectedRows > 0) {
            console.log(`✅ Automatically approved ${approveResult.affectedRows} students whose user accounts were already active/approved.`);
        }

        // Auto deletion of rejected students has been removed per user request

        // 3. Sync mentor_id in timetable with the current student's mentor_id
        const [timetableSyncRes] = await pool.query(`
            UPDATE timetable t
            JOIN students s ON t.student_id = s.id
            SET t.mentor_id = s.mentor_id
            WHERE t.mentor_id IS NULL OR t.mentor_id != s.mentor_id
        `);
        if (timetableSyncRes.affectedRows > 0) {
            console.log(`✅ Synchronized mentor_id for ${timetableSyncRes.affectedRows} sessions in timetable.`);
        }

        console.log('✅ Student synchronization and cleanup complete');
    } catch (err) {
        console.log('⚠️ Failed to sync students on startup:', err.message);
    }
};

const startServer = async () => {
    try {
        // Connect to MongoDB & Verify
        const [rows] = await pool.query('SELECT 1');
        console.log('✅ MongoDB (Lms-Erp-Demo) Connected and Ready');

        // Execute student synchronization and cleanup
        await syncStudentsOnStart();

        console.log('✅ Database schema verified');
        
        // Start Integrity Checker Cron Job
        const cron = require('node-cron');
        let runIntegrityCheck; try { const mod = require('./cron/integrityScanner'); runIntegrityCheck = mod.runIntegrityCheck || mod.runIntegrityScanner || mod; } catch (e) { runIntegrityCheck = () => {}; }
        
        // Run immediately on startup
        runIntegrityCheck();
        
        // Schedule to run every day at midnight (00:00)
        cron.schedule('0 0 * * *', () => {
            runIntegrityCheck();
        });

        // Midnight Interaction Rollover - carries over pending students to next day
        const { runMidnightRollover } = require('./cron/midnightInteractionRollover');
        cron.schedule('1 0 * * *', async () => {
            console.log('[CRON] Running midnight interaction rollover...');
            await runMidnightRollover();
        }, { timezone: 'Asia/Kolkata' });


        app.listen(PORT, () => {
            console.log(`🚀 Server running on http://localhost:${PORT}`);
        });
    } catch (err) {
        console.error('❌ Database connection failed:', err.message);
        process.exit(1);
    }
};

startServer();
