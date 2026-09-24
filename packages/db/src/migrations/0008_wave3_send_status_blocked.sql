-- Wave 3: adds `blocked` to send_status. Distinct from `unknown` on
-- purpose: `unknown` means the provider's own result was uncertain
-- (timeout/ambiguous external state); `blocked` means the deterministic
-- safety gate decided this send may not go out at all -- the provider was
-- never even called. Conflating the two would hide exactly the
-- distinction the product vision's failure philosophy cares about ("an
-- uncertain send" vs. "a send we deliberately refused to attempt").
alter type send_status add value 'blocked';
