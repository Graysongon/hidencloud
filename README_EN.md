# HidenCloud Auto Renewal Script

🇨🇳 [简体中文](./README.md) | 🇬🇧 English

## 📖 Introduction

An automated renewal script for HidenCloud services, supporting three deployment methods: local execution, GitHub Actions cloud automation, and Qinglong Panel. It automatically handles renewal and payment processes with intelligent Cookie cache management.

## ✨ Key Features

- ☁️ **Multiple Deployment Options**: Local / GitHub Actions / Qinglong Panel
- 🔄 **Cookie Auto-Persistence**: Automatically updates and caches the latest cookies
- 👥 **Multi-Account Support**: Handle up to 10 accounts simultaneously
- 💳 **Auto Payment**: Automatically completes payment after renewal
- 📊 **Detailed Logging**: Real-time progress and result output
- 🛡️ **Smart Retry**: Auto fallback retry when cookies expire
- 🔐 **Secure & Reliable**: GitHub Actions automatically updates repository variables

## 🚀 Deployment Methods

### Method 1: Local Execution (Recommended for Beginners)

**Prerequisites:**
- Node.js (v14 or higher recommended)
- npm packages: run `npm install`

**Quick Start:**

See [Quick Start Guide](./start.md)

### Method 2: GitHub Actions (Recommended)

Fully automated in the cloud, no local environment needed, automatic Cookie updates.

**Configuration Steps:**

1. **Fork this repository** to your GitHub account

39: 2. **Set Repository Secret**
40:    - Go to your forked repository → Settings → Secrets and variables → Actions
41:    - Click New repository secret
42:    - Name: `USERS_JSON`
43:    - Secret: Paste your account configuration JSON (format below)
44:      ```json
45:      [
46:        {"username": "user1@example.com", "password": "password123"},
47:        {"username": "user2@example.com", "password": "password456"}
48:      ]
49:      ```
50: 
51: 3. **Enable GitHub Actions**
52:    - Go to Actions tab
53:    - If prompted, click "I understand my workflows, go ahead and enable them"
54: 
55: 4. **Manual Test Run**
56:    - Actions → Katabump Auto Renew New → Run workflow
57:    - Check run logs to confirm success

**Workflow Details:**
- Auto-run: Triggers every 3 days automatically
- Manual trigger: Can be run anytime from Actions page
- Cookie auto-update: Automatically updates repository variables after execution

### Method 3: Qinglong Panel

Suitable for users who already have Qinglong Panel.

**Usage:**

1. Copy `qinglong.js` to Qinglong Panel
2. Set environment variable `HIDEN_COOKIE`, separate multiple accounts with `&` or newline
3. Cron schedule: `0 10 */7 * *` (runs every 7 days)

See comments in file for details.

## 🍪 How to Get Cookies

### Method 1: Browser DevTools

1. Login to [HidenCloud Dashboard](https://dash.hidencloud.com)
2. Press `F12` to open DevTools
3. Switch to `Network` tab
4. Refresh the page
5. Click any request, view `Request Headers`
6. Copy the complete `Cookie` field content

### Method 2: Browser Extension

Use cookie export extensions like EditThisCookie or Cookie-Editor.

### Method 3: Windows Auto Retrieval (Recommended)

If you are running locally on Windows, you can use the provided auto-login script to generate cookies.

1. **Prepare Account File**: Create `users.json` in the project root directory:
   ```json
   [
     {"username": "your_email", "password": "your_password"},
     {"username": "second_user", "password": "password"}
   ]
   ```
2. **Run Login Script**:
   ```bash
   node win_login.js
   ```
   The script will launch Chrome, login, solve verification, and save cookies to `cookie.json`.
3. **Done**: Once `cookie.json` is generated, proceed to run the renewal script.

## ⚙️ Configuration

Script parameters (at the top of `local_renew.js`):

```javascript
const RENEW_DAYS = 10;  // Renewal days, default 10
const COOKIE_FILE = path.join(__dirname, 'cookie.json');  // Cookie file path
const CACHE_FILE = path.join(__dirname, 'hiden_cookies_cache.json');  // Cache file path
```

## 📁 File Structure

### Main Files
- `local_renew.js` - Local/Cloud universal script (dual-mode support)
- `qinglong.js` - Qinglong Panel specific script
- `update_vars.js` - GitHub repository variables update tool
- `.github/workflows/renew.yml` - GitHub Actions workflow configuration

### Configuration Files
- `cookie.json` - Local mode cookie configuration file
- `hiden_cookies_cache.json` - Cookie cache file (auto-generated)
- `package.json` - Node.js dependencies

### Documentation
- `README.md` - Chinese documentation
- `README_EN.md` - English documentation (this file)
- `start.md` / `start.bat` - Quick start guide

## 🔧 Workflow

1. Read Cookie configuration from `cookie.json` or environment variables
2. Use cached latest cookies if available
3. Verify login status
4. Get all services under the account
5. Process each service:
   - Submit renewal request
   - Auto-complete payment
6. Update Cookie cache
7. Output summary results

## 📊 Example Output

```
╔════════════════════════════════════════════╗
║   HidenCloud Auto Renewal Script v3.0    ║
╚════════════════════════════════════════════╝

☁️  Detected environment variables, using cloud mode

📋 Found 2 accounts (cloud mode)

==================================================
Processing: cookie1 (1/2)
==================================================
[cookie1] 🔄 Found local cache Cookie, using...
[cookie1] 🔍 Verifying login status...
[cookie1] ✅ Login successful, found 3 services
[cookie1] >>> Processing service ID: 12345
[cookie1] 📅 Submitting renewal (10 days)...
[cookie1] ⚡️ Renewal successful, proceeding to payment
[cookie1] 💳 Submitting payment...
[cookie1] ✅ Payment successful!
💾 [cookie1] Latest Cookie saved to cache

╔════════════════════════════════════════════╗
║           Renewal Results Summary          ║
╚════════════════════════════════════════════╝

📊 cookie1:
   ✅ Successfully renewed 3 services
📊 cookie2:
   ✅ Successfully renewed 2 services

✨ Script execution completed!
```

## ⚠️ Important Notes

1. **Cookie Security**: Keep `cookie.json` file secure, don't share with others
2. **Regular Updates**: Cookies may expire, update promptly when invalid
3. **Run Frequency**: Recommended to set scheduled task to run every 7 days (every 3 days for Cloud mode recommended)
4. **Network**: Ensure network can access hidencloud.com
5. **Private Repo**: Use private repository for GitHub Actions to enhance security

## 🆚 Deployment Comparison

| Feature | Local | GitHub Actions | Qinglong Panel |
|---------|-------|---------------|----------------|
| Environment | Local Node.js | GitHub Cloud | Qinglong Container |
| Cookie Source | cookie.json | Repo Variables | Env Variables |
| Auto Schedule | Manual setup | ✅ Built-in | ✅ Built-in |
| Cookie Auto-Update | ✅ Local cache | ✅ Auto push to repo | ✅ Local cache |
| Notifications | ❌ | ❌ | ✅ |
| Multi-Account | ✅ | ✅ | ✅ |
| Free to Use | ✅ | ✅ | Self-hosted |
| Recommendation | ⭐⭐⭐ | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐ |


## 🐛 Troubleshooting

### Cookie Expired

**Symptom**: Shows "Current Cookie has expired"

**Solution**:
1. Re-login to HidenCloud
2. Get latest Cookie
3. Update `cookie.json` or repository variables

### Dependency Installation Failed

**Symptom**: `npm install` errors

**Solution**:
```bash
# Clear cache
npm cache clean --force

# Reinstall
npm install axios cheerio
```

### Network Timeout

**Symptom**: Request timeout or connection failed

**Solution**:
1. Check network connection
2. Try using a proxy
3. Increase `timeout` value in script

### GitHub Actions Failures

**Symptom**: Workflow fails to run

**Solution**:
1. Check if `ACTION_VARS_TOKEN` is set correctly
2. Verify Token has Variables (Read and write) permission
3. Ensure repository variables are configured
4. Check Actions logs for detailed error messages

## 📜 License

MIT License

## 🙏 Acknowledgments

Thanks to HidenCloud for their services!

Special thanks to [gally16](https://linux.do/u/gally16) for the original Qinglong script! This project optimized it and added GitHub Actions deployment and Windows local support.
