-- Wave 3: persists whether a human explicitly overrode the cross-campaign
-- contact safeguard when scheduling this send, so the real execution-time
-- gate (which may run long after scheduling) knows whether to honor an
-- override that was already decided and logged at schedule time, rather
-- than re-deciding a policy question with no human present.
alter table outreach_sends add column cross_campaign_override boolean not null default false;
