# Show demo mode info
    if results.get('demo_mode'):
        messages.append({
            'type': 'info',
            'content': "💡 **Demo Mode**: Showing sample predictions. For accurate results, train the model with medical data."
        })

    # Primary disease prediction details
    pred = results['top_prediction']
    messages.append({
        'type': 'prediction',
        'disease': pred['disease'],
        'probability': f"{pred['probability']*100:.1f}%",
        'description': pred['description'],
        'confidence': pred['probability']
    })