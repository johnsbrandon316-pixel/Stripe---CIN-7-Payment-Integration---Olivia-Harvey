-- Create sale_payment_links table
CREATE TABLE IF NOT EXISTS sale_payment_links (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  cin7_sale_id INTEGER NOT NULL UNIQUE,
  cin7_reference TEXT NOT NULL,
  stripe_payment_link_id TEXT NOT NULL,
  stripe_payment_link_url TEXT NOT NULL,
  amount INTEGER NOT NULL,
  currency TEXT NOT NULL DEFAULT 'USD',
  status TEXT NOT NULL DEFAULT 'pending', -- pending, paid, failed, expired
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_sale_payment_links_cin7_sale_id 
  ON sale_payment_links(cin7_sale_id);

CREATE INDEX IF NOT EXISTS idx_sale_payment_links_stripe_payment_link_id 
  ON sale_payment_links(stripe_payment_link_id);

-- Create webhook_events table
CREATE TABLE IF NOT EXISTS webhook_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  event_id TEXT NOT NULL UNIQUE,
  event_type TEXT NOT NULL,
  stripe_payment_intent_id TEXT,
  stripe_charge_id TEXT,
  cin7_sale_id INTEGER,
  cin7_reference TEXT,
  amount INTEGER,
  currency TEXT,
  processed BOOLEAN NOT NULL DEFAULT 0,
  raw_event TEXT, -- JSON blob for debugging
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  processed_at DATETIME
);

CREATE INDEX IF NOT EXISTS idx_webhook_events_event_id 
  ON webhook_events(event_id);

CREATE INDEX IF NOT EXISTS idx_webhook_events_cin7_sale_id 
  ON webhook_events(cin7_sale_id);

CREATE INDEX IF NOT EXISTS idx_webhook_events_processed 
  ON webhook_events(processed);

-- Create payment_postings table
CREATE TABLE IF NOT EXISTS payment_postings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  cin7_sale_id INTEGER NOT NULL,
  stripe_payment_intent_id TEXT NOT NULL,
  stripe_charge_id TEXT,
  amount INTEGER NOT NULL,
  currency TEXT NOT NULL,
  posted_to_cin7 BOOLEAN NOT NULL DEFAULT 0,
  cin7_response TEXT, -- JSON response from Cin7 API
  posted_at DATETIME,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(cin7_sale_id, stripe_payment_intent_id)
);

CREATE INDEX IF NOT EXISTS idx_payment_postings_cin7_sale_id 
  ON payment_postings(cin7_sale_id);

CREATE INDEX IF NOT EXISTS idx_payment_postings_posted_to_cin7 
  ON payment_postings(posted_to_cin7);

-- Create idempotency_keys table
CREATE TABLE IF NOT EXISTS idempotency_keys (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  key TEXT NOT NULL UNIQUE,
  operation TEXT NOT NULL, -- e.g., 'create_payment_link', 'post_payment'
  response_data TEXT, -- JSON response
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  expires_at DATETIME NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_idempotency_keys_key 
  ON idempotency_keys(key);

CREATE INDEX IF NOT EXISTS idx_idempotency_keys_expires_at 
  ON idempotency_keys(expires_at);
