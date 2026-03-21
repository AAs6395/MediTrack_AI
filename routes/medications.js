const express = require('express');
const router = express.Router();

// GET all medications
router.get('/', (req, res) => {
    const db = req.app.locals.db;
    db.query('SELECT * FROM medications ORDER BY time ASC', (err, results) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(results);
    });
});

// POST add medication
router.post('/', (req, res) => {
    const db = req.app.locals.db;
    const { name, dosage, frequency, time } = req.body;
    if (!name || !dosage || !time) {
        return res.status(400).json({ error: 'name, dosage and time are required' });
    }
    db.query(
        'INSERT INTO medications (name, dosage, frequency, time) VALUES (?, ?, ?, ?)',
        [name, dosage, frequency || 'Once daily', time],
        (err, result) => {
            if (err) return res.status(500).json({ error: err.message });
            res.status(201).json({ id: result.insertId, name, dosage, frequency, time, taken: false });
        }
    );
});

// PUT mark as taken
router.put('/:id/taken', (req, res) => {
    const db = req.app.locals.db;
    const { taken } = req.body;
    db.query('UPDATE medications SET taken = ? WHERE id = ?', [taken ? 1 : 0, req.params.id], (err) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ success: true });
    });
});

// DELETE medication
router.delete('/:id', (req, res) => {
    const db = req.app.locals.db;
    db.query('DELETE FROM medications WHERE id = ?', [req.params.id], (err) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ success: true });
    });
});

module.exports = router;
