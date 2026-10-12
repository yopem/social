PRAGMA foreign_keys = ON;

CREATE TABLE users (
  id TEXT PRIMARY KEY,
  issuer TEXT NOT NULL,
  subject_id TEXT NOT NULL,
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  initial_workspace_id TEXT NOT NULL,
  UNIQUE (issuer, subject_id)
);

CREATE TABLE workspaces (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('personal', 'organization')),
  timezone TEXT NOT NULL
);

CREATE TABLE memberships (
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id),
  role TEXT NOT NULL CHECK (role IN ('owner', 'admin', 'editor')),
  PRIMARY KEY (workspace_id, user_id)
);
CREATE UNIQUE INDEX workspace_owner ON memberships(workspace_id)
  WHERE role = 'owner';

CREATE TABLE invites (
  token_hash TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('admin', 'editor')),
  expires_at TEXT NOT NULL,
  consumed_by TEXT REFERENCES users(id),
  claim_key TEXT
);

CREATE TABLE channels (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  data TEXT NOT NULL CHECK (json_valid(data))
);

CREATE TABLE media (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  object_key TEXT NOT NULL UNIQUE,
  data TEXT NOT NULL CHECK (json_valid(data))
);

CREATE TABLE posts (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  content TEXT NOT NULL CHECK (json_valid(content)),
  state TEXT NOT NULL CHECK (state IN (
    'draft', 'scheduled', 'pending', 'published', 'partial', 'failed',
    'needs-review', 'cancelled'
  )),
  scheduled_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  review_reason TEXT,
  operation_key TEXT,
  lease_until TEXT,
  dispatch_status TEXT CHECK (dispatch_status IN (
    'leased', 'enqueued', 'dispatching'
  ))
);
CREATE INDEX posts_due ON posts(state, scheduled_at);
CREATE INDEX posts_lease ON posts(dispatch_status, lease_until);

CREATE TABLE deliveries (
  id TEXT PRIMARY KEY,
  post_id TEXT NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  channel_id TEXT NOT NULL REFERENCES channels(id),
  data TEXT NOT NULL CHECK (json_valid(data)),
  UNIQUE (post_id, channel_id)
);

CREATE TABLE feeds (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  data TEXT NOT NULL CHECK (json_valid(data)),
  last_checked_at TEXT
);
CREATE INDEX feeds_checked ON feeds(last_checked_at);

CREATE TABLE feed_items (
  feed_id TEXT NOT NULL REFERENCES feeds(id) ON DELETE CASCADE,
  item_key TEXT NOT NULL,
  claimed_at TEXT NOT NULL,
  post_id TEXT REFERENCES posts(id) ON DELETE SET NULL,
  PRIMARY KEY (feed_id, item_key)
);

CREATE TABLE auth_attempts (
  state TEXT PRIMARY KEY,
  nonce_hash TEXT NOT NULL,
  verifier TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  consumed_at TEXT
);
CREATE INDEX auth_attempts_expiry ON auth_attempts(expires_at);
