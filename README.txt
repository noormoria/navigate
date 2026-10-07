NAVIGATE Python Backend

Files:
- app.py: FastAPI prediction API
- navigate_final_churn_model.pkl: trained ML model
- navigate_final_model_info.json: threshold, features, and test metrics
- requirements.txt: Python dependencies

Run locally:
1. Open a terminal inside this folder.
2. pip install -r requirements.txt
3. uvicorn app:app --reload
4. Open http://127.0.0.1:8000/docs

Prediction endpoint:
POST /predict

Required JSON fields:
- tenure
- total_spend
- last_interaction

Optional JSON fields:
- usage_frequency
- support_calls
- payment_delay
- subscription_type
- contract_length

Current threshold: 0.5537
Final untouched-test accuracy: 0.9596
ROC-AUC: 0.9815
