// MediTrack AI — Frontend Controller
// FIX: API_URL points to Node (port 3000); health check uses /health (no /api prefix)
const API_URL = 'http://localhost:3000/api';

let medications = [], reminders = [], vitals = [], appointments = [];
let audioCtx, hasPlayedSound = new Set();

document.addEventListener('DOMContentLoaded', initApp);

async function initApp() {
    try {
        await checkServerHealth();
        await loadAll();
        checkReminders();
        requestNotificationPermission();
        initAudio();
        setInterval(checkReminders, 60000);
        setInterval(updateStats, 30000);
        toast('Welcome to MediTrack AI 🏥');
    } catch (e) {
        console.error('Init failed:', e);
        toast('Could not connect to server — running in offline mode.', 'warn');
    }
}

// FIX: server.js exposes /health not /api/health
async function checkServerHealth() {
    const healthUrl = API_URL.replace('/api', '') + '/health';
    const r = await fetch(healthUrl);
    if (!r.ok) throw new Error('Server not responding');
    return r.json();
}

function initAudio() {
    try { audioCtx = new (window.AudioContext || window.webkitAudioContext)(); }
    catch (e) { console.log('Web Audio not available'); }
}

function playSound(type = 'reminder') {
    if (!audioCtx) { initAudio(); if (!audioCtx) return; }
    if (audioCtx.state === 'suspended') audioCtx.resume();
    try {
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        osc.connect(gain); gain.connect(audioCtx.destination);
        if (type === 'urgent') {
            osc.frequency.value = 880;
            gain.gain.setValueAtTime(.3, audioCtx.currentTime);
            gain.gain.exponentialRampToValueAtTime(.01, audioCtx.currentTime + .15);
            osc.start(); osc.stop(audioCtx.currentTime + .15);
        } else {
            osc.type = 'sine';
            osc.frequency.setValueAtTime(523, audioCtx.currentTime);
            osc.frequency.setValueAtTime(659, audioCtx.currentTime + .1);
            osc.frequency.setValueAtTime(784, audioCtx.currentTime + .2);
            gain.gain.setValueAtTime(.25, audioCtx.currentTime);
            gain.gain.exponentialRampToValueAtTime(.01, audioCtx.currentTime + .5);
            osc.start(); osc.stop(audioCtx.currentTime + .5);
        }
    } catch (e) { console.log('Sound error:', e); }
}

async function loadAll() {
    await Promise.all([loadMedications(), loadReminders(), loadVitals(), loadAppointments()]);
    updateStats();
}

function updateStats() {
    safeSet('totalMeds', medications.length);
    const today = new Date(); today.setHours(0,0,0,0);
    safeSet('todayReminders', reminders.filter(r => {
        const d = new Date(r.date_time); d.setHours(0,0,0,0);
        return d.getTime() === today.getTime();
    }).length);
    safeSet('upcomingAppointments', appointments.filter(a => new Date(a.date_time) >= new Date()).length);
    safeSet('vitalRecords', vitals.length);
}
function safeSet(id, val) { const el = document.getElementById(id); if (el) el.textContent = val; }

// ======= MEDICATIONS =======
async function loadMedications() {
    try {
        const r = await fetch(`${API_URL}/medications`);
        if (!r.ok) throw new Error('Failed');
        medications = await r.json();
        renderMedications();
    } catch (e) { console.error('Load meds:', e); }
}

async function addMedication() {
    const name = val('medName'), dosage = val('medDosage'),
          frequency = val('medFrequency'), time = val('medTime');
    if (!name || !dosage || !time) { toast('Please fill in all medication fields', 'warn'); return; }
    try {
        const r = await fetch(`${API_URL}/medications`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name, dosage, frequency, time })
        });
        if (!r.ok) { const e = await r.json(); throw new Error(e.error); }
        clearFields('medName','medDosage','medTime');
        await loadMedications(); updateStats();
        toast('Medication added! 💊', 'success');
    } catch (e) { toast(`Error: ${e.message}`, 'error'); }
}

function renderMedications() {
    const list = document.getElementById('medicationList');
    if (!list) return;
    if (!medications.length) { list.innerHTML = emptyState('💊','No medications added','Add your first medication above'); return; }
    list.innerHTML = medications.map(m => `
        <div class="list-item">
            <div class="li-head">
                <span class="li-name">${esc(m.name)}</span>
                <span class="badge ${m.taken ? 'badge-ok' : 'badge-warn'}">${m.taken ? 'Taken' : 'Pending'}</span>
            </div>
            <div class="li-body">
                <strong>Dosage:</strong> ${esc(m.dosage)} &nbsp;·&nbsp;
                <strong>Frequency:</strong> ${esc(m.frequency)} &nbsp;·&nbsp;
                <strong>Time:</strong> ${fmtTime(m.time)}
            </div>
            <div class="li-actions">
                ${!m.taken ? `<button class="btn-sm btn-taken" onclick="markTaken(${m.id})"><i class="fas fa-check"></i> Mark Taken</button>` : ''}
                <button class="btn-sm btn-del" onclick="deleteMedication(${m.id})"><i class="fas fa-trash"></i> Delete</button>
            </div>
        </div>`).join('');
}

async function markTaken(id) {
    try {
        await fetch(`${API_URL}/medications/${id}/taken`, {
            method: 'PUT', headers: {'Content-Type':'application/json'},
            body: JSON.stringify({ taken: true })
        });
        await loadMedications();
        toast('Medication marked as taken ✅', 'success');
    } catch (e) { toast('Error updating medication', 'error'); }
}

async function deleteMedication(id) {
    if (!confirm('Delete this medication?')) return;
    try {
        await fetch(`${API_URL}/medications/${id}`, { method: 'DELETE' });
        await loadMedications(); updateStats();
        toast('Deleted 🗑️');
    } catch (e) { toast('Error deleting', 'error'); }
}

// ======= REMINDERS =======
async function loadReminders() {
    try {
        const r = await fetch(`${API_URL}/reminders`);
        if (!r.ok) throw new Error('Failed');
        reminders = await r.json();
        renderReminders();
    } catch (e) { console.error('Load reminders:', e); }
}

async function addReminder() {
    const title = val('reminderTitle'), dateTime = val('reminderDateTime'), notes = val('reminderNotes');
    if (!title || !dateTime) { toast('Please fill in title and date/time', 'warn'); return; }
    if (new Date(dateTime) <= new Date()) { toast('Please select a future date/time', 'warn'); return; }
    try {
        const r = await fetch(`${API_URL}/reminders`, {
            method: 'POST', headers: {'Content-Type':'application/json'},
            body: JSON.stringify({ title, date_time: dateTime, notes: notes || null })
        });
        if (!r.ok) { const e = await r.json(); throw new Error(e.error); }
        clearFields('reminderTitle','reminderDateTime','reminderNotes');
        await loadReminders(); updateStats();
        toast('Reminder set! ⏰', 'success');
    } catch (e) { toast(`Error: ${e.message}`, 'error'); }
}

function renderReminders() {
    const list = document.getElementById('reminderList');
    if (!list) return;
    if (!reminders.length) { list.innerHTML = emptyState('⏰','No reminders set','Add a reminder using the + button above'); return; }
    const now = new Date();
    list.innerHTML = reminders.map(rem => {
        const d = new Date(rem.date_time), past = d < now;
        return `<div class="list-item">
            <div class="li-head">
                <span class="li-name">${esc(rem.title)}</span>
                <span class="badge ${past ? 'badge-bad' : 'badge-ok'}">${past ? 'Past' : 'Upcoming'}</span>
            </div>
            <div class="li-body">
                <strong>When:</strong> ${fmtDateTime(rem.date_time)}
                ${rem.notes ? `<br><strong>Notes:</strong> ${esc(rem.notes)}` : ''}
            </div>
            <div class="li-actions">
                <button class="btn-sm btn-del" onclick="deleteReminder(${rem.id})"><i class="fas fa-trash"></i> Delete</button>
            </div>
        </div>`;
    }).join('');
}

async function deleteReminder(id) {
    if (!confirm('Delete this reminder?')) return;
    try {
        await fetch(`${API_URL}/reminders/${id}`, { method: 'DELETE' });
        hasPlayedSound.delete(`${id}-5min`); hasPlayedSound.delete(`${id}-now`);
        await loadReminders(); updateStats();
        toast('Reminder deleted 🗑️');
    } catch (e) { toast('Error deleting', 'error'); }
}

function checkReminders() {
    const now = new Date();
    reminders.forEach(rem => {
        const t = new Date(rem.date_time), diff = t - now;
        if (diff > 0 && diff <= 300000 && !hasPlayedSound.has(`${rem.id}-5min`)) {
            playSound('reminder');
            sendNotification(rem.title, `Reminder in 5 minutes: ${rem.title}`);
            toast(`⏰ "${rem.title}" in 5 minutes!`);
            fetch(`${API_URL}/reminders/${rem.id}/notify`, { method: 'PUT' }).catch(() => {});
            hasPlayedSound.add(`${rem.id}-5min`);
        } else if (diff > -60000 && diff <= 0 && !hasPlayedSound.has(`${rem.id}-now`)) {
            playSound('urgent');
            sendNotification(rem.title, `Time for: ${rem.title}!`);
            toast(`🔔 Time for: "${rem.title}"!`);
            fetch(`${API_URL}/reminders/${rem.id}/notify`, { method: 'PUT' }).catch(() => {});
            hasPlayedSound.add(`${rem.id}-now`);
        }
    });
}

function sendNotification(title, body) {
    if (!('Notification' in window)) return;
    if (Notification.permission === 'granted') {
        const n = new Notification(title, { body, tag: 'meditrack' });
        setTimeout(() => n.close(), 10000);
    }
}
function requestNotificationPermission() {
    if ('Notification' in window && Notification.permission === 'default') {
        setTimeout(() => Notification.requestPermission(), 3000);
    }
}

// ======= VITALS =======
async function loadVitals() {
    try {
        const r = await fetch(`${API_URL}/vitals`);
        if (!r.ok) throw new Error('Failed');
        vitals = await r.json();
        renderVitals();
    } catch (e) { console.error('Load vitals:', e); }
}

async function addVitalSigns() {
    const bp = val('bloodPressure'), hr = val('heartRate'),
          temp = val('temperature'), sugar = val('bloodSugar');
    if (!bp && !hr && !temp && !sugar) { toast('Enter at least one vital sign', 'warn'); return; }
    if (bp && !/^\d{2,3}\/\d{2,3}$/.test(bp)) { toast('Blood pressure format: 120/80', 'warn'); return; }
    if (hr && (hr < 30 || hr > 220)) { toast('Heart rate should be 30–220 bpm', 'warn'); return; }
    if (temp && (temp < 90 || temp > 115)) { toast('Temperature seems out of range', 'warn'); return; }
    try {
        const r = await fetch(`${API_URL}/vitals`, {
            method: 'POST', headers: {'Content-Type':'application/json'},
            body: JSON.stringify({ blood_pressure: bp||null, heart_rate: hr||null, temperature: temp||null, blood_sugar: sugar||null })
        });
        if (!r.ok) { const e = await r.json(); throw new Error(e.error); }
        clearFields('bloodPressure','heartRate','temperature','bloodSugar');
        await loadVitals(); updateStats();
        toast('Vital signs recorded! ❤️', 'success');
    } catch (e) { toast(`Error: ${e.message}`, 'error'); }
}

function renderVitals() {
    const list = document.getElementById('vitalsList');
    if (!list) return;
    if (!vitals.length) { list.innerHTML = emptyState('❤️','No vitals recorded','Record your first vital signs above'); return; }
    list.innerHTML = vitals.map(v => `
        <div class="list-item">
            <div class="li-head">
                <span class="li-name">Vital Record</span>
                <span class="badge badge-ok">${fmtDate(v.recorded_date)}</span>
            </div>
            <div class="li-body">
                ${v.blood_pressure ? `<strong>BP:</strong> <span class="${bpClass(v.blood_pressure)}">${v.blood_pressure} mmHg</span> &nbsp;` : ''}
                ${v.heart_rate     ? `<strong>HR:</strong> <span class="${hrClass(v.heart_rate)}">${v.heart_rate} bpm</span> &nbsp;` : ''}
                ${v.temperature    ? `<strong>Temp:</strong> <span class="${tempClass(v.temperature)}">${v.temperature}°F</span> &nbsp;` : ''}
                ${v.blood_sugar    ? `<strong>Sugar:</strong> <span class="${sugarClass(v.blood_sugar)}">${v.blood_sugar} mg/dL</span>` : ''}
            </div>
            <div class="li-actions">
                <button class="btn-sm btn-del" onclick="deleteVital(${v.id})"><i class="fas fa-trash"></i> Delete</button>
            </div>
        </div>`).join('');
}

function bpClass(bp)    { const [s,d]=bp.split('/').map(Number); return s>140||d>90?'v-high':s<90||d<60?'v-low':'v-normal'; }
function hrClass(hr)    { return hr>100?'v-high':hr<60?'v-low':'v-normal'; }
function tempClass(t)   { return t>99.5?'v-high':t<97.5?'v-low':'v-normal'; }
function sugarClass(s)  { return s>140?'v-high':s<70?'v-low':'v-normal'; }

async function deleteVital(id) {
    if (!confirm('Delete this vital record?')) return;
    try {
        await fetch(`${API_URL}/vitals/${id}`, { method: 'DELETE' });
        await loadVitals(); updateStats(); toast('Deleted 🗑️');
    } catch (e) { toast('Error deleting', 'error'); }
}

// ======= APPOINTMENTS =======
async function loadAppointments() {
    try {
        const r = await fetch(`${API_URL}/appointments`);
        if (!r.ok) throw new Error('Failed');
        appointments = await r.json();
        renderAppointments();
    } catch (e) { console.error('Load appointments:', e); }
}

async function addAppointment() {
    const doctor = val('appointmentDoctor'), type = val('appointmentType'),
          dateTime = val('appointmentDateTime'), location = val('appointmentLocation');
    if (!doctor || !dateTime) { toast('Please fill in doctor and date/time', 'warn'); return; }
    if (new Date(dateTime) <= new Date()) { toast('Please select a future date/time', 'warn'); return; }
    try {
        const r = await fetch(`${API_URL}/appointments`, {
            method: 'POST', headers: {'Content-Type':'application/json'},
            body: JSON.stringify({ doctor, type, date_time: dateTime, location: location||null })
        });
        if (!r.ok) { const e = await r.json(); throw new Error(e.error); }
        clearFields('appointmentDoctor','appointmentDateTime','appointmentLocation');
        await loadAppointments(); updateStats();
        toast('Appointment scheduled! 📅', 'success');
    } catch (e) { toast(`Error: ${e.message}`, 'error'); }
}

function renderAppointments() {
    const list = document.getElementById('appointmentList');
    if (!list) return;
    if (!appointments.length) { list.innerHTML = emptyState('📅','No appointments scheduled','Schedule your first appointment above'); return; }
    const now = new Date();
    list.innerHTML = appointments.map(a => {
        const past = new Date(a.date_time) < now;
        return `<div class="list-item">
            <div class="li-head">
                <span class="li-name">${esc(a.doctor)}</span>
                <span class="badge ${past ? 'badge-bad' : 'badge-ok'}">${past ? 'Past' : 'Upcoming'}</span>
            </div>
            <div class="li-body">
                <strong>Type:</strong> ${esc(a.type)} &nbsp;·&nbsp;
                <strong>When:</strong> ${fmtDateTime(a.date_time)}
                ${a.location ? `<br><strong>Where:</strong> ${esc(a.location)}` : ''}
            </div>
            <div class="li-actions">
                <button class="btn-sm btn-del" onclick="deleteAppointment(${a.id})"><i class="fas fa-trash"></i> Delete</button>
            </div>
        </div>`;
    }).join('');
}

async function deleteAppointment(id) {
    if (!confirm('Delete this appointment?')) return;
    try {
        await fetch(`${API_URL}/appointments/${id}`, { method: 'DELETE' });
        await loadAppointments(); updateStats(); toast('Deleted 🗑️');
    } catch (e) { toast('Error deleting', 'error'); }
}

// ======= EXPORT / IMPORT =======
async function exportData() {
    try {
        const r = await fetch(`${API_URL}/export-data`);
        if (!r.ok) throw new Error('Failed');
        const data = await r.json();
        const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `meditrack-backup-${new Date().toISOString().split('T')[0]}.json`;
        document.body.appendChild(a); a.click(); document.body.removeChild(a);
        URL.revokeObjectURL(url);
        toast('Data exported! 💾', 'success');
    } catch (e) { toast('Export failed', 'error'); }
}

// ======= HELPERS =======
function val(id) {
    const el = document.getElementById(id);
    return el ? el.value.trim() : '';
}
function clearFields(...ids) {
    ids.forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });
}
function esc(s) {
    if (!s) return '';
    return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
        .replace(/"/g,'&quot;').replace(/'/g,'&#039;');
}
function fmtDateTime(s) {
    try { return new Date(s).toLocaleString('en-US', { year:'numeric',month:'short',day:'numeric',hour:'2-digit',minute:'2-digit' }); }
    catch { return s; }
}
function fmtDate(s) {
    try { return new Date(s).toLocaleDateString('en-US', { month:'short', day:'numeric', year:'numeric' }); }
    catch { return s; }
}
function fmtTime(s) {
    try {
        const [h, m] = s.split(':');
        const hr = parseInt(h), ampm = hr >= 12 ? 'PM' : 'AM';
        return `${hr % 12 || 12}:${m} ${ampm}`;
    } catch { return s; }
}
function emptyState(icon, title, sub) {
    return `<div class="empty"><div class="empty-icon">${icon}</div><div class="empty-txt">${title}</div><div class="empty-sub">${sub}</div></div>`;
}

let _toastTimer;
function toast(msg, type = 'info') {
    const el = document.getElementById('toast');
    if (!el) return;
    el.textContent = msg;
    el.className = 'toast show';
    if (type === 'error') el.style.background = '#ef4444';
    else if (type === 'warn') el.style.background = '#f59e0b';
    else if (type === 'success') el.style.background = 'linear-gradient(135deg,#3b82f6,#22c55e)';
    else el.style.background = '';
    clearTimeout(_toastTimer);
    _toastTimer = setTimeout(() => el.classList.remove('show'), 3200);
}

// Offline/online detection
window.addEventListener('online',  () => { toast('Connection restored — syncing...', 'success'); loadAll(); });
window.addEventListener('offline', () => { toast('You are offline — some features unavailable', 'warn'); });

// Service worker
if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('/sw.js').catch(() => {});
    });
}
