# FinTrackr - Codebase Overview

**FinTrackr** is a modern personal finance management web application designed to help users track income, expenses, budgets, and visualize their financial health. It's built as a full-stack application with a **Python FastAPI** backend and a **React** frontend.

---

## 🎯 Core Purpose

The application enables users to:
- **Track expenses** with multiple input methods (manual, text, image, camera)
- **Categorize transactions** (grocery, restaurant, service, utility, etc.)
- **Visualize spending patterns** through interactive dashboards and charts
- **Generate reports** for financial analysis
- **Manage budgets** with spending alerts
- **Add line-item details** to expenses (e.g., itemized receipts)

---

## 🏗️ Architecture Overview

### **Full-Stack Structure**
```
Frontend (React + Vite)         Backend (FastAPI)          Database (MongoDB)
├── Auth Flow                   ├── User Management         ├── Users Collection
├── Dashboard                   ├── Expense APIs            ├── Expenses Collection
├── Expense Entry               ├── Authentication          ├── Line Items
├── Reports & Analytics         ├── Authorization           └── Session Data
└── Charts (Recharts)           └── Middleware (CSRF, etc.)
```

---

## 📦 Technology Stack

### **Backend**
| Component | Technology | Version |
|-----------|-----------|---------|
| Framework | FastAPI | 0.110.0 |
| Server | Uvicorn | 0.27.1 |
| Database | MongoDB | 4.10.1 |
| Authentication | Python-José (JWT) + Passlib | - |
| Security | Bcrypt | 4.0.1 (Passlib 1.7.4 compatibility) |
| Validation | Pydantic | 2.6.4 |
| AI Extraction | Google Generative AI | 0.8.5 |
| Logging | Loguru | 0.7.2 |
| Templating | Jinja2 | 3.1.3 |

### **Frontend**
| Component | Technology | Version |
|-----------|-----------|---------|
| Framework | React | 18.3.1 |
| Build Tool | Vite | 5.4.9 |
| Routing | React Router | 6.28.0 |
| Charts | Recharts | 2.13.3 |
| Styling | CSS | Custom |

### **Deployment**
- **Docker** containerization
- **Docker Compose** for multi-container orchestration
- **Kubernetes** ready (k8s manifests included)
- Health checks via `/health` endpoint

---

## 🗂️ Directory Structure

```
my-finance/
├── app/                          # Main application package
│   ├── api/                      # API route handlers
│   │   ├── routes/
│   │   │   ├── auth.py          # Authentication endpoints (register, login, verify)
│   │   │   ├── expenses.py      # Expense CRUD + summaries
│   │   │   ├── users.py         # User profile management
│   │   │   ├── health.py        # Health check endpoint
│   │   │   └── web.py           # Web routes (frontend serving)
│   │   ├── deps.py              # Dependency injection helpers
│   │   └── csrf_helper.py       # CSRF token utilities
│   │
│   ├── core/                     # Core application logic
│   │   ├── config.py            # Environment configuration
│   │   ├── security.py          # JWT & password hashing
│   │   ├── ratelimit.py         # OTP rate limiting
│   │   └── tracing.py           # Distributed tracing setup
│   │
│   ├── middleware/               # HTTP middleware
│   │   ├── auth.py              # Authentication middleware
│   │   ├── csrf.py              # CSRF protection
│   │   └── tracing.py           # Request tracing
│   │
│   ├── models/                   # Pydantic data models
│   │   ├── expense.py           # Expense schema
│   │   └── user.py              # User schema
│   │
│   ├── services/                 # Business logic layer
│   │   ├── auth_service.py      # User registration/login
│   │   ├── expense_service.py   # Expense operations & analytics
│   │   └── expense_extraction_service.py  # AI-powered receipt parsing
│   │
│   ├── db/                       # Database access
│   │   └── mongo.py             # MongoDB connection & helpers
│   │
│   ├── src/                      # React frontend source
│   │   ├── App.jsx              # Main app component + routing
│   │   ├── main.jsx             # React entry point
│   │   ├── styles.css           # Global styles
│   │   ├── auth/                # Authentication context
│   │   ├── components/          # Reusable React components
│   │   ├── pages/               # Page components (Dashboard, Report, etc.)
│   │   └── lib/                 # Client-side utilities (API requests)
│   │
│   ├── static/                   # Built frontend (Vite output)
│   │   └── index.html
│   │
│   └── templates/                # Jinja2 templates (fallback)
│
├── k8s/                          # Kubernetes manifests
├── Dockerfile                    # Container image definition
├── docker-compose.yml            # Multi-container setup
├── requirements.txt              # Python dependencies
└── package.json                  # Node.js dependencies
```

---

## 🔑 Core Entities & Data Models

### **Expense Model**
```python
{
  "id": str,
  "amount": float,
  "category": str,          # e.g., "grocery", "restaurant"
  "bill_type": str,         # grocery|restaurant|service|utility|other
  "vendor": str,            # e.g., "Amazon", "Whole Foods"
  "description": str,
  "expense_date": date,
  "invoice_number": str,
  "input_type": str,        # manual|text|image|camera|mixed
  "line_items": [           # Itemized details
    {
      "name": str,
      "quantity": float,
      "unit_price": float,
      "total": float
    }
  ],
  "llm_model": str          # e.g., "gemini-2.5-flash" (for extraction)
}
```

### **User Model**
```python
{
  "username": email,
  "password_hash": str,
  "email_verified": bool,
  "role": str,
  "profile": {
    "first_name": str,
    "last_name": str,
    "phone": str,
    "address": str
  }
}
```

---

## 🔌 API Endpoints

### **Authentication** (`/api/v1/auth`)
- `POST /register` — Create new user & send OTP
- `POST /verify-signup` — Verify email with OTP
- `POST /resend-otp` — Resend verification OTP
- `POST /login` — Authenticate & get JWT token
- `POST /logout` — Clear session

### **Expenses** (`/api/v1/expenses`)
- `POST /` — Add new expense
- `POST /extract-and-create` — Extract from image/text + create
- `GET /` — List user's expenses
- `GET /summary/daily?year=YYYY&month=MM` — Daily breakdown
- `GET /summary/monthly?year=YYYY` — Monthly summary
- `GET /summary/yearly` — Yearly summary
- `GET /summary/categories-monthly?year=YYYY&month=MM` — Category breakdown
- `GET /summary/vendors-monthly?year=YYYY&month=MM` — Vendor breakdown
- `GET /summary/categories?year=YYYY` — Annual category trends

### **Users** (`/api/v1/users`)
- `GET /me` — Current user profile
- `PUT /profile` — Update user profile

### **Health** (`/health`)
- `GET /` — Application health status

---

## 🎨 Frontend Pages

| Page | Route | Purpose |
|------|-------|---------|
| **Login** | `/login` | User authentication |
| **Register** | `/register` | New user signup |
| **Email Verification** | `/verify-email` | OTP verification |
| **Dashboard** | `/dashboard` | Main analytics hub with charts |
| **Add Expense** | `/add-expense` | Expense entry (manual, image, camera) |
| **Report** | `/report` | Financial reports & exports |

### **Dashboard Features** (Recently Enhanced)
- **Daily Expense Chart** — Bar chart showing spending per day
- **Category Donut Chart** — Pie breakdown by expense category
- **Vendor Donut Chart** — Pie breakdown by merchant/vendor (top-7 + Others)
- **Avg Category Bar Chart** — Grouped bar chart comparing categories across months
- **Month/Year Filter** — Shared filter for date-based views
- **Quick Add Panel** — Fast expense entry
- **Monthly Trend Chart** — Line chart of monthly spending
- **Yearly Summary** — Annual spending overview
- **Category Split** — Category distribution pie chart

---

## 🔐 Security Features

- **JWT Authentication** — Stateless token-based auth
- **Password Hashing** — Bcrypt with salt
- **CSRF Protection** — Token-based CSRF middleware
- **Email Verification** — OTP-based signup verification
- **Rate Limiting** — OTP request throttling
- **Secure Cookies** — HTTPOnly, SameSite=Lax
- **Request Tracing** — Distributed tracing with correlation IDs
- **MongoDB Injection Prevention** — Parameterized queries via PyMongo

---

## 🚀 Deployment Models

### **Local Development**
```bash
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload
```

### **Docker**
```bash
docker-compose up
```
Runs FastAPI on port 8000 with MongoDB connection.

### **Kubernetes**
- `k8s/deployment.yaml` — FastAPI deployment
- `k8s/service.yaml` — Service exposure
- `k8s/ingress.yaml` — Ingress routing
- `k8s/pdb.yaml` — Pod disruption budget
- `k8s/managedcertificate.yaml` — SSL/TLS

---

## 📊 AI/ML Features

- **Expense Extraction** — Google Generative AI (Gemini) parses:
  - Invoice images
  - Receipt text
  - Structured expense descriptions
- **Smart Categorization** — AI suggests categories & vendors
- **Line Item Parsing** — Automatically extracts itemized details from receipts

---

## 🔄 Data Flow Example: Adding an Expense

```
User submits expense form
    ↓
AddExpensePage (React) → POST /api/v1/expenses
    ↓
expenses.py route → add_expense() service
    ↓
expense_service.py → Validate + Store in MongoDB
    ↓
Response: {"id": "...", "amount": 50, ...}
    ↓
Dashboard re-fetches data
    ↓
Recharts components re-render with new totals
```

---

## 📈 Analytics & Reporting

The application provides **time-series analytics**:
- Daily/monthly/yearly expense summaries
- Category-wise spending breakdown
- Vendor/merchant analysis
- Trend visualization with Recharts
- CSV/Excel export capability (Report page)

---

## 🛠️ Development Workflow

### **Backend Development**
- Modify routes in `app/api/routes/`
- Add business logic in `app/services/`
- Update models in `app/models/`
- Restart: `uvicorn app.main:app --reload`

### **Frontend Development**
- React components in `app/src/components/` & `app/src/pages/`
- Styling in `app/src/styles.css`
- Run: `npm run dev` (Vite dev server)
- Build: `npm run build`

---

## ✅ Summary

**FinTrackr** is a production-ready, full-stack finance tracker with:
✔️ Secure user authentication  
✔️ Multi-input expense tracking (manual, image, camera)  
✔️ AI-powered receipt parsing  
✔️ Rich analytics dashboard  
✔️ Real-time charts & visualizations  
✔️ Containerized deployment  
✔️ MongoDB persistence  
✔️ Kubernetes-ready architecture
