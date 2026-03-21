# 🏥 MediTrack AI

> Smart Health Management Platform with AI-Powered Disease Prediction

---

## 🚀 Quick Start

### 1. Clone & Install
```bash
git clone <your-repo>
cd meditrack-ai
npm install
pip install flask scikit-learn pandas numpy joblib
```

### 2. Configure Database
```bash
# Create MySQL database
mysql -u root -p < database.sql

# Copy and edit environment variables
cp .env.example .env
# Edit .env → set DB_PASSWORD to your MySQL password
```

### 3. Start Servers

**Terminal 1 — Node.js (Medical Tracker):**
```bash
node server.js
# Runs on http://localhost:3000
```

**Terminal 2 — Flask (AI Assistant):**
```bash
python app.py
# Runs on http://localhost:5000
```

### 4. Open in Browser
- Medical Tracker → http://localhost:3000
- AI Assistant    → http://localhost:3000/ai-assistant
  *(or http://localhost:5000/ai-assistant)*

---

## 📂 Project Structure

```
meditrack-ai/
├── templates/
│   ├── index.html          # Medical Tracker UI
│   └── ai-assistant.html   # AI Chat Interface
├── static/
│   ├── style.css           # Main stylesheet
│   ├── ai-style.css        # AI assistant styles
│   ├── script.js           # Medical tracker logic
│   └── ai-script.js        # AI chat logic
├── routes/
│   ├── medications.js
│   ├── reminders.js
│   ├── vitals.js
│   └── appointments.js
├── dataset/
│   ├── dataset.csv
│   ├── symptom_description.csv
│   ├── symptom_precaution.csv
│   └── symptom_severity.csv
├── models/
│   ├── disease_rf_model.joblib
│   ├── symptom_list.joblib
│   ├── feature_importance.joblib
│   └── symptom_mapping.joblib
├── app.py                  # Flask AI server
├── server.js               # Node.js API server
├── predict_disease.py      # ML prediction engine
├── train_model.py          # Model training script
├── database.sql            # MySQL schema + seed data
├── package.json
└── .env.example
```

---

## 🛠 Tech Stack

| Layer | Technology |
|---|---|
| Frontend | HTML5, CSS3, Vanilla JS |
| Backend (Tracker) | Node.js + Express |
| Backend (AI) | Python + Flask |
| Database | MySQL |
| Machine Learning | scikit-learn (Random Forest) |

---

## 🤖 Re-training the Model

```bash
python train_model.py
# Outputs to models/ directory
```

---

## 🐛 Bug Fixes Applied

1. **`app.py`** — `KeyError: 'suggestions'` → fixed to use `'symptom_suggestions'` consistently  
2. **`app.py`** — indentation bug in `format_results_for_chat` error branch  
3. **`server.js`** — removed invalid `reconnect: true` option (not supported by mysql2)  
4. **`server.js`** — replaced `db.state` (invalid in mysql2) with live `SELECT 1` ping  
5. **`script.js`** — health check used `/api/health` → fixed to `/health`  
6. **`ai-script.js`** — theme class `dark-mode` → `dark` (matches CSS)  
7. **`ai-assistant.html`** — added missing `id="theme-toggle"` on theme button  
8. **`routes/`** — created all 4 missing route files  

---

## ⚠️ Medical Disclaimer

This application is for informational purposes only. It is not a substitute for professional medical advice, diagnosis, or treatment.

---

**Author:** Aashish Joshi · B.Tech CSE
