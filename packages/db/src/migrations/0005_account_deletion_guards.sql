-- New Drizzle Kit custom migration. Do not change 0003.
DROP TRIGGER account_operation_guard;
CREATE TRIGGER account_operation_guard BEFORE INSERT ON account_operations BEGIN
 SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM users WHERE id=NEW.user_id)
 OR EXISTS(SELECT 1 FROM account_deletions WHERE user_id=NEW.user_id)
 OR EXISTS(SELECT 1 FROM deletion_workspaces WHERE workspace_id=NEW.workspace_id)
 OR EXISTS(SELECT 1 FROM social_grants g JOIN account_deletions d ON d.user_id=g.principal_id WHERE g.tenant_id=NEW.workspace_id)
 THEN RAISE(ABORT,'Account deletion in progress') END;
 SELECT CASE WHEN (SELECT count(*) FROM account_operations WHERE user_id=NEW.user_id)>=32 THEN RAISE(ABORT,'Account operation limit reached') END;
END;
DROP TRIGGER account_deletion_guard;
CREATE TRIGGER account_deletion_guard BEFORE INSERT ON account_deletions BEGIN
 SELECT CASE WHEN EXISTS(SELECT 1 FROM account_operations WHERE user_id=NEW.user_id
 OR workspace_id IN (SELECT workspace_id FROM memberships WHERE user_id=NEW.user_id AND role='owner')
 OR workspace_id IN (SELECT tenant_id FROM social_grants WHERE principal_id=NEW.user_id))
 THEN RAISE(ABORT,'An account operation is still active. Wait for it to finish, then retry deletion.') END;
 SELECT CASE WHEN EXISTS(SELECT 1 FROM memberships owner JOIN memberships other ON other.workspace_id=owner.workspace_id AND other.user_id!=owner.user_id WHERE owner.user_id=NEW.user_id AND owner.role='owner') THEN RAISE(ABORT,'Transfer ownership of shared workspaces before deleting your account.') END;
 SELECT CASE WHEN EXISTS(
 SELECT 1 FROM posts p WHERE p.dispatch_status='dispatching'
 AND (p.workspace_id IN (SELECT workspace_id FROM memberships WHERE user_id=NEW.user_id AND role='owner')
 OR EXISTS(SELECT 1 FROM channels c JOIN social_grants g ON g.tenant_id=c.workspace_id
 AND g.backend=json_extract(c.data,'$.backend') AND g.platform=json_extract(c.data,'$.platform') AND g.account_id=json_extract(c.data,'$.accountId')
 WHERE c.workspace_id=p.workspace_id AND g.principal_id=NEW.user_id
 AND EXISTS(SELECT 1 FROM json_each(p.content,'$.channelIds') target WHERE target.value=c.id))))
 THEN RAISE(ABORT,'Publication must finish before account deletion.') END;
 SELECT CASE WHEN EXISTS(
 SELECT 1 FROM deliveries d JOIN posts p ON p.id=d.post_id
 JOIN channels c ON c.id=d.channel_id AND c.workspace_id=p.workspace_id
 WHERE (p.workspace_id IN (SELECT workspace_id FROM memberships WHERE user_id=NEW.user_id AND role='owner')
 OR EXISTS(SELECT 1 FROM social_grants g WHERE g.principal_id=NEW.user_id AND g.tenant_id=p.workspace_id
 AND g.platform=json_extract(c.data,'$.platform') AND g.backend=json_extract(c.data,'$.backend') AND g.account_id=json_extract(c.data,'$.accountId')))
 AND (json_extract(d.data,'$.state') IN ('accepted','processing','unknown')
 OR (json_extract(d.data,'$.state')='scheduled' AND json_extract(d.data,'$.providerPostId') IS NOT NULL)))
 THEN RAISE(ABORT,'Publication must finish before account deletion.') END;
 SELECT CASE WHEN EXISTS(SELECT 1 FROM social_workflows w WHERE w.tenant_id IS NULL
 AND EXISTS(SELECT 1 FROM social_grants g WHERE (g.principal_id=NEW.user_id OR g.tenant_id IN (SELECT workspace_id FROM memberships WHERE user_id=NEW.user_id AND role='owner')) AND g.backend=json_extract(w.data,'$.backend') AND g.account_id=json_extract(w.data,'$.accountId'))
 AND EXISTS(SELECT 1 FROM social_grants survivor WHERE survivor.principal_id!=NEW.user_id AND survivor.tenant_id NOT IN (SELECT workspace_id FROM memberships WHERE user_id=NEW.user_id AND role='owner') AND survivor.backend=json_extract(w.data,'$.backend') AND survivor.account_id=json_extract(w.data,'$.accountId')))
 OR EXISTS(SELECT 1 FROM social_idempotency WHERE tenant_id IS NULL AND (principal_id IS NULL OR principal_id=NEW.user_id) AND json_valid(scope) AND json_extract(scope,'$[0]')='credential-ready')
 THEN RAISE(ABORT,'Legacy provider work has no workspace owner. Resolve its ownership before deleting your account.') END;
END;
