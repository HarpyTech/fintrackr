# Secret Management Guide

This guide explains how to manage secrets and credentials for the FinTrackr application using various credential managers instead of storing them in `.env` files.

## Overview

The application supports loading secrets from multiple sources in this priority order:

1. **`.env` file** (development)
2. **System credential managers** (recommended for local development)
3. **Environment variables** (CI/CD, containers)
4. **Docker secrets** (production with Docker Swarm)
5. **Default values** (fallback only)

## Quick Start

### Option 1: Use .env file (Development)

```bash
# Copy the example file
cp .env.example .env

# Edit with your values
nano .env
```

### Option 2: Use Credential Manager (Recommended)

#### Windows (PowerShell)

```powershell
# Install credential manager module
Install-Module -Name CredentialManager -Force

# Store secrets
New-StoredCredential -Target 'MyFinanceApp-SecretKey' -UserName 'app' -Password 'your-secret-key-here' -Persist LocalMachine

# Load secrets and start application
. .\load-secrets.ps1
docker-compose up
```

#### macOS (Keychain)

```bash
# Store secrets in macOS Keychain
security add-generic-password -s 'MyFinanceApp' -a 'SecretKey' -w 'your-secret-key-here'

# Load secrets and start application
source ./load-secrets.sh
docker-compose up
```

#### Linux (secret-tool)

```bash
# Install secret-tool (part of libsecret)
sudo apt-get install libsecret-tools  # Debian/Ubuntu
# sudo dnf install libsecret            # Fedora
# sudo pacman -S libsecret              # Arch

# Store secrets
secret-tool store --label='MyFinanceApp Secret Key' service MyFinanceApp account SecretKey
# Enter your secret when prompted

# Load secrets and start application
source ./load-secrets.sh
docker-compose up
```

### Option 3: Use Environment Variables

```bash
# Set environment variables directly
export SECRET_KEY="your-secret-key-here"
export PROJECT_NAME="FinTrackr"
export MONGODB_URI="mongodb://localhost:27017"

# Start application
docker-compose up
```

### Option 4: Docker Secrets (Production)

For production deployments with Docker Swarm:

```bash
# Create secrets
echo "your-secret-key" | docker secret create secret_key -

# Uncomment the secrets section in docker-compose.yml
# Then deploy with:
docker stack deploy -c docker-compose.yml my-finance
```

## Docker Compose Configuration

The `docker-compose.yml` file is configured to:

1. Attempt to load from `.env` file (silently ignores if missing)
2. Use environment variables with fallback defaults using `${VAR:-default}` syntax
3. Support Docker secrets for production deployments

Example environment variable with fallback:
```yaml
- SECRET_KEY=${SECRET_KEY:-your-super-secret-key-change-in-prod}
```

## Security Best Practices

### Development
- ✅ Use credential managers (Windows Credential Manager, macOS Keychain, Linux Secret Service)
- ✅ Use `.env` file with proper `.gitignore` (already configured)
- ❌ Never commit `.env` to version control

### CI/CD
- ✅ Use GitHub secrets only for deployment-scoped values such as cloud credentials, project IDs, regions, and service names
- ✅ Store application runtime values in a managed secret store such as Google Secret Manager
- ✅ Bind secrets directly to the runtime platform during deploy instead of writing them into generated env files
- ❌ Never log secret values

### Production
- ✅ Use Docker Secrets (Docker Swarm)
- ✅ Use Kubernetes Secrets (Kubernetes)
- ✅ Use cloud provider secret managers (Azure Key Vault, AWS Secrets Manager, Google Secret Manager)
- ✅ Rotate secrets regularly
- ❌ Never use default values in production

## Google Cloud Run + Secret Manager

For GitHub Actions deployments to Cloud Run, keep only deployment configuration in GitHub secrets and store all application runtime values in Google Secret Manager.

Recommended GitHub secrets:
- `GCP_SA_KEY`
- `GCP_PROJECT_ID`
- `GCP_REGION`
- `CLOUD_RUN_SERVICE`

Recommended Secret Manager secret names:
- `SECRET_KEY`
- `DEFAULT_LOGIN_PASSWORD`
- `MONGODB_URI`
- `MONGODB_DB`
- `GEMINI_API_KEY`
- `GEMINI_MODEL`
- `SMTP_HOST`
- `SMTP_PORT`
- `SMTP_USERNAME`
- `SMTP_PASSWORD`
- `SMTP_USE_TLS`
- `SMTP_USE_SSL`
- `SMTP_TIMEOUT_SECONDS`
- `SMTP_FROM_EMAIL`
- `SMTP_BCC_EMAILS`
- `PROJECT_NAME`
- `API_V1_STR`
- `ACCESS_TOKEN_EXPIRE_MINUTES`
- `ALGORITHM`
- `CORS_ORIGINS`
- `WEBAUTHN_RP_ID`
- `WEBAUTHN_RP_NAME`
- `WEBAUTHN_ORIGIN`
- `SIGNUP_OTP_EXPIRY_MINUTES`
- `SIGNUP_OTP_LENGTH`

Cloud Run injects those secrets as environment variables, which the application already reads through `app/core/config.py`.

## Environment Variables Reference

All variables are read from the environment or a `.env` file at startup by `app/core/config.py`.

### 🔴 Critical — must be set in every environment

| Variable | Default | Importance | Description |
|----------|---------|------------|-------------|
| `SECRET_KEY` | *(none — required)* | **Critical** | JWT signing key. Use a random 32+ character string. Leaking this allows forging auth tokens for any account. |

### 🟠 High — strongly recommended for production

| Variable | Default | Importance | Description |
|----------|---------|------------|-------------|
| `MONGODB_URI` | `mongodb://localhost:27017` | **High** | Full MongoDB connection string including auth credentials. Must be set to a secured URI in production. |
| `MONGODB_DB` | `my_finance` | **High** | Database name used by the application. Changing this in production without migration will lose all data. |
| `GEMINI_API_KEY` | *(none — optional)* | **High** | Google Gemini API key. Required to enable AI receipt extraction. Without it the extract-and-create endpoint is disabled. Keep secret — billing is tied to this key. |
| `SMTP_HOST` | *(none — optional)* | **High** | SMTP server hostname. Without it OTP verification emails fall back to log-only mode (development). Required for user registration to work end-to-end. |
| `SMTP_USERNAME` | *(none — optional)* | **High** | SMTP login username. Required when the mail server enforces authentication. |
| `SMTP_PASSWORD` | *(none — optional)* | **High** | SMTP login password. Required when the mail server enforces authentication. Keep secret. |
| `CORS_ORIGINS` | `http://localhost:3000, http://localhost:5173` | **High** | Comma-separated or JSON-array list of allowed CORS origins. Must be set to the real frontend URL(s) in production to prevent cross-origin abuse. |
| `WEBAUTHN_RP_ID` | `localhost` | **High** | WebAuthn relying party ID. Must equal the login domain (or a parent registrable suffix) where passkeys are used, e.g. `app.example.com` or `example.com`. |
| `WEBAUTHN_ORIGIN` | `http://localhost:5173` | **High** | Exact WebAuthn origin used by browsers for passkey verification, e.g. `https://app.example.com`. Must match the frontend origin exactly. |

### 🟡 Medium — tune for your deployment

| Variable | Default | Importance | Description |
|----------|---------|------------|-------------|
| `SMTP_FROM_EMAIL` | `no-reply@my-finance.local` | **Medium** | `From:` address on all outbound emails. Set to a real domain address so emails are not rejected as spam. |
| `SMTP_BCC_EMAILS` | `no-reply@harpytechco.in` | **Medium** | Comma-separated or JSON-array list of addresses to blind-copy on every outbound email (audit / ops trail). Set to `""` to disable. |
| `SMTP_PORT` | `587` | **Medium** | SMTP server port. Common values: `587` (STARTTLS), `465` (SSL), `25` (plain — avoid in production). |
| `SMTP_USE_TLS` | `true` | **Medium** | Enable STARTTLS upgrade after connecting. Set to `false` only when `SMTP_USE_SSL=true` or on a trusted internal relay. |
| `SMTP_USE_SSL` | `false` | **Medium** | Use SMTP over SSL (port 465). Set to `true` when your mail provider requires an SSL-only connection. |
| `SMTP_TIMEOUT_SECONDS` | `15` | **Medium** | Seconds before an SMTP connection attempt is aborted. Increase on slow networks; decrease for faster failure detection. |
| `ACCESS_TOKEN_EXPIRE_MINUTES` | `30` | **Medium** | JWT access-token lifetime in minutes. Shorter values reduce the window of a stolen token but require more frequent re-login. |
| `GEMINI_MODEL` | `gemini-2.5-flash` | **Medium** | Gemini model used for receipt extraction. Currently locked to `gemini-2.5-flash`; changing this requires a code update in `expense_extraction_service.py`. |

### 🟢 Low — informational / rarely changed

| Variable | Default | Importance | Description |
|----------|---------|------------|-------------|
| `PROJECT_NAME` | `Secure FastAPI` | **Low** | Application display name logged at startup. No functional effect. |
| `BUILD_VERSION` | `dev` | **Low** | Build or release version string exposed via the health endpoint. Set by CI/CD pipelines. |
| `API_V1_STR` | `/api/v1` | **Low** | URL prefix for all API routes. Changing this requires matching updates to frontend API calls and the ingress config. |
| `ALGORITHM` | `HS256` | **Low** | JWT signing algorithm. Only change if your security policy mandates RS256/ES256 (requires keypair setup). |
| `WEBAUTHN_RP_NAME` | `FinTrackr` | **Low** | Human-readable relying party name shown in authenticator prompts. Cosmetic only, but keep consistent for users. |
| `SIGNUP_OTP_EXPIRY_MINUTES` | `2` | **Low** | How long a registration OTP remains valid. Short window reduces brute-force exposure. |
| `SIGNUP_OTP_LENGTH` | `6` | **Low** | Number of digits in a registration OTP (4–8). Higher values are harder to guess but less convenient. |

## Troubleshooting

### "Failed to load configuration" error

Check that required variables are set:
```bash
# Windows
$env:SECRET_KEY

# Linux/macOS
echo $SECRET_KEY
```

### Docker Compose can't find variables

Ensure you've sourced the load script:
```bash
# Windows PowerShell
. .\load-secrets.ps1

# Linux/macOS
source ./load-secrets.sh
```

### Still seeing default values

Check the priority order - environment variables override `.env` file values.

## References

- [Docker Secrets Documentation](https://docs.docker.com/engine/swarm/secrets/)
- [Docker Compose Environment Variables](https://docs.docker.com/compose/environment-variables/)
- [Windows Credential Manager PowerShell Module](https://www.powershellgallery.com/packages/CredentialManager)
- [Linux Secret Service (libsecret)](https://wiki.gnome.org/Projects/Libsecret)
