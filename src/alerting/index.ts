import logger from '../logger';
import { config } from '../config';
import axios from 'axios';

export interface AlertPayload {
  severity: 'info' | 'warning' | 'critical';
  title: string;
  message: string;
  context?: Record<string, any>;
  timestamp?: string;
}

export class AlertingService {
  private failureThresholds = {
    critical: config.ALERT_CRITICAL_THRESHOLD || 3,
    warning: config.ALERT_WARNING_THRESHOLD || 5,
  };

  /**
   * Send alert through all configured channels
   */
  async sendAlert(alert: AlertPayload): Promise<void> {
    if (!config.ALERT_ENABLED) {
      logger.debug({ msg: 'Alerting disabled, skipping alert' });
      return;
    }

    // Add timestamp if not present
    if (!alert.timestamp) {
      alert.timestamp = new Date().toISOString();
    }

    // Log alert for audit trail
    this.logAlert(alert);

    // Send through configured channels
    const promises: Promise<void>[] = [];

    if (config.ALERT_SLACK_ENABLED) {
      promises.push(this.sendSlackAlert(alert).catch((error) => {
        logger.error({ msg: 'Failed to send Slack alert', error });
      }));
    }

    if (config.ALERT_EMAIL_ENABLED) {
      promises.push(this.sendEmailAlert(alert).catch((error) => {
        logger.error({ msg: 'Failed to send email alert', error });
      }));
    }

    if (config.ALERT_PAGERDUTY_ENABLED && alert.severity === 'critical') {
      promises.push(this.sendPagerDutyAlert(alert).catch((error) => {
        logger.error({ msg: 'Failed to send PagerDuty alert', error });
      }));
    }

    // Wait for all alerts to complete
    await Promise.all(promises);
  }

  /**
   * Send critical-level alert
   */
  async sendCritical(title: string, message: string, context?: Record<string, any>): Promise<void> {
    await this.sendAlert({
      severity: 'critical',
      title,
      message,
      context,
    });
  }

  /**
   * Send warning-level alert
   */
  async sendWarning(title: string, message: string, context?: Record<string, any>): Promise<void> {
    await this.sendAlert({
      severity: 'warning',
      title,
      message,
      context,
    });
  }

  /**
   * Send info-level alert
   */
  async sendInfo(title: string, message: string, context?: Record<string, any>): Promise<void> {
    await this.sendAlert({
      severity: 'info',
      title,
      message,
      context,
    });
  }

  /**
   * Send alert via Slack webhook
   */
  private async sendSlackAlert(alert: AlertPayload): Promise<void> {
    if (!config.ALERT_SLACK_WEBHOOK_URL) {
      return;
    }

    const color = alert.severity === 'critical' ? 'danger' : alert.severity === 'warning' ? 'warning' : 'good';

    const payload = {
      channel: config.ALERT_SLACK_CHANNEL || '#alerts',
      attachments: [
        {
          fallback: `${alert.severity.toUpperCase()}: ${alert.title}`,
          color,
          title: alert.title,
          text: alert.message,
          fields: [
            {
              title: 'Severity',
              value: alert.severity.toUpperCase(),
              short: true,
            },
            {
              title: 'Timestamp',
              value: alert.timestamp || new Date().toISOString(),
              short: true,
            },
          ],
          mrkdwn_in: ['text', 'pretext'],
        },
      ],
    };

    // Add context fields if present
    if (alert.context && Object.keys(alert.context).length > 0) {
      const contextFields = Object.entries(alert.context).map(([key, value]) => ({
        title: key,
        value: typeof value === 'object' ? JSON.stringify(value) : String(value),
        short: true,
      }));
      payload.attachments[0].fields?.push(...contextFields);
    }

    try {
      await axios.post(config.ALERT_SLACK_WEBHOOK_URL, payload, {
        timeout: 10000,
      });
      logger.info({ msg: 'Slack alert sent', title: alert.title });
    } catch (error) {
      logger.error({ msg: 'Failed to send Slack alert', error });
      throw error;
    }
  }

  /**
   * Send alert via email (placeholder for SMTP configuration)
   */
  private async sendEmailAlert(alert: AlertPayload): Promise<void> {
    if (!config.ALERT_EMAIL_ENABLED) {
      return;
    }

    logger.warn({
      msg: 'Email alerting not yet implemented',
      alert_title: alert.title,
      alert_severity: alert.severity,
    });

    // TODO: Implement SMTP email sending
    // Use nodemailer or similar to send emails
  }

  /**
   * Send alert via PagerDuty (placeholder for PagerDuty API)
   */
  private async sendPagerDutyAlert(alert: AlertPayload): Promise<void> {
    if (!config.ALERT_PAGERDUTY_ENABLED || !config.ALERT_PAGERDUTY_INTEGRATION_KEY) {
      return;
    }

    logger.warn({
      msg: 'PagerDuty alerting not yet implemented',
      alert_title: alert.title,
      alert_severity: alert.severity,
    });

    // TODO: Implement PagerDuty Events API v2
    // Create incidents for critical alerts
  }

  /**
   * Log alert to database for audit trail
   */
  private logAlert(alert: AlertPayload): void {
    logger.warn({
      msg: 'Alert triggered',
      severity: alert.severity,
      title: alert.title,
      message: alert.message,
      context: alert.context,
      timestamp: alert.timestamp,
    });
  }
}

export const alertingService = new AlertingService();
