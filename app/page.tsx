
"use client";

import { useCallback, useEffect, useState } from "react";

type Reading = {
  ai_status: "NORMAL" | "ANOMALY" | "PENDING";
  prediction: number | null;
  anomaly_score: number | null;
  id: number;
  device_id: string;
  created_at: string;
  accel_x: number | null;
  accel_y: number | null;
  accel_z: number | null;
  accel_magnitude_g: number | null;
  temperature_c: number | null;
  vibration_alert: boolean;
  high_temperature_alert: boolean;
  rapid_temperature_rise_alert: boolean;
  sensor_error: boolean;
  alert_message: string | null;
  wifi_connected: boolean;
};

function formatNumber(value: number | null, digits = 2) {
  return value == null || !Number.isFinite(value)
    ? "--"
    : value.toFixed(digits);
}

function Sparkline({
  values,
  label,
}: {
  values: number[];
  label: string;
}) {
  const width = 320;
  const height = 76;
  const pad = 8;

  const min = values.length ? Math.min(...values) : 0;
  const max = values.length ? Math.max(...values) : 1;
  const range = max - min || 1;

  const points = values
    .map((value, index) => {
      const x =
        pad +
        (index / Math.max(values.length - 1, 1)) * (width - 2 * pad);
      const y =
        height -
        pad -
        ((value - min) / range) * (height - 2 * pad);
      return `${x},${y}`;
    })
    .join(" ");

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      role="img"
      aria-label={label}
      className="h-20 w-full overflow-visible"
    >
      <line
        x1={pad}
        y1={height - pad}
        x2={width - pad}
        y2={height - pad}
        stroke="currentColor"
        opacity=".15"
      />
      {values.length > 1 && (
        <polyline
          points={points}
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinejoin="round"
          strokeLinecap="round"
        />
      )}
    </svg>
  );
}

function Metric({
  title,
  value,
  unit,
  detail,
  values,
}: {
  title: string;
  value: string;
  unit: string;
  detail: string;
  values: number[];
}) {
  return (
    <section className="panel">
      <p className="muted">{title}</p>
      <div className="metric">
        {value}
        <span>{unit}</span>
      </div>
      <p className="muted detail">{detail}</p>
      <Sparkline values={values} label={`${title} history`} />
    </section>
  );
}

export default function Home() {
  const [readings, setReadings] = useState<Reading[]>([]);
  const [error, setError] = useState("");
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const response = await fetch("/api/readings", {
        cache: "no-store",
      });

      if (!response.ok) {
        throw new Error(`API returned HTTP ${response.status}`);
      }

      const result = (await response.json()) as {
        readings?: Reading[];
      };

      setReadings(result.readings ?? []);
      setLastUpdated(new Date());
      setError("");
    } catch {
      setError("Unable to load readings. Check your API and database setup.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
    const timer = window.setInterval(() => void refresh(), 5000);
    return () => window.clearInterval(timer);
  }, [refresh]);

  const latest = readings[0];
  const aiStatus = latest?.ai_status ?? "PENDING";
  const alerts = latest
    ? [
        latest.vibration_alert && "Sudden vibration detected",
        latest.high_temperature_alert && "High temperature",
        latest.rapid_temperature_rise_alert && "Rapid temperature rise",
        latest.sensor_error && "Sensor error",
      ].filter(Boolean) as string[]
    : [];

  const history = [...readings].reverse();
  const temperatures = history
    .map((r) => r.temperature_c)
    .filter((v): v is number => v !== null && Number.isFinite(v));

  const acceleration = history
    .map((r) => r.accel_magnitude_g)
    .filter((v): v is number => v !== null && Number.isFinite(v));

  const hasRecentData =
    latest != null &&
    Date.now() - new Date(latest.created_at).getTime() < 30000;

  return (
    <main className="dashboard">
      <header className="topbar">
        <div>
          <p className="eyebrow">IoT MONITORING</p>
          <h1>AIOT Sentinel</h1>
          <p className="muted">ESP32-S3 · MPU6050 · DS18B20</p>
        </div>
        <div className="status">
          <span className={`dot ${hasRecentData ? "green" : "gray"}`} />
          {hasRecentData ? "Receiving data" : "Waiting for data"}
        </div>
      </header>

      {error && (
        <div className="notice danger" role="alert">
          {error}
        </div>
      )}
      <section className={`notice ${
  aiStatus === "ANOMALY" ? "danger" :
  aiStatus === "NORMAL" ? "safe" : ""
}`}>
  <div className="notice-title">
    Isolation Forest AI Status
  </div>
  <p>
    {aiStatus === "PENDING"
      ? "Prediction pending"
      : aiStatus}
  </p>
  {latest?.anomaly_score != null && (
    <p className="muted">
      Anomaly score: {latest.anomaly_score.toFixed(4)}
    </p>
  )}
</section>
      <section className={`notice ${alerts.length ? "danger" : "safe"}`}>
        <div className="notice-title">
          <span className={`dot ${alerts.length ? "red" : "green"}`} />
          {alerts.length ? "WARNING DETECTED" : "SYSTEM STATUS"}
        </div>
        <p>
          {alerts.length
            ? alerts.join(" · ")
            : latest
              ? "No active alerts in the latest reading."
              : "Waiting for the first sensor reading."}
        </p>
        {latest?.alert_message && (
          <p className="muted">{latest.alert_message}</p>
        )}
      </section>

      <div className="section-heading">
        <h2>Live measurements</h2>
        <span className="muted">
          {loading
            ? "Loading..."
            : lastUpdated
              ? `Updated ${lastUpdated.toLocaleTimeString()}`
              : "Not updated"}
        </span>
      </div>

      <section className="grid">
        <Metric
          title="Temperature"
          value={formatNumber(latest?.temperature_c ?? null, 1)}
          unit="°C"
          detail="DS18B20"
          values={temperatures}
        />
        <Metric
          title="Acceleration magnitude"
          value={formatNumber(latest?.accel_magnitude_g ?? null)}
          unit="g"
          detail="MPU6050 · Total acceleration"
          values={acceleration}
        />
        <Metric
          title="X acceleration"
          value={formatNumber(latest?.accel_x ?? null)}
          unit="m/s²"
          detail="MPU6050 X axis"
          values={history
            .map((r) => r.accel_x)
            .filter((v): v is number => v !== null)}
        />
        <Metric
          title="Y acceleration"
          value={formatNumber(latest?.accel_y ?? null)}
          unit="m/s²"
          detail="MPU6050 Y axis"
          values={history
            .map((r) => r.accel_y)
            .filter((v): v is number => v !== null)}
        />
        <Metric
          title="Z acceleration"
          value={formatNumber(latest?.accel_z ?? null)}
          unit="m/s²"
          detail="MPU6050 Z axis"
          values={history
            .map((r) => r.accel_z)
            .filter((v): v is number => v !== null)}
        />
      </section>

      <section className="panel history-panel">
        <div className="section-heading">
          <h2>Recent readings</h2>
          <span className="muted">{readings.length} records</span>
        </div>
        {readings.length === 0 ? (
          <p className="muted empty">
            No readings saved yet. Once the ESP32 starts uploading data,
            measurements will appear here.
          </p>
        ) : (
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Time</th>
                  <th>Temperature</th>
                  <th>X</th>
                  <th>Y</th>
                  <th>Z</th>
                  <th>Alert</th>
                </tr>
              </thead>
              <tbody>
                {readings.slice(0, 20).map((reading) => {
                  const warning =
                    reading.vibration_alert ||
                    reading.high_temperature_alert ||
                    reading.rapid_temperature_rise_alert ||
                    reading.sensor_error;

                  return (
                    <tr key={reading.id}>
                      <td>
                        {new Date(reading.created_at).toLocaleTimeString()}
                      </td>
                      <td>{formatNumber(reading.temperature_c, 1)} °C</td>
                      <td>{formatNumber(reading.accel_x)}</td>
                      <td>{formatNumber(reading.accel_y)}</td>
                      <td>{formatNumber(reading.accel_z)}</td>
                      <td>
                        <span className={`pill ${warning ? "bad" : "good"}`}>
                          {warning ? "WARNING" : "Normal"}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <footer className="footer">
        <span>Device: {latest?.device_id ?? "esp32-s3-01"}</span>
        <span>
          Last stored reading:{" "}
          {latest
            ? new Date(latest.created_at).toLocaleString()
            : "None yet"}
        </span>
        <button className="refresh" onClick={() => void refresh()}>
          Refresh now
        </button>
      </footer>
    </main>
  );
}

