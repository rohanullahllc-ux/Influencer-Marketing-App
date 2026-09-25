-- Mock AI provider (opt-in): lets a workspace exercise the full
-- AI-assisted workflow (product intelligence, matching, outreach drafts,
-- reply classification) with clearly-labeled placeholder output, with no
-- Anthropic key and no API cost. Explicit, human-set toggle only — never
-- implied by the mere absence of a credential, so the existing "no key
-- configured" error path is unchanged unless this is turned on.
alter table workspaces add column ai_mock_mode boolean not null default false;
