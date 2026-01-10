#!/bin/bash
set -e

echo "========================================="
echo "Deploying CIN7 Stripe Integration to Kubernetes"
echo "========================================="

# Check if kubectl is installed
if ! command -v kubectl &> /dev/null; then
    echo "Error: kubectl is not installed. Please install it first."
    exit 1
fi

# Create namespace
echo "Creating namespace..."
kubectl apply -f k8s/namespace.yaml

# Apply PersistentVolumeClaim first
echo "Creating persistent volume claim..."
kubectl apply -f k8s/persistentvolumeclaim.yaml

# Apply ConfigMap
echo "Applying ConfigMap..."
kubectl apply -f k8s/configmap.yaml

# Apply Secret (you should have updated this with real values)
echo "Applying Secret..."
echo "WARNING: Ensure k8s/secret.yaml contains real production values!"
read -p "Press Enter to continue or Ctrl+C to abort..."
kubectl apply -f k8s/secret.yaml

# Apply Deployment
echo "Deploying application..."
kubectl apply -f k8s/deployment.yaml

# Apply Service
echo "Creating service..."
kubectl apply -f k8s/service.yaml

# Wait for rollout to complete
echo "Waiting for deployment to complete..."
kubectl rollout status deployment/cin7-stripe-integration -n payments --timeout=5m

# Get pods
echo ""
echo "========================================="
echo "Deployment Status"
echo "========================================="
kubectl get pods -n payments

# Get service
echo ""
kubectl get svc -n payments

# Show logs
echo ""
echo "========================================="
echo "Recent Logs"
echo "========================================="
kubectl logs -n payments deployment/cin7-stripe-integration --tail=30

echo ""
echo "========================================="
echo "Deployment Complete!"
echo "========================================="
echo "To view logs: kubectl logs -f deployment/cin7-stripe-integration -n payments"
echo "To check health: kubectl port-forward -n payments svc/cin7-stripe-integration 3000:80"
echo "Then visit: http://localhost:3000/health"
