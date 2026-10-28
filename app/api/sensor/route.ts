
import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";

const getSupabase = () => {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY;

  if (!url || !key) {
    throw new Error("Supabase server environment variables are missing");
  }

  return createClient(url, key, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
};

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function optionalNumber(value: unknown) {
  return value === null || value === undefined || isFiniteNumber(value);
}

function optionalBoolean(value: unknown) {
  return value === undefined || typeof value === "boolean";
}

export async function POST(request: NextRequest) {
  const expectedToken = process.env.DEVICE_API_TOKEN;
  const suppliedToken = request.headers
    .get("authorization")
    ?.replace(/^Bearer\s+/i, "");

  if (!expectedToken || suppliedToken !== expectedToken) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: Record<string, unknown>;

  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const numericFields = [
    "accel_x", "accel_y", "accel_z", "accel_magnitude_g",
    "gyro_x", "gyro_y", "gyro_z", "temperature_c",
  ];

  for (const field of numericFields) {
    if (!optionalNumber(body[field])) {
      return NextResponse.json(
        { error: `Invalid numeric field: ${field}` },
        { status: 400 },
      );
    }
  }

  if (
    !["accel_x", "accel_y", "accel_z", "temperature_c"].some(
      (field) => isFiniteNumber(body[field]),
    )
  ) {
    return NextResponse.json(
      { error: "At least one acceleration or temperature reading is required" },
      { status: 400 },
    );
  }

  const booleanFields = [
    "vibration_alert",
    "high_temperature_alert",
    "rapid_temperature_rise_alert",
    "sensor_error",
    "wifi_connected",
  ];

  for (const field of booleanFields) {
    if (!optionalBoolean(body[field])) {
      return NextResponse.json(
        { error: `Invalid boolean field: ${field}` },
        { status: 400 },
      );
    }
  }

  const deviceId =
    typeof body.device_id === "string" &&
    /^[a-zA-Z0-9_-]{1,64}$/.test(body.device_id)
      ? body.device_id
      : "esp32-s3-01";

  const alertMessage =
    typeof body.alert_message === "string"
      ? body.alert_message.slice(0, 250)
      : null;

  const row = {
    device_id: deviceId,
    accel_x: body.accel_x ?? null,
    accel_y: body.accel_y ?? null,
    accel_z: body.accel_z ?? null,
    accel_magnitude_g: body.accel_magnitude_g ?? null,
    gyro_x: body.gyro_x ?? null,
    gyro_y: body.gyro_y ?? null,
    gyro_z: body.gyro_z ?? null,
    temperature_c: body.temperature_c ?? null,
    vibration_alert: body.vibration_alert ?? false,
    high_temperature_alert: body.high_temperature_alert ?? false,
    rapid_temperature_rise_alert:
      body.rapid_temperature_rise_alert ?? false,
    sensor_error: body.sensor_error ?? false,
    alert_message: alertMessage,
    wifi_connected: body.wifi_connected ?? true,
  };

  try {
    const { data, error } = await getSupabase()
      .from("sensor_readings")
      .insert(row)
      .select("id, created_at")
      .single();

    if (error) {
      console.error("Sensor insert failed:", error.message);
      return NextResponse.json(
        { error: "Could not save sensor reading" },
        { status: 500 },
      );
    }

    return NextResponse.json({ success: true, reading: data }, { status: 201 });
  } catch (error) {
    console.error("Sensor API configuration error:", error);
    return NextResponse.json(
      { error: "Server configuration error" },
      { status: 500 },
    );
  }
}

