# -*- coding: utf-8 -*-
"""
Created on Fri Oct 30 10:41:15 2026

@author: Chandu
"""

import os
import pandas as pd
import numpy as np
from sklearn.ensemble import IsolationForest
import joblib
from supabase_client import get_supabase_client
from preprocessing import validate_and_preprocess, FEATURE_COLS

MODEL_FILENAME = "isolation_forest_accel_model.pkl"
BATCH_SIZE = 1000
MIN_TRAINING_SAMPLES = 50

def fetch_historical_data() -> pd.DataFrame:
    """Fetches historical sensor readings from Supabase using pagination."""
    client = get_supabase_client()
    all_rows = []
    start = 0
    
    print("Fetching historical sensor readings from Supabase...")
    while True:
        response = client.table("sensor_readings") \
            .select("id, created_at, accel_x, accel_y, accel_z, accel_magnitude_g") \
            .range(start, start + BATCH_SIZE - 1) \
            .execute()
        
        rows = response.data
        if not rows:
            break
            
        all_rows.extend(rows)
        start += BATCH_SIZE
        if len(rows) < BATCH_SIZE:
            break

    return pd.DataFrame(all_rows)

def train():
    csv_path = "historical_readings.csv"
    
    # Clearly report whether training used the CSV file or Supabase data
    if os.path.exists(csv_path):
        print(f"Data Source Selected: Local CSV file ('{csv_path}')")
        df = pd.read_csv(csv_path)
    else:
        print("Data Source Selected: Supabase database ('public.sensor_readings')")
        df = fetch_historical_data()

    total_fetched = len(df)
    if total_fetched == 0:
        raise ValueError("No historical data found in Supabase or local CSV.")

    # Robust duplicate removal when 'id' or feature columns might be missing
    initial_len = len(df)
    if "id" in df.columns and df["id"].notnull().any():
        df = df.drop_duplicates(subset=["id"], keep="first")
    else:
        available_subset = [c for c in FEATURE_COLS if c in df.columns]
        if available_subset:
            df = df.drop_duplicates(subset=available_subset, keep="first")
        else:
            df = df.drop_duplicates(keep="first")
    duplicates_removed = initial_len - len(df)

    # Preprocess data and remove invalid/NaN/Inf rows
    initial_pre_len = len(df)
    df_clean = validate_and_preprocess(df, is_training=True)
    df_clean = df_clean.dropna(subset=FEATURE_COLS)
    invalid_removed = initial_pre_len - len(df_clean)

    if len(df_clean) < MIN_TRAINING_SAMPLES:
        raise ValueError(
            f"Insufficient valid training data. Valid records ({len(df_clean)}) "
            f"is below the minimum threshold required ({MIN_TRAINING_SAMPLES} valid samples)."
        )

    print("\n--- Model Training Summary ---")
    print(f"Total records fetched:        {total_fetched}")
    print(f"Duplicate records removed:    {duplicates_removed}")
    print(f"Invalid/Inf records removed:  {invalid_removed}")
    print(f"Final training records used:  {len(df_clean)}")
    print("------------------------------\n")

    X = df_clean[FEATURE_COLS]

    print(f"Training Isolation Forest using features: {FEATURE_COLS}")
    model = IsolationForest(
        n_estimators=100,
        contamination=0.02,
        random_state=42,
        n_jobs=-1
    )
    model.fit(X)
    
    joblib.dump(model, MODEL_FILENAME)
    print(f"Model successfully trained and saved to {MODEL_FILENAME}")

if __name__ == "__main__":
    train()