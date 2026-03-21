const express = require('express');
const router = express.Router();

router.get('/', (req, res) => {
    const db = req.app.locals.db;
    db.query('SELECT * FROM reminders ORDER BY date_time ASC', (err, results) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(results);
    });
});

router.post('/', (req, res) => {
    const db = req.app.locals.db;
    const { title, date_time, notes } = req.body;
    if (!title || !date_time) {
        return res.status(400).json({ error: 'title and date_time are required' });
    }
    db.query(
        'INSERT INTO reminders (title, date_time, notes) VALUES (?, ?, ?)',
        [title, date_time, notes || null],
        (err, result) => {
            if (err) return res.status(500).json({ error: err.message });
            res.status(201).json({ id: result.insertId, title, date_time, notes, notified: false });
        }
    );
});

router.put('/:id/notify', (req, res) => {
    const db = req.app.locals.db;
    db.query('UPDATE reminders SET notified = 1 WHERE id = ?', [req.params.id], (err) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ success: true });
    });
});

router.delete('/:id', (req, res) => {
    const db = req.app.locals.db;
    db.query('DELETE FROM reminders WHERE id = ?', [req.params.id], (err) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ success: true });
    });
});

module.exports = router;
