CREATE TABLE account_operations (token TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id), workspace_id TEXT REFERENCES workspaces(id), started_at TEXT NOT NULL);
CREATE TRIGGER account_operation_guard BEFORE INSERT ON account_operations BEGIN
 SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM users WHERE id=NEW.user_id) OR EXISTS(SELECT 1 FROM account_deletions WHERE user_id=NEW.user_id) OR EXISTS(SELECT 1 FROM deletion_workspaces WHERE workspace_id=NEW.workspace_id) THEN RAISE(ABORT,'Account deletion in progress') END;
 SELECT CASE WHEN (SELECT count(*) FROM account_operations WHERE user_id=NEW.user_id)>=32 THEN RAISE(ABORT,'Account operation limit reached') END;
END;
CREATE TABLE account_deletions (user_id TEXT PRIMARY KEY REFERENCES users(id));
CREATE TABLE deletion_workspaces (workspace_id TEXT PRIMARY KEY REFERENCES workspaces(id) ON DELETE CASCADE, user_id TEXT NOT NULL REFERENCES account_deletions(user_id));
CREATE TRIGGER account_deletion_guard BEFORE INSERT ON account_deletions BEGIN
 SELECT CASE WHEN EXISTS(SELECT 1 FROM account_operations WHERE user_id=NEW.user_id OR workspace_id IN (SELECT workspace_id FROM memberships WHERE user_id=NEW.user_id AND role='owner')) THEN RAISE(ABORT,'An account operation is still active. Wait for it to finish, then retry deletion.') END;
 SELECT CASE WHEN EXISTS(SELECT 1 FROM memberships owner JOIN memberships other ON other.workspace_id=owner.workspace_id AND other.user_id!=owner.user_id WHERE owner.user_id=NEW.user_id AND owner.role='owner') THEN RAISE(ABORT,'Transfer ownership of shared workspaces before deleting your account.') END;
 SELECT CASE WHEN EXISTS(SELECT 1 FROM posts p JOIN memberships m ON m.workspace_id=p.workspace_id WHERE m.user_id=NEW.user_id AND m.role='owner' AND p.state='pending' AND p.dispatch_status='dispatching') THEN RAISE(ABORT,'Publication must finish before account deletion.') END;
END;
CREATE TRIGGER deletion_membership_insert BEFORE INSERT ON memberships WHEN EXISTS(SELECT 1 FROM account_deletions WHERE user_id=NEW.user_id) OR EXISTS(SELECT 1 FROM deletion_workspaces WHERE workspace_id=NEW.workspace_id) BEGIN SELECT RAISE(ABORT,'Account deletion in progress'); END;
CREATE TRIGGER deletion_membership_update BEFORE UPDATE ON memberships WHEN EXISTS(SELECT 1 FROM deletion_workspaces WHERE workspace_id=OLD.workspace_id) BEGIN SELECT RAISE(ABORT,'Account deletion in progress'); END;
CREATE TRIGGER deletion_post_claim BEFORE UPDATE ON posts WHEN NEW.dispatch_status='dispatching' AND EXISTS(SELECT 1 FROM deletion_workspaces WHERE workspace_id=NEW.workspace_id) BEGIN SELECT RAISE(ABORT,'Account deletion in progress'); END;
ALTER TABLE social_workflows ADD COLUMN tenant_id TEXT;
ALTER TABLE social_workflows ADD COLUMN principal_id TEXT;
ALTER TABLE social_idempotency ADD COLUMN tenant_id TEXT;
ALTER TABLE social_idempotency ADD COLUMN principal_id TEXT;
