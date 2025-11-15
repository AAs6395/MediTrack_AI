from flask import Flask, request, jsonify, render_template, send_from_directory
import os
import threading
import json
import random
from datetime import datetime

# Initialize Flask app with specified folders for static files and templates
app = Flask(__name__, static_folder='static', template_folder='templates')

# stores the ai prediction model
predictor = None

def load_predictor():
    """
    Loads the disease prediction model.
    If the main predictor (DiseasePredictor) is not available,
    it falls back to SimplePredictor for demo purposes.
    """
    global predictor
    if predictor is None:
        try:
            # Try importing and loading the trained disease predictor
            from predict_disease import DiseasePredictor
            predictor = DiseasePredictor(model_dir='models')
            print("✅ AI Predictor loaded successfully!")
        except ImportError as e:
            # If import fails, use fallback predictor
            print(f"❌ Could not import predictor: {e}")
            predictor = SimplePredictor()
            print("✅ Using simple fallback predictor")
        except Exception as e:
            # If any other error occurs, fallback to simple version
            print(f"❌ Predictor failed to load: {e}")
            predictor = SimplePredictor()
            print("✅ Using simple fallback predictor")

class SimplePredictor:
    """
    A simple fallback predictor class.
    Simulates disease prediction when the real AI model is unavailable.
    Uses hardcoded sample data for demonstration.
    """
    def __init__(self):
        # Predefined symptom list
        self.symptom_list = [
            'fever', 'cough', 'headache', 'fatigue', 'nausea', 'vomiting',
            'sneezing', 'runny nose', 'sore throat', 'body aches', 'chills',
            'chest pain', 'shortness of breath', 'dizziness', 'rash'
        ]
        # Demo diseases database with sample data
        self.diseases_db = {
            'Common Cold': {
                'description': 'Viral infection of the upper respiratory tract causing runny nose, sneezing, and cough',
                'precautions': ['Rest', 'Hydrate', 'Take Vitamin C', 'Use humidifier', 'Warm fluids'],
                'common_symptoms': ['fever', 'cough', 'sneezing', 'runny nose', 'sore throat']
            },
            'Influenza': {
                'description': 'Contagious respiratory illness caused by flu viruses with fever, body aches, and fatigue',
                'precautions': ['Rest', 'Stay hydrated', 'Take antiviral medication', 'Use fever reducers', 'Isolate yourself'],
                'common_symptoms': ['fever', 'cough', 'body aches', 'fatigue', 'chills']
            },
            'Migraine': {
                'description': 'Severe headache often accompanied by nausea, vomiting, and sensitivity to light and sound',
                'precautions': ['Rest in dark room', 'Apply cold compress', 'Avoid triggers', 'Take prescribed medication', 'Stay hydrated'],
                'common_symptoms': ['headache', 'nausea', 'vomiting', 'dizziness']
            },
            'Food Poisoning': {
                'description': 'Illness caused by consuming contaminated food or water, leading to stomach cramps and diarrhea',
                'precautions': ['Stay hydrated', 'Avoid solid foods', 'Rest', 'Seek medical attention if severe', 'BRAT diet'],
                'common_symptoms': ['nausea', 'vomiting', 'fatigue', 'body aches']
            },
            'Allergic Rhinitis': {
                'description': 'Allergic response causing nasal congestion, sneezing, and itchy eyes',
                'precautions': ['Avoid allergens', 'Use antihistamines', 'Keep windows closed', 'Use air purifier', 'Shower after outdoors'],
                'common_symptoms': ['sneezing', 'runny nose', 'rash', 'fatigue']
            }
        }
        
    def get_closest_symptom_match(self, symptom: str):
        """
        Match input symptom to closest known symptom (simple substring match).
        Returns best matching symptom or None if no match found.
        """
        symptom = symptom.lower().strip()
        for known_symptom in self.symptom_list:
            if symptom in known_symptom.lower() or known_symptom.lower() in symptom:
                return known_symptom
        return None
    
    def parse_symptoms(self, symptom_input: str):
        """
        Parse and classify user input symptoms into:
        - matched: valid known symptoms
        - unmatched: not recognized
        - suggested: alternative guesses for unmatched ones
        """
        input_symptoms = [s.strip() for s in symptom_input.split(',') if s.strip()]
        
        matched = []
        unmatched = []
        suggested = []
        
        for symptom in input_symptoms:
            match = self.get_closest_symptom_match(symptom)
            if match:
                matched.append(match)
            else:
                unmatched.append(symptom)
                # Suggest random symptoms if unrecognized
                suggestions = random.sample(self.symptom_list, min(3, len(self.symptom_list)))
                suggested.append((symptom, suggestions))
                
        return matched, unmatched, suggested
    
    def predict_and_info(self, symptom_input: str):
        """
        Generate a simulated prediction result with:
        - top disease match
        - alternative predictions
        - symptom details
        - precautionary advice
        """
        matched_symptoms, unmatched, suggested = self.parse_symptoms(symptom_input)
        
        # If no symptoms matched
        if not matched_symptoms:
            return {
                'error': 'No valid symptoms provided. Try: fever, cough, headache, fatigue, nausea',
                'unmatched': unmatched,
                'suggestions': suggested,
                'demo_mode': True
            }
        
        # Calculate disease match scores based on symptom overlap
        symptom_scores = {}
        for disease, info in self.diseases_db.items():
            score = len(set(matched_symptoms) & set(info['common_symptoms']))
            symptom_scores[disease] = score
        
        # Sort diseases in descending by score
        sorted_diseases = sorted(symptom_scores.items(), key=lambda x: x[1], reverse=True)
        
        # If no strong match, give general advice
        if not sorted_diseases or sorted_diseases[0][1] == 0:
            primary_disease = 'General Medical Consultation'
            primary_info = {
                'description': 'Based on your symptoms, it is recommended to consult with a healthcare professional for proper diagnosis.',
                'precautions': ['Rest', 'Stay hydrated', 'Monitor symptoms', 'Seek medical attention if symptoms worsen'],
                'common_symptoms': []
            }
            confidence = 0.3
        else:
            # Get top disease with highest match
            primary_disease = sorted_diseases[0][0]
            primary_info = self.diseases_db[primary_disease]
            max_score = max(symptom_scores.values())
            confidence = min(0.95, 0.3 + (symptom_scores[primary_disease] / max_score) * 0.65)
        
        # stores the next best 3 matching disease if only they have positive score
        alternative_predictions = []
        for disease, score in sorted_diseases[1:4]:
            if score > 0:
                alt_info = self.diseases_db.get(disease, {})
                alt_confidence = min(0.8, 0.2 + (score / max(symptom_scores.values())) * 0.6)
                alternative_predictions.append({
                    'disease': disease,
                    'probability': alt_confidence,
                    'description': alt_info.get('description', 'No description available'),
                    'precautions': alt_info.get('precautions', [])
                })
        
        # Generate random score from(3 to 7 ) for matched symptoms
        symptom_details = []
        for symptom in matched_symptoms:
            severity = random.randint(3, 7)
            symptom_details.append({
                'symptom': symptom,
                'severity': severity,
                'importance': random.uniform(0.1, 0.9)
            })
        
        # Sort symptoms by severity for display
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

# Load the ai model into a separate thread so the server can start immediately
threading.Thread(target=load_predictor).start()

@app.route('/ai-assistant')
def ai_assistant():
    """Serves the AI Assistant web interface page."""
    return render_template('ai-assistant.html')

@app.route('/')
def medical_tracker():
    """Serves the Medical Tracker home interface page."""
    return render_template('index.html')

@app.route('/api/predict', methods=['POST'])
def predict():
    """
    API endpoint for disease prediction.
    Accepts symptoms from user input and returns predictions in JSON format.
    """
    global predictor
    
    try:
        # Api responsible for disease prediction
        data = request.get_json()
        if not data:
            return jsonify({'error': 'No JSON data provided'}), 400
            
        symptoms = data.get('symptoms', '').strip()
        
        if not symptoms:
            return jsonify({'error': 'No symptoms provided'}), 400
        
        # Ensure predictor is ready
        if predictor is None:
            load_predictor()
        
        # Get prediction results
        results = predictor.predict_and_info(symptoms)
        messages = format_results_for_chat(results)
        
        # Return structured response
        response_data = {
            'status': 'success',
            'messages': messages,
            'raw_results': results,
            'timestamp': datetime.now().isoformat()
        }
       
        # Sends the result back to the frontend as a JSON response.
        return jsonify(response_data), 200

    except Exception as e:
        # Log and return error if prediction fails
        app.logger.error(f"Error in prediction: {str(e)}")
        return jsonify({
            'error': f'Prediction failed: {str(e)}',
            'status': 'error'
        }), 500

@app.route('/api/symptoms', methods=['GET'])
def get_symptoms():
    """
    API endpoint to fetch the list of available symptoms
    from the loaded model or fallback demo list.
    """
    global predictor
    
    try:
        if predictor is None:
            load_predictor()
        
        # Get symptom list from predictor
        if hasattr(predictor, 'symptom_list'):
            symptoms = predictor.symptom_list
        else:
            symptoms = [
                'fever', 'cough', 'headache', 'fatigue', 'nausea', 'vomiting',
                'sneezing', 'runny nose', 'sore throat', 'body aches', 'chills',
                'chest pain', 'shortness of breath', 'dizziness', 'rash'
            ]
        
        return jsonify({
            'status': 'success',
            'symptoms': symptoms,
            'total_symptoms': len(symptoms),
            'demo_mode': isinstance(predictor, SimplePredictor)
        }), 200

    except Exception as e:
        # Handle errors in fetching symptoms
        app.logger.error(f"Error fetching symptoms: {str(e)}")
        return jsonify({
            'status': 'error',
            'error': f'Failed to fetch symptoms: {str(e)}',
            'symptoms': [
                'fever', 'cough', 'headache', 'fatigue', 'nausea', 'vomiting',
                'sneezing', 'runny nose', 'sore throat', 'body aches'
            ]
        }), 500

# to check wether ai health assistant is running correctly
@app.route('/api/health', methods=['GET'])
def health_check():
    """
    Simple health check API to verify if the service is running properly.
    """
    return jsonify({
        'status': 'healthy',
        'service': 'AI Health Assistant',
        'timestamp': datetime.now().isoformat(),
        'predictor_loaded': predictor is not None,
        'predictor_type': 'SimplePredictor' if isinstance(predictor, SimplePredictor) else 'DiseasePredictor'
    }), 200

# To display details about the available API endpoints.
@app.route('/api/info', methods=['GET'])
def api_info():
    """
    Returns API metadata including version, description, and available endpoints.
    """
    return jsonify({
        'name': 'AI Health Assistant API',
        'version': '1.0.0',
        'description': 'Disease prediction based on symptoms',
        'endpoints': {
            'POST /api/predict': 'Predict disease from symptoms',
            'GET /api/symptoms': 'Get list of available symptoms',
            'GET /api/health': 'Health check',
            'GET /api/info': 'This information'
        },
        'demo_mode': isinstance(predictor, SimplePredictor)
    }), 200

def format_results_for_chat(results):
    """
    Converts raw prediction results into human-readable
    chat message format for frontend display.
    """
    messages = []

    #If the prediction failed or the symptoms were invalid, handle the error.
    if 'error' in results:
        # Adds an error message to the chat.
        messages.append({
            'type': 'error',
            'content': f"⚠️ {results['error']}"
        })

#provides alternative suggestion if symptoms are not when symptoms are not recognized
        if results.get('suggestions'):
            suggestions_text = "💡 Did you mean:\n"
            for original, suggestions in results['suggestions']:
                suggestions_text += f"• **{original}** → {', '.join(suggestions)}\n"
            messages.append({
                'type': 'suggestions',
                'content': suggestions_text
            })
            
        # Adds a message telling the user that the system is using sample demo data and not real medical AI.
        if results.get('demo_mode'):
            messages.append({
                'type': 'info',
                'content': "💡 **Demo Mode**: Using sample data for demonstration."
            })
            
        return messages

    # Show demo mode info tells that predictions are only sample based not from a real trained model
    if results.get('demo_mode'):
        messages.append({
            'type': 'info',
            'content': "💡 **Demo Mode**: Showing sample predictions. For accurate results, train the model with medical data."
        })

    # It then takes the top predicted disease from the results and adds it to the chat message list
    pred = results['top_prediction']
    messages.append({
        'type': 'prediction',
        'disease': pred['disease'],
        'probability': f"{pred['probability']*100:.1f}%",
        'description': pred['description'],
        'confidence': pred['probability']
    })

    # Add precautions section if the predicted disease has precaution available in the chat
    if pred['precautions']:
        precautions_text = "🛡️ **Recommended Precautions:**\n"
        for i, p in enumerate(pred['precautions'], 1):
            precautions_text += f"{i}. {p}\n"
        messages.append({
            'type': 'precautions',
            'content': precautions_text
        })

    # Add alternative disease suggestions beside the main one in the chat
    if results['alternative_predictions']:
        alt_text = "🔄 **Alternative Possibilities:**\n"
        for alt in results['alternative_predictions']:
            alt_text += f"• {alt['disease']} ({alt['probability']*100:.1f}%)\n"
        messages.append({
            'type': 'alternatives',
            'content': alt_text
        })

    # Add detailed symptom analysis it tells how severe a disease is and adds it to the chat
    if results['symptom_details']:
        symptom_text = "🩺 **Symptom Analysis:**\n"
        symptom_text += f"• **Total symptoms identified**: {len(results['matched_symptoms'])}\n"
        symptom_text += "• **Severity scores** (1-7 scale, higher = more severe):\n"
        
        for detail in results['symptom_details']:
            severity_stars = '⭐' * detail['severity']
            symptom_text += f"  - {detail['symptom']}: {detail['severity']}/7 {severity_stars}\n"
            
        messages.append({
            'type': 'symptoms',
            'content': symptom_text
        })

    # Handle unmatched symptoms
    if results['unmatched_symptoms']:
        unmatched_text = "❓ **Unrecognized Symptoms:**\n"
        unmatched_text += f"{', '.join(results['unmatched_symptoms'])}\n"
        
        if results['symptom_suggestions']:
            unmatched_text += "\n💡 **Suggestions:**\n"
            for original, suggestions in results['suggestions']:
                unmatched_text += f"• '{original}' → {', '.join(suggestions[:2])}\n"
                
        messages.append({
            'type': 'unmatched',
            'content': unmatched_text
        })

    # Final disclaimer message
    messages.append({
        'type': 'disclaimer',
        'content': "⚠️ **Important Disclaimer:** This is a demonstration system and not a substitute for professional medical advice. Always consult with qualified healthcare providers for medical diagnosis and treatment."
    })

    return messages

@app.route('/favicon.ico')
def favicon():
    """Serve favicon for the web interface."""
    return send_from_directory(os.path.join(app.root_path, 'static'),
                               'favicon.ico', mimetype='image/vnd.microsoft.icon')

# Custom error handlers for common HTTP errors
@app.errorhandler(404)
def not_found(error):
    """Handle 404 - Not Found errors"""
    return jsonify({'error': 'Endpoint not found'}), 404

@app.errorhandler(500)
def internal_error(error):
    """Handle 500 - Internal Server Error"""
    return jsonify({'error': 'Internal server error'}), 500

@app.errorhandler(405)
def method_not_allowed(error):
    """Handle 405 - Method Not Allowed errors"""
    return jsonify({'error': 'Method not allowed'}), 405

# Serve static files manually when requested
@app.route('/static/<path:filename>')
def serve_static(filename):
    """Serve static files from /static directory to the browser"""
    return send_from_directory(app.static_folder, filename)

# Main entry point of the Flask app
if __name__ == '__main__':
    port = int(os.environ.get('AI_PORT', 5000))
    debug = os.environ.get('FLASK_DEBUG', 'True').lower() == 'true'
    
    #Prints server startup information in the terminal:
    print(f"""
    🤖 AI Health Assistant Server
    =============================
    ✅ Starting server on port {port}
    🔗 AI Assistant: http://localhost:{port}/ai-assistant
    🔌 Health Check: http://localhost:{port}/api/health
    📚 API Info: http://localhost:{port}/api/info
    🏥 Medical Tracker: http://localhost:3000
    =============================
    """)
    
    # Start Flask server 
    app.run(debug=debug, host='0.0.0.0', port=port)
