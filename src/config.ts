import dotenv from 'dotenv';
import { z } from 'zod';

dotenv.config();

const EnvSchema = z.object({
  APP_PORT: z.coerce.number().default(3000),
  LOG_LEVEL: z.string().optional(),
  STRIPE_API_KEY: z.string().min(1, 'STRIPE_API_KEY is required'),
  // Optional for local testing; required in production when webhooks are enabled
  STRIPE_WEBHOOK_SECRET: z.string().optional(),
  CIN7_BASE_URL: z.string().url().default('https://inventory.dearsystems.com/ExternalApi/v2/'),
  CIN7_API_KEY: z.string().optional(),
  CIN7_TENANT: z.string().optional(),
  // Admin token for accessing admin endpoints (optional; if not set, admin endpoints disabled)
  ADMIN_TOKEN: z.string().optional(),
  // Alerting configuration
  ALERT_ENABLED: z.enum(['true', 'false']).default('false').transform((v) => v === 'true'),
  ALERT_CRITICAL_THRESHOLD: z.coerce.number().default(3),
  ALERT_WARNING_THRESHOLD: z.coerce.number().default(5),
  ALERT_SLACK_ENABLED: z.enum(['true', 'false']).default('false').transform((v) => v === 'true'),
  ALERT_SLACK_WEBHOOK_URL: z.string().url().optional(),
  ALERT_SLACK_CHANNEL: z.string().default('#alerts'),
  ALERT_EMAIL_ENABLED: z.enum(['true', 'false']).default('false').transform((v) => v === 'true'),
  ALERT_EMAIL_FROM: z.string().optional(),
  ALERT_EMAIL_TO: z.string().optional(),
  ALERT_PAGERDUTY_ENABLED: z.enum(['true', 'false']).default('false').transform((v) => v === 'true'),
  ALERT_PAGERDUTY_INTEGRATION_KEY: z.string().optional(),
});

export const config = EnvSchema.parse(process.env);
