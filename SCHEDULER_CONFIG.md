# Step 14: Worker Scheduler Configuration

**Status**: ✅ **COMPLETE - Worker is integrated and production-ready**

The sale discovery worker is fully integrated into the service and requires **no additional configuration** for basic operation. This document provides production deployment guidance and optional advanced scheduling options.

## Current Implementation

### Worker Startup (Automatic)
```typescript
// src/index.ts - Runs on service initialization
saleDiscoveryWorker.start();

// Graceful shutdown
process.on('SIGINT', () => saleDiscoveryWorker.stop());
process.on('SIGTERM', () => saleDiscoveryWorker.stop());
```

The worker starts automatically when the service initializes and stops gracefully on shutdown signals (SIGINT, SIGTERM).

### Configuration (via `.env`)
```bash
# Worker Configuration
WORKER_ENABLED=true              # Enable/disable worker without redeploying
WORKER_POLL_INTERVAL_MS=60000    # Poll interval in milliseconds (default: 60s)
WORKER_BATCH_SIZE=10             # Process N sales per cycle (default: 10)
```

**Recommended Production Settings:**
```bash
WORKER_ENABLED=true              # Always enabled in production
WORKER_POLL_INTERVAL_MS=60000    # Poll every minute (balanced for responsiveness)
WORKER_BATCH_SIZE=20             # Higher batch size for efficiency
```

**For High-Volume Scenarios:**
```bash
WORKER_POLL_INTERVAL_MS=30000    # Poll every 30 seconds
WORKER_BATCH_SIZE=50             # Process larger batches
```

## Deployment Options

### Option A: Docker / Kubernetes (Recommended - Default)

**Docker Compose** (Local/Staging):
```bash
docker-compose up
```
- Service runs as containerized process
- Worker polling loop built-in
- Health check: `GET /health` (returns 200 OK + uptime)
- Restart policy: `unless-stopped`
- Database persists via volume mount: `./data:/app/data`

**Kubernetes** (Production):
```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: cin7-stripe-integration
spec:
  replicas: 1
  selector:
    matchLabels:
      app: cin7-stripe-integration
  template:
    metadata:
      labels:
        app: cin7-stripe-integration
    spec:
      containers:
      - name: service
        image: redi-cin7-stripe-integration:latest
        ports:
        - containerPort: 3000
        env:
        - name: WORKER_ENABLED
          value: "true"
        - name: WORKER_POLL_INTERVAL_MS
          value: "60000"
        - name: WORKER_BATCH_SIZE
          value: "20"
        livenessProbe:
          httpGet:
            path: /health
            port: 3000
          initialDelaySeconds: 10
          periodSeconds: 30
        readinessProbe:
          httpGet:
            path: /health
            port: 3000
          initialDelaySeconds: 5
          periodSeconds: 10
        volumeMounts:
        - name: data
          mountPath: /app/data
      restartPolicy: Always
      volumes:
      - name: data
        persistentVolumeClaim:
          claimName: cin7-stripe-data
```

**Advantages:**
- ✅ Worker integrated into service (no separate process)
- ✅ Single point of deployment
- ✅ Automatic restart on failure
- ✅ Health checks built-in
- ✅ Data persists across restarts

### Option B: Systemd Timer (Linux VPS/Dedicated Server)

**When to use**: Running on EC2, DigitalOcean, Linode, or self-managed Linux servers

**Create service file** `/etc/systemd/system/cin7-stripe.service`:
```ini
[Unit]
Description=CIN7 Stripe Payment Integration Service
After=network.target
Wants=cin7-stripe.timer

[Service]
Type=simple
User=node
WorkingDirectory=/opt/cin7-stripe-integration
EnvironmentFile=/opt/cin7-stripe-integration/.env
ExecStart=/usr/bin/node /opt/cin7-stripe-integration/dist/index.js
Restart=always
RestartSec=10
StandardOutput=journal
StandardError=journal
SyslogIdentifier=cin7-stripe

[Install]
WantedBy=multi-user.target
```

**Enable and start the service:**
```bash
sudo systemctl daemon-reload
sudo systemctl enable cin7-stripe
sudo systemctl start cin7-stripe

# Verify status
sudo systemctl status cin7-stripe

# View logs
sudo journalctl -u cin7-stripe -f
```

### Option C: PM2 Process Manager (Development/Staging)

**Installation:**
```bash
npm install -g pm2
```

**Create `ecosystem.config.js`:**
```javascript
module.exports = {
  apps: [{
    name: 'cin7-stripe-integration',
    script: './dist/index.js',
    instances: 1,
    exec_mode: 'cluster',
    env: {
      NODE_ENV: 'production',
      WORKER_ENABLED: 'true',
      WORKER_POLL_INTERVAL_MS: 60000,
    },
    error_file: './logs/error.log',
    out_file: './logs/out.log',
    log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
    watch: false,
    max_memory_restart: '500M',
    autorestart: true,
    max_restarts: 10,
  }]
};
```

**Start:**
```bash
pm2 start ecosystem.config.js
pm2 save
pm2 startup
```

## Monitoring the Worker

### Health Check Endpoint
```bash
curl http://localhost:3000/health
```

Response:
```json
{
  "status": "ok",
  "timestamp": "2026-01-10T18:30:45.123Z",
  "uptime_ms": 3600000
}
```

### Metrics Endpoint (Prometheus format)
```bash
curl http://localhost:3000/metrics
```

Key metrics to monitor:
- `worker_cycles` - Number of polling cycles completed
- `worker_errors` - Failed cycles or errors
- `cin7_api_calls` - Successful API calls to Cin7
- `cin7_api_errors` - Failed Cin7 API calls
- `payments_created` - Payment links generated
- `webhooks_received` - Webhook events received
- `webhooks_failed` - Failed webhook processing
- `payments_posted` - Successful payments posted to Cin7

### JSON Metrics Endpoint
```bash
curl http://localhost:3000/api/metrics
```

Response:
```json
{
  "webhooks_received": 24,
  "webhooks_failed": 2,
  "webhooks_processed": 22,
  "payments_created": 18,
  "payments_posted": 18,
  "payments_failed": 0,
  "cin7_api_calls": 42,
  "cin7_api_errors": 1,
  "worker_cycles": 15,
  "worker_errors": 0,
  "database_errors": 0,
  "cin7_avg_ms": { "sum": 1205, "count": 42, "avg": 28.7 },
  "stripe_avg_ms": { "sum": 856, "count": 18, "avg": 47.6 },
  "webhook_avg_ms": { "sum": 543, "count": 22, "avg": 24.7 }
}
```

### Application Logs
```bash
# Docker
docker logs redi-cin7-stripe-integration

# Systemd
sudo journalctl -u cin7-stripe -f

# PM2
pm2 logs cin7-stripe-integration
```

Look for:
```
msg: 'Starting sale discovery cycle'
msg: 'Sale discovery cycle completed'
msg: 'Webhook processing complete'
msg: 'Payment posted to Cin7 SalePayments'
```

## Alerting Configuration

The service includes built-in alerting for critical worker failures. Configure via `.env`:

```bash
# Alerting Configuration
ALERT_ENABLED=true
ALERT_CRITICAL_THRESHOLD=3        # Alert after 3 consecutive failures
ALERT_WARNING_THRESHOLD=5
ALERT_SLACK_ENABLED=true
ALERT_SLACK_WEBHOOK_URL=https://hooks.slack.com/services/YOUR/WEBHOOK/URL
ALERT_SLACK_CHANNEL=#payments-alerts
```

**Critical events that trigger alerts:**
- Worker cycle failures > threshold (repeated errors)
- Cin7 API connectivity loss
- Payment posting failures
- Database write errors

## Scaling Considerations

### Single Instance (Recommended Default)
- 1 service instance with integrated worker
- Polling interval: 60 seconds
- Batch size: 10-20 sales per cycle
- Suitable for: < 1000 sales/day

### Multiple Instances (Advanced)
If you need to scale beyond single instance:

**Option 1: Read-Only Replicas**
```
- 1 Primary (worker enabled, WORKER_ENABLED=true)
- N Replicas (worker disabled, WORKER_ENABLED=false)
```
Only the primary instance runs the worker to prevent duplicate processing.

**Option 2: Separate Worker Service**
```
- N API instances (WORKER_ENABLED=false)
- 1 Worker instance (dedicated scheduler)
```
Deploy worker separately using same codebase but only running `saleDiscoveryWorker`.

### Database Considerations
- SQLite suitable for: Single instance, < 100 events/min
- For higher scale: Migrate to PostgreSQL
- Workers across instances automatically deduplicate via database constraints

## Production Checklist

Before deploying to production:

- [ ] `WORKER_ENABLED=true` in production `.env`
- [ ] `WORKER_POLL_INTERVAL_MS` set appropriately (60000 = 1 min recommended)
- [ ] `WORKER_BATCH_SIZE` tuned for your sales volume (20-50 recommended)
- [ ] Health check endpoint responding: `GET /health` → 200 OK
- [ ] Metrics accessible: `GET /api/metrics` → valid JSON
- [ ] Alerting configured: `ALERT_ENABLED=true`, Slack webhook set
- [ ] Database persists across restarts (volume mounts or persistent storage)
- [ ] Logs configured and accessible
- [ ] Restart policy set to `always` (docker-compose or systemd)
- [ ] Graceful shutdown handlers working (test with `SIGTERM`)
- [ ] Worker cycle logging visible in application logs
- [ ] Monitoring dashboard connected to `/metrics` endpoint

## Troubleshooting

### Worker not starting
```bash
# Check logs
docker logs redi-cin7-stripe-integration | grep "Starting sale discovery"

# Check config
curl http://localhost:3000/api/metrics | jq '.worker_cycles'
# Should be > 0
```

**Fix**: Verify `WORKER_ENABLED=true` in `.env`

### Worker cycles not incrementing
```bash
curl http://localhost:3000/api/metrics | jq '.worker_cycles'
```

**Possible causes:**
- `CIN7_API_KEY` not configured (worker runs but skips posting)
- Worker polling interval too long (wait time = `WORKER_POLL_INTERVAL_MS`)
- Database locked (SQLite concurrent access issue)

### High worker errors
```bash
curl http://localhost:3000/api/metrics | jq '.worker_errors'
```

**Check logs for:**
```
msg: 'Failed to fetch sales from Cin7'
msg: 'Error in worker interval'
```

**Common causes:**
- Cin7 API key invalid or expired
- Network connectivity to `api.cin7.com`
- Stripe API key missing

## Summary

✅ **Step 14 Complete:**
- Worker automatically starts on service initialization
- All scheduling logic built into service (no external cron jobs needed)
- Configurable via `.env` without code changes
- Health check and metrics endpoints for monitoring
- Multiple deployment options (Docker, Kubernetes, systemd, PM2)
- Production-ready with alerting and logging
- Graceful shutdown support

**No additional code changes required.** The service is ready for production deployment with the scheduler fully integrated and configurable.
