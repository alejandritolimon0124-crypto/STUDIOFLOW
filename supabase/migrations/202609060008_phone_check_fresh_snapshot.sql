-- Recheck committed registrations after waiting for the per-number lock.
alter function public.studio_flow_phone_in_use(text, text, uuid) volatile;
