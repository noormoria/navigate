from pathlib import Path
import joblib
import pandas as pd

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

BASE_DIR = Path(__file__).resolve().parent
MODEL_PATH = BASE_DIR / "navigate_final_churn_model.pkl"

MODEL = joblib.load(MODEL_PATH)
THRESHOLD = 0.5537

app = FastAPI(
    title="NAVIGATE Churn API",
    version="1.0.0",
    description="Python ML API for NAVIGATE customer churn prediction."
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "https://noormoria.github.io",
        "https://app.navigateretention.site",
        "http://localhost:5500",
        "http://127.0.0.1:5500",
        "http://localhost:8000",
        "http://127.0.0.1:8000"
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

class ChurnInput(BaseModel):
    tenure: float = Field(ge=0)
    total_spend: float = Field(ge=0)
    last_interaction: float = Field(ge=0)

    usage_frequency: float | None = Field(default=None, ge=0)
    support_calls: float | None = Field(default=None, ge=0)
    payment_delay: float | None = Field(default=None, ge=0)

    subscription_type: str | None = None
    contract_length: str | None = None

@app.get("/")
def root():
    return {
        "service": "NAVIGATE Churn API",
        "status": "online",
        "model": "Hist Gradient Boosting"
    }

@app.get("/health")
def health():
    return {"ok": True}

@app.post("/predict")
def predict(data: ChurnInput):
    row = pd.DataFrame([[
        data.tenure,
        data.total_spend,
        data.last_interaction,
        data.usage_frequency,
        data.support_calls,
        data.payment_delay,
        data.subscription_type,
        data.contract_length,
    ]], columns=[
        "Tenure",
        "Total Spend",
        "Last Interaction",
        "Usage Frequency",
        "Support Calls",
        "Payment Delay",
        "Subscription Type",
        "Contract Length",
    ])

    probability = float(MODEL.predict_proba(row)[0, 1])
    prediction = int(probability >= THRESHOLD)

    return {
        "churn_probability": round(probability, 6),
        "churn_percentage": round(probability * 100, 2),
        "prediction": prediction,
        "decision_threshold": round(THRESHOLD, 6)
    }
