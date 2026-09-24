-- Wave 4: adds the transient 'creating' affiliate_status value, mirroring
-- migration 0008's addition of send_status 'blocked' as a small follow-on
-- rather than reworking 0011. Needed for the same interruption-safety
-- pattern used by outreach send execution (packages/domain/src/
-- outreachSend.ts): the row is marked 'creating' and committed BEFORE the
-- provider call, so a process crash mid-call is detectable on the next
-- invocation and resolved to 'unknown' rather than silently retried
-- (risking a real duplicate affiliate creation) or silently dropped.
alter type affiliate_status add value 'creating';
