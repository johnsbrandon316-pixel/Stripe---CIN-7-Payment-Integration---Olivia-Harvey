import logger from '../logger';

export interface Metrics {
  webhooks_received: number;
  webhooks_processed: number;
  webhooks_failed: number;
  payments_created: number;
  payments_posted: number;
  payments_failed: number;
  cin7_api_calls: number;
  cin7_api_errors: number;
  stripe_api_calls: number;
  stripe_api_errors: number;
  worker_cycles: number;
  worker_errors: number;
  database_errors: number;
  response_times: {
    cin7_avg_ms: number;
    cin7_count: number;
    stripe_avg_ms: number;
    stripe_count: number;
    webhook_avg_ms: number;
    webhook_count: number;
  };
}

export class MetricsCollector {
  private metrics: Metrics = {
    webhooks_received: 0,
    webhooks_processed: 0,
    webhooks_failed: 0,
    payments_created: 0,
    payments_posted: 0,
    payments_failed: 0,
    cin7_api_calls: 0,
    cin7_api_errors: 0,
    stripe_api_calls: 0,
    stripe_api_errors: 0,
    worker_cycles: 0,
    worker_errors: 0,
    database_errors: 0,
    response_times: {
      cin7_avg_ms: 0,
      cin7_count: 0,
      stripe_avg_ms: 0,
      stripe_count: 0,
      webhook_avg_ms: 0,
      webhook_count: 0,
    },
  };

  /**
   * Increment a numeric metric
   */
  increment(metric: keyof Omit<Metrics, 'response_times'>): void {
    const current = this.metrics[metric];
    if (typeof current === 'number') {
      (this.metrics[metric] as number) = current + 1;
      logger.debug({ msg: 'Metric incremented', metric, value: current + 1 });
    }
  }

  /**
   * Record API response time
   */
  recordTime(endpoint: 'cin7' | 'stripe' | 'webhook', duration_ms: number): void {
    const rt = this.metrics.response_times;

    if (endpoint === 'cin7') {
      rt.cin7_avg_ms = (rt.cin7_avg_ms * rt.cin7_count + duration_ms) / (rt.cin7_count + 1);
      rt.cin7_count++;
    } else if (endpoint === 'stripe') {
      rt.stripe_avg_ms = (rt.stripe_avg_ms * rt.stripe_count + duration_ms) / (rt.stripe_count + 1);
      rt.stripe_count++;
    } else if (endpoint === 'webhook') {
      rt.webhook_avg_ms = (rt.webhook_avg_ms * rt.webhook_count + duration_ms) / (rt.webhook_count + 1);
      rt.webhook_count++;
    }

    logger.debug({
      msg: 'Response time recorded',
      endpoint,
      duration_ms,
      running_average_ms: endpoint === 'cin7' ? rt.cin7_avg_ms : endpoint === 'stripe' ? rt.stripe_avg_ms : rt.webhook_avg_ms,
    });
  }

  /**
   * Get current metrics snapshot
   */
  getMetrics(): Metrics {
    return JSON.parse(JSON.stringify(this.metrics));
  }

  /**
   * Get metrics as Prometheus-formatted text
   */
  getPrometheusMetrics(): string {
    const m = this.metrics;
    const lines: string[] = [
      '# HELP stripe_cin7_webhooks_received Total webhook events received from Stripe',
      '# TYPE stripe_cin7_webhooks_received counter',
      `stripe_cin7_webhooks_received ${m.webhooks_received}`,
      '',
      '# HELP stripe_cin7_webhooks_processed Total webhook events successfully processed',
      '# TYPE stripe_cin7_webhooks_processed counter',
      `stripe_cin7_webhooks_processed ${m.webhooks_processed}`,
      '',
      '# HELP stripe_cin7_webhooks_failed Total webhook events that failed processing',
      '# TYPE stripe_cin7_webhooks_failed counter',
      `stripe_cin7_webhooks_failed ${m.webhooks_failed}`,
      '',
      '# HELP stripe_cin7_payments_created Total Stripe payment links created',
      '# TYPE stripe_cin7_payments_created counter',
      `stripe_cin7_payments_created ${m.payments_created}`,
      '',
      '# HELP stripe_cin7_payments_posted Total payments successfully posted to Cin7',
      '# TYPE stripe_cin7_payments_posted counter',
      `stripe_cin7_payments_posted ${m.payments_posted}`,
      '',
      '# HELP stripe_cin7_payments_failed Total payments that failed to post to Cin7',
      '# TYPE stripe_cin7_payments_failed counter',
      `stripe_cin7_payments_failed ${m.payments_failed}`,
      '',
      '# HELP stripe_cin7_cin7_api_calls Total Cin7 API calls',
      '# TYPE stripe_cin7_cin7_api_calls counter',
      `stripe_cin7_cin7_api_calls ${m.cin7_api_calls}`,
      '',
      '# HELP stripe_cin7_cin7_api_errors Total Cin7 API errors',
      '# TYPE stripe_cin7_cin7_api_errors counter',
      `stripe_cin7_cin7_api_errors ${m.cin7_api_errors}`,
      '',
      '# HELP stripe_cin7_stripe_api_calls Total Stripe API calls',
      '# TYPE stripe_cin7_stripe_api_calls counter',
      `stripe_cin7_stripe_api_calls ${m.stripe_api_calls}`,
      '',
      '# HELP stripe_cin7_stripe_api_errors Total Stripe API errors',
      '# TYPE stripe_cin7_stripe_api_errors counter',
      `stripe_cin7_stripe_api_errors ${m.stripe_api_errors}`,
      '',
      '# HELP stripe_cin7_worker_cycles Total worker poll cycles',
      '# TYPE stripe_cin7_worker_cycles counter',
      `stripe_cin7_worker_cycles ${m.worker_cycles}`,
      '',
      '# HELP stripe_cin7_worker_errors Total worker cycle errors',
      '# TYPE stripe_cin7_worker_errors counter',
      `stripe_cin7_worker_errors ${m.worker_errors}`,
      '',
      '# HELP stripe_cin7_database_errors Total database operation errors',
      '# TYPE stripe_cin7_database_errors counter',
      `stripe_cin7_database_errors ${m.database_errors}`,
      '',
      '# HELP stripe_cin7_cin7_response_time_avg Average Cin7 API response time in milliseconds',
      '# TYPE stripe_cin7_cin7_response_time_avg gauge',
      `stripe_cin7_cin7_response_time_avg ${Math.round(m.response_times.cin7_avg_ms)}`,
      '',
      '# HELP stripe_cin7_stripe_response_time_avg Average Stripe API response time in milliseconds',
      '# TYPE stripe_cin7_stripe_response_time_avg gauge',
      `stripe_cin7_stripe_response_time_avg ${Math.round(m.response_times.stripe_avg_ms)}`,
      '',
      '# HELP stripe_cin7_webhook_response_time_avg Average webhook processing time in milliseconds',
      '# TYPE stripe_cin7_webhook_response_time_avg gauge',
      `stripe_cin7_webhook_response_time_avg ${Math.round(m.response_times.webhook_avg_ms)}`,
    ];

    return lines.join('\n');
  }

  /**
   * Reset all metrics
   */
  reset(): void {
    this.metrics = {
      webhooks_received: 0,
      webhooks_processed: 0,
      webhooks_failed: 0,
      payments_created: 0,
      payments_posted: 0,
      payments_failed: 0,
      cin7_api_calls: 0,
      cin7_api_errors: 0,
      stripe_api_calls: 0,
      stripe_api_errors: 0,
      worker_cycles: 0,
      worker_errors: 0,
      database_errors: 0,
      response_times: {
        cin7_avg_ms: 0,
        cin7_count: 0,
        stripe_avg_ms: 0,
        stripe_count: 0,
        webhook_avg_ms: 0,
        webhook_count: 0,
      },
    };
    logger.info({ msg: 'Metrics reset' });
  }
}

export const metricsCollector = new MetricsCollector();
