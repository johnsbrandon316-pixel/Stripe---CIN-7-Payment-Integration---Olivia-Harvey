#!/bin/bash
set -e

echo "========================================="
echo "Deploying CIN7 Stripe Integration to AWS ECS"
echo "========================================="

# Configuration
CLUSTER_NAME="cin7-stripe-cluster"
SERVICE_NAME="cin7-stripe-integration"
TASK_DEFINITION_FILE="aws/task-definition.json"

# Check if AWS CLI is installed
if ! command -v aws &> /dev/null; then
    echo "Error: AWS CLI is not installed. Please install it first."
    exit 1
fi

# Check if task definition file exists
if [ ! -f "$TASK_DEFINITION_FILE" ]; then
    echo "Error: Task definition file not found: $TASK_DEFINITION_FILE"
    exit 1
fi

# Ensure you've replaced placeholders
echo "WARNING: Ensure you've replaced ACCOUNT_ID, REGION, and fs-XXXXXXXX in task-definition.json"
read -p "Press Enter to continue or Ctrl+C to abort..."

# Register new task definition
echo "Registering task definition..."
TASK_DEFINITION_ARN=$(aws ecs register-task-definition \
  --cli-input-json file://$TASK_DEFINITION_FILE \
  --query 'taskDefinition.taskDefinitionArn' \
  --output text)

echo "Task definition registered: $TASK_DEFINITION_ARN"

# Update service with new task definition
echo "Updating ECS service..."
aws ecs update-service \
  --cluster $CLUSTER_NAME \
  --service $SERVICE_NAME \
  --task-definition $TASK_DEFINITION_ARN \
  --force-new-deployment \
  --desired-count 1

echo ""
echo "========================================="
echo "Deployment Initiated"
echo "========================================="
echo "Service is being updated with new task definition."
echo ""
echo "Monitor deployment:"
echo "  aws ecs describe-services --cluster $CLUSTER_NAME --services $SERVICE_NAME"
echo ""
echo "View logs:"
echo "  aws logs tail /ecs/cin7-stripe-integration --follow"
echo ""
echo "Check tasks:"
echo "  aws ecs list-tasks --cluster $CLUSTER_NAME --service-name $SERVICE_NAME"
