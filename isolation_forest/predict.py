# -*- coding: utf-8 -*-
"""
Created on Fri Oct 30 10:41:59 2026

@author: Chandu
"""

import os
import pandas as pd
import numpy as np
import joblib
from supabase_client import get_supabase_client
from preprocessing import validate_and_preprocess, FEATURE_COLS

MODEL_FILENAME = "isolation_forest_accel_model.pkl"
BATCH_SIZE = 1000

def load_model():
    if not os.path.exists(MODEL_FILENAME):
        raise FileNotFoundError(f"Trained model '{MODEL_FILENAME}' not found. Run train_model.py first.")
    return joblib.load(MODEL_FILENAME)

def fetch_existing_prediction_ids(client) -> set:
    """Paginated retrieval of existing sensor_reading_id values from anomaly_predictions."""
    existing_ids = set()
    start = 0
    while True:
        response = client.table("anomaly_predictions") \
            .select("sensor_reading_id") \
            .range(start, start + BATCH_SIZE - 1) \
            .execute()
        
        rows = response.data
        if not rows:
            break
            
        for row in rows:
            existing_ids.add(row["sensor_reading_id"])
            
        start += BATCH_SIZE
        if len(rows) < BATCH_SIZE:
            break
            
    return existing_ids

def fetch_unprocessed_readings(client) -> pd.DataFrame:
    """Fetches sensor readings that do not yet have an entry in anomaly_predictions using pagination."""
    processed_ids = fetch_existing_prediction_ids(client)
    unprocessed_dfs = []
    start = 0

    print("Fetching unprocessed sensor readings with pagination...")
    while True:
        response = client.table("sensor_readings") \
            .select("id, created_at, accel_x, accel_y, accel_z, accel_magnitude_g") \
            .order("id", desc=False) \
            .range(start, start + BATCH_SIZE - 1) \
            .execute()
        
        rows = response.data
        if not rows:
            break
            
        df_batch = pd.DataFrame(rows)
        df_unprocessed = df_batch[~df_batch["id"].isin(processed_ids)]
        
        if not df_unprocessed.empty:
            unprocessed_dfs.append(df_unprocessed)
            
        start += BATCH_SIZE
        if len(rows) < BATCH_SIZE:
            break

    if unprocessed_dfs:
        return pd.concat(unprocessed_dfs, ignore_index=True)
    return pd.DataFrame()

def run_predictions():
    model = load_model()
    client = get_supabase_client()
    
    df_raw = fetch_unprocessed_readings(client)
    if df_raw.empty:
        print("No new unpredicted sensor readings found.")
        return

    df_clean = validate_and_preprocess(df_raw, is_training=False)
    df_clean = df_clean.dropna(subset=FEATURE_COLS)
    if df_clean.empty:
        print("No valid records remaining after preprocessing.")
        return

    X = df_clean[FEATURE_COLS]
    
    predictions = model.predict(X)
    scores = model.decision_function(X)

    records_to_insert = []
    for idx, row in df_clean.reset_index(drop=True).iterrows():
        pred = int(predictions[idx])
        score = float(scores[idx])
        ai_status = "NORMAL" if pred == 1 else "ANOMALY"
        
        records_to_insert.append({
            "sensor_reading_id": row["id"],
            "prediction": pred,
            "ai_status": ai_status,
            "anomaly_score": score
        })

    if records_to_insert:
        print(f"Upserting {len(records_to_insert)} predictions into Supabase...")
        chunk_size = 500
        for i in range(0, len(records_to_insert), chunk_size):
            chunk = records_to_insert[i:i + chunk_size]
            client.table("anomaly_predictions").upsert(
                chunk,
                on_conflict="sensor_reading_id"
            ).execute()
        print("Predictions successfully stored in Supabase.")

if __name__ == "__main__":
    run_predictions()