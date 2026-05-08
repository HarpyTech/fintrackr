# FinTrackr

A personal finance management web app to track income, expenses, budgets and visualize financial health.

## 🚀 Features

✔️ Add and manage multiple accounts  
✔️ Track income and expenses  
✔️ Categorize transactions  
✔️ Budget creation & alerts  
✔️ Financial summary dashboard  
✔️ Export reports (CSV / Excel)  
✔️ Optional authentication (if implemented)  

---

## 📦 Tech Stack

This project is built with:

- **Python** – backend logic  
- **(Flask / Django / FastAPI)** – web framework *(replace with whichever your app uses)*  
- **HTML, CSS, JavaScript** – frontend  
- **SQLite / PostgreSQL** – database *(adjust accordingly)*  
- **Docker** – containerization  
- **docker-compose** – multi-container setup  

---

## 🧩 Project Structure

```

my-finance/
├── app/                     # Application source code
├── Dockerfile               # Docker container specification
├── docker-compose.yml       # Compose services
├── requirements.txt         # Python dependencies
├── .gitignore
├── LICENSE
└── README.md

````

---

## 📥 Setup & Installation

### 🛠 Local Development

1. **Clone the repository**

```bash
git clone https://github.com/HarpyTech/my-finance.git
cd my-finance
````

2. **Create a Python virtual environment**

```bash
python3 -m venv venv
source venv/bin/activate   # Linux / macOS
venv\Scripts\activate      # Windows
```

3. **Install dependencies**

```bash
pip install -r requirements.txt
```

4. **Configure environment variables**

Copy the example environment file and configure your settings:

```bash
cp .env.example .env
```

Update the `.env` file with your actual configuration. See [SECRET-MANAGEMENT.md](./SECRET-MANAGEMENT.md) for secure credential management options.

**Required Variables:**
- `SECRET_KEY` - JWT signing key (generate with `openssl rand -hex 32`)
- `MONGODB_URI` - MongoDB connection string
- `DEFAULT_LOGIN_PASSWORD` - Default user password
- `ACCESS_TOKEN_EXPIRE_MINUTES` - JWT token expiration time
- `DEFAULT_USER_EMAIL` - Default user email
- `DEFAULT_USER_NAME` - Default user name

For production deployments, use credential managers instead of `.env` files. See [🔐 Secret Management](#-secret-management) below.

5. **Run the app**

```bash
uvicorn app.main:app --reload
```

Your app should now be running at: **[http://localhost:8000](http://localhost:8000)** *(or configured port)*

---

## 🐳 Using Docker

If you prefer containerized setup:

```bash
docker build -t my-finance:latest .
docker-compose up
```

**Environment Configuration:**
- Docker Compose automatically loads from `.env` file if present
- If `.env` is not found, it falls back to default values specified in `docker-compose.yml`
- For production, use credential managers (see [🔐 Secret Management](#-secret-management))

**Using Credential Managers:**

Windows (PowerShell):
```powershell
.\load-secrets.ps1
docker-compose up
```

Linux/macOS (Bash):
```bash
./load-secrets.sh
docker-compose up
```

The application will be available at **[http://localhost:8000](http://localhost:8000)** *(if exposed via compose)*

---

## 🔐 Secret Management

For secure credential management in production environments, this project supports multiple approaches:

1. **Credential Managers** (Recommended for Production)
   - Windows: Credential Manager
   - macOS: Keychain
   - Linux: Secret Service (secret-tool)

2. **Azure Key Vault** (Enterprise)

3. **Docker Secrets** (Container Orchestration)

4. **Environment Variables** (Development Only)

**Quick Start:**

Windows:
```powershell
# Load secrets from Windows Credential Manager
.\load-secrets.ps1
```

Linux/macOS:
```bash
# Load secrets from system credential manager
./load-secrets.sh
```

**Full Documentation:**  
See [SECRET-MANAGEMENT.md](./SECRET-MANAGEMENT.md) for comprehensive setup instructions, examples, and best practices for each platform.

---

## ☁️ Auto Deploy to Google Cloud Run (GitHub Actions)

This repository includes branch-specific Cloud Run workflows:

- `.github/workflows/dev_deploy.yml` deploys pushes from `develop`
- `.github/workflows/prod_deploy.yml` deploys pushes from `main`

Deployment flow:
1. Build Docker image
2. Push image to Artifact Registry
3. Deploy image to Cloud Run
4. Bind runtime environment variables from Google Secret Manager

### 1) Add Required GitHub Secrets

Add these in GitHub: **Settings -> Secrets and variables -> Actions -> Secrets**.

**Deployment Secrets**
- `GCP_SA_KEY` = full JSON of your GCP service account key
- `GCP_PROJECT_ID` = your Google Cloud project ID
- `GCP_REGION` = Cloud Run region (optional)
- `CLOUD_RUN_SERVICE` = base Cloud Run service name, for example `finance` (the workflows append `-dev` and `-prod` when needed)

Only deployment-scoped values should live in GitHub secrets.

### 2) Add Application Runtime Values To Secret Manager

The workflows no longer read application runtime values from GitHub secrets. Cloud Run now binds these directly from Google Secret Manager using the same names as the application environment variables.

**Required Secret Manager secrets**
- `SECRET_KEY`
- `DEFAULT_LOGIN_PASSWORD`
- `MONGODB_URI`

**Optional Secret Manager secrets**
- `PROJECT_NAME`
- `API_V1_STR`
- `ACCESS_TOKEN_EXPIRE_MINUTES`
- `ALGORITHM`
- `CORS_ORIGINS`
- `WEBAUTHN_RP_ID`
- `WEBAUTHN_RP_NAME`
- `WEBAUTHN_ORIGIN`
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
- `SIGNUP_OTP_EXPIRY_MINUTES`
- `SIGNUP_OTP_LENGTH`

Example:

```bash
echo -n "mongodb+srv://user:pass@cluster.example.mongodb.net/" | gcloud secrets create MONGODB_URI --data-file=-
echo -n "replace-with-a-long-random-secret" | gcloud secrets create SECRET_KEY --data-file=-
echo -n "replace-default-password" | gcloud secrets create DEFAULT_LOGIN_PASSWORD --data-file=-
```

If a secret already exists, add a new version instead:

```bash
echo -n "new-value" | gcloud secrets versions add SECRET_KEY --data-file=-
```

### 3) Push to `develop` or `main`

After the deployment secrets and Secret Manager entries are set, push to `develop` or `main` and the matching workflow will build and deploy to Cloud Run.

---

## 🤝 Contributing

We welcome contributions! To contribute:

1. Fork the repo
2. Create your feature branch (`git checkout -b feature/xyz`)
3. Commit your changes (`git commit -m "Add xyz"`)
4. Push to your fork (`git push origin feature/xyz`)
5. Open a Pull Request

Please follow the code style and add tests where applicable.

---

## 📄 License

This project is licensed under the **MIT License** — see the [LICENSE](./LICENSE) file for details.

---

## 📞 Contact

Created by **HarpyTech** – feel free to reach out with questions or suggestions!

[1] [https://github.com/HarpyTech/my-finance](https://github.com/HarpyTech/my-finance) "GitHub - HarpyTech/my-finance"
