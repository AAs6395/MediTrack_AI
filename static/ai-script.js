// MediTrack AI — AI Assistant Frontend
// FIX 1: Theme class is 'dark' (matches ai-style.css), not 'dark-mode' or 'dark-theme'
// FIX 2: themeToggleButton now found via id="theme-toggle" (added to HTML)
// FIX 3: Dark-mode CSS selectors updated to body.dark

document.addEventListener('DOMContentLoaded', function () {

    const chatMessages      = document.getElementById('chatMessages');
    const symptomInput      = document.getElementById('symptomInput');
    const sendButton        = document.getElementById('sendButton');
    const clearChatButton   = document.getElementById('clearChat');
    const loadingOverlay    = document.getElementById('loadingOverlay');
    const autocomplete      = document.getElementById('autocompleteContainer');
    // FIX: id="theme-toggle" now exists in ai-assistant.html
    const themeBtn          = document.getElementById('theme-toggle');

    const API_BASE    = window.location.origin;
    const PREDICT_API = `${API_BASE}/api/predict`;
    const SYMPTOMS_API= `${API_BASE}/api/symptoms`;

    let availableSymptoms = [];

    // ---- Init ----
    initApp();

    async function initApp() {
        try {
            await fetchSymptoms();
            addWelcome();
            console.log('✅ AI Assistant ready');
        } catch (e) {
            console.error('Init error:', e);
            addAIMsg('⚠️ **Initialisation error.** Please refresh and try again.');
        }
    }

    // ---- Event listeners ----
    sendButton.addEventListener('click', handleSend);
    symptomInput.addEventListener('keypress', e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); } });
    symptomInput.addEventListener('input', handleInput);
    symptomInput.addEventListener('focus', () => { if (symptomInput.value.trim()) showAutocomplete(); });
    document.addEventListener('click', e => { if (e.target !== autocomplete && e.target !== symptomInput) autocomplete.style.display = 'none'; });

    if (clearChatButton) clearChatButton.addEventListener('click', clearChat);

    // FIX: themeBtn may be null on some pages — guard it
    if (themeBtn) {
        themeBtn.addEventListener('click', () => {
            // toggleThemeAI is defined in the HTML inline script; call it
            if (typeof toggleThemeAI === 'function') toggleThemeAI();
        });
    }

    // ---- Welcome message ----
    function addWelcome() {
        addAIMsg(
            `👋 **Hello! I'm your AI Health Assistant.**\n\n` +
            `I can help you understand possible health conditions based on your symptoms.\n\n` +
            `**How to use:**\n` +
            `• Type your symptoms separated by commas\n` +
            `• Example: *"fever, headache, fatigue"*\n` +
            `• Or click a quick symptom button on the left\n\n` +
            `What symptoms are you experiencing?`
        );
    }

    // ---- Send ----
    function handleSend() {
        const symptoms = symptomInput.value.trim();
        if (!symptoms) { showTemp('Please enter some symptoms', 'warn'); symptomInput.focus(); return; }
        if (symptoms.length < 2) { showTemp('Please describe your symptoms in more detail', 'warn'); symptomInput.focus(); return; }

        addUserMsg(symptoms);
        symptomInput.value = '';
        autocomplete.style.display = 'none';
        loadingOverlay.style.display = 'flex';
        sendPrediction(symptoms);
    }

    async function sendPrediction(symptoms) {
        try {
            const resp = await fetch(PREDICT_API, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
                body: JSON.stringify({ symptoms })
            });

            if (!resp.ok) {
                const txt = await resp.text();
                throw new Error(`Server ${resp.status}: ${txt}`);
            }

            const data = await resp.json();
            loadingOverlay.style.display = 'none';

            if (data.status === 'success' && data.messages) {
                displayMessages(data.messages);
            } else {
                throw new Error(data.error || 'Unknown error');
            }
        } catch (e) {
            loadingOverlay.style.display = 'none';
            console.error('Prediction error:', e);
            let msg = `**Sorry, something went wrong:** ${e.message}`;
            if (e.message.includes('fetch') || e.message.includes('Network')) {
                msg = `**Connection Error:** Unable to reach the AI server.\n\n• Check that the Flask server is running on port 5000\n• Try refreshing the page`;
            }
            addAIMsg(msg);
        }
    }

    // ---- Display messages ----
    function displayMessages(messages) {
        if (!messages || !messages.length) { addAIMsg('⚠️ No response received. Please try again.'); return; }
        messages.forEach((msg, i) => setTimeout(() => renderMsg(msg), i * 280));
    }

    function renderMsg(msg) {
        switch (msg.type) {
            case 'prediction':    addPredictionMsg(msg); break;
            case 'precautions':   addSectionMsg(msg, 'precautions', 'fas fa-shield-alt', 'Health Recommendations'); break;
            case 'alternatives':  addSectionMsg(msg, 'alternatives', 'fas fa-shuffle', 'Alternative Possibilities'); break;
            case 'symptoms':      addSectionMsg(msg, 'symptoms', 'fas fa-clipboard-list', 'Symptom Analysis'); break;
            default:              addAIMsg(msg.content || ''); break;
        }
    }

    // ---- Message builders ----
    function addUserMsg(text) {
        const div = document.createElement('div');
        div.className = 'msg msg-user';
        div.innerHTML = `<div class="msg-bubble"><p>${escHtml(text)}</p></div><div class="msg-time">${nowTime()}</div>`;
        chatMessages.appendChild(div);
        scrollBottom();
    }

    function addAIMsg(text) {
        const div = document.createElement('div');
        div.className = 'msg msg-ai';
        div.innerHTML = `<div class="msg-bubble">${fmtText(text)}</div><div class="msg-time">${nowTime()}</div>`;
        chatMessages.appendChild(div);
        scrollBottom();
    }

    function addPredictionMsg(pred) {
        const div = document.createElement('div');
        div.className = 'msg msg-ai msg-prediction';
        div.innerHTML = `
            <div class="msg-bubble">
                <div class="msg-section-hd">
                    <i class="fas fa-stethoscope"></i>
                    <h3>Disease Prediction</h3>
                </div>
                <div class="disease-name">${escHtml(pred.disease)}</div>
                <div class="prob-badge">Confidence: ${pred.probability}</div>
                <div class="desc">${escHtml(pred.description)}</div>
            </div>
            <div class="msg-time">${nowTime()}</div>`;
        chatMessages.appendChild(div);
        scrollBottom();
    }

    function addSectionMsg(msg, type, icon, title) {
        const div = document.createElement('div');
        div.className = `msg msg-ai msg-${type}`;
        div.innerHTML = `
            <div class="msg-bubble">
                <div class="msg-section-hd">
                    <i class="${icon}"></i>
                    <h3>${title}</h3>
                </div>
                <div>${fmtText(msg.content)}</div>
            </div>
            <div class="msg-time">${nowTime()}</div>`;
        chatMessages.appendChild(div);
        scrollBottom();
    }

    function clearChat() {
        if (!confirm('Clear chat history?')) return;
        while (chatMessages.children.length > 1) chatMessages.removeChild(chatMessages.lastChild);
        showTemp('Chat cleared', 'ok');
    }

    // ---- Symptoms autocomplete ----
    async function fetchSymptoms() {
        try {
            const r = await fetch(SYMPTOMS_API);
            if (!r.ok) throw new Error('Failed');
            const data = await r.json();
            if (data.status === 'success' && data.symptoms) {
                availableSymptoms = data.symptoms;
                console.log(`✅ Loaded ${availableSymptoms.length} symptoms`);
            }
        } catch (e) {
            availableSymptoms = [
                'fever', 'cough', 'headache', 'fatigue', 'nausea', 'vomiting',
                'sneezing', 'runny_nose', 'sore_throat', 'body_aches', 'chills',
                'chest_pain', 'shortness_of_breath', 'dizziness', 'skin_rash',
                'itching', 'joint_pain', 'back_pain', 'abdominal_pain'
            ];
            console.log('Using default symptom list');
        }
    }

    function handleInput() {
        if (symptomInput.value.trim() && availableSymptoms.length) showAutocomplete();
        else autocomplete.style.display = 'none';
    }

    function showAutocomplete() {
        const input = symptomInput.value;
        const lastComma = input.lastIndexOf(',');
        const term = lastComma !== -1
            ? input.substring(lastComma + 1).trim().toLowerCase()
            : input.trim().toLowerCase();

        if (!term || term.length < 1) { autocomplete.style.display = 'none'; return; }

        const termNorm = term.replace(/ /g, '_');
        const matches = availableSymptoms.filter(s =>
            s.toLowerCase().includes(termNorm) || s.replace(/_/g,' ').includes(term)
        ).slice(0, 7);

        if (!matches.length) { autocomplete.style.display = 'none'; return; }

        autocomplete.innerHTML = '';
        matches.forEach(sym => {
            const item = document.createElement('div');
            item.className = 'ac-item';
            item.textContent = sym.replace(/_/g, ' ');
            item.addEventListener('click', () => {
                if (lastComma !== -1) {
                    symptomInput.value = input.substring(0, lastComma + 1) + ' ' + sym.replace(/_/g, ' ');
                } else {
                    symptomInput.value = sym.replace(/_/g, ' ');
                }
                autocomplete.style.display = 'none';
                symptomInput.focus();
            });
            autocomplete.appendChild(item);
        });
        autocomplete.style.display = 'block';
    }

    // ---- Utilities ----
    function nowTime() {
        const d = new Date();
        let h = d.getHours(), m = String(d.getMinutes()).padStart(2, '0');
        const ap = h >= 12 ? 'PM' : 'AM';
        h = h % 12 || 12;
        return `${h}:${m} ${ap}`;
    }

    function scrollBottom() { chatMessages.scrollTop = chatMessages.scrollHeight; }

    function fmtText(text) {
        if (!text) return '';
        return text.split('\n').map(line => {
            if (!line.trim()) return '<br>';
            line = line.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
            line = line.replace(/\*(.*?)\*/g, '<em>$1</em>');
            return `<p>${line}</p>`;
        }).join('');
    }

    function escHtml(s) {
        if (!s) return '';
        return String(s)
            .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;').replace(/'/g, '&#039;');
    }

    let _tempTimer;
    function showTemp(msg, type = 'info') {
        clearTimeout(_tempTimer);
        const el = document.createElement('div');
        el.textContent = msg;
        const bg = type === 'warn' ? '#f59e0b' : type === 'error' ? '#ef4444' : '#22c55e';
        el.style.cssText = `position:fixed;top:1.2rem;right:1.2rem;background:${bg};color:white;
            padding:.7rem 1.4rem;border-radius:2rem;font-weight:600;font-size:.88rem;
            z-index:99999;box-shadow:0 8px 24px rgba(0,0,0,.2);
            animation:slideInR .3s ease`;
        document.body.appendChild(el);
        _tempTimer = setTimeout(() => el.remove(), 3000);
    }
});

// Inject animation keyframe for temp messages
const style = document.createElement('style');
style.textContent = `@keyframes slideInR { from{transform:translateX(110%);opacity:0} to{transform:translateX(0);opacity:1} }`;
document.head.appendChild(style);

// Debug helpers
window.AIAssistant = {
    testAPI: (symptoms = 'headache, fever') => {
        fetch('/api/predict', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ symptoms })
        }).then(r => r.json()).then(console.log).catch(console.error);
    }
};
console.log('🤖 AI Assistant loaded. Debug: AIAssistant.testAPI()');
