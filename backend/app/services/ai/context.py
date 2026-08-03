from app.services.victoriametrics import VictoriaMetricsService
from app.services.ml.forecast import ForecastService
from app.services.ml.anomaly import AnomalyService


async def build_server_system_prompt() -> str:
    """
    Directly fetches live telemetry, forecast predictions, and anomaly scores
    from internal backend services (not HTTP) and formats a structured System Prompt
    for the AI Assistant.
    """
    # 1. Fetch live metrics
    metrics = {}
    try:
        victoria = VictoriaMetricsService()
        metrics = await victoria.get_current_metrics()
    except Exception:
        metrics = {}

    # 2. Fetch forecast predictions
    forecasts = {}
    try:
        forecast_service = ForecastService()
        forecasts = await forecast_service.get_forecasts()
    except Exception:
        forecasts = {}

    # 3. Fetch anomaly status
    anomaly = {}
    try:
        anomaly_service = AnomalyService()
        anomaly = await anomaly_service.get_anomaly_score()
    except Exception:
        anomaly = {}

    # Check if telemetry is actively streaming
    has_active_metrics = any(
        isinstance(v, (int, float)) and v > 0.0
        for k, v in metrics.items()
        if k in ('cpu', 'memory', 'disk', 'load_1m', 'network_rx', 'disk_read')
    )

    # Extract metrics
    cpu = metrics.get('cpu', '0.0')
    memory = metrics.get('memory', '0.0')
    disk = metrics.get('disk', '0.0')
    swap = metrics.get('swap', '0.0')
    load_1m = metrics.get('load_1m', '0.0')
    load_5m = metrics.get('load_5m', '0.0')
    load_15m = metrics.get('load_15m', '0.0')
    network_rx = metrics.get('network_rx', '0.0')
    network_tx = metrics.get('network_tx', '0.0')
    disk_read = metrics.get('disk_read', '0.0')
    disk_write = metrics.get('disk_write', '0.0')
    processes = metrics.get('processes', '0.0')
    iowait = metrics.get('iowait', '0.0')

    # Format Forecasts
    def format_predictions(data):
        if not data or not isinstance(data, dict) or 'predictions' not in data:
            return "Persistence (Awaiting VM Forecast Model Sync)"
        p = data.get('predictions', {})
        strat = data.get('strategy', 'persistence')
        return f"Current: {data.get('current', 0.0)} | +5m: {p.get('5m', 0.0)}, +15m: {p.get('15m', 0.0)}, +30m: {p.get('30m', 0.0)}, +1h: {p.get('1h', 0.0)}, +3h: {p.get('3h', 0.0)} (Strategy: {strat})"

    cpu_forecast = format_predictions(forecasts.get('cpu'))
    mem_forecast = format_predictions(forecasts.get('memory'))
    load_forecast = format_predictions(forecasts.get('load_1m'))

    # Format Anomaly
    is_anomaly = anomaly.get('is_anomaly', False) if isinstance(anomaly, dict) else False
    anomaly_status = "DETECTED" if is_anomaly else "NORMAL"
    severity = anomaly.get('severity', 'NORMAL') if isinstance(anomaly, dict) else 'NORMAL'
    score = anomaly.get('anomaly_score', 0.0) if isinstance(anomaly, dict) else 0.0
    features_eval = anomaly.get('features_evaluated', 11) if isinstance(anomaly, dict) else 11

    vm_status = "ACTIVE TELEMETRY STREAMING" if has_active_metrics else "AWAITING CONNECTION TO VICTORIAMETRICS ON UBUNTU VM"

    system_prompt = f"""You are the Server Intelligence AI Assistant, an expert Linux Systems Administrator and Site Reliability Engineer (SRE).
You are integrated directly into the Server Intelligence Platform monitoring the Ubuntu server VM.

==================================================
UBUNTU VM SERVER TELEMETRY & ML PIPELINE STATE
==================================================
- VM Telemetry Connection Status: {vm_status}
- Current CPU Utilization: {cpu}%
- Current Memory Usage: {memory}% (Swap: {swap}%)
- Current Disk Storage: {disk}%
- System Load Averages (1m, 5m, 15m): {load_1m}, {load_5m}, {load_15m}
- Network Throughput: RX {network_rx} B/s | TX {network_tx} B/s
- Disk I/O Throughput: Read {disk_read} B/s | Write {disk_write} B/s
- Active Process Count: {processes}
- CPU I/O Wait Percentage: {iowait}%

==================================================
CAPACITY FORECAST TRAJECTORIES (UBUNTU VM ML)
==================================================
- CPU Forecast: {cpu_forecast}
- Memory Forecast: {mem_forecast}
- Load 1m Forecast: {load_forecast}

==================================================
OPERATIONAL ANOMALY EVALUATION (ISOLATION FOREST)
==================================================
- Anomaly Status: {anomaly_status}
- Severity Level: {severity}
- Outlier Score: {score} (Higher = More Anomalous)
- Features Evaluated: {features_eval}

==================================================
CRITICAL ASSISTANT INSTRUCTIONS
==================================================
1. NEVER state that the user has not provided data, text, logs, or images.
2. NEVER ask the user to upload a dataset, log file, code, or image. You are the embedded server AI assistant.
3. Use the live server telemetry, ML forecasts, and anomaly state above to answer questions about the host server VM's health, CPU scheduling, I/O wait, memory, disk, network, capacity forecasting, and anomaly detection.
4. When asked conceptual or technical questions (e.g. Linux CPU scheduling, IO wait, load averages, memory allocation), answer clearly and thoroughly as an expert SRE, referencing how those concepts relate to the server VM telemetry above.
5. Keep your tone professional, concise, highly technical, and structured using clean Markdown headers and code blocks.
"""
    return system_prompt
