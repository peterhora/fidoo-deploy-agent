---
name: deploy
description: >
  Deploy, manage, and delete static HTML/JS apps on Azure.
  Triggers: "deploy my app", "publish my app", "deploy this to Azure",
  "re-deploy", "update my app", "delete my app", "remove my app",
  "list my apps", "show my apps", "app info", "app status",
  "rebuild dashboard", "fix dashboard".
  Handles authentication, first deploys, re-deploys, and app management
  via 9 MCP tools backed by Azure Static Web Apps.
---

# Deploy Skill

You are orchestrating deployments of static HTML/JS apps to Azure Static Web Apps.
Apps get custom domains under `*.env.fidoo.cloud` and Entra ID authentication.

## Step 1: Check Authentication

Before any operation, check if the user is authenticated:

1. Call `auth_status` (no arguments)
2. If `status` is `"authenticated"` — proceed to the requested operation
3. If `status` is `"not_authenticated"` or `"expired"` — run the login flow:
   a. Call `auth_login` — returns `verification_uri` and `user_code`
   b. Tell the user: **"Open {verification_uri} and enter code {user_code}"**
   c. Wait for the user to confirm they completed the login
   d. Call `auth_poll` with the `device_code` from step (a)
   e. Verify the response shows `status: "authenticated"`

## Step 2: Determine the Operation

Based on the user's request:

| User intent | Operation |
|---|---|
| "deploy", "publish", "put online" | **Deploy** (see Step 3) |
| "delete", "remove", "take down" | **Delete** (see Step 4) |
| "list", "show apps", "what's deployed" | **List** (see Step 5) |
| "info", "status", "details" about a specific app | **Info** (see Step 6) |
| "rename", "update description", "change name" | **Update info** (see Step 7) |
| "rebuild dashboard", "fix dashboard" | **Dashboard rebuild** (see Step 8) |

## Step 3: Deploy

### Detect first deploy vs re-deploy

Check if the target folder contains a `.deploy.json` file.

- **Has `.deploy.json`** → This is a **re-deploy**. The tool reads it automatically.
- **No `.deploy.json`** → This is a **first deploy**. You need `app_name` and `app_description`.

### First deploy

1. Ask the user for an **app name** (human-readable, e.g. "Budget Tracker") and a **short description** if they haven't provided them
2. Call `app_deploy` with:
   - `folder`: absolute path to the app folder
   - `app_name`: the display name
   - `app_description`: short description for the dashboard
3. The tool handles everything: slug generation, collision check, SWA creation, ZIP upload, DNS, auth config, `.deploy.json`, and dashboard rebuild
4. Report the URL: `https://{slug}.env.fidoo.cloud`

### Re-deploy

1. Call `app_deploy` with just `folder` (the absolute path)
2. The tool reads `.deploy.json` and re-deploys automatically
3. Report the updated URL

### Error handling

- **"Not authenticated"** → Run the login flow (Step 1)
- **"slug already exists"** → Ask the user to choose a different app name
- **"Folder does not exist"** → Verify the path with the user

## Step 4: Delete an App

1. Ask the user which app to delete (by slug). If unsure, list apps first (Step 5)
2. Confirm with the user: "Are you sure you want to delete **{app_name}** ({slug})? This cannot be undone."
3. Call `app_delete` with `app_slug`
4. The tool removes the SWA, DNS record, and rebuilds the dashboard

The dashboard app (`apps` slug) cannot be deleted.

## Step 5: List Apps

1. Call `app_list` (no arguments)
2. Present the results as a readable list with name, slug, URL, and last deploy time
3. If no apps exist, tell the user

## Step 6: App Info

1. Call `app_info` with `app_slug`
2. Present: name, description, URL, status, last deploy time
3. If not found, suggest listing apps to find the correct slug

## Step 7: Update App Info

1. Call `app_update_info` with `app_slug` and the fields to change (`app_name` and/or `app_description`)
2. This updates the dashboard display only — it does NOT re-deploy the app code

## Step 8: Dashboard Rebuild

1. Call `dashboard_rebuild` (no arguments)
2. This regenerates the dashboard at `https://apps.env.fidoo.cloud` from current Azure state
3. Use this if the dashboard is out of sync

## Important Notes

- All apps are protected by Entra ID — only users with the `app_subscriber` role can access them
- The deploy tool automatically excludes sensitive files (.env, .git, node_modules, .pem, .key, etc.)
- App slugs are generated from the app name (lowercase, alphanumeric + hyphens, max 60 chars)
- Each app gets a custom domain: `{slug}.env.fidoo.cloud`
- The dashboard at `apps.env.fidoo.cloud` is auto-rebuilt after every deploy, delete, or info update
