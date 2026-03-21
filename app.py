from flask import Flask, request, jsonify, render_template, send_from_directory
import os
import json
import random
from datetime import datetime
import sys
sys.stdout.reconfigure(encoding='utf-8')

app = Flask(__name__, static_folder='static', template_folder='templates')

predictor = None


def load_predictor():
    global predictor
    if predictor is None:
        try:
            from predict_disease import DiseasePredictor
            predictor = DiseasePredictor(model_dir='models')
            print("✅ AI Predictor (DiseasePredictor) loaded successfully!")
        except Exception as e:
            print(f"⚠️  Could not load trained model ({e}). Using fallback SimplePredictor.")
            predictor = SimplePredictor()


class SimplePredictor:
    """Fallback demo predictor when the trained model is unavailable."""

    def __init__(self):
        self.symptom_list = [
            'fever', 'cough', 'headache', 'fatigue', 'nausea', 'vomiting',
            'sneezing', 'runny_nose', 'sore_throat', 'body_aches', 'chills',
            'chest_pain', 'shortness_of_breath', 'dizziness', 'skin_rash',
            'itching', 'joint_pain', 'back_pain', 'abdominal_pain', 'loss_of_appetite'
        ]
        self.diseases_db = {
            'Common Cold': {
                'description': 'A viral infection of the upper respiratory tract causing runny nose, sneezing, sore throat and mild fever.',
                'precautions': ['Get plenty of rest', 'Stay well hydrated', 'Take Vitamin C', 'Use a humidifier', 'Drink warm fluids'],
                'common_symptoms': ['fever', 'cough', 'sneezing', 'runny_nose', 'sore_throat']
            },
            'Influenza': {
                'description': 'A contagious respiratory illness caused by flu viruses, characterized by fever, body aches and severe fatigue.',
                'precautions': ['Rest at home', 'Stay hydrated', 'Take antiviral medication if prescribed', 'Use fever reducers', 'Isolate yourself'],
                'common_symptoms': ['fever', 'cough', 'body_aches', 'fatigue', 'chills', 'headache']
            },
            'Migraine': {
                'description': 'A neurological condition causing intense, debilitating headaches often with nausea and light sensitivity.',
                'precautions': ['Rest in a quiet dark room', 'Apply cold compress to forehead', 'Avoid known triggers', 'Take prescribed medication', 'Stay hydrated'],
                'common_symptoms': ['headache', 'nausea', 'vomiting', 'dizziness', 'fatigue']
            },
            'Food Poisoning': {
                'description': 'Illness from consuming contaminated food or water, causing gastrointestinal upset.',
                'precautions': ['Stay hydrated with clear fluids', 'Avoid solid foods initially', 'Rest adequately', 'Seek medical help if severe', 'Follow BRAT diet when recovering'],
                'common_symptoms': ['nausea', 'vomiting', 'fatigue', 'body_aches', 'abdominal_pain']
            },
            'Allergic Rhinitis': {
                'description': 'Allergic inflammation of the nasal airways caused by allergens like pollen, dust or pet dander.',
                'precautions': ['Avoid identified allergens', 'Use antihistamines', 'Keep windows closed during high pollen', 'Use air purifier', 'Shower after outdoor exposure'],
                'common_symptoms': ['sneezing', 'runny_nose', 'skin_rash', 'fatigue', 'itching']
            }
        }

    def get_closest_symptom_match(self, symptom: str):
        symptom = symptom.lower().strip().replace(' ', '_')
        for known in self.symptom_list:
            if symptom == known or symptom in known or known in symptom:
                return known
        return None

    def parse_symptoms(self, symptom_input: str):
        input_symptoms = [s.strip() for s in symptom_input.split(',') if s.strip()]
        matched, unmatched, suggested = [], [], []
        for symptom in input_symptoms:
            match = self.get_closest_symptom_match(symptom)
            if match:
                if match not in matched:
                    matched.append(match)
            else:
                unmatched.append(symptom)
                suggestions = random.sample(self.symptom_list, min(3, len(self.symptom_list)))
                suggested.append((symptom, suggestions))
        return matched, unmatched, suggested

    def predict_and_info(self, symptom_input: str):
        matched_symptoms, unmatched, suggested = self.parse_symptoms(symptom_input)

        if not matched_symptoms:
            return {
                'error': 'No valid symptoms recognized. Try: fever, cough, headache, fatigue, nausea',
                'unmatched': unmatched,
                'symptom_suggestions': suggested,
                'demo_mode': True
            }

        symptom_scores = {}
        for disease, info in self.diseases_db.items():
            score = len(set(matched_symptoms) & set(info['common_symptoms']))
            symptom_scores[disease] = score

        sorted_diseases = sorted(symptom_scores.items(), key=lambda x: x[1], reverse=True)
        max_score = max(symptom_scores.values()) if symptom_scores else 1

        if not sorted_diseases or sorted_diseases[0][1] == 0:
            primary_disease = 'General Medical Consultation'
            primary_info = {
                'description': 'Based on your symptoms, please consult a healthcare professional for a proper diagnosis.',
                'precautions': ['Rest and monitor symptoms', 'Stay hydrated', 'Seek medical attention if symptoms worsen', 'Keep a symptom diary'],
                'common_symptoms': []
            }
            confidence = 0.3
        else:
            primary_disease = sorted_diseases[0][0]
            primary_info = self.diseases_db[primary_disease]
            confidence = min(0.95, 0.3 + (symptom_scores[primary_disease] / max_score) * 0.65)

        alternative_predictions = []
        for disease, score in sorted_diseases[1:4]:
            if score > 0:
                alt_info = self.diseases_db.get(disease, {})
                alt_confidence = min(0.8, 0.2 + (score / max_score) * 0.6)
                alternative_predictions.append({
                    'disease': disease,
                    'probability': alt_confidence,
                    'description': alt_info.get('description', ''),
                    'precautions': alt_info.get('precautions', [])
                })

        symptom_details = []
        for symptom in matched_symptoms:
            symptom_details.append({
                'symptom': symptom,
                'severity': random.randint(3, 7),
                'importance': round(random.uniform(0.1, 0.9), 2)
            })
        symptom_details.sort(key=lambda x: x['severity'], reverse=True)

        return {
            'top_prediction': {
                'disease': primary_disease,
                'probability': confidence,
                'description': primary_info['description'],
                'precautions': primary_info['precautions']
            },
            'alternative_predictions': alternative_predictions,
            'matched_symptoms': matched_symptoms,
            'symptom_details': symptom_details,
            'unmatched_symptoms': unmatched,
            'symptom_suggestions': suggested,
            'demo_mode': True,
            'timestamp': datetime.now().isoformat()
        }


# Load model at startup
load_predictor()


@app.route('/')
def medical_tracker():
    return render_template('index.html')


@app.route('/ai-assistant')
def ai_assistant():
    return render_template('ai-assistant.html')


@app.route('/api/predict', methods=['POST'])
def predict():
    global predictor
    try:
        data = request.get_json()
        if not data:
            return jsonify({'error': 'No JSON data provided'}), 400

        symptoms = data.get('symptoms', '').strip()
        if not symptoms:
            return jsonify({'error': 'No symptoms provided'}), 400

        if predictor is None:
            load_predictor()

        results = predictor.predict_and_info(symptoms)
        messages = format_results_for_chat(results)

        return jsonify({
            'status': 'success',
            'messages': messages,
            'raw_results': results,
            'timestamp': datetime.now().isoformat()
        }), 200

    except Exception as e:
        app.logger.error(f"Prediction error: {e}")
        return jsonify({'error': f'Prediction failed: {str(e)}', 'status': 'error'}), 500


@app.route('/api/symptoms', methods=['GET'])
def get_symptoms():
    global predictor
    try:
        if predictor is None:
            load_predictor()
        symptoms = predictor.symptom_list if hasattr(predictor, 'symptom_list') else []
        return jsonify({
            'status': 'success',
            'symptoms': symptoms,
            'total_symptoms': len(symptoms),
            'demo_mode': isinstance(predictor, SimplePredictor)
        }), 200
    except Exception as e:
        app.logger.error(f"Symptoms error: {e}")
        return jsonify({
            'status': 'error',
            'error': str(e),
            'symptoms': ['fever', 'cough', 'headache', 'fatigue', 'nausea']
        }), 500


@app.route('/api/health', methods=['GET'])
def health_check():
    return jsonify({
        'status': 'healthy',
        'service': 'MediTrack AI',
        'timestamp': datetime.now().isoformat(),
        'predictor_loaded': predictor is not None,
        'predictor_type': 'SimplePredictor' if isinstance(predictor, SimplePredictor) else 'DiseasePredictor'
    }), 200


@app.route('/api/info', methods=['GET'])
def api_info():
    return jsonify({
        'name': 'MediTrack AI API',
        'version': '2.0.0',
        'endpoints': {
            'POST /api/predict': 'Predict disease from symptoms',
            'GET /api/symptoms': 'Get available symptoms list',
            'GET /api/health': 'Service health check',
        },
        'demo_mode': isinstance(predictor, SimplePredictor)
    }), 200


def format_results_for_chat(results: dict) -> list:
    messages = []

    if 'error' in results:
        messages.append({'type': 'error', 'content': f"⚠️ {results['error']}"})

        # FIX: use 'symptom_suggestions' (consistent key)
        if results.get('symptom_suggestions'):
            suggestions_text = "💡 Did you mean?\n"
            for original, suggestions in results['symptom_suggestions']:
                suggestions_text += f"• **{original}** → {', '.join(suggestions)}\n"
            messages.append({'type': 'suggestions', 'content': suggestions_text})

        if results.get('demo_mode'):
            messages.append({
                'type': 'info',
                'content': "💡 **Demo Mode**: Using sample data. Train the model for accurate predictions."
            })
        return messages

    if results.get('demo_mode'):
        messages.append({
            'type': 'info',
            'content': "💡 **Demo Mode**: Showing sample predictions. For accuracy, train with medical data."
        })

    pred = results['top_prediction']
    messages.append({
        'type': 'prediction',
        'disease': pred['disease'],
        'probability': f"{pred['probability'] * 100:.1f}%",
        'description': pred['description'],
        'confidence': pred['probability']
    })

    if pred['precautions']:
        precautions_text = "🛡️ **Recommended Precautions:**\n"
        for i, p in enumerate(pred['precautions'], 1):
            precautions_text += f"{i}. {p}\n"
        messages.append({'type': 'precautions', 'content': precautions_text})

    if results['alternative_predictions']:
        alt_text = "🔄 **Other Possible Conditions:**\n"
        for alt in results['alternative_predictions']:
            alt_text += f"• {alt['disease']} ({alt['probability'] * 100:.1f}%)\n"
        messages.append({'type': 'alternatives', 'content': alt_text})

    if results['symptom_details']:
        symptom_text = "🩺 **Symptom Analysis:**\n"
        symptom_text += f"• **Total symptoms identified**: {len(results['matched_symptoms'])}\n"
        symptom_text += "• **Severity scores** (1–7, higher = more severe):\n"
        for detail in results['symptom_details']:
            bars = '█' * int(detail['severity']) + '░' * (7 - int(detail['severity']))
            symptom_text += f"  - {detail['symptom'].replace('_', ' ').title()}: {bars} {detail['severity']}/7\n"
        messages.append({'type': 'symptoms', 'content': symptom_text})

    if results['unmatched_symptoms']:
        unmatched_text = "❓ **Unrecognized Symptoms:**\n"
        unmatched_text += f"{', '.join(results['unmatched_symptoms'])}\n"
        # FIX: use 'symptom_suggestions' consistently
        if results['symptom_suggestions']:
            unmatched_text += "\n💡 **Did you mean?**\n"
            for original, suggestions in results['symptom_suggestions']:
                unmatched_text += f"• '{original}' → {', '.join(suggestions[:2])}\n"
        messages.append({'type': 'unmatched', 'content': unmatched_text})

    messages.append({
        'type': 'disclaimer',
        'content': "⚠️ **Medical Disclaimer:** This tool is for informational purposes only and is not a substitute for professional medical advice. Always consult a qualified healthcare provider."
    })

    return messages


@app.route('/favicon.ico')
def favicon():
    return send_from_directory(os.path.join(app.root_path, 'static'),
                               'favicon.ico', mimetype='image/vnd.microsoft.icon')


@app.errorhandler(404)
def not_found(error):
    return jsonify({'error': 'Endpoint not found'}), 404


@app.errorhandler(500)
def internal_error(error):
    return jsonify({'error': 'Internal server error'}), 500


@app.route('/static/<path:filename>')
def serve_static(filename):
    return send_from_directory(app.static_folder, filename)


if __name__ == '__main__':
    port = int(os.environ.get('AI_PORT', 5000))
    debug = os.environ.get('FLASK_DEBUG', 'True').lower() == 'true'
    print(f"""
    MediTrack AI — Flask Server
    ============================
    AI Assistant : http://localhost:{port}/ai-assistant
    Health Check : http://localhost:{port}/api/health
    ============================
    """)
    app.run(debug=debug, host='0.0.0.0', port=port)
