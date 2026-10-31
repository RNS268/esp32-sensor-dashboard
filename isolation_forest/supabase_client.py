# -*- coding: utf-8 -*-
"""
Created on Fri Oct 30 10:25:10 2026

@author: Chandu
"""

import os
from dotenv import load_dotenv
from supabase import create_client, Client

from pathlib import Path

env_path = Path(__file__).resolve().parent / ".env"
load_dotenv(dotenv_path=env_path, override=True)

SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_SERVICE_ROLE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY")

if not SUPABASE_URL or not SUPABASE_SERVICE_ROLE_KEY:
    raise ValueError("Missing Supabase credentials in environment variables.")

def get_supabase_client() -> Client:
    """Initializes and returns the Supabase client."""
    return create_client(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)