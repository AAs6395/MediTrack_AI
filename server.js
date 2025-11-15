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
app.use(bodyParser.urlencoded({ extended: true }));//helps read form submissions
app.use(express.static(path.join(__dirname, 'static')));
app.set('view engine', 'html');
app.engine('html', require('ejs').renderFile);
app.set('views', path.join(__dirname, 'templates'));

// Database Connection
const db = mysql.createConnection({
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || 'aashish@1234',
    database: process.env.DB_NAME || 'medical_tracker',
    charset: 'utf8mb4',
    connectTimeout: 60000,//Timeout settings increased
    acquireTimeout: 60000,
    timeout: 60000,
    reconnect: true// auto reconnect enabled 
});

// Enhanced connection handling with retry logic
const connectWithRetry = () => {
    db.connect((err) => {
        if (err) {
            console.error('Database connection failed:', err.message);
            console.log('Retrying connection in 5 seconds...');
            setTimeout(connectWithRetry, 5000);
            return;
        }
        console.log('✅ Connected to MySQL database');
        console.log('📊 Database: medical_tracker');
        
        // Verify tables exist
        verifyTables();
    });
};

// Verify all required tables exist
const verifyTables = () => {
    const tables = ['medications', 'reminders', 'vitals', 'appointments'];
    
    tables.forEach(table => {
        db.query(`SHOW TABLES LIKE '${table}'`, (err, results) => {
            if (err) {
                console.error(`Error checking ${table} table:`, err);
                return;
            }
            
            if (results.length === 0) {
                console.warn(`⚠️  Table '${table}' does not exist. Please run database.sql`);
            } else {
                console.log(`✅ Table '${table}' verified`);
            }
        });
    });
};

//starts DB connection
connectWithRetry();

// Handle database connection errors
db.on('error', (err) => {
    console.error('Database error:', err);
    if (err.code === 'PROTOCOL_CONNECTION_LOST' || err.code === 'ECONNRESET') {
        console.log('Database connection lost. Attempting to reconnect...');
        connectWithRetry();
    } else {
        throw err;
    }
});

// Make db accessible to routes
app.locals.db = db;

// Import Routes
const medicationRoutes = require('./routes/medications');
const reminderRoutes = require('./routes/reminders');
const vitalRoutes = require('./routes/vitals');
const appointmentRoutes = require('./routes/appointments');

// Use Routes
app.use('/api/medications', medicationRoutes);
app.use('/api/reminders', reminderRoutes);
app.use('/api/vitals', vitalRoutes);
app.use('/api/appointments', appointmentRoutes);

// checks wether the server is running
app.get('/health', (req, res) => {
    const healthcheck = {
        uptime: process.uptime(),
        message: 'OK',
        timestamp: Date.now(),
        database: db.state === 'connected' ? 'connected' : 'disconnected'
    };
    
    try {
        res.status(200).json(healthcheck);
    } catch (error) {
        healthcheck.message = error;
        res.status(503).json(healthcheck);
    }
});

// Checks if database is responding.
app.get('/api/db-status', (req, res) => {
    db.query('SELECT 1 + 1 AS solution', (err, results) => {
        if (err) {
            return res.status(500).json({ 
                status: 'error', 
                message: 'Database connection failed',
                error: err.message 
            });
        }
        
        res.json({ 
            status: 'success', 
            message: 'Database is connected and responsive',
            queryResult: results[0].solution 
        });
    });
});

// creates an api endpoint and fetch dashboard statistics
app.get('/api/dashboard-stats', async (req, res) => {
    try {
        const stats = await getDashboardStats();
        res.json(stats);
    } catch (error) {
        console.error('Error fetching dashboard stats:', error);
        res.status(500).json({ 
            error: 'Failed to fetch dashboard statistics',
            details: error.message 
        });
    }
});

// Get comprehensive dashboard statistics
const getDashboardStats = () => {
    return new Promise((resolve, reject) => {
        const queries = {
            medications: 'SELECT COUNT(*) as total, SUM(taken) as taken FROM medications',
            reminders: `SELECT 
                COUNT(*) as total,
                SUM(CASE WHEN DATE(date_time) = CURDATE() THEN 1 ELSE 0 END) as today,
                SUM(CASE WHEN date_time >= NOW() THEN 1 ELSE 0 END) as upcoming
                FROM reminders`,
            vitals: 'SELECT COUNT(*) as total FROM vitals',
            appointments: `SELECT 
                COUNT(*) as total,
                SUM(CASE WHEN date_time >= NOW() THEN 1 ELSE 0 END) as upcoming
                FROM appointments`
        };

        // stores queries result 
        const results = {};
        let completedQueries = 0;
        const totalQueries = Object.keys(queries).length;

        // count finished queries , return final dashboard results
        const checkCompletion = () => {
            completedQueries++;
            if (completedQueries === totalQueries) {
                resolve({
                    medications: results.medications[0],
                    reminders: results.reminders[0],
                    vitals: results.vitals[0],
                    appointments: results.appointments[0],
                    lastUpdated: new Date().toISOString()
                });
            }
        };

        // Execute all queries
        db.query(queries.medications, (err, medResults) => {
            if (err) {
                console.error('Medications query error:', err);
                results.medications = [{ total: 0, taken: 0 }];
            } else {
                results.medications = medResults;
            }
            checkCompletion();
        });

        db.query(queries.reminders, (err, remResults) => {
            if (err) {
                console.error('Reminders query error:', err);
                results.reminders = [{ total: 0, today: 0, upcoming: 0 }];
            } else {
                results.reminders = remResults;
            }
            checkCompletion();
        });

        db.query(queries.vitals, (err, vitResults) => {
            if (err) {
                console.error('Vitals query error:', err);
                results.vitals = [{ total: 0 }];
            } else {
                results.vitals = vitResults;
            }
            checkCompletion();
        });

        db.query(queries.appointments, (err, aptResults) => {
            if (err) {
                console.error('Appointments query error:', err);
                results.appointments = [{ total: 0, upcoming: 0 }];
            } else {
                results.appointments = aptResults;
            }
            checkCompletion();
        });
    });
};

// export all tables from database as backup
app.get('/api/export-data', (req, res) => {
    const exportQueries = {
        medications: 'SELECT * FROM medications',
        reminders: 'SELECT * FROM reminders',
        vitals: 'SELECT * FROM vitals',
        appointments: 'SELECT * FROM appointments'
    };

    const exportData = {};
    let completedQueries = 0;
    const totalQueries = Object.keys(exportQueries).length;

    const checkCompletion = () => {
        completedQueries++;
        if (completedQueries === totalQueries) {
            res.json({
                success: true,
                exportedAt: new Date().toISOString(),
                data: exportData
            });
        }
    };

    // checks if all queries are done
    Object.keys(exportQueries).forEach(table => {
        db.query(exportQueries[table], (err, results) => {
            if (err) {
                exportData[table] = { error: err.message };
            } else {
                exportData[table] = results;
            }
            checkCompletion();
        });
    });
});

// Data Import Endpoint (for restore)
app.post('/api/import-data', (req, res) => {
    const { data } = req.body;
    
    if (!data) {
        return res.status(400).json({ error: 'No data provided for import' });
    }

    // This is a simplified import - in production, you'd want more validation
    const importPromises = [];
    
    // clears the medication table and insert the new medication data provided by the user
    if (data.medications) {
        const promise = new Promise((resolve, reject) => {
            db.query('DELETE FROM medications', (err) => {
                if (err) reject(err);
                
                if (data.medications.length > 0) {
                    const values = data.medications.map(med => 
                        [med.name, med.dosage, med.frequency, med.time, med.taken || false]
                    );
                    
                    db.query(
                        'INSERT INTO medications (name, dosage, frequency, time, taken) VALUES ?',
                        [values],
                        (err) => err ? reject(err) : resolve()
                    );
                } else {
                    resolve();
                }
            });
        });
        importPromises.push(promise);
    }

    // Similar logic for other tables...

    Promise.all(importPromises)
        .then(() => {
            res.json({ success: true, message: 'Data imported successfully' });
        })
        .catch(error => {
            console.error('Import error:', error);
            res.status(500).json({ error: 'Failed to import data' });
        });
});

// System Information Endpoint and helps in debugging
app.get('/api/system-info', (req, res) => {
    const systemInfo = {
        nodeVersion: process.version,
        platform: process.platform,
        memory: process.memoryUsage(),
        uptime: process.uptime(),
        database: {
            host: process.env.DB_HOST || 'localhost',
            database: process.env.DB_NAME || 'medical_tracker',
            state: db.state
        },
        environment: process.env.NODE_ENV || 'development'
    };
    
    res.json(systemInfo);
});

// Serve Medical Tracker Main Page
app.get('/', (req, res) => {
    res.render('index.html');
});

// Serve AI Assistant Page
app.get('/ai-assistant', (req, res) => {
    res.render('ai-assistant.html');
});

// Serve Medical Tracker API Info and show all available APIs
app.get('/api', (req, res) => {
    res.json({
        message: 'Medical Tracking & Engagement Kit API',
        version: '1.0.0',
        endpoints: {
            medications: '/api/medications',
            reminders: '/api/reminders',
            vitals: '/api/vitals',
            appointments: '/api/appointments',
            dashboard: '/api/dashboard-stats',
            health: '/health',
            system: '/api/system-info'
        },
        documentation: 'See README.md for API documentation'
    });
});

// Enhanced Error handling middleware prints full error details
app.use((err, req, res, next) => {
    console.error('Error Stack:', err.stack);
    
    // Database connection errors checks database is reachable or not 
    if (err.code === 'ECONNREFUSED' || err.code === 'PROTOCOL_CONNECTION_LOST') {
        return res.status(503).json({ 
            error: 'Database service unavailable',
            message: 'Please check your database connection and try again'
        });
    }
    
    // MySQL errors send error message and response
    if (err.code && err.code.startsWith('ER_')) {
        return res.status(400).json({ 
            error: 'Database error',
            message: err.message,
            code: err.code
        });
    }
    
    // Default error unexpected error happens not database specific it display error
    res.status(500).json({ 
        error: 'Internal server error',
        message: process.env.NODE_ENV === 'development' ? err.message : 'Something went wrong!',
        ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
    });
});

// handle the json response that api does not exist
app.use('/api/*', (req, res) => {
    res.status(404).json({ 
        error: 'Endpoint not found',
        message: `The requested API endpoint ${req.originalUrl} does not exist.`
    });
});

// 404 Handler for other routes
app.use('*', (req, res) => {
    if (req.accepts('html')) {
        res.status(404).send(`
            <!DOCTYPE html>
            <html>
            <head>
                <title>Page Not Found - Medical Tracker</title>
                <style>
                    body { 
                        font-family: 'Inter', sans-serif; 
                        background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                        color: white; 
                        text-align: center; 
                        padding: 50px; 
                    }
                    .container { 
                        max-width: 500px; 
                        margin: 0 auto; 
                    }
                    h1 { 
                        font-size: 3em; 
                        margin-bottom: 20px; 
                    }
                    a { 
                        color: white; 
                        text-decoration: none; 
                        border: 2px solid white; 
                        padding: 10px 20px; 
                        border-radius: 5px; 
                        display: inline-block; 
                        margin-top: 20px; 
                    }
                    a:hover { 
                        background: white; 
                        color: #667eea; 
                    }
                </style>
            </head>
            <body>
                <div class="container">
                    <h1>404</h1>
                    <h2>Page Not Found</h2>
                    <p>The page you are looking for doesn't exist.</p>
                    <a href="/">Go to Medical Tracker</a>
                    <br>
                    <a href="/ai-assistant">Go to AI Assistant</a>
                </div>
            </body>
            </html>
        `);
    } else if (req.accepts('json')) {
        res.status(404).json({ 
            error: 'Page not found',
            message: 'The requested page does not exist.'
        });
    } else {
        res.status(404).type('txt').send('404 - Page Not Found');
    }
});

// Graceful shutdown handling
process.on('SIGINT', () => {
    console.log('\n🛑 Received SIGINT. Shutting down gracefully...');
    shutdown();
});

//os tells the server to stop
process.on('SIGTERM', () => {
    console.log('🛑 Received SIGTERM. Shutting down gracefully...');
    shutdown();
});

// for closing the database
function shutdown() {
    console.log('Closing database connections...');
    db.end((err) => {
        if (err) {
            console.error('Error closing database connection:', err);
            process.exit(1);
        }
        console.log('✅ Database connections closed.');
        console.log('👋 Server shutdown complete.');
        process.exit(0);
    });
}

// Database connection health monitoring
setInterval(() => {
    if (db.state !== 'connected') {
        console.log('⚠️  Database connection lost. Attempting to reconnect...');
        connectWithRetry();
    }
}, 30000); 

// Start Server it listens on the chosen host and port
const PORT = process.env.PORT || 3000;
const HOST = process.env.HOST || '0.0.0.0';

const server = app.listen(PORT, HOST, () => {
    console.log(`
    🏥 Medical Tracking & Engagement Kit Server
    ==========================================
    ✅ Server is running on port ${PORT}
    📊 Medical Tracker: http://${HOST}:${PORT}
    🤖 AI Assistant: http://${HOST}:${PORT}/ai-assistant
    🔌 Health Check: http://${HOST}:${PORT}/health
    📚 API Documentation: http://${HOST}:${PORT}/api
    
    Environment: ${process.env.NODE_ENV || 'development'}
    Database: ${process.env.DB_NAME || 'medical_tracker'}
    ==========================================
    `);
});

// Handle server errors
server.on('error', (error) => {
    if (error.code === 'EADDRINUSE') {
        console.error(`❌ Port ${PORT} is already in use.`);
        console.log('Please choose a different port or stop the other process.');
        process.exit(1);
    } else {
        console.error('❌ Server error:', error);
        process.exit(1);
    }
});

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
    console.error('💥 Uncaught Exception:', error);
    console.log('🛑 Server shutting down due to uncaught exception...');
    shutdown();
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('💥 Unhandled Rejection at:', promise, 'reason:', reason);
    console.log('🛑 Server shutting down due to unhandled rejection...');
    shutdown();
});

// allw the express application to be used by other
module.exports = app;