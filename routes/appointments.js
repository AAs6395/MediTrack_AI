const express = require('express');
const router = express.Router();

router.get('/', (req, res) => {
    const db = req.app.locals.db;
    db.query('SELECT * FROM appointments ORDER BY date_time ASC', (err, results) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(results);
    });
});

router.post('/', (req, res) => {
    const db = req.app.locals.db;
    const { doctor, type, date_time, location } = req.body;
    if (!doctor || !date_time) {
        return res.status(400).json({ error: 'doctor and date_time are required' });
    }
    db.query(
        'INSERT INTO appointments (doctor, type, date_time, location) VALUES (?, ?, ?, ?)',
        [doctor, type || 'Check-up', date_time, location || null],
        (err, result) => {
            if (err) return res.status(500).json({ error: err.message });
            res.status(201).json({ id: result.insertId, doctor, type, date_time, location });
        }
    );
});

router.delete('/:id', (req, res) => {
    const db = req.app.locals.db;
    db.query('DELETE FROM appointments WHERE id = ?', [req.params.id], (err) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ success: true });
    });
});

module.exports = router;
