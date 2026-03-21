const express = require('express');
const mysql = require('mysql2');
const cors = require('cors');
const bodyParser = require('body-parser');
const path = require('path');
require('dotenv').config();

const app = express();

// Middleware
app.use(cors());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'static')));
app.set('view engine', 'html');
app.engine('html', require('ejs').renderFile);
app.set('views', path.join(__dirname, 'templates'));

// Database connection — FIX: removed invalid 'reconnect' option (mysql2 doesn't support it)
const db = mysql.createConnection({
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'medical_tracker',
    charset: 'utf8mb4',
    connectTimeout: 60000,
    acquireTimeout: 60000,
    timeout: 60000
});

const connectWithRetry = () => {
    db.connect((err) => {
        if (err) {
            console.error('Database connection failed:', err.message);
            console.log('Retrying in 5 seconds...');
            setTimeout(connectWithRetry, 5000);
            return;
        }
        console.log('✅ Connected to MySQL database');
        verifyTables();
    });
};

const verifyTables = () => {
    const tables = ['medications', 'reminders', 'vitals', 'appointments'];
    tables.forEach(table => {
        db.query(`SHOW TABLES LIKE '${table}'`, (err, results) => {
            if (err) { console.error(`Error checking ${table}:`, err); return; }
            if (results.length === 0) {
                console.warn(`⚠️  Table '${table}' missing — please run database.sql`);
            } else {
                console.log(`✅ Table '${table}' OK`);
            }
        });
    });
};

connectWithRetry();

db.on('error', (err) => {
    console.error('Database error:', err);
    if (err.code === 'PROTOCOL_CONNECTION_LOST' || err.code === 'ECONNRESET') {
        connectWithRetry();
    } else {
        throw err;
    }
});

app.locals.db = db;

// Routes
const medicationRoutes = require('./routes/medications');
const reminderRoutes = require('./routes/reminders');
const vitalRoutes = require('./routes/vitals');
const appointmentRoutes = require('./routes/appointments');

app.use('/api/medications', medicationRoutes);
app.use('/api/reminders', reminderRoutes);
app.use('/api/vitals', vitalRoutes);
app.use('/api/appointments', appointmentRoutes);

// FIX: /health endpoint — replaced db.state (not valid in mysql2) with a live SELECT 1 ping
app.get('/health', (req, res) => {
    db.query('SELECT 1', (err) => {
        const payload = {
            uptime: process.uptime(),
            message: err ? 'DB_ERROR' : 'OK',
            timestamp: Date.now(),
            database: err ? 'disconnected' : 'connected'
        };
        res.status(err ? 503 : 200).json(payload);
    });
});

app.get('/api/db-status', (req, res) => {
    db.query('SELECT 1 + 1 AS result', (err, results) => {
        if (err) return res.status(500).json({ status: 'error', message: err.message });
        res.json({ status: 'success', message: 'Database responsive', result: results[0].result });
    });
});

app.get('/api/dashboard-stats', async (req, res) => {
    try {
        const stats = await getDashboardStats();
        res.json(stats);
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch stats', details: error.message });
    }
});

const getDashboardStats = () => new Promise((resolve, reject) => {
    const queries = {
        medications: 'SELECT COUNT(*) as total, SUM(taken) as taken FROM medications',
        reminders: `SELECT COUNT(*) as total,
            SUM(CASE WHEN DATE(date_time) = CURDATE() THEN 1 ELSE 0 END) as today,
            SUM(CASE WHEN date_time >= NOW() THEN 1 ELSE 0 END) as upcoming
            FROM reminders`,
        vitals: 'SELECT COUNT(*) as total FROM vitals',
        appointments: `SELECT COUNT(*) as total,
            SUM(CASE WHEN date_time >= NOW() THEN 1 ELSE 0 END) as upcoming
            FROM appointments`
    };

    const results = {};
    let completed = 0;
    const total = Object.keys(queries).length;

    const done = () => {
        if (++completed === total) {
            resolve({
                medications: results.medications[0],
                reminders: results.reminders[0],
                vitals: results.vitals[0],
                appointments: results.appointments[0],
                lastUpdated: new Date().toISOString()
            });
        }
    };

    db.query(queries.medications, (err, r) => { results.medications = err ? [{ total: 0, taken: 0 }] : r; done(); });
    db.query(queries.reminders, (err, r) => { results.reminders = err ? [{ total: 0, today: 0, upcoming: 0 }] : r; done(); });
    db.query(queries.vitals, (err, r) => { results.vitals = err ? [{ total: 0 }] : r; done(); });
    db.query(queries.appointments, (err, r) => { results.appointments = err ? [{ total: 0, upcoming: 0 }] : r; done(); });
});

app.get('/api/export-data', (req, res) => {
    const exportQueries = {
        medications: 'SELECT * FROM medications',
        reminders: 'SELECT * FROM reminders',
        vitals: 'SELECT * FROM vitals',
        appointments: 'SELECT * FROM appointments'
    };

    const exportData = {};
    let completed = 0;
    const total = Object.keys(exportQueries).length;

    Object.keys(exportQueries).forEach(table => {
        db.query(exportQueries[table], (err, results) => {
            exportData[table] = err ? { error: err.message } : results;
            if (++completed === total) {
                res.json({ success: true, exportedAt: new Date().toISOString(), data: exportData });
            }
        });
    });
});

app.post('/api/import-data', (req, res) => {
    const { data } = req.body;
    if (!data) return res.status(400).json({ error: 'No data provided' });

    const promises = [];

    if (data.medications) {
        promises.push(new Promise((resolve, reject) => {
            db.query('DELETE FROM medications', (err) => {
                if (err) return reject(err);
                if (!data.medications.length) return resolve();
                const values = data.medications.map(m => [m.name, m.dosage, m.frequency, m.time, m.taken || false]);
                db.query('INSERT INTO medications (name, dosage, frequency, time, taken) VALUES ?', [values],
                    (err) => err ? reject(err) : resolve());
            });
        }));
    }

    Promise.all(promises)
        .then(() => res.json({ success: true, message: 'Data imported successfully' }))
        .catch(err => res.status(500).json({ error: 'Import failed', details: err.message }));
});

// FIX: db.state replaced — system-info now uses a live ping for db status
app.get('/api/system-info', (req, res) => {
    db.query('SELECT 1', (err) => {
        res.json({
            nodeVersion: process.version,
            platform: process.platform,
            memory: process.memoryUsage(),
            uptime: process.uptime(),
            database: {
                host: process.env.DB_HOST || 'localhost',
                database: process.env.DB_NAME || 'medical_tracker',
                connected: !err
            },
            environment: process.env.NODE_ENV || 'development'
        });
    });
});

app.get('/', (req, res) => res.render('index.html'));
app.get('/ai-assistant', (req, res) => res.render('ai-assistant.html'));

app.get('/api', (req, res) => {
    res.json({
        message: 'MediTrack API',
        version: '2.0.0',
        endpoints: {
            medications: '/api/medications',
            reminders: '/api/reminders',
            vitals: '/api/vitals',
            appointments: '/api/appointments',
            dashboard: '/api/dashboard-stats',
            health: '/health'
        }
    });
});

app.use((err, req, res, next) => {
    console.error('Error:', err.stack);
    if (err.code === 'ECONNREFUSED' || err.code === 'PROTOCOL_CONNECTION_LOST') {
        return res.status(503).json({ error: 'Database unavailable' });
    }
    if (err.code && err.code.startsWith('ER_')) {
        return res.status(400).json({ error: 'Database error', message: err.message });
    }
    res.status(500).json({ error: 'Internal server error', message: err.message });
});

app.use('/api/*', (req, res) => {
    res.status(404).json({ error: 'Endpoint not found', path: req.originalUrl });
});

app.use('*', (req, res) => {
    res.status(404).send(`<!DOCTYPE html><html><head><title>404 - MediTrack</title>
    <style>body{font-family:sans-serif;background:linear-gradient(135deg,#667eea,#764ba2);color:white;text-align:center;padding:60px}
    a{color:white;border:2px solid white;padding:10px 20px;border-radius:8px;text-decoration:none;margin:8px;display:inline-block}
    a:hover{background:white;color:#667eea}</style></head>
    <body><h1>404</h1><h2>Page Not Found</h2>
    <a href="/">Medical Tracker</a><a href="/ai-assistant">AI Assistant</a></body></html>`);
});

// Graceful shutdown
const shutdown = () => {
    console.log('\n🛑 Shutting down gracefully...');
    db.end((err) => {
        if (err) console.error(err);
        process.exit(err ? 1 : 0);
    });
};
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

// FIX: db health check — replaced db.state with live query
setInterval(() => {
    db.query('SELECT 1', (err) => {
        if (err) {
            console.log('⚠️  DB ping failed. Attempting reconnect...');
            connectWithRetry();
        }
    });
}, 30000);

const PORT = process.env.PORT || 3000;
const HOST = process.env.HOST || '0.0.0.0';

const server = app.listen(PORT, HOST, () => {
    console.log(`
    🏥 MediTrack Server
    ========================
    Medical Tracker : http://${HOST}:${PORT}
    AI Assistant    : http://${HOST}:${PORT}/ai-assistant
    Health Check    : http://${HOST}:${PORT}/health
    ========================
    `);
});

server.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
        console.error(`Port ${PORT} already in use.`);
        process.exit(1);
    }
    throw err;
});

process.on('uncaughtException', (err) => { console.error('Uncaught:', err); shutdown(); });
process.on('unhandledRejection', (reason) => { console.error('Unhandled rejection:', reason); shutdown(); });

module.exports = app;
