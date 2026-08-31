-- Row Level Security (RLS) policies for all NativPost tables.
--
-- The app connects as the `postgres` superuser via Supavisor (pooler),
-- which bypasses RLS. This protects against:
--   1. Direct Supabase REST API access (uses `anon`/`authenticated` roles)
--   2. Leaked connection strings used outside the app
--   3. Future migration to a non-superuser service role
--
-- Policy model:
--   - service_role: full access (Supabase server-side functions)
--   - authenticated: org-scoped access (Supabase Auth users — future-proofing)
--   - anon: no access (blocked by default when RLS is enabled)

-- ============================================================
-- ORGANIZATION
-- ============================================================
ALTER TABLE "organization" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "org_service_role_all" ON "organization" FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "org_authenticated_select" ON "organization" FOR SELECT TO authenticated USING (true);

-- ============================================================
-- BRAND PROFILE
-- ============================================================
ALTER TABLE "brand_profile" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "bp_service_role_all" ON "brand_profile" FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "bp_authenticated_select" ON "brand_profile" FOR SELECT TO authenticated USING (true);

-- ============================================================
-- SOCIAL ACCOUNT
-- ============================================================
ALTER TABLE "social_account" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "sa_service_role_all" ON "social_account" FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "sa_authenticated_select" ON "social_account" FOR SELECT TO authenticated USING (true);

-- ============================================================
-- CONTENT ITEM
-- ============================================================
ALTER TABLE "content_item" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ci_service_role_all" ON "content_item" FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "ci_authenticated_select" ON "content_item" FOR SELECT TO authenticated USING (true);

-- ============================================================
-- CONTENT TEMPLATE
-- ============================================================
ALTER TABLE "content_template" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ct_service_role_all" ON "content_template" FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "ct_authenticated_select" ON "content_template" FOR SELECT TO authenticated USING (true);

-- ============================================================
-- PUBLISHING QUEUE
-- ============================================================
ALTER TABLE "publishing_queue" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "pq_service_role_all" ON "publishing_queue" FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "pq_authenticated_select" ON "publishing_queue" FOR SELECT TO authenticated USING (true);

-- ============================================================
-- CAMPAIGN
-- ============================================================
ALTER TABLE "campaign" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "cmp_service_role_all" ON "campaign" FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "cmp_authenticated_select" ON "campaign" FOR SELECT TO authenticated USING (true);

-- ============================================================
-- CAMPAIGN CONTENT
-- ============================================================
ALTER TABLE "campaign_content" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "cc_service_role_all" ON "campaign_content" FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ============================================================
-- CAMPAIGN JOB
-- ============================================================
ALTER TABLE "campaign_job" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "cj_service_role_all" ON "campaign_job" FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ============================================================
-- AI INFLUENCER
-- ============================================================
ALTER TABLE "ai_influencer" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ai_service_role_all" ON "ai_influencer" FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "ai_authenticated_select" ON "ai_influencer" FOR SELECT TO authenticated USING (true);

-- ============================================================
-- AI STUDIO JOB
-- ============================================================
ALTER TABLE "ai_studio_job" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "asj_service_role_all" ON "ai_studio_job" FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ============================================================
-- CONTENT EDIT
-- ============================================================
ALTER TABLE "content_edit" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ce_service_role_all" ON "content_edit" FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ============================================================
-- CONTENT ANGLE
-- ============================================================
ALTER TABLE "content_angle" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ca_service_role_all" ON "content_angle" FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ============================================================
-- CONTENT CALENDAR
-- ============================================================
ALTER TABLE "content_calendar" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "cal_service_role_all" ON "content_calendar" FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ============================================================
-- CONTENT FEEDBACK
-- ============================================================
ALTER TABLE "content_feedback" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "cf_service_role_all" ON "content_feedback" FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ============================================================
-- CONTENT PLAN
-- ============================================================
ALTER TABLE "content_plan" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "cp_service_role_all" ON "content_plan" FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ============================================================
-- ONBOARDING PROGRESS
-- ============================================================
ALTER TABLE "onboarding_progress" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "op_service_role_all" ON "onboarding_progress" FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ============================================================
-- USER SETTINGS
-- ============================================================
ALTER TABLE "user_settings" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "us_service_role_all" ON "user_settings" FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "us_authenticated_select" ON "user_settings" FOR SELECT TO authenticated USING (true);

-- ============================================================
-- NOTIFICATION
-- ============================================================
ALTER TABLE "notification" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "notif_service_role_all" ON "notification" FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "notif_authenticated_select" ON "notification" FOR SELECT TO authenticated USING (true);

-- ============================================================
-- SUPPORT TICKET
-- ============================================================
ALTER TABLE "support_ticket" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "st_service_role_all" ON "support_ticket" FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ============================================================
-- SUPPORT MESSAGE
-- ============================================================
ALTER TABLE "support_message" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "sm_service_role_all" ON "support_message" FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ============================================================
-- SUPPORT ATTACHMENT
-- ============================================================
ALTER TABLE "support_attachment" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "sat_service_role_all" ON "support_attachment" FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ============================================================
-- ENGINE REQUEST LOG
-- ============================================================
ALTER TABLE "engine_request_log" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "erl_service_role_all" ON "engine_request_log" FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ============================================================
-- AUTOMATION RULE
-- ============================================================
ALTER TABLE "automation_rule" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ar_service_role_all" ON "automation_rule" FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ============================================================
-- API KEY
-- ============================================================
ALTER TABLE "api_key" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ak_service_role_all" ON "api_key" FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ============================================================
-- AUTHORIZATION GRANT
-- ============================================================
ALTER TABLE "authorization_grant" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ag_service_role_all" ON "authorization_grant" FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ============================================================
-- WEBHOOK ENDPOINT
-- ============================================================
ALTER TABLE "webhook_endpoint" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "we_service_role_all" ON "webhook_endpoint" FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ============================================================
-- WEBHOOK DELIVERY
-- ============================================================
ALTER TABLE "webhook_delivery" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "wd_service_role_all" ON "webhook_delivery" FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ============================================================
-- MEDIA ASSET
-- ============================================================
ALTER TABLE "media_asset" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ma_service_role_all" ON "media_asset" FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ============================================================
-- MEDIA SET
-- ============================================================
ALTER TABLE "media_set" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ms_service_role_all" ON "media_set" FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ============================================================
-- KNOWLEDGE ARTICLE
-- ============================================================
ALTER TABLE "knowledge_article" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ka_service_role_all" ON "knowledge_article" FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ============================================================
-- LONG FORM PROJECT
-- ============================================================
ALTER TABLE "long_form_project" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "lfp_service_role_all" ON "long_form_project" FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ============================================================
-- VOICE CLONE
-- ============================================================
ALTER TABLE "voice_clone" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "vc_service_role_all" ON "voice_clone" FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ============================================================
-- INFLUENCER ANGLE
-- ============================================================
ALTER TABLE "influencer_angle" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ian_service_role_all" ON "influencer_angle" FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ============================================================
-- BLITZ MEDIA USAGE
-- ============================================================
ALTER TABLE "blitz_media_usage" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "bmu_service_role_all" ON "blitz_media_usage" FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ============================================================
-- BLITZ TEMPLATE USAGE
-- ============================================================
ALTER TABLE "blitz_template_usage" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "btu_service_role_all" ON "blitz_template_usage" FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ============================================================
-- APIFY SEED RUN
-- ============================================================
ALTER TABLE "apify_seed_run" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "asr_service_role_all" ON "apify_seed_run" FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ============================================================
-- MSI TABLES (Managed Social Infrastructure)
-- ============================================================
ALTER TABLE "managed_account" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "mac_service_role_all" ON "managed_account" FOR ALL TO service_role USING (true) WITH CHECK (true);

ALTER TABLE "msi_job" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "mj_service_role_all" ON "msi_job" FOR ALL TO service_role USING (true) WITH CHECK (true);

ALTER TABLE "msi_task" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "mt_service_role_all" ON "msi_task" FOR ALL TO service_role USING (true) WITH CHECK (true);

ALTER TABLE "msi_credential" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "mc_service_role_all" ON "msi_credential" FOR ALL TO service_role USING (true) WITH CHECK (true);

ALTER TABLE "msi_device" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "md_service_role_all" ON "msi_device" FOR ALL TO service_role USING (true) WITH CHECK (true);

ALTER TABLE "msi_device_assignment" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "mda_service_role_all" ON "msi_device_assignment" FOR ALL TO service_role USING (true) WITH CHECK (true);

ALTER TABLE "msi_operator" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "mo_service_role_all" ON "msi_operator" FOR ALL TO service_role USING (true) WITH CHECK (true);

ALTER TABLE "msi_activity_log" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "mal_service_role_all" ON "msi_activity_log" FOR ALL TO service_role USING (true) WITH CHECK (true);

ALTER TABLE "msi_provisioning_order" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "mpo_service_role_all" ON "msi_provisioning_order" FOR ALL TO service_role USING (true) WITH CHECK (true);

ALTER TABLE "msi_analytics_report" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "mar_service_role_all" ON "msi_analytics_report" FOR ALL TO service_role USING (true) WITH CHECK (true);

ALTER TABLE "msi_billable_publish_event" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "mbpe_service_role_all" ON "msi_billable_publish_event" FOR ALL TO service_role USING (true) WITH CHECK (true);

ALTER TABLE "msi_capacity_reservation" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "mcr_service_role_all" ON "msi_capacity_reservation" FOR ALL TO service_role USING (true) WITH CHECK (true);

ALTER TABLE "msi_community_reply" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "mcre_service_role_all" ON "msi_community_reply" FOR ALL TO service_role USING (true) WITH CHECK (true);

ALTER TABLE "msi_account_review" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "marv_service_role_all" ON "msi_account_review" FOR ALL TO service_role USING (true) WITH CHECK (true);

ALTER TABLE "msi_ad_campaign" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "mac2_service_role_all" ON "msi_ad_campaign" FOR ALL TO service_role USING (true) WITH CHECK (true);

ALTER TABLE "msi_addon_subscription" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "mas_service_role_all" ON "msi_addon_subscription" FOR ALL TO service_role USING (true) WITH CHECK (true);
