import joblib
import pandas as pd
import numpy as np
import os
from difflib import get_close_matches
import sys
from typing import Dict, List, Tuple, Any, Optional, Union
import argparse

class DiseasePredictor:
    """
    Class for predicting diseases based on user symptoms using a pre-trained model
    """
    def __init__(self, 
                 model_dir: str = 'models',
                 symptom_desc_path: str = 'dataset/symptom_description.csv',
                 symptom_prec_path: str = 'dataset/symptom_precaution.csv',
                 symptom_sev_path: str = 'dataset/symptom_severity.csv'):
        """
        Initialize the disease predictor with model and reference data
        
        Args:
            model_dir: Directory containing trained model files
            symptom_desc_path: Path to symptom description CSV
            symptom_prec_path: Path to symptom precaution CSV
            symptom_sev_path: Path to symptom severity CSV
        """
        # 1. Load model and metadata
        try:
            self.model = joblib.load(os.path.join(model_dir, 'disease_rf_model.joblib'))
            self.symptom_list = joblib.load(os.path.join(model_dir, 'symptom_list.joblib'))
            
            # Try to load feature importance if available
            try:
                self.feature_importance = joblib.load(os.path.join(model_dir, 'feature_importance.joblib'))
                self.has_importance = True
            except:
                self.has_importance = False
                
        except FileNotFoundError as e:
            sys.exit(f"Error loading model files: {e}. Please ensure you've trained the model first.")
            
        # 2. Load auxiliary dataframes
        try:
            self.df_desc = pd.read_csv(symptom_desc_path)    # Columns: Disease, Description
            self.df_prec = pd.read_csv(symptom_prec_path)    # Columns: Disease, Precaution_1...4
            self.df_sev = pd.read_csv(symptom_sev_path)      # Columns: Symptom, weight
        except FileNotFoundError as e:
            sys.exit(f"Error loading auxiliary data files: {e}")
            
        # 3. Clean identifier columns
        self.df_desc['Disease'] = self.df_desc['Disease'].astype(str).str.strip()
        self.df_prec['Disease'] = self.df_prec['Disease'].astype(str).str.strip()
        self.df_sev['Symptom'] = self.df_sev['Symptom'].astype(str).str.strip()

        # 4. Build lookup maps
        self.desc_map = dict(zip(self.df_desc['Disease'], self.df_desc['Description']))
        self.prec_cols = [col for col in self.df_prec.columns if col.startswith('Precaution')]
        self.prec_map = {
            row['Disease']: [row[col] for col in self.prec_cols if pd.notna(row[col])]  
            for _, row in self.df_prec.iterrows()
        }
        self.sev_map = dict(zip(self.df_sev['Symptom'], self.df_sev['weight']))
        self.mean_sev = self.df_sev['weight'].mean()
        
        # 5. Create a list of all symptoms for fuzzy matching
        self.all_symptoms_lower = {s.lower(): s for s in self.symptom_list}
        
        print(f"Loaded disease prediction model with {len(self.symptom_list)} symptoms.")
        print(f"Model can predict {len(self.model.classes_)} different diseases.")

    def get_closest_symptom_match(self, symptom: str) -> Optional[str]:
        """Find the closest matching symptom from the known symptom list"""
        symptom = symptom.lower().strip()
        
        # Exact match
        if symptom in self.all_symptoms_lower:
            return self.all_symptoms_lower[symptom]
            
        # Fuzzy match
        matches = get_close_matches(symptom, list(self.all_symptoms_lower.keys()), n=1, cutoff=0.6)
        if matches:
            return self.all_symptoms_lower[matches[0]]
            
        return None
    
    def parse_symptoms(self, symptom_input: str) -> Tuple[List[str], List[str], List[str]]:
        """
        Parse user input symptoms and match them to known symptoms
        
        Returns:
            Tuple of (matched_symptoms, unmatched_symptoms, closest_matches)
        """
        # Split input by comma and clean each symptom
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
                # Get potential suggestions
                matches = get_close_matches(symptom.lower(), 
                                           list(self.all_symptoms_lower.keys()), 
                                           n=3, cutoff=0.4)
                if matches:
                    suggested.append((symptom, [self.all_symptoms_lower[m] for m in matches]))
                    
        return matched, unmatched, suggested
    
    def predict(self, symptoms: List[str]) -> Tuple[str, np.ndarray]:
        """
        Predict disease based on a list of symptoms
        
        Returns:
            Tuple of (predicted_disease, probability_array)
        """
        # Build feature vector for model
        feat = {f'has_{sym}': int(sym in symptoms) for sym in self.symptom_list}
        X = pd.DataFrame([feat])
        
        # Predict disease and probabilities
        disease = self.model.predict(X)[0]
        probas = self.model.predict_proba(X)[0]
        
        return disease, probas
    
    def get_top_diseases(self, probas: np.ndarray, n: int = 3) -> List[Dict[str, Any]]:
        """Get top N diseases with their probabilities"""
        classes = self.model.classes_
        # Get indices of top N probabilities
        top_indices = np.argsort(probas)[::-1][:n]
        
        return [
            {
                'disease': classes[i],
                'probability': probas[i],
                'description': self.desc_map.get(classes[i], 'No description available'),
                'precautions': self.prec_map.get(classes[i], [])
            }
            for i in top_indices if probas[i] > 0.01  # Only return diseases with some probability
        ]
    
    def get_symptom_information(self, symptoms: List[str]) -> List[Dict[str, Any]]:
        """Get information about each symptom including severity"""
        details = []
        for sym in symptoms:
            severity = self.sev_map.get(sym, self.mean_sev)
            # Add feature importance if available
            importance = None
            if self.has_importance and f'has_{sym}' in self.feature_importance:
                importance = self.feature_importance[f'has_{sym}']
                
            details.append({
                'symptom': sym,
                'severity': severity,
                'importance': importance
            })
        
        # Sort by severity (higher first)
        return sorted(details, key=lambda x: x['severity'], reverse=True)
        
    def predict_and_info(self, symptom_input: str) -> Dict[str, Any]:
        """
        Main prediction function that processes user input and returns comprehensive results
        
        Args:
            symptom_input: Comma-separated string of symptoms
            
        Returns:
            Dictionary containing prediction results and additional information
        """
        # Parse user symptoms
        matched_symptoms, unmatched, suggested = self.parse_symptoms(symptom_input)
        
        if not matched_symptoms:
            return {
                'error': 'No valid symptoms provided',
                'unmatched': unmatched,
                'suggestions': suggested
            }
            
        # Make prediction
        disease, probas = self.predict(matched_symptoms)
        
        # Get top diseases
        top_diseases = self.get_top_diseases(probas)
        
        # Get symptom details
        symptom_details = self.get_symptom_information(matched_symptoms)
        
        # Return comprehensive results
        return {
            'top_prediction': {
                'disease': disease,
                'probability': probas[list(self.model.classes_).index(disease)],
                'description': self.desc_map.get(disease, 'No description available'),
                'precautions': self.prec_map.get(disease, [])
            },
            'alternative_predictions': top_diseases[1:] if len(top_diseases) > 1 else [],
            'matched_symptoms': matched_symptoms,
            'symptom_details': symptom_details,
            'unmatched_symptoms': unmatched,
            'symptom_suggestions': suggested
        }
        
    def print_results(self, results: Dict[str, Any]) -> None:
        """Print prediction results in a user-friendly format"""
        if 'error' in results:
            print(f"\nError: {results['error']}")
            if results['unmatched']:
                print(f"Unrecognized symptoms: {', '.join(results['unmatched'])}")
            if results['suggestions']:
                print("\nDid you mean?")
                for original, suggestions in results['suggestions']:
                    print(f"  {original} → {', '.join(suggestions)}")
            return
            
        # Print prediction results
        print("\n" + "="*60)
        print(f"🔍 DISEASE PREDICTION RESULTS")
        print("="*60)
        
        # Primary prediction
        pred = results['top_prediction']
        print(f"\n📌 PRIMARY PREDICTION: {pred['disease']}")
        print(f"   Confidence: {pred['probability']*100:.1f}%")
        print(f"\n📋 DESCRIPTION:")
        print(f"   {pred['description']}")
        
        if pred['precautions']:
            print(f"\n⚠️ RECOMMENDED PRECAUTIONS:")
            for p in pred['precautions']:
                print(f"   • {p}")
                
        # Alternative predictions
        if results['alternative_predictions']:
            print(f"\n🔄 ALTERNATIVE POSSIBILITIES:")
            for alt in results['alternative_predictions']:
                print(f"   • {alt['disease']} (Confidence: {alt['probability']*100:.1f}%)")
                
        # Symptom information
        print(f"\n🩺 SYMPTOM ANALYSIS:")
        print(f"   Total symptoms identified: {len(results['matched_symptoms'])}")
        
        print(f"\n   Severity scores (1-7 scale, higher = more severe):")
        for detail in results['symptom_details']:
            print(f"   • {detail['symptom']}: {detail['severity']}")
            
        # Unmatched symptoms
        if results['unmatched_symptoms']:
            print(f"\n❓ UNRECOGNIZED SYMPTOMS:")
            print(f"   {', '.join(results['unmatched_symptoms'])}")
            
            if results['symptom_suggestions']:
                print(f"\n💡 SUGGESTIONS:")
                for original, suggestions in results['symptom_suggestions']:
                    print(f"   Did you mean '{original}' → {', '.join(suggestions)}?")
        print("\n" + "="*60)

def main():
    """Main function for command-line interface"""
    parser = argparse.ArgumentParser(description='Predict diseases based on symptoms')
    parser.add_argument('--model-dir', default='models', help='Directory containing model files')
    parser.add_argument('--symptoms', help='Comma-separated list of symptoms')
    parser.add_argument('--interactive', action='store_true', help='Run in interactive mode')
    
    args = parser.parse_args()
    
    # Initialize predictor
    predictor = DiseasePredictor(model_dir=args.model_dir)
    
    if args.interactive:
        print("\nDisease Prediction System")
        print("------------------------")
        print("Enter 'q' or 'quit' to exit")
        
        while True:
            symptom_input = input('\nEnter your symptoms (comma-separated): ')
            if symptom_input.lower() in ['q', 'quit', 'exit']:
                break
                
            results = predictor.predict_and_info(symptom_input)
            predictor.print_results(results)
    else:
        if not args.symptoms:
            symptom_input = input('Enter your symptoms (comma-separated): ')
        else:
            symptom_input = args.symptoms
            
        results = predictor.predict_and_info(symptom_input)
        predictor.print_results(results)

if __name__ == '__main__':
    main()
