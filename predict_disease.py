import joblib
import pandas as pd
import numpy as np
import os
from difflib import get_close_matches
import sys
from typing import Dict, List, Tuple, Any, Optional
import argparse


class DiseasePredictor:
    def __init__(self,
                 model_dir: str = 'models',
                 symptom_desc_path: str = 'dataset/symptom_description.csv',
                 symptom_prec_path: str = 'dataset/symptom_precaution.csv',
                 symptom_sev_path: str = 'dataset/symptom_severity.csv'):
        try:
            self.model = joblib.load(os.path.join(model_dir, 'disease_rf_model.joblib'))
            self.symptom_list = joblib.load(os.path.join(model_dir, 'symptom_list.joblib'))
            try:
                fi = joblib.load(os.path.join(model_dir, 'feature_importance.joblib'))
                # feature_importance may be a Series or dict
                if hasattr(fi, 'to_dict'):
                    self.feature_importance = fi.to_dict()
                else:
                    self.feature_importance = fi
                self.has_importance = True
            except Exception:
                self.has_importance = False
        except FileNotFoundError as e:
            sys.exit(f"Error loading model files: {e}. Please train the model first.")

        try:
            self.df_desc = pd.read_csv(symptom_desc_path)
            self.df_prec = pd.read_csv(symptom_prec_path)
            self.df_sev = pd.read_csv(symptom_sev_path)
        except FileNotFoundError as e:
            sys.exit(f"Error loading auxiliary data: {e}")

        self.df_desc['Disease'] = self.df_desc['Disease'].astype(str).str.strip()
        self.df_prec['Disease'] = self.df_prec['Disease'].astype(str).str.strip()
        self.df_sev['Symptom'] = self.df_sev['Symptom'].astype(str).str.strip()

        self.desc_map = dict(zip(self.df_desc['Disease'], self.df_desc['Description']))
        self.prec_cols = [c for c in self.df_prec.columns if c.startswith('Precaution')]
        self.prec_map = {
            row['Disease']: [row[c] for c in self.prec_cols if pd.notna(row[c])]
            for _, row in self.df_prec.iterrows()
        }
        self.sev_map = dict(zip(self.df_sev['Symptom'], self.df_sev['weight']))
        self.mean_sev = self.df_sev['weight'].mean()
        self.all_symptoms_lower = {s.lower().strip(): s for s in self.symptom_list}

        print(f"Loaded model with {len(self.symptom_list)} symptoms, {len(self.model.classes_)} diseases.")

    def get_closest_symptom_match(self, symptom: str) -> Optional[str]:
        symptom = symptom.lower().strip().replace(' ', '_')
        if symptom in self.all_symptoms_lower:
            return self.all_symptoms_lower[symptom]
        # also try with spaces
        symptom_space = symptom.replace('_', ' ')
        if symptom_space in self.all_symptoms_lower:
            return self.all_symptoms_lower[symptom_space]
        matches = get_close_matches(symptom, list(self.all_symptoms_lower.keys()), n=1, cutoff=0.55)
        if matches:
            return self.all_symptoms_lower[matches[0]]
        return None

    def parse_symptoms(self, symptom_input: str) -> Tuple[List[str], List[str], List[str]]:
        input_symptoms = [s.strip() for s in symptom_input.split(',') if s.strip()]
        matched, unmatched, suggested = [], [], []
        for symptom in input_symptoms:
            match = self.get_closest_symptom_match(symptom)
            if match:
                if match not in matched:
                    matched.append(match)
            else:
                unmatched.append(symptom)
                close = get_close_matches(
                    symptom.lower().replace(' ', '_'),
                    list(self.all_symptoms_lower.keys()),
                    n=3, cutoff=0.4
                )
                if close:
                    suggested.append((symptom, [self.all_symptoms_lower[m] for m in close]))
        return matched, unmatched, suggested

    def predict(self, symptoms: List[str]) -> Tuple[str, np.ndarray]:
        feat = {f'has_{sym}': int(sym in symptoms) for sym in self.symptom_list}
        X = pd.DataFrame([feat])
        disease = self.model.predict(X)[0]
        probas = self.model.predict_proba(X)[0]
        return disease, probas

    def get_top_diseases(self, probas: np.ndarray, n: int = 3) -> List[Dict[str, Any]]:
        classes = self.model.classes_
        top_indices = np.argsort(probas)[::-1][:n]
        return [
            {
                'disease': classes[i],
                'probability': float(probas[i]),
                'description': self.desc_map.get(classes[i], 'No description available'),
                'precautions': self.prec_map.get(classes[i], [])
            }
            for i in top_indices if probas[i] > 0.01
        ]

    def get_symptom_information(self, symptoms: List[str]) -> List[Dict[str, Any]]:
        details = []
        for sym in symptoms:
            severity = self.sev_map.get(sym, self.mean_sev)
            importance = None
            if self.has_importance and f'has_{sym}' in self.feature_importance:
                importance = float(self.feature_importance[f'has_{sym}'])
            details.append({'symptom': sym, 'severity': float(severity), 'importance': importance})
        return sorted(details, key=lambda x: x['severity'], reverse=True)

    def predict_and_info(self, symptom_input: str) -> Dict[str, Any]:
        matched_symptoms, unmatched, suggested = self.parse_symptoms(symptom_input)

        if not matched_symptoms:
            return {
                'error': 'No valid symptoms recognized. Please check your spelling and try again.',
                'unmatched': unmatched,
                'symptom_suggestions': suggested
            }

        disease, probas = self.predict(matched_symptoms)
        top_diseases = self.get_top_diseases(probas)
        symptom_details = self.get_symptom_information(matched_symptoms)

        disease_idx = list(self.model.classes_).index(disease)

        return {
            'top_prediction': {
                'disease': disease,
                'probability': float(probas[disease_idx]),
                'description': self.desc_map.get(disease, 'No description available'),
                'precautions': self.prec_map.get(disease, [])
            },
            'alternative_predictions': top_diseases[1:] if len(top_diseases) > 1 else [],
            'matched_symptoms': matched_symptoms,
            'symptom_details': symptom_details,
            'unmatched_symptoms': unmatched,
            'symptom_suggestions': suggested
        }


def main():
    parser = argparse.ArgumentParser(description='Predict diseases based on symptoms')
    parser.add_argument('--model-dir', default='models')
    parser.add_argument('--symptoms', help='Comma-separated list of symptoms')
    parser.add_argument('--interactive', action='store_true')
    args = parser.parse_args()

    predictor = DiseasePredictor(model_dir=args.model_dir)

    if args.interactive:
        print("\nDisease Prediction System — enter 'q' to quit")
        while True:
            symptom_input = input('\nEnter symptoms (comma-separated): ')
            if symptom_input.lower() in ['q', 'quit', 'exit']:
                break
            results = predictor.predict_and_info(symptom_input)
            print(results)
    else:
        symptoms = args.symptoms or input('Enter symptoms (comma-separated): ')
        print(predictor.predict_and_info(symptoms))


if __name__ == '__main__':
    main()
