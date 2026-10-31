# -*- coding: utf-8 -*-
"""
Created on Fri Oct 30 10:40:07 2026

@author: Chandu
"""

import pandas as pd
import numpy as np

# Exactly the 4 required features. No temperature, gyro, or time features.
FEATURE_COLS = ["accel_x", "accel_y", "accel_z", "accel_magnitude_g"]

def validate_and_preprocess(df: pd.DataFrame, is_training: bool = True) -> pd.DataFrame:
    """
    Validates mandatory features, converts to numeric, explicitly rejects infinite 
    and negative-infinite values, calculates missing magnitudes, and retains metadata 
    strictly without using them as features.
    """
    if df.empty:
        return df

    df = df.copy()

    # Explicit validation that all required base feature columns exist
    base_cols = ["accel_x", "accel_y", "accel_z"]
    for col in base_cols:
        if col not in df.columns:
            raise ValueError(f"Required base feature column '{col}' is missing from the dataset.")
        df[col] = pd.to_numeric(df[col], errors="coerce")

    # Handle accel_magnitude_g
    if "accel_magnitude_g" not in df.columns:
        df["accel_magnitude_g"] = np.nan
    else:
        df["accel_magnitude_g"] = pd.to_numeric(df["accel_magnitude_g"], errors="coerce")

    # Explicitly reject infinite and negative-infinite values in all four features
    all_target_cols = base_cols + ["accel_magnitude_g"]
    for col in all_target_cols:
        df[col] = df[col].replace([np.inf, -np.inf], np.nan)

    # Compute missing magnitude using formula: sqrt(x^2 + y^2 + z^2) / 9.80665
    missing_mag_mask = df["accel_magnitude_g"].isnull()
    if missing_mag_mask.any():
        calc_mag = np.sqrt(df["accel_x"]**2 + df["accel_y"]**2 + df["accel_z"]**2) / 9.80665
        df.loc[missing_mag_mask, "accel_magnitude_g"] = calc_mag[missing_mag_mask]

    # Re-verify inf/-inf on calculated magnitude
    df["accel_magnitude_g"] = df["accel_magnitude_g"].replace([np.inf, -np.inf], np.nan)

    return df