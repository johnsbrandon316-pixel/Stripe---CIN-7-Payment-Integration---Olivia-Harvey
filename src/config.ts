import dotenv from 'dotenv';
import { z } from 'zod';

dotenv.config();

const EnvSchema = z.object({
  APP_PORT: z.coerce.number().default(3000),
  LOG_LEVEL: z.string().optional(),
  STRIPE_API_KEY: z.string().min(1, 'STRIPE_API_KEY is required'),
  // Optional for local testing; required in production when webhooks are enabled
  STRIPE_WEBHOOK_SECRET: z.string().optional(),
  CIN7_BASE_URL: z.string().url().default('https://api.cin7.com'),
  CIN7_API_KEY: z.string().optional(),
  CIN7_TENANT: z.string().optional(),
});

export const config = EnvSchema.parse(process.env);
