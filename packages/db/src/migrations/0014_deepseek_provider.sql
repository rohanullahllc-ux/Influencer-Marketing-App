-- Replaces Anthropic with DeepSeek as the AI provider for packages/ai's
-- operations (product intelligence, matching, outreach drafts, reply
-- classification, conversation summaries). Renaming the enum value (rather
-- than adding a new one and leaving 'anthropic' dangling) transparently
-- updates any existing stored credential rows to the new label.
alter type credential_provider rename value 'anthropic' to 'deepseek';
