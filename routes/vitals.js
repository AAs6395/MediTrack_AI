const express = require('express');
const router = express.Router();

router.get('/', (req, res) => {
    const db = req.app.locals.db;
    db.query('SELECT * FROM vitals ORDER BY recorded_date DESC', (err, results) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(results);
    });
});

router.post('/', (req, res) => {
    const db = req.app.locals.db;
    const { blood_pressure, heart_rate, temperature, blood_sugar } = req.body;
    if (!blood_pressure && !heart_rate && !temperature && !blood_sugar) {
        return res.status(400).json({ error: 'At least one vital sign is required' });
    }
    db.query(
        'INSERT INTO vitals (blood_pressure, heart_rate, temperature, blood_sugar) VALUES (?, ?, ?, ?)',
        [blood_pressure || null, heart_rate || null, temperature || null, blood_sugar || null],
        (err, result) => {
            if (err) return res.status(500).json({ error: err.message });
            res.status(201).json({ id: result.insertId, blood_pressure, heart_rate, temperature, blood_sugar });
        }
    );
});

router.delete('/:id', (req, res) => {
    const db = req.app.locals.db;
    db.query('DELETE FROM vitals WHERE id = ?', [req.params.id], (err) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ success: true });
    });
});

module.exports = router;
