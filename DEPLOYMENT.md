# Deployment Manifests

This directory contains deployment configurations for multiple cloud platforms and container orchestration systems.

## Available Deployment Options

### 1. Kubernetes (`k8s/`)

Production-ready Kubernetes manifests for deploying to any Kubernetes cluster (GKE, EKS, AKS, self-hosted).

**Files:**
- `namespace.yaml` - Creates `payments` namespace
- `persistentvolumeclaim.yaml` - 5Gi storage for SQLite database
- `configmap.yaml` - Non-sensitive configuration
- `secret.yaml` - Sensitive credentials (API keys, tokens)
- `deployment.yaml` - Main application deployment (1 replica)
- `service.yaml` - ClusterIP service on port 80

**Deploy:**
```bash
cd scripts
chmod +x deploy-k8s.sh
./deploy-k8s.sh
```

**Verify:**
```bash
kubectl get pods -n payments
kubectl logs -f deployment/cin7-stripe-integration -n payments
kubectl port-forward -n payments svc/cin7-stripe-integration 3000:80
curl http://localhost:3000/health
```

---

### 2. AWS ECS Fargate (`aws/`)

AWS ECS task definition for serverless container deployment with Fargate.

**Files:**
- `task-definition.json` - ECS task definition with Fargate configuration

**Prerequisites:**
- ECS cluster created: `cin7-stripe-cluster`
- EFS file system for persistent storage
- Secrets stored in AWS Secrets Manager
- CloudWatch log group: `/ecs/cin7-stripe-integration`

**Deploy:**
```bash
# Update ACCOUNT_ID, REGION, and fs-XXXXXXXX in task-definition.json
cd scripts
chmod +x deploy-ecs.sh
./deploy-ecs.sh
```

**Verify:**
```bash
aws ecs describe-services --cluster cin7-stripe-cluster --services cin7-stripe-integration
aws logs tail /ecs/cin7-stripe-integration --follow
```

---

### 3. Google Cloud Run (`gcp/`)

Google Cloud Run service configuration for serverless container deployment.

**Files:**
- `service.yaml` - Cloud Run service definition

**Prerequisites:**
- GCP project with Cloud Run API enabled
- Container image pushed to GCR: `gcr.io/PROJECT_ID/cin7-stripe-integration`
- Secrets stored in Secret Manager

**Deploy:**
```bash
# Update PROJECT_ID in service.yaml
cd scripts
chmod +x deploy-gcp.sh
./deploy-gcp.sh
```

**Verify:**
```bash
gcloud run services describe cin7-stripe-integration --region=us-central1
curl $(gcloud run services describe cin7-stripe-integration --region=us-central1 --format='value(status.url)')/health
```

---

## Pre-Deployment Checklist

Before deploying to production:

### Secrets Configuration
- [ ] `CIN7_API_KEY` - Production Cin7 API key from Olivia
- [ ] `CIN7_TENANT` - Account ID: `f4ad4eb-2df3-4142-ba8b-a99f349b8279`
- [ ] `STRIPE_API_KEY` - Production `sk_live_...` key
- [ ] `STRIPE_WEBHOOK_SECRET` - Production `whsec_...` secret
- [ ] `ADMIN_TOKEN` - Secure random token (e.g., `openssl rand -hex 32`)
- [ ] `ALERT_SLACK_WEBHOOK_URL` - Slack incoming webhook URL

### Infrastructure
- [ ] Container image built and pushed to registry
- [ ] Persistent storage configured (PVC, EFS, or Cloud Storage)
- [ ] Secrets stored securely (Kubernetes Secrets, AWS Secrets Manager, GCP Secret Manager)
- [ ] Networking configured (ingress, load balancer, or service mesh)
- [ ] SSL/TLS certificates configured for HTTPS

### Application
- [ ] `WORKER_ENABLED=true` in production
- [ ] `WORKER_POLL_INTERVAL_MS` tuned for expected load (default: 60000)
- [ ] `WORKER_BATCH_SIZE` appropriate for sales volume (default: 20)
- [ ] Health check endpoint responding: `GET /health`
- [ ] Metrics endpoint accessible: `GET /api/metrics`

### Monitoring
- [ ] Alerting configured (`ALERT_ENABLED=true`)
- [ ] Slack channel created for alerts
- [ ] Metrics endpoint connected to monitoring (Prometheus, Datadog, etc.)
- [ ] Log aggregation configured (CloudWatch, Stackdriver, ELK)
- [ ] Uptime monitoring enabled

---

## Resource Requirements

**Minimum:**
- CPU: 200m (0.2 cores)
- Memory: 256Mi
- Storage: 1Gi (SQLite database)

**Recommended:**
- CPU: 500m (0.5 cores)
- Memory: 512Mi
- Storage: 5Gi (SQLite database with growth room)

**High Volume (>1000 sales/day):**
- CPU: 1000m (1 core)
- Memory: 1Gi
- Storage: 10Gi
- Consider PostgreSQL instead of SQLite

---

## Deployment Architecture

### Single Instance (Default)
- 1 replica running worker + API
- Suitable for: <1000 sales/day
- Worker polls Cin7 every 60 seconds
- Database: SQLite on persistent volume

### High Availability (Advanced)
If you need multiple instances:

**Option 1: Primary/Replica Pattern**
- 1 primary instance with `WORKER_ENABLED=true`
- N replica instances with `WORKER_ENABLED=false`
- Only primary runs worker to avoid duplication

**Option 2: Separate Worker Service**
- N API instances (`WORKER_ENABLED=false`)
- 1 dedicated worker instance (`WORKER_ENABLED=true`)
- Shared database (migrate to PostgreSQL)

---

## Post-Deployment Verification

### 1. Check Service Health
```bash
curl https://your-domain.com/health
# Expected: {"status":"ok","timestamp":"...","uptime_ms":...}
```

### 2. Verify Worker is Running
```bash
curl https://your-domain.com/api/metrics | jq '.worker_cycles'
# Should be > 0 and incrementing over time
```

### 3. Test Webhook Endpoint
- Go to Stripe Dashboard → Webhooks
- Update webhook endpoint URL to production domain
- Send test event
- Check logs for "Webhook processing complete"

### 4. Verify Database Persistence
- Restart the service/pod
- Check metrics endpoint
- Verify `payments_created` count persists

### 5. Test Admin Endpoints
```bash
# Replace with your admin token
curl -H "x-admin-token: YOUR_ADMIN_TOKEN" https://your-domain.com/api/admin/health
# Expected: {"status":"ok",...}
```

---

## Troubleshooting

### Worker Not Starting
**Check logs for:**
```
msg: 'Starting sale discovery worker'
msg: 'Starting sale discovery cycle'
```

**Common issues:**
- `WORKER_ENABLED` not set to `true`
- `CIN7_API_KEY` missing or invalid
- Database connection failed

### Webhook Failures
**Check logs for:**
```
msg: 'Stripe webhook signature verification failed'
msg: 'Webhook processing complete'
```

**Common issues:**
- `STRIPE_WEBHOOK_SECRET` incorrect
- Webhook URL not updated in Stripe Dashboard
- Service not accessible from internet

### High Memory Usage
**Check metrics:**
```bash
curl https://your-domain.com/api/metrics | jq '.worker_cycles, .payments_created'
```

**Solutions:**
- Reduce `WORKER_BATCH_SIZE`
- Increase memory limits
- Consider PostgreSQL for large datasets

---

## Rollback Procedure

### Kubernetes
```bash
kubectl rollout undo deployment/cin7-stripe-integration -n payments
kubectl rollout status deployment/cin7-stripe-integration -n payments
```

### AWS ECS
```bash
# Get previous task definition
aws ecs describe-services --cluster cin7-stripe-cluster --services cin7-stripe-integration

# Update to previous task definition
aws ecs update-service \
  --cluster cin7-stripe-cluster \
  --service cin7-stripe-integration \
  --task-definition cin7-stripe-integration:PREVIOUS_REVISION
```

### GCP Cloud Run
```bash
# List revisions
gcloud run revisions list --service=cin7-stripe-integration --region=us-central1

# Route traffic to previous revision
gcloud run services update-traffic cin7-stripe-integration \
  --region=us-central1 \
  --to-revisions=PREVIOUS_REVISION=100
```

---

## Support

For deployment issues or questions:
- Check logs: Service-specific commands above
- Review metrics: `GET /api/metrics`
- Test health: `GET /health`
- Contact: Olivia Harvey (project owner)

---

## Security Notes

- **Never commit secrets to git** - Use `.gitignore` for `.env.production`
- **Rotate secrets regularly** - API keys, admin tokens, webhook secrets
- **Use HTTPS only** - Configure TLS/SSL certificates
- **Restrict admin endpoints** - Use firewall rules or API gateway
- **Monitor logs** - Watch for unauthorized access attempts
- **Enable audit logging** - Track all admin actions
