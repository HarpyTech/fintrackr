# Application Design Document (UI/UX + Page Behavior)

## 1. Purpose

This document explains what exists in the current FinTrackr application, how many user-facing pages there are, what each page does, and what UI behavior must be represented in wireframes.

It is intended for design teams creating or improving Figma wireframes with implementation-accurate scope.

---

## 2. Scope Snapshot

## 2.1 Active Product Type
- Single Page Application (SPA) served by FastAPI static hosting.
- Frontend routing is handled in React.

## 2.2 Active Routed Pages (for wireframes)
There are **7 active routed pages** in the live SPA:

1. `/` - Landing
2. `/login` - Login
3. `/register` - Register + OTP request/verify flow (two-step on same page)
4. `/verify-email` - OTP verification + resend
5. `/dashboard` - Analytics + quick capture
6. `/report` - Historical reporting
7. `/add-expense` - Manual + AI-based expense creation

## 2.3 Shared UI Surfaces (cross-page)
- Top navigation menu (Dashboard, Report, Add Expense)
- Profile menu + Edit Profile modal
- Floating Expense Chat assistant (protected pages only)
- Logout action in page headers

## 2.4 Legacy/Inactive Template Pages (not currently used in SPA flow)
- `app/templates/login.html`
- `app/templates/home.html`
- `app/templates/index.html`

These exist in the repo but are not part of the active SPA route configuration.

---

## 3. Information Architecture

## 3.1 Public Flow
- Landing -> Register or Login
- Register -> OTP verify (inline) -> Login
- Login (if email unverified) -> Verify Email page

## 3.2 Authenticated Flow
- Login success -> Dashboard
- Global nav between Dashboard / Report / Add Expense
- Chat assistant available on protected pages
- Logout returns user to Login

## 3.3 Route Guarding
- Protected routes: `/dashboard`, `/report`, `/add-expense`
- Unauthenticated users are redirected to `/login`
- Unknown route fallback redirects to `/`

---

## 4. Global UX and Design System Notes

## 4.1 Core Visual Direction in Current Build
- Light UI with soft gradient page background
- Rounded cards and panels
- Blue primary action emphasis
- Neutral forms with clear labels and compact helper/error text

## 4.2 Global Interaction Patterns
- Form submit states: disabled buttons + progress labels
- Inline validation and server error messaging
- Empty states for data visuals and tables
- Responsive behavior across desktop and mobile

## 4.3 Shared Components to Include in Wireframes
- Header block with page title + right-side actions
- Navigation pill/buttons with active state
- User avatar button, dropdown, and profile modal form
- Toast and alert banners for success and limit messages
- Table wrapper for horizontal overflow

---

## 5. Detailed Page Documentation

## 5.1 Landing Page
- **Route:** `/`
- **Access:** Public
- **Primary Goal:** Introduce product value and convert users to Register/Login.

### 5.1.1 Layout Sections
1. Hero section:
- Brand badge
- Brand icon + wordmark
- H1 value proposition
- Supporting paragraph
- Two CTAs: Get Started, I Already Have an Account

2. Why choose section:
- 3 value cards with title + short descriptive text

3. Benefits section:
- Bullet list of user outcomes

4. Bottom CTA section:
- Reinforcing heading + copy
- Create Free Account CTA

### 5.1.2 Key Interactions
- CTA links route to Register or Login.

### 5.1.3 Content Requirements
- Marketing-friendly copy blocks with clear hierarchy.
- Trust-building tone focused on clarity, habit-building, and control.

### 5.1.4 Wireframe Notes
- Build desktop and mobile variants with strong visual hierarchy.
- Maintain obvious dual-path entry (new user vs existing user).

---

## 5.2 Login Page
- **Route:** `/login`
- **Access:** Public
- **Primary Goal:** Authenticate existing users.

### 5.2.1 Layout Sections
1. Brand block:
- Icon + wordmark
- Short tagline

2. Login form:
- Email field
- Password field
- Error message region
- Submit button (`Sign in` / `Signing in...`)

3. Secondary links:
- Create account
- Verify account

### 5.2.2 Key Interactions
- Submit login credentials.
- On success -> navigate to Dashboard.
- If backend returns email-not-verified message -> redirect to Verify Email route with prefilled query email.

### 5.2.3 Validation and States
- Required email/password.
- Server error displayed inline.
- Button disabled while submitting.

### 5.2.4 Wireframe Notes
- Keep support links visible without overpowering primary login action.
- Error placement must be immediately above CTA area.

---

## 5.3 Register Page
- **Route:** `/register`
- **Access:** Public
- **Primary Goal:** New account creation with OTP verification.

### 5.3.1 Flow Model
This page contains two internal steps:

1. Step A: Request OTP
- Email
- Password
- Confirm Password
- Send OTP button

2. Step B: Verify OTP
- Email (disabled/read-only)
- OTP field (numeric input behavior)
- Verify & Create Account button

### 5.3.2 Key Interactions
- Password and confirm must match before OTP request.
- Request OTP triggers transition to OTP step.
- Verify OTP success -> Login page.

### 5.3.3 Validation and States
- Password mismatch check.
- Min password length behavior.
- Success/informational message area.
- Error area for request/verify failures.
- Submitting button labels differ by step.

### 5.3.4 Wireframe Notes
- Must clearly communicate two-step progression.
- Keep context that verification email was sent.
- Preserve navigation links to Login and Verify Email.

---

## 5.4 Verify Email Page
- **Route:** `/verify-email`
- **Access:** Public
- **Primary Goal:** Complete account verification and resend OTP when needed.

### 5.4.1 Layout Sections
1. Intro copy
2. Form
- Email input
- OTP input
- Verify button
- Resend OTP button (secondary style)
3. Link back to Login

### 5.4.2 Key Interactions
- Verify account with email + OTP.
- Resend OTP if user did not receive code.
- Supports pre-filled email from query string.

### 5.4.3 Validation and States
- Requires both fields for verify.
- Resend requires email.
- Separate loading states for verify vs resend.
- Message region for resend confirmation.

### 5.4.4 Wireframe Notes
- Distinguish primary and secondary action clearly.
- Keep OTP usability high (numeric keyboard hint on mobile).

---

## 5.5 Dashboard Page
- **Route:** `/dashboard`
- **Access:** Protected
- **Primary Goal:** Give current financial overview + quick expense capture.

### 5.5.1 Header and Shared Shell
- Brand wordmark + page title
- Top navigation component
- Logout button
- Success toast (sticky top-right style behavior)

### 5.5.2 Stats Cards
- Total Expenses (currency)
- Entries count
- Tracking Year

### 5.5.3 Quick Add Expense Panel
Mobile:
- Camera capture input
- Receipt preview card
- Remove image action
- Capture + Save action

Desktop:
- CTA block pushing user to Add Expense page

Post-submit:
- Optional extracted JSON preview block
- Error state region

### 5.5.4 Analytics Panels
1. Monthly Trend (bar chart)
2. Yearly Trend (bar chart)
3. Category Split (pie chart)
4. Daily Expenses with month/year filter
5. Expenses by Category (donut)
6. Expenses by Vendor (donut)
7. Avg Expense by Category (grouped bar)

### 5.5.5 Data and Refresh Behavior
- Initial load pulls expenses and summary datasets.
- Filtered charts react to selected month/year.
- Page listens to custom expense-created event to refresh stats/charts.

### 5.5.6 Empty/Error States
- Each chart panel can independently show no-data/help text or error text.
- Quick capture error shown inline.

### 5.5.7 Wireframe Notes
- Prioritize scannability: summary first, actions second, analytics third.
- Include responsive chart containers and card stacking behavior.
- Include separate mobile and desktop quick-add treatment.

---

## 5.6 Report Page
- **Route:** `/report`
- **Access:** Protected
- **Primary Goal:** Explore historical expenses with filters and two table perspectives.

### 5.6.1 Header and Shared Shell
- Page title
- Top navigation
- Logout button

### 5.6.2 Report Controls
1. View toggle tabs:
- View By Expense
- View By Line Items

2. Filters:
- Start Date
- End Date
- Category dropdown (dynamic from dataset)

3. Summary strip:
- Count of filtered expenses
- Count of filtered line items
- Total filtered spend

### 5.6.3 Table Views
Expense view columns:
- ID
- Date
- Category
- Input Type
- Invoice No.
- Vendor
- Description
- Line Items count
- Amount

Line-item view columns:
- Expense ID
- Date
- Category
- Vendor
- Input Type
- Item
- Qty
- Unit Price
- Total

### 5.6.4 Interaction Behavior
- Filters apply client-side on loaded expenses dataset.
- Toggle instantly switches table mode.
- Empty state row shown when no matching records.

### 5.6.5 Wireframe Notes
- Emphasize data density with strong table readability.
- Include horizontal-scroll friendly table container.
- Keep filters and mode toggle always visible above table.

---

## 5.7 Add Expense Page
- **Route:** `/add-expense`
- **Access:** Protected
- **Primary Goal:** Create expenses via manual entry or AI-assisted extraction.

### 5.7.1 Header and Shared Shell
- Page title
- Top navigation
- Logout button

### 5.7.2 Expense Limit Banner
- Alert shown when session limit reached.
- Includes support contact mailto link.
- Form submit buttons disabled when limit is reached.

### 5.7.3 Panel A: Manual Expense Form
Fields:
- Amount (numeric)
- Category (fixed set)
- Date
- Note

Action:
- Save Expense

### 5.7.4 Panel B: Text/Image/Camera AI Extraction
Inputs:
- Free text area
- Receipt image upload
- Mobile-only camera capture input

Action:
- Extract + Save Expense

Output:
- Last Extracted JSON preview
- Error state region

### 5.7.5 Interaction Behavior
- Input type is derived automatically (text, image, camera, or mixed).
- On success, forms clear and limit state refreshes.
- On limit error, page enters limit-reached state.

### 5.7.6 Wireframe Notes
- Distinguish manual and AI methods as equal primary workflows.
- Make mobile camera path obvious and easy.
- Reserve visible area for extraction output and errors.

---

## 6. Shared Surface Documentation

## 6.1 Top Navigation + Profile Experience
Appears on protected pages.

### 6.1.1 Navigation
- Three destination links with active state:
  - Dashboard
  - Report
  - Add Expense

### 6.1.2 Profile Menu
- Avatar/initials trigger
- Dropdown with display name and user email
- Edit Profile action

### 6.1.3 Edit Profile Modal
Fields:
- First Name
- Last Name
- Phone (format validation)
- Address (min/max length validation + counter)

Actions:
- Cancel
- Save

States:
- Validation errors
- Save loading state
- Success message

Wireframe requirement:
- Include modal overlay, focus area, footer action row, and inline helper/error text patterns.

## 6.2 Expense Chat Widget
Appears on protected pages as floating assistant.

### 6.2.1 Closed State
- Circular launcher fixed bottom-right.

### 6.2.2 Open State
- Header with title and close action
- Scrollable message list
- Textarea input
- Primary send button
- Secondary "Start new expense" reset action

### 6.2.3 Behavior
- User can log expense via plain language.
- If details are missing, assistant asks only for missing fields.
- Successful save dispatches global expense-created event (refreshes page data).

Wireframe requirement:
- Capture both closed and open states, including status tone variants (success, missing-fields, error).

---

## 7. Backend Dependency Summary for Design Context

Design should anticipate these backend-powered behaviors:
- Session-aware routing and redirects
- CSRF-protected mutating requests
- Independent loading/error states per section
- Real-time refresh trigger after expense creation event

Primary endpoint families used by pages:
- Authentication/session/profile endpoints
- Expense CRUD and extraction endpoints
- Expense summary/report endpoints

---

## 8. Recommended Figma Deliverables

For complete handoff, create:

1. Global foundations
- Color and typography tokens
- Form control states
- Button states
- Alert, toast, and helper/error messaging patterns

2. Reusable components
- Header shell
- Top nav
- Profile dropdown + modal
- Chart card container
- Data table pattern
- Chat widget

3. Page wireframes
- Landing
- Login
- Register (step A and step B)
- Verify Email
- Dashboard (desktop + mobile)
- Report (both toggle states)
- Add Expense (desktop + mobile)

4. State variants per page
- Empty
- Loading
- Success
- Error
- Limit-reached (where applicable)

---

## 9. Route Inventory Matrix

| Route | Page | Access | Primary Function |
|---|---|---|---|
| `/` | Landing | Public | Product introduction and conversion |
| `/login` | Login | Public | User authentication |
| `/register` | Register | Public | Account creation with OTP flow |
| `/verify-email` | Verify Email | Public | OTP verification and resend |
| `/dashboard` | Dashboard | Protected | Overview analytics + quick capture |
| `/report` | Report | Protected | Historical reporting and filtering |
| `/add-expense` | Add Expense | Protected | Manual + AI expense creation |

Total active routed pages: **7**

---

## 10. Implementation Reference Files

Primary route map:
- `app/src/App.jsx`

Page implementations:
- `app/src/pages/LandingPage.jsx`
- `app/src/pages/LoginPage.jsx`
- `app/src/pages/RegisterPage.jsx`
- `app/src/pages/VerifyEmailPage.jsx`
- `app/src/pages/DashboardPage.jsx`
- `app/src/pages/ReportPage.jsx`
- `app/src/pages/AddExpensePage.jsx`

Shared shells/components:
- `app/src/components/TopNavigation.jsx`
- `app/src/components/ExpenseChatWidget.jsx`
- `app/src/components/MonthYearFilter.jsx`
- `app/src/components/DailyExpenseChart.jsx`
- `app/src/components/CategoryDonutChart.jsx`
- `app/src/components/VendorDonutChart.jsx`
- `app/src/components/AvgCategoryBarChart.jsx`

Styling baseline:
- `app/src/styles.css`

Backend SPA serving context:
- `app/main.py`
