const crypto = require('crypto');
const axios = require('axios');

class WebhookService {
  constructor(options = {}) {
    this.retryAttempts = options.retryAttempts || 3;
    this.retryDelay = options.retryDelay || 1000;
    this.timeout = options.timeout || 10000;
    this.secret = options.secret || process.env.WEBHOOK_SECRET;
    this.queue = options.queue;
  }

  generateSignature(payload, secret = this.secret) {
    return crypto
      .createHmac('sha256', secret)
      .update(JSON.stringify(payload))
      .digest('hex');
  }

  async deliverWebhook(webhook) {
    const { url, payload, headers = {}, secret } = webhook;
    
    const signature = this.generateSignature(payload, secret);
    const timestamp = Date.now();
    
    const requestConfig = {
      method: 'POST',
      url,
      data: payload,
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'MyApp-Webhook/1.0',
        'X-Webhook-Signature': `sha256=${signature}`,
        'X-Webhook-Timestamp': timestamp.toString(),
        'X-Webhook-ID': webhook.id || this.generateWebhookId(),
        ...headers
      },
      timeout: this.timeout
    };

    let lastError;
    
    for (let attempt = 0; attempt < this.retryAttempts; attempt++) {
      try {
        const startTime = Date.now();
        const response = await axios(requestConfig);
        const duration = Date.now() - startTime;
        
        await this.logWebhookDelivery({
          webhookId: webhook.id,
          url,
          attempt: attempt + 1,
          status: response.status,
          duration,
          success: true
        });
        
        return {
          success: true,
          status: response.status,
          attempt: attempt + 1,
          duration
        };
        
      } catch (error) {
        lastError = error;
        const duration = Date.now() - startTime;
        
        await this.logWebhookDelivery({
          webhookId: webhook.id,
          url,
          attempt: attempt + 1,
          status: error.response?.status || 0,
          duration,
          success: false,
          error: error.message
        });
        
        if (error.response?.status >= 400 && error.response?.status < 500) {
          break;
        }
        
        if (attempt < this.retryAttempts - 1) {
          await this.sleep(this.retryDelay * Math.pow(2, attempt));
        }
      }
    }
    
    return {
      success: false,
      error: lastError.message,
      attempt: this.retryAttempts,
      status: lastError.response?.status || 0
    };
  }

  async deliverWebhookWithQueue(webhook) {
    if (!this.queue) {
      return this.deliverWebhook(webhook);
    }
    
    return this.queue.add('deliver-webhook', webhook, {
      attempts: this.retryAttempts,
      backoff: {
        type: 'exponential',
        settings: {
          delay: this.retryDelay
        }
      }
    });
  }

  generateWebhookId() {
    return crypto.randomUUID();
  }

  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  async logWebhookDelivery(logData) {
    console.log('Webhook delivery log:', logData);
  }
}

const express = require('express');
const router = express.Router();
const webhookService = new WebhookService();

const webhookSchema = `
  CREATE TABLE webhooks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL,
    url VARCHAR(255) NOT NULL,
    events TEXT[] NOT NULL,
    secret VARCHAR(255),
    active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
  );
  
  CREATE TABLE webhook_deliveries (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    webhook_id UUID REFERENCES webhooks(id),
    event_type VARCHAR(100),
    payload JSONB,
