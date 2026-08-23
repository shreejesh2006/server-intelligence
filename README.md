# Server Intelligence Platform

A multi-server Linux infrastructure monitoring, telemetry aggregation, machine learning forecasting, anomaly detection, and AI-assisted observability platform.

---

## 1. PROJECT OVERVIEW

### What the Project Does
The **Server Intelligence Platform** continuously monitors Linux virtual machines (VMs), collects high-resolution system telemetry, stores time-series data in **VictoriaMetrics**, exposes host-aware metric endpoints via a **FastAPI backend**, and visualizes real-time performance, statistical percentiles, capacity forecasts, and anomaly detection inside a **React industrial neumorphic dashboard**. It also includes an embedded **AI Engineering Copilot** that ingests system telemetry to provide diagnostic intelligence.

### Why it Exists & Problem Solved
Managing heterogeneous Linux environments (e.g., Ubuntu enterprise nodes and Kali security Linux VMs) traditionally requires separate logging tools or heavy monitoring agents. Standard Prometheus stacks without proper host-level filtering often collapse multi-server metrics into single-series queries, producing identical or misleading data across hosts. This platform solves multi-host telemetry ambiguity by combining wall-clock-aligned telemetry ingestion, host-specific PromQL query scoping, local machine learning models, and local/cloud LLM context synthesis.

### Current Development Stage
- **Stage**: Active Development / Operational Prototype (v0.2.0 Backend / v0.1.0 Frontend).
- **Core Telemetry & Ingestion**: Fully operational for 2 monitored nodes (**Ubuntu** and **Kali**).
- **Host-Aware API & Authentication**: Fully implemented with JWT authentication and Role-Based Access Control (RBAC).
- **Machine Learning & AI**: Machine learning forecasting and Isolation Forest anomaly detection pipelines are integrated; AI Assistant service supports Ollama, OpenAI, and Anthropic.

---

## 2. CURRENT SYSTEM STATUS

| Component / Feature | Implementation Status | Technical Details in Codebase |
| :--- | :---: | :--- |
| **Dockerized Infrastructure** | **COMPLETED** | `docker-compose.yml` configures `backend`, `frontend`, `victoriametrics`, and `grafana`. |
| **Multi-Server Telemetry** | **COMPLETED** | Host-labeled ingestion for `ubuntu` and `Kali`. |
| **Ubuntu Collector** | **COMPLETED** | Daemon running on `100.108.160.2` publishing to VictoriaMetrics. |
| **Kali Collector** | **COMPLETED** | Daemon running on `100.115.122.92` publishing to VictoriaMetrics. |
| **Tailscale Networking** | **COMPLETED** | Mesh VPN connectivity established across Linux VMs and dev host. |
| **VictoriaMetrics TSDB** | **COMPLETED** | Ingesting via `/api/v1/import/prometheus` with 90-day retention. |
| **FastAPI Backend Gateway** | **COMPLETED** | Async Python backend exposing `/api/metrics`, `/api/auth`, `/api/intelligence`, `/api/assistant`. |
| **React Frontend Console** | **COMPLETED** | React 19 + Vite 8 SPA styled in Light/Dark Industrial Neumorphic theme. |
| **Host-Aware Metrics Filtering** | **COMPLETED** | `GET /api/metrics/current?host=<label>` and `GET /api/metrics/{metric}?host=<label>`. |
| **ML Capacity Forecasting** | **COMPLETED** | Pre-trained models (`/ml/models/forecasting/`) predicting 5m, 15m, 30m, 1h, 3h horizons. |
| **ML Anomaly Detection** | **COMPLETED** | Isolation Forest detector (`isolation_forest.joblib`) evaluating multi-feature anomaly scores. |
| **AI Assistant (Copilot)** | **COMPLETED** | Multi-provider LLM manager (Ollama, OpenAI, Anthropic) with telemetry context injection. |
| **User Management (RBAC)** | **COMPLETED** | SQLite database with `ADMIN`, `OPERATOR`, `VIEWER` roles and encrypted JWT tokens. |
| **Telemetry Analytics** | **IN DEVELOPMENT** | Interactive target node percentile distributions and specs breakdown available on frontend. |
| **Alert Trigger Subsystem** | **IN DEVELOPMENT** | UI alert policy rules and threshold displays available; live alert dispatcher in development. |
| **Multi-Node ML Auto-Training** | **NOT YET IMPLEMENTED**| ML models are currently trained on historical baseline datasets; automated continuous retraining is planned. |

---

## 3. SYSTEM ARCHITECTURE

### Conceptual Architecture & Data Flow
<img width="800" height="741" alt="image" src="https://github.com/user-attachments/assets/6e432c45-69d1-4bf0-96b1-5f862e0fbcc7" />

### Component Roles
1. **Telemetry Collector (`/collector`)**: Standalone Python daemon running on monitored VMs. Uses `psutil` to sample system metrics every 30 seconds aligned to wall-clock boundaries (`:00`, `:30`) and pushes Prometheus text exposition payloads to VictoriaMetrics.
2. **VictoriaMetrics (`port 8428`)**: Fast, memory-efficient time-series database storing host-tagged metrics (`server_cpu_usage_percent{host="ubuntu"}`).
3. **FastAPI Backend (`/backend`, `port 8000`)**: Serves REST endpoints, validates JWT tokens, executes host-aware PromQL queries against VictoriaMetrics, runs local ML models, and manages AI LLM context formatting.
4. **React Frontend (`/frontend`, `port 80` / `port 5173`)**: Single Page Application providing real-time metric visualizations, node selection, multi-window time-series charts, user management, and AI copilot interaction.
5. **Developer Workstation (Mac OS)**: Host environment executing the Vite frontend dev server, docker container stack, and code editing workspace.

---

## 4. SERVERS

The platform actively monitors two Linux virtual machine nodes:

| Server Name | Operating System | Tailscale IP | VictoriaMetrics Host Label | Role |
| :--- | :--- | :--- | :--- | :--- |
| **Ubuntu** | Ubuntu 22.04 LTS / Linux (x86_64) | `100.108.160.2` | `ubuntu` | Primary Telemetry Host & VictoriaMetrics Server |
| **Kali** | Kali Linux Rolling (x86_64) | `100.115.122.92` | `Kali` | Monitored Target Node |

> [!IMPORTANT]
> **Host Label Sensitivity**:
> - **Hostname**: OS-level hostname returned by `socket.gethostname()`.
> - **Tailscale IP**: Private mesh network IP assigned to the VM interface.
> - **VictoriaMetrics Host Label (`host`)**: Exact label string embedded in metrics exposition headers (e.g., `host="ubuntu"` and `host="Kali"`).
>
> All backend PromQL queries and frontend server context parameters **must** use the exact VictoriaMetrics host label string (`ubuntu` or `Kali`).

---

## 5. NETWORKING

### Tailscale Mesh Connectivity
The infrastructure relies on **Tailscale** to create an encrypted 100.x.x.x overlay mesh network between monitored nodes and the developer environment.

- **Kali → Ubuntu VictoriaMetrics**: The collector daemon on Kali (`100.115.122.92`) publishes metrics across Tailscale directly to VictoriaMetrics running on Ubuntu (`100.108.160.2:8428`).
- **FastAPI Backend → VictoriaMetrics**: The FastAPI backend communicates with VictoriaMetrics via internal Docker network (`http://victoriametrics:8428`) or local loopback (`http://localhost:8428`).
- **React Frontend → Backend**: The React frontend issues requests to `/api/*` which Vite reverse-proxies to `http://localhost:8000` (or `http://192.168.64.22:8000` in production VM environments).

---

## 6. TELEMETRY COLLECTION

### Collector Specifications
- **Script Location**: [`/collector/collector.py`](file:///Users/shreejesh2006/Projects/server-intelligence/collector/collector.py)
- **Metrics Module**: [`/collector/metrics.py`](file:///Users/shreejesh2006/Projects/server-intelligence/collector/metrics.py)
- **Publisher Module**: [`/collector/publisher.py`](file:///Users/shreejesh2006/Projects/server-intelligence/collector/publisher.py)
- **Collection Frequency**: `30 seconds` (synchronized to wall-clock boundaries: `:00` and `:30`).
- **Library**: `psutil` (Python Process and System Utilities).

### Sampled Telemetry Fields & Exposition Metric Mapping

| Data Field | Sampled Source | Published Metric Name | Unit |
| :--- | :--- | :--- | :--- |
| `cpu_usage_percent` | `psutil.cpu_percent(interval=None)` | `server_cpu_usage_percent` | `%` |
| `memory_usage_percent` | `psutil.virtual_memory().percent` | `server_memory_usage_percent` | `%` |
| `disk_usage_percent` | `psutil.disk_usage("/").percent` | `server_disk_usage_percent` | `%` |
| `swap_usage_percent` | `psutil.swap_memory().percent` | `server_swap_usage_percent` | `%` |
| `load_1m` | `os.getloadavg()[0]` | `server_load_1m` | Threads |
| `load_5m` | `os.getloadavg()[1]` | `server_load_5m` | Threads |
| `load_15m` | `os.getloadavg()[2]` | `server_load_15m` | Threads |
| `network_rx_bytes_sec` | `psutil.net_io_counters()` delta / elapsed | `server_network_rx_bytes_per_second` | Bytes/sec |
| `network_tx_bytes_sec` | `psutil.net_io_counters()` delta / elapsed | `server_network_tx_bytes_per_second` | Bytes/sec |
| `disk_read_bytes_sec` | `psutil.disk_io_counters()` delta / elapsed | `server_disk_read_bytes_per_second` | Bytes/sec |
| `disk_write_bytes_sec` | `psutil.disk_io_counters()` delta / elapsed | `server_disk_write_bytes_per_second` | Bytes/sec |
| `process_count` | `len(psutil.pids())` | `server_process_count` | Integer |
| `cpu_iowait_percent` | `psutil.cpu_times_percent().iowait` | `server_cpu_iowait_percent` | `%` |
| `uptime_seconds` | `time.time() - psutil.boot_time()` | `server_uptime_seconds` | Seconds |

---

## 7. VICTORIAMETRICS

### Database Configuration & API Usage
VictoriaMetrics is deployed as a single-binary TSDB providing high compression and Prometheus-compatible PromQL querying capabilities.

- **Retention Period**: `90 days` (`--retentionPeriod=90d`).
- **Import Endpoint**: `POST /api/v1/import/prometheus` (accepts line-delimited Prometheus text exposition format).
- **Query Endpoint**: `GET /api/v1/query?query=<promql>`
- **Range Query Endpoint**: `GET /api/v1/query_range?query=<promql>&start=<start>&end=<end>&step=<step>`

### Real PromQL Query Examples
```promql
# Query latest CPU usage for Ubuntu node
server_cpu_usage_percent{host="ubuntu"}

# Query 1-hour memory history for Kali node with 30s resolution
server_memory_usage_percent{host="Kali"}

# Query 1-minute system load across all registered hosts
server_load_1m
```

---

## 8. BACKEND (FASTAPI)

The backend is located in [`/backend`](file:///Users/shreejesh2006/Projects/server-intelligence/backend). It is built with **FastAPI** and uses **SQLAlchemy** for SQLite user management and AI settings storage.

### API Architecture & Endpoint Documentation

```
backend/app/
├── api/
│   ├── ai_settings.py   # AI Assistant provider configuration & key encryption
│   ├── assistant.py     # AI Copilot chat streaming & telemetry context building
│   ├── auth.py          # JWT login, token issuance, & access verification
│   ├── intelligence.py  # ML Capacity forecasting & Isolation Forest endpoints
│   ├── metrics.py       # Current telemetry & historical range-query API
│   └── users.py         # User management (CRUD, RBAC)
├── auth/                # Security, password hashing (bcrypt), JWT tokens, RBAC roles
├── database/            # SQLAlchemy database initialization & models (SQLite)
├── schemas/             # Pydantic validation models
├── services/            # VictoriaMetrics, ML loaders, AI provider integrations
└── main.py              # Application entrypoint & CORS middleware
```

#### Complete Endpoint Reference

| Method | Endpoint | Access Level | Description |
| :--- | :--- | :--- | :--- |
| `GET` | `/` | Public | Returns API version and status. |
| `GET` | `/health` | Public | Healthcheck endpoint. |
| `POST` | `/api/auth/login` | Public | Authenticates credentials and returns JWT access token. |
| `GET` | `/api/auth/me` | Authenticated | Returns profile of current logged-in user. |
| `GET` | `/api/metrics/` | Viewer+ | Returns list of supported metric keys. |
| `GET` | `/api/metrics/current` | Viewer+ | Returns latest snapshot of all metrics (supports `?host=`). |
| `GET` | `/api/metrics/{metric_name}` | Viewer+ | Returns historical time-series range values (supports `?host=`, `start`, `end`, `step`). |
| `GET` | `/api/intelligence/forecast` | Viewer+ | Returns 5m to 3h predictions for CPU, Memory, and Load. |
| `GET` | `/api/intelligence/anomaly` | Viewer+ | Returns current anomaly score, severity level, and evaluation status. |
| `POST` | `/api/assistant/chat` | Viewer+ | Streams chat responses from LLM with live telemetry context. |
| `GET` | `/api/settings/ai` | Viewer+ | Fetches current AI Copilot provider and model status. |
| `PUT` | `/api/settings/ai` | Admin Only | Updates AI provider engine, model, or encrypted API key. |
| `DELETE` | `/api/settings/ai/key` | Admin Only | Clears stored third-party AI API key. |
| `GET` | `/api/users/` | Admin Only | Lists all platform users. |
| `POST` | `/api/users/` | Admin Only | Creates a new platform user with designated role. |
| `PUT` | `/api/users/{id}` | Admin Only | Updates user details, password, role, or active state. |
| `DELETE` | `/api/users/{id}` | Admin Only | Deletes user account. |

---

## 9. HOST-AWARE METRICS

### The Multi-Server Disambiguation Problem
When multiple Linux VMs publish telemetry to a single VictoriaMetrics instance, querying an unlabelled metric (e.g., `server_cpu_usage_percent`) returns an array of multiple series—one per host. 

If backend query code naively accesses index `data[0]` without filtering, the API arbitrarily returns whichever VM's metric series VictoriaMetrics evaluated first. This causes Ubuntu and Kali metrics to appear duplicate or swap unexpectedly on the UI.

### Implementation Solution ([`backend/app/api/metrics.py`](file:///Users/shreejesh2006/Projects/server-intelligence/backend/app/api/metrics.py))
1. **Query Construction**:
   ```python
   def build_query(metric: str, host: str | None) -> str:
       if not host:
           return metric
       if not host.replace("_", "").replace("-", "").isalnum():
           raise HTTPException(status_code=400, detail="Invalid host")
       return f'{metric}{{host="{host}"}}'
   ```
2. **Post-Query Strict Verification**:
   ```python
   if host:
       matching = [item for item in data if item.get("metric", {}).get("host") == host]
       if not matching:
           result[name] = None
       else:
           data = matching
   ```

---

## 10. FRONTEND ARCHITECTURE

Located in [`/frontend`](file:///Users/shreejesh2006/Projects/server-intelligence/frontend), the client is constructed using **React 19**, **Vite 8**, and **React Router 7**.

### Component & Context Hierarchy
- **State Contexts**:
  - `AuthContext`: Manages login session, JWT local storage, active user, and role validation.
  - `ServerContext`: Manages active server target selection (`ubuntu` vs `Kali`).
  - `ThemeContext`: Toggles between `light` and `dark` Industrial Neumorphic color schemes.
  - `TimezoneContext`: Manages display timezone formatting (`UTC`, `EST`, `PST`, `IST`).
- **Telemetry Hook (`useMetrics`)**: Polls `GET /api/metrics/current?host=<activeHost>` every 30 seconds with automatic stale state detection and error recovery.
- **Design System**: Refined Light & Dark Industrial Neumorphic theme built with soft shadows, cool-gray/dark-slate surfaces, dark navy typography, and restrained green primary status accents (`#16a34a` / `#22c55e`).

---

## 11. FRONTEND PAGES

| Route | Page Module | Functional Status | Description & Capabilities |
| :--- | :--- | :---: | :--- |
| `/login` | `LoginPage.jsx` | **Functional** | JWT authentication gateway with form validation. |
| `/overview` | `OverviewPage.jsx` | **Functional** | Primary observability console featuring hero server status, telemetry snapshot cards, Recharts time-series charts, and intelligence summary. |
| `/servers` | `ServersPage.jsx` | **Functional** | Multi-server target control card displaying node specs, Tailscale IP, collector status, and real-time CPU/RAM/Disk metrics. |
| `/forecasts` | `ForecastsPage.jsx` | **Functional** | Detailed predictive trajectory visualizer across 5m, 15m, 30m, 1h, and 3h horizons. |
| `/anomalies` | `AnomaliesPage.jsx` | **Functional** | Isolation Forest anomaly detector dashboard showing anomaly score, severity badge, and feature telemetry breakdown. |
| `/analytics` | `AnalyticsPage.jsx` | **Functional** | Statistical percentile breakdown (P50, P90, P95, P99, Peak) and long-term telemetry rollup analysis. |
| `/alerts` | `AlertsPage.jsx` | **Functional** | Incident alert logs, trigger threshold policy rules, and severity filter controls. |
| `/assistant` | `AssistantPage.jsx` | **Functional** | Interactive AI Copilot workspace streaming responses with injected live telemetry context. |
| `/users` | `UsersPage.jsx` | **Functional (Admin)** | Role-Based Access Control console for creating, editing, and deactivating user accounts. |
| `/settings` | `SettingsPage.jsx` | **Functional (Admin)** | System settings, timezone formatting, and AI provider/model configuration card. |

---

## 12. MACHINE LEARNING ARCHITECTURE

The platform integrates two distinct machine learning subsystems located in [`/ml`](file:///Users/shreejesh2006/Projects/server-intelligence/ml) and loaded via [`backend/app/services/ml/loader.py`](file:///Users/shreejesh2006/Projects/server-intelligence/backend/app/services/ml/loader.py).

### 1. Capacity Forecasting Subsystem
- **Target Metrics**: `cpu`, `memory`, `load_1m`.
- **Prediction Horizons**: `5m`, `15m`, `30m`, `1h`, `3h`.
- **Model Storage**: [`/ml/models/forecasting/`](file:///Users/shreejesh2006/Projects/server-intelligence/ml/models/forecasting) containing `.joblib` regression models and `.json` metadata descriptors.
- **Fallback Strategy**: If a model file is missing or telemetry is insufficient, the system gracefully falls back to persistence-based trend evaluation.

### 2. Anomaly Detection Subsystem
- **Algorithm**: **Isolation Forest** unsupervised anomaly detection (`ml.anomaly.AnomalyDetector`).
- **Model File**: [`/ml/models/anomaly/isolation_forest.joblib`](file:///Users/shreejesh2006/Projects/server-intelligence/ml/models/anomaly/isolation_forest.joblib)
- **Features Evaluated**: 11 system telemetry features (CPU, memory, swap, load averages, network RX/TX rates, disk read/write rates, IO wait).

> [!NOTE]
> **Data Requirement**: Reliable per-server machine learning evaluations require at least 24–48 hours of continuous, uninterrupted telemetry collection per host.

---

## 13. AI ASSISTANT (ENGINEERING COPILOT)

The platform includes an embedded AI copilot ([`backend/app/services/ai`](file:///Users/shreejesh2006/Projects/server-intelligence/backend/app/services/ai)) designed to assist system administrators with operational diagnostics.

### Supported Inference Backends
1. **Ollama (Default / Local)**: Connects to local Ollama inference server (`http://host.docker.internal:11434/api/chat`). Default model: `qwen3:1.7b` or `llama3`. Does not require API keys.
2. **OpenAI (Cloud)**: Requires an encrypted API key stored via `/api/settings/ai`. Supports `gpt-4o-mini` and `gpt-4o`.
3. **Anthropic (Cloud)**: Requires an encrypted API key. Supports `claude-3-5-sonnet` and `claude-3-haiku`.

### Telemetry Context Injection
Before sending a user query to the selected LLM, [`backend/app/services/ai/context.py`](file:///Users/shreejesh2006/Projects/server-intelligence/backend/app/services/ai/context.py) automatically generates a structured system prompt containing:
- Monitored server list and active node hardware specs.
- Current CPU, RAM, Disk, Load, and Network metrics for `ubuntu` and `Kali`.
- Active machine learning capacity predictions (5m to 3h).
- Current Isolation Forest anomaly score and severity rating.

---

## 14. DOCKER INFRASTRUCTURE

The root [`docker-compose.yml`](file:///Users/shreejesh2006/Projects/server-intelligence/docker-compose.yml) orchestrates the complete containerized stack:

```yaml
services:
  backend:
    build:
      context: .
      dockerfile: ./backend/Dockerfile
    container_name: server-intelligence-backend
    ports:
      - "8000:8000"
    environment:
      OLLAMA_URL: "http://host.docker.internal:11434/api/chat"
      VICTORIAMETRICS_URL: "http://victoriametrics:8428"
    depends_on:
      - victoriametrics

  frontend:
    build:
      context: ./frontend
      dockerfile: Dockerfile
    container_name: server-intelligence-frontend
    ports:
      - "80:80"
    depends_on:
      - backend

  victoriametrics:
    image: victoriametrics/victoria-metrics:latest
    container_name: server-intelligence-victoriametrics
    ports:
      - "8428:8428"
    command:
      - "--storageDataPath=/victoria-metrics-data"
      - "--retentionPeriod=90d"

  grafana:
    image: grafana/grafana:latest
    container_name: server-intelligence-grafana
    ports:
      - "3000:3000"
    depends_on:
      - victoriametrics
```

---

## 15. LOCAL DEVELOPMENT GUIDE

### Prerequisites
- Node.js `v18+` & `npm`
- Python `3.10+` & `pip`
- Docker Desktop & Docker Compose

### 1. Clone Repository
```bash
git clone https://github.com/shreejesh2006/server-intelligence.git
cd server-intelligence
```

### 2. Frontend Local Setup
```bash
cd frontend
npm install
npm run dev
# Frontend runs at http://localhost:5173
```

To verify production compilation:
```bash
npm run lint
npm run build
```

### 3. Backend Local Setup
```bash
cd ../backend
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt

# Initialize database & seed default admin user
python scripts/create_admin.py

# Run FastAPI server
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
# Backend API runs at http://localhost:8000
```

### 4. Collector Local Setup (on Monitored VM)
```bash
cd collector
pip install psutil
python collector.py
```

### 5. Docker Full Stack Setup
```bash
docker-compose up -d --build
```

---

## 16. ENVIRONMENT VARIABLES

Configure variables in a `.env` file at the root of the project:

| Variable Name | Purpose | Example Format |
| :--- | :--- | :--- |
| `JWT_SECRET_KEY` | Secret key used for signing JWT authentication tokens. | `<random-secure-64-char-string>` |
| `SECRET_KEY` | Application fallback encryption secret. | `<random-secure-string>` |
| `VICTORIAMETRICS_URL` | URL to central VictoriaMetrics TSDB instance. | `http://localhost:8428` |
| `OLLAMA_URL` | Local Ollama LLM chat completion API endpoint. | `http://host.docker.internal:11434/api/chat` |
| `DATABASE_URL` | SQLAlchemy connection URI for user/settings database. | `sqlite:///./server_intelligence.db` |
| `ACCESS_TOKEN_EXPIRE_MINUTES` | Lifetime of issued JWT authentication tokens. | `60` |

---

## 17. GIT WORKFLOW

### Branching Strategy
- `main`: Production-ready, tested codebase.
- `feature/frontend`: Active frontend user interface feature work.
- `feature/infrastructure`: Backend, telemetry pipeline, and VictoriaMetrics configuration.
- `experiment/*`: Short-lived experimental branches for testing design language or ML models.

### Developer Commit & PR Guidelines
1. Always create a topic branch from `main` (e.g., `git checkout -b feature/alert-dispatch`).
2. Run `npm run lint` and `npm run build` inside `frontend/` before pushing.
3. Keep commits focused, descriptive, and atomic.
4. **NEVER force-push** (`git push -f`) to `main` or shared feature branches.
5. **NEVER commit secrets, private keys, or `.env` files**.

---

## 18. TEAM CONTRIBUTION RULES

### DO
- **Inspect Before Modifying**: Read existing API contracts and component structures before introducing changes.
- **Maintain Host Filtering**: Always pass and validate the `host` query parameter on metric endpoints.
- **Test Both Hosts**: Verify that UI changes render correctly for both `ubuntu` and `Kali` node selections.
- **Preserve Defensive Fallbacks**: Maintain null checks and safe default values in React state contexts.

### DO NOT
- **DO NOT Hardcode Telemetry**: Never substitute real metrics with static mock numbers in production views.
- **DO NOT Fabricate ML Outputs**: Ensure forecasting and anomaly values strictly reflect model loader outputs or documented fallbacks.
- **DO NOT Change API Contracts Unilaterally**: Coordinate changes to FastAPI request/response models with frontend developers.
- **DO NOT Commit Credentials**: Never commit `.env`, SQLite database files containing hashed passwords, or decrypted API keys.

---

## 19. HOW TO ADD A NEW MONITORED SERVER

To add a third monitored VM (e.g., `Debian Server`):

1. **Deploy Collector Script**: Copy the `/collector` directory to the target VM.
2. **Verify Tailscale Mesh**: Ensure the target VM is connected to Tailscale and can reach the Ubuntu VictoriaMetrics IP (`100.108.160.2:8428`).
3. **Configure Publisher Destination**: In `collector/publisher.py`, set `VICTORIAMETRICS_IMPORT_URL = "http://100.108.160.2:8428/api/v1/import/prometheus"`.
4. **Start Collector Daemon**: Execute `python3 collector/collector.py` (or set up a systemd service).
5. **Verify Metric Ingestion**: Confirm metric series exist in VictoriaMetrics:
   ```bash
   curl "http://100.108.160.2:8428/api/v1/query?query=server_cpu_usage_percent"
   ```
   Ensure `{host="debian"}` appears in the metric results.
6. **Register Host in Frontend ([`frontend/src/context/ServerContext.jsx`](file:///Users/shreejesh2006/Projects/server-intelligence/frontend/src/context/ServerContext.jsx))**:
   ```javascript
   {
     host: 'debian',
     name: 'Debian Server',
     ip: '100.x.x.x',
     os: 'Debian GNU/Linux 12'
   }
   ```

---

## 20. TROUBLESHOOTING

| Symptom | Probable Cause | Diagnostic & Resolution Steps |
| :--- | :--- | :--- |
| **API OFFLINE banner on UI** | FastAPI backend unreachable or crashed. | Check backend process: `curl http://localhost:8000/health`. Check logs: `docker logs server-intelligence-backend`. |
| **Metrics show identical data on Ubuntu & Kali** | Host query filter missing or bypassed. | Verify URL contains `?host=ubuntu` or `?host=Kali`. Inspect Network tab in developer tools. |
| **VictoriaMetrics ingestion failure** | Collector process stopped or port 8428 blocked. | Test connectivity: `curl http://100.108.160.2:8428/api/v1/query?query=up`. Restart collector daemon on target VM. |
| **AI Assistant returns 502 / Error** | Ollama daemon unreachable or API key missing. | Verify Ollama status: `curl http://localhost:11434/api/tags`. Check Settings page AI configuration. |
| **ML Models show 'Unavailable'** | Model files missing from `/ml/models/`. | Verify `.joblib` and `.json` metadata exist in `/ml/models/forecasting` and `/ml/models/anomaly`. |
| **React White Screen / Error Boundary** | Unhandled null property or invalid theme state. | Inspect browser console logs. Verify `localStorage.clear()` or check defensive context fallbacks. |

---

## 21. SECURITY

- **Authentication**: Stateless JSON Web Tokens (JWT) signed with HMAC-SHA256. Passwords stored using `bcrypt` password hashing.
- **Role-Based Access Control**: Three distinct permission tiers:
  - `ADMIN`: Full system management, user management, and AI settings modification.
  - `OPERATOR`: Operational node monitoring, metric inspection, and telemetry viewing.
  - `VIEWER`: Read-only telemetry and dashboard inspection.
- **Credential Storage**: Third-party LLM API keys are encrypted at rest inside SQLite using AES symmetric key encryption.
- **Network Security**: Telemetry ingestion operates exclusively over private Tailscale mesh network interfaces.

---

## 22. CURRENT LIMITATIONS

- **ML Historical Data Dependency**: Machine learning forecasting models require consistent long-term telemetry history; newly provisioned VMs will rely on persistence fallback until sufficient historical data is collected.
- **Alert Dispatch Engine**: The UI contains threshold policy rules and incident logs; automated notification dispatch (PagerDuty / Slack / Email) is under development.
- **Static Monitored Host Registry**: The frontend monitored server list is configured via `ServerContext.jsx`; dynamic auto-discovery of newly registered TSDB host labels is planned for Phase 5.

---

## 23. PROJECT ROADMAP

- [x] **PHASE 1 — Infrastructure**: Dockerized VictoriaMetrics, FastAPI backend, and React baseline UI setup.
- [x] **PHASE 2 — Multi-Server Telemetry**: Wall-clock aligned collector daemon deployed on Ubuntu (`100.108.160.2`) and Kali (`100.115.122.92`) with host-aware filtering.
- [x] **PHASE 3 — System Intelligence**: Integrated PatchTST forecasting and Isolation Forest anomaly detection pipelines.
- [x] **PHASE 4 — AI-Assisted Copilot**: Multi-provider AI Assistant workspace with live telemetry context injection.
- [x] **PHASE 5 — User Management & RBAC**: JWT authentication, SQLite user database, and role-based permissions (`ADMIN`, `OPERATOR`, `VIEWER`).
- [ ] **PHASE 6 — Live Alert Dispatch**: Real-time webhook notification dispatch for threshold violations.
- [ ] **PHASE 7 — Automated ML Continuous Training**: Scheduled background jobs for automatic model retraining on fresh VictoriaMetrics telemetry.

---

## 24. CONTRIBUTION GUIDE FOR NEW TEAM MEMBERS

### Onboarding Timeline

```
DAY 1: System Familiarization
 ├── Clone repository and launch local frontend (`npm run dev`)
 ├── Run FastAPI backend and inspect Swagger docs at `http://localhost:8000/docs`
 └── Test switching between `ubuntu` and `Kali` server targets on the UI

DAY 2: Architecture Deep Dive
 ├── Inspect collector daemon (`/collector/collector.py`) and metrics mapping
 ├── Trace host-aware PromQL query builder in `backend/app/api/metrics.py`
 └── Review React context state (`AuthContext`, `ServerContext`, `ThemeContext`)

DAY 3: Subsystem Contribution
 ├── Pick an assigned task from the Phase 6/7 roadmap
 ├── Create a feature branch from `main`
 └── Verify changes with `npm run lint` and `npm run build` before opening PR
```

---

## 25. ARCHITECTURE QUICK REFERENCE

| Component | Repository Path | Service / Port | Default Credentials / Notes |
| :--- | :--- | :--- | :--- |
| **Python Collector** | [`/collector/collector.py`](file:///Users/shreejesh2006/Projects/server-intelligence/collector/collector.py) | Daemon | Wall-clock 30s sampling using `psutil`. |
| **VictoriaMetrics** | [`docker-compose.yml`](file:///Users/shreejesh2006/Projects/server-intelligence/docker-compose.yml) | Port `8428` | TSDB storage engine; retention period `90d`. |
| **FastAPI Backend** | [`/backend/app/main.py`](file:///Users/shreejesh2006/Projects/server-intelligence/backend/app/main.py) | Port `8000` | REST API Gateway & JWT Auth provider. |
| **React Frontend** | [`/frontend/src/App.jsx`](file:///Users/shreejesh2006/Projects/server-intelligence/frontend/src/App.jsx) | Port `80` / `5173` | React 19 SPA styled in Industrial Neumorphism. |
| **ML Model Loader** | [`/backend/app/services/ml/loader.py`](file:///Users/shreejesh2006/Projects/server-intelligence/backend/app/services/ml/loader.py) | Internal Service | Loads PatchTST forecasting & Isolation Forest models. |
| **AI Assistant** | [`/backend/app/services/ai/manager.py`](file:///Users/shreejesh2006/Projects/server-intelligence/backend/app/services/ai/manager.py) | Port `11434` / Cloud | Context-injected LLM manager (Ollama, OpenAI, Anthropic). |
| **SQLite Database** | [`/backend/server_intelligence.db`](file:///Users/shreejesh2006/Projects/server-intelligence/backend/server_intelligence.db) | Internal DB | Stores users, role permissions, and AI configuration. |
| **Grafana** | [`docker-compose.yml`](file:///Users/shreejesh2006/Projects/server-intelligence/docker-compose.yml) | Port `3000` | Optional visualization dashboard layer. |
| **Tailscale Mesh** | System Subnet | `100.x.x.x` | Encrypted mesh VPN for multi-server VM communication. |
