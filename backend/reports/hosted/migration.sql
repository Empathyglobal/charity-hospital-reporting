-- Additive only. Apply once through the coordinated publisher after approval.
-- No relationship or copy from owner workspaces, donor tables or patient tables.
CREATE TABLE IF NOT EXISTS hospital_shared_report_workspaces (
 workspace_id text PRIMARY KEY,
 state jsonb NOT NULL DEFAULT '{"entities":[],"revisions":[],"requests":[],"jobs":[]}'::jsonb,
 updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS hospital_report_sessions (
 workspace_id text NOT NULL, token_hash text NOT NULL, credential_version text NOT NULL,
 expires_at timestamptz NOT NULL, PRIMARY KEY(workspace_id,token_hash)
);
CREATE TABLE IF NOT EXISTS hospital_report_login_limits (
 workspace_id text NOT NULL, client_hash text NOT NULL, attempts integer NOT NULL DEFAULT 0,
 started_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(workspace_id,client_hash)
);
INSERT INTO hospital_shared_report_workspaces(workspace_id) VALUES('hospital-shared-reports-v1') ON CONFLICT DO NOTHING;
CREATE TABLE IF NOT EXISTS hospital_shared_report_originals (
 workspace_id text NOT NULL REFERENCES hospital_shared_report_workspaces(workspace_id),
 id text NOT NULL,
 metadata jsonb NOT NULL,
 original bytea NOT NULL,
 PRIMARY KEY(workspace_id,id)
);
CREATE TABLE IF NOT EXISTS hospital_report_details (
 workspace_id text NOT NULL REFERENCES hospital_shared_report_workspaces(workspace_id),
 id text NOT NULL, version integer NOT NULL, body jsonb NOT NULL,
 PRIMARY KEY(workspace_id,id,version)
);
CREATE TABLE IF NOT EXISTS hospital_report_uploads (
 workspace_id text NOT NULL REFERENCES hospital_shared_report_workspaces(workspace_id),
 id text NOT NULL, request_key text NOT NULL, metadata jsonb NOT NULL,
 status text NOT NULL, lease_until bigint NOT NULL DEFAULT 0,
 created_at bigint NOT NULL, updated_at bigint NOT NULL,
 PRIMARY KEY(workspace_id,id), UNIQUE(workspace_id,request_key)
);
CREATE INDEX IF NOT EXISTS hospital_report_upload_queue ON hospital_report_uploads(workspace_id,status,lease_until,updated_at);
CREATE TABLE IF NOT EXISTS hospital_report_chunks (
 workspace_id text NOT NULL, upload_id text NOT NULL, chunk_index integer NOT NULL,
 sha256 text NOT NULL, bytes bytea NOT NULL,
 PRIMARY KEY(workspace_id,upload_id,chunk_index),
 FOREIGN KEY(workspace_id,upload_id) REFERENCES hospital_report_uploads(workspace_id,id)
);
