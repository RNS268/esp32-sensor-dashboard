import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

export async function GET() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY;

  if (!url || !key) {
    return NextResponse.json(
      { error: "Server configuration is incomplete" },
      { status: 500 }
    );
  }

  const supabase = createClient(url, key, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });

  const { data: readings, error } = await supabase
    .from("sensor_readings")
    .select(
      "id, device_id, created_at, accel_x, accel_y, accel_z, accel_magnitude_g, temperature_c, vibration_alert, high_temperature_alert, rapid_temperature_rise_alert, sensor_error, alert_message, wifi_connected"
    )
    .order("created_at", { ascending: false })
    .limit(100);

  if (error) {
    console.error("Readings query failed:", error.message);
    return NextResponse.json(
      { error: "Could not load sensor readings" },
      { status: 500 }
    );
  }

  const ids = (readings ?? []).map((r) => r.id);

  if (ids.length === 0) {
    return NextResponse.json({ readings: [] });
  }

  const { data: predictions, error: predictionError } = await supabase
    .from("anomaly_predictions")
    .select("sensor_reading_id, prediction, ai_status, anomaly_score")
    .in("sensor_reading_id", ids);

  if (predictionError) {
    console.error("Prediction query failed:", predictionError.message);
    return NextResponse.json(
      { error: "Could not load AI predictions" },
      { status: 500 }
    );
  }

  const predictionMap = new Map(
    (predictions ?? []).map((p) => [p.sensor_reading_id, p])
  );

  const result = (readings ?? []).map((reading) => {
    const ai = predictionMap.get(reading.id);

    return {
      ...reading,
      ai_status: ai?.ai_status ?? "PENDING",
      prediction: ai?.prediction ?? null,
      anomaly_score: ai?.anomaly_score ?? null,
    };
  });

  return NextResponse.json(
    { readings: result },
    { headers: { "Cache-Control": "no-store" } }
  );
}
