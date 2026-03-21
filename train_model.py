# File: train_model.py
import pandas as pd
import numpy as np
from sklearn.ensemble import RandomForestClassifier
from sklearn.model_selection import GridSearchCV, train_test_split, StratifiedKFold
from sklearn.metrics import accuracy_score, classification_report, confusion_matrix
import joblib
import os
import matplotlib.pyplot as plt
import seaborn as sns
from datetime import datetime

def train_disease_model(dataset_path='dataset/dataset.csv', output_dir='models'):
    """
    Train a disease prediction model based on symptoms.
    
    Args:
        dataset_path: Path to the main dataset CSV file
        output_dir: Directory to save model artifacts
    
    Returns:
        Dict with model performance metrics
    """
    print(f"Starting model training process at {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    
    # Create output directory if it doesn't exist
    os.makedirs(output_dir, exist_ok=True)
    
    # 1. Load main dataset
    print("Loading dataset...")
    df = pd.read_csv(dataset_path)
    
    # Clean column names and values
    df.columns = [c.strip() for c in df.columns]
    
    # Extract symptom columns
    symptom_cols = [c for c in df.columns if c.lower().startswith('symptom')]
    for col in symptom_cols:
        df[col] = df[col].astype(str).str.strip()
        # Replace empty/NaN values with empty string
        df[col] = df[col].fillna('').replace('nan', '')
    
    # Clean disease names
    df['Disease'] = df['Disease'].astype(str).str.strip()
    
    # 2. Analyze dataset
    print(f"Dataset shape: {df.shape}")
    print(f"Total unique diseases: {df['Disease'].nunique()}")
    
    # Count symptoms per disease
    disease_symptom_counts = df.apply(
        lambda row: sum(1 for col in symptom_cols if row[col]), axis=1
    )
    print(f"Symptoms per disease - Min: {disease_symptom_counts.min()}, "
          f"Max: {disease_symptom_counts.max()}, "
          f"Avg: {disease_symptom_counts.mean():.2f}")
    
    # 3. Build one-hot feature matrix
    print("Creating one-hot encoded features...")
    # Get all unique symptoms, excluding empty strings and NaN values
    all_symptoms = sorted({
        s for col in symptom_cols 
        for s in df[col].unique() 
        if s and s != 'nan' and not pd.isna(s)
    })
    print(f"Total unique symptoms: {len(all_symptoms)}")
    
    # Create feature dictionary and save mapping of symptoms
    data = []
    # Track which symptoms actually appear in the dataset
    symptom_occurrence = {sym: 0 for sym in all_symptoms}
    
    for _, row in df.iterrows():
        # Get all non-empty symptoms for this row
        row_symptoms = [s for s in row[symptom_cols].values if s and s != 'nan']
        # Create one-hot encoded features
        vec = {f'has_{sym}': int(sym in row_symptoms) for sym in all_symptoms}
        data.append(vec)
        
        # Update symptom occurrence counts
        for sym in row_symptoms:
            if sym in symptom_occurrence:
                symptom_occurrence[sym] += 1
    
    # Report on symptom distribution
    print(f"Most common symptoms: {sorted(symptom_occurrence.items(), key=lambda x: x[1], reverse=True)[:5]}")
    print(f"Least common symptoms: {sorted(symptom_occurrence.items(), key=lambda x: x[1])[:5]}")
    
    # Create feature matrix and target vector
    X = pd.DataFrame(data)
    y = df['Disease']
    
    # 4. Train/test split for validation
    print("Splitting data into train and validation sets...")
    tX, vX, tY, vY = train_test_split(X, y, test_size=0.2, stratify=y, random_state=42)
    print(f"Training set size: {tX.shape[0]}, Validation set size: {vX.shape[0]}")
    
    # 5. Hyperparameter tuning with class balance
    print("Starting hyperparameter tuning...")
    param_grid = {
        'n_estimators': [100, 200, 500],
        'max_depth': [None, 20, 40, 60],
        'min_samples_leaf': [1, 2, 4],
        'min_samples_split': [2, 5, 10]
    }
    
    # Use stratified k-fold to handle potential class imbalance
    cv = StratifiedKFold(n_splits=5, shuffle=True, random_state=42)
    
    clf = GridSearchCV(
        RandomForestClassifier(class_weight='balanced_subsample', random_state=42),
        param_grid, 
        cv=cv, 
        n_jobs=-1, 
        verbose=1,
        scoring='balanced_accuracy'
    )
    
    clf.fit(tX, tY)
    print(f"Best parameters: {clf.best_params_}")
    print(f"Best cross-validation score: {clf.best_score_:.4f}")
    
    # 6. Evaluate on validation set
    print("Evaluating model on validation set...")
    v_pred = clf.predict(vX)
    v_accuracy = accuracy_score(vY, v_pred)
    
    print(f"Validation accuracy: {v_accuracy:.4f}")
    print(classification_report(vY, v_pred))
    
    # 7. Analyze feature importance
    best_model = clf.best_estimator_
    feature_importance = pd.Series(
        best_model.feature_importances_, 
        index=X.columns
    ).sort_values(ascending=False)
    
    print("Top 10 most important symptoms:")
    for feature, importance in feature_importance.head(10).items():
        # Extract actual symptom name from feature name ('has_symptom')
        symptom = feature[4:] if feature.startswith('has_') else feature
        print(f"  - {symptom}: {importance:.4f}")
    
    # 8. Retrain on full data with best params
    print("Training final model on full dataset...")
    final_model = RandomForestClassifier(
        **clf.best_params_,
        class_weight='balanced_subsample',
        random_state=42
    )
    final_model.fit(X, y)
    
    # 9. Save model artifacts
    model_path = os.path.join(output_dir, 'disease_rf_model.joblib')
    symptoms_path = os.path.join(output_dir, 'symptom_list.joblib')
    
    joblib.dump(final_model, model_path)
    joblib.dump(all_symptoms, symptoms_path)
    
    # Also save symptom-to-feature mapping for easier interpretation
    symptom_mapping = {
        'symptom_to_feature': {s: f'has_{s}' for s in all_symptoms},
        'feature_to_symptom': {f'has_{s}': s for s in all_symptoms}
    }
    joblib.dump(symptom_mapping, os.path.join(output_dir, 'symptom_mapping.joblib'))
    
    # Save feature importance for later use
    joblib.dump(feature_importance, os.path.join(output_dir, 'feature_importance.joblib'))
    
    print(f"Training complete. Artifacts saved in {output_dir}/")
    
    # Return performance metrics
    return {
        'accuracy': v_accuracy,
        'best_params': clf.best_params_,
        'cv_score': clf.best_score_,
        'feature_importance': feature_importance.head(10).to_dict()
    }

if __name__ == '__main__':
    metrics = train_disease_model()
    print("\nTraining Summary:")
    print(f"Validation Accuracy: {metrics['accuracy']:.4f}")
    print(f"Cross-Validation Score: {metrics['cv_score']:.4f}")
