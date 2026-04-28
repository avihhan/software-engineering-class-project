# 🏋️ Aura Fit

**A comprehensive health & fitness mobile app platform for fitness centers and gyms**

Aura Fit is a full-stack web-based platform designed to help gyms and fitness centers manage their clients, classes, and fitness tracking. It features a mobile app for end-users, an admin portal for gym management, and a robust Flask API backend.

---

## 📊 Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                      Aura Fit Ecosystem                      │
├─────────────────────────────────────────────────────────────┤
│                                                               │
│  ┌──────────────────┐  ┌──────────────────┐                 │
│  │  Mobile App      │  │  Web Portal      │                 │
│  │  (React + Vite)  │  │  (React + Vite)  │                 │
│  │  for Users       │  │  for Admins      │                 │
│  └────────┬─────────┘  └────────┬─────────┘                 │
│           │                     │                            │
│           └─────────┬───────────┘                            │
│                     │                                        │
│           ┌─────────▼──────────┐                            │
│           │   Flask API Server │                            │
│           │  (Python Backend)  │                            │
│           └─────────┬──────────┘                            │
│                     │                                        │
│         ┌───────────┴───────────┐                           │
│         │                       │                           │
│    ┌────▼────────┐    ┌────────▼────┐                      │
│    │  Supabase   │    │ PostgreSQL   │                      │
│    │  (Auth)     │    │ (Database)   │                      │
│    └─────────────┘    └─────────────┘                       │
│                                                               │
│    Cloud Deployment: Google Cloud Run                        │
│    Infrastructure: Dockerized & Scalable                    │
│                                                               │
└─────────────────────────────────────────────────────────────┘
```

---

## 🚀 Quick Access

### Portal & Apps
- **Admin/Tenant Portal (Login):** https://aurafit-web-portal-746427091131.us-central1.run.app/login
- **Mobile App (Users):** https://aurafit-mobile-746427091131.us-central1.run.app/
- **API Server:** https://aurafit-server-746427091131.us-central1.run.app/

---

## ✨ Key Features

### 👥 For End-Users (Mobile App)
- **Fitness Tracking** - Track workouts, calories, and progress
- **Class Booking** - View and book fitness classes
- **Goal Management** - Set and monitor fitness goals
- **Social Features** - Connect with other gym members
- **Personal Dashboard** - View stats and achievements
- **Gym Information** - Access gym details and schedules

### 🏢 For Admins/Trainers (Web Portal)
- **User Management** - Manage gym members and access
- **Class Management** - Create and schedule fitness classes
- **Operations Dashboard** - Monitor gym operations
- **Analytics & Reports** - View member analytics and insights
- **Content Management** - Manage gym announcements and resources
- **Billing & Payments** - Handle membership and payments

---

## 🛠 Technology Stack

| Layer | Technology | Percentage |
|-------|-----------|-----------|
| **Frontend** | TypeScript, React, Vite | 51.7% |
| **Backend** | Python, Flask | 38.6% |
| **Styling** | CSS | 8.8% |
| **Infrastructure** | Docker, Google Cloud Run | 0.3% |
| **Scripting** | Shell | 0.3% |
| **Other** | JavaScript, HTML | 0.3% |

**Additional Tech:**
- **Authentication:** Supabase Auth (OAuth support)
- **Database:** PostgreSQL (via Supabase)
- **State Management:** React Context/Redux
- **Build Tool:** Vite
- **API Framework:** Flask (Python)
- **Containerization:** Docker
- **Cloud Platform:** Google Cloud Run

---

## 📁 Project Structure

```
aura-fit/
├── mobile/                 # React + Vite mobile web app
│   ├── src/
│   │   ├── components/     # Reusable UI components
│   │   ├── pages/          # Mobile app pages
│   │   ├── hooks/          # Custom React hooks
│   │   └── utils/          # Utility functions
│   ├── .env.example        # Environment variables template
│   ├── package.json
│   └── vite.config.ts
│
├── web-portal/             # React + Vite admin portal
│   ├── src/
│   │   ├── components/     # Portal components
│   │   ├── pages/          # Admin pages
│   │   ├── hooks/          # Custom hooks
│   │   └── utils/          # Utility functions
│   ├── .env.example
│   ├── package.json
│   └── vite.config.ts
│
├── server/                 # Flask Python API
│   ├── app/
│   │   ├── routes/         # API endpoints
│   │   ├── models/         # Database models
│   │   ├── services/       # Business logic
│   │   └── middleware/     # Auth & middleware
│   ├── .env.example
│   ├── requirements.txt    # Python dependencies
│   ├── run.py              # Entry point
│   └── Dockerfile
│
├── docker-compose.yml      # Local Docker setup
├── README.md               # This file
└── .gitignore
```

---

## 🚀 Installation & Setup

### Prerequisites
- **Node.js** (v16+) and npm
- **Python** (v3.9+) and pip
- **Docker** (optional, for containerized setup)
- **Git**

### Backend Setup (Flask API)

#### Option 1: Local Setup
```bash
cd server

# Create virtual environment
python -m venv venv

# Activate virtual environment
# On Windows:
venv\Scripts\activate
# On macOS/Linux:
source venv/bin/activate

# Install dependencies
pip install -r requirements.txt

# Setup environment variables
copy .env.example .env  # Windows
cp .env.example .env    # macOS/Linux

# Run the Flask server
python run.py
```

The API will be available at `http://localhost:5000`

#### Option 2: Docker Setup
```bash
cd server
docker build -t aura-fit-api .
docker run -p 5000:5000 --env-file .env aura-fit-api
```

### Frontend Setup - Mobile App

```bash
cd mobile

# Install dependencies
npm install

# Setup environment variables
copy .env.example .env  # Windows
cp .env.example .env    # macOS/Linux

# Start development server
npm run dev
```

The mobile app will be available at `http://localhost:5173` (or your Vite dev port)

### Frontend Setup - Web Portal

```bash
cd web-portal

# Install dependencies
npm install

# Setup environment variables
copy .env.example .env  # Windows
cp .env.example .env    # macOS/Linux

# Start development server
npm run dev
```

The web portal will be available at `http://localhost:5174` (or your Vite dev port)

### Full Stack Setup with Docker Compose

```bash
# From project root
docker-compose up -d
```

This will start:
- Flask API on `localhost:5000`
- Mobile app on `localhost:5173`
- Web portal on `localhost:5174`

---

## 📋 Environment Variables

### Backend (`server/.env`)
```env
FLASK_ENV=development
FLASK_APP=run.py
DATABASE_URL=postgresql://user:password@localhost/aurafit
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_KEY=your_anon_key
JWT_SECRET=your_jwt_secret
CORS_ORIGINS=http://localhost:5173,http://localhost:5174,http://10.0.2.2:5000
```

### Mobile App (`mobile/.env`)
```env
VITE_API_URL=http://localhost:5000
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your_anon_key
```

### Web Portal (`web-portal/.env`)
```env
VITE_API_URL=http://localhost:5000
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your_anon_key
```

> 📝 **Note:** Copy `.env.example` files in each directory to `.env` and fill in your actual values.

---

## 🔌 API Endpoints

### Authentication
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/auth/signup` | Register new user |
| POST | `/api/auth/login` | Login user |
| POST | `/api/auth/logout` | Logout user |
| POST | `/api/auth/refresh` | Refresh access token |
| GET | `/api/auth/me` | Get current user |

### Users
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/users` | List all users |
| GET | `/api/users/<id>` | Get user details |
| PUT | `/api/users/<id>` | Update user profile |
| DELETE | `/api/users/<id>` | Delete user account |
| GET | `/api/users/<id>/stats` | Get user fitness stats |
| POST | `/api/users/<id>/goals` | Create fitness goal |

### Classes
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/classes` | List all classes |
| POST | `/api/classes` | Create new class (Admin) |
| GET | `/api/classes/<id>` | Get class details |
| PUT | `/api/classes/<id>` | Update class (Admin) |
| DELETE | `/api/classes/<id>` | Delete class (Admin) |
| POST | `/api/classes/<id>/book` | Book a class |
| DELETE | `/api/classes/<id>/unbook` | Cancel booking |
| GET | `/api/classes/<id>/members` | Get class members |

### Gyms
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/gyms` | List all gyms |
| POST | `/api/gyms` | Create gym (Admin) |
| GET | `/api/gyms/<id>` | Get gym details |
| PUT | `/api/gyms/<id>` | Update gym (Admin) |
| GET | `/api/gyms/<id>/stats` | Get gym statistics |
| GET | `/api/gyms/<id>/members` | Get gym members |

### Analytics
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/analytics/overview` | Get analytics dashboard (Admin) |
| GET | `/api/analytics/members` | Member analytics |
| GET | `/api/analytics/classes` | Class analytics |
| GET | `/api/analytics/revenue` | Revenue analytics (Admin) |

---

## 🐳 Docker Deployment

### Build Docker Image
```bash
cd server
docker build -t aura-fit-api:latest .
```

### Run Container
```bash
docker run -d \
  --name aura-fit-api \
  -p 5000:5000 \
  --env-file .env \
  aura-fit-api:latest
```

### Push to Google Cloud Run
```bash
# Configure gcloud
gcloud config set project YOUR_PROJECT_ID

# Build and push
gcloud builds submit --tag gcr.io/YOUR_PROJECT_ID/aura-fit-api

# Deploy
gcloud run deploy aura-fit-api \
  --image gcr.io/YOUR_PROJECT_ID/aura-fit-api \
  --platform managed \
  --region us-central1 \
  --set-env-vars DATABASE_URL=$DATABASE_URL,SUPABASE_URL=$SUPABASE_URL
```

---

## 🔐 Security & Best Practices

- **Authentication:** JWT tokens via Supabase
- **CORS:** Configured for allowed origins
- **Environment Variables:** Sensitive data in `.env` (never commit)
- **Database:** PostgreSQL with encrypted connections
- **API Rate Limiting:** Implemented on critical endpoints
- **Input Validation:** Server-side validation on all endpoints
- **Error Handling:** Comprehensive error messages for debugging

---

## 📦 Build & Deployment

### Build Frontend
```bash
# Mobile app
cd mobile
npm run build

# Web portal
cd web-portal
npm run build
```

### Build Backend
```bash
cd server
pip install -r requirements.txt
python run.py
```

### Production Deployment
All services are deployed on **Google Cloud Run** with automatic scaling and monitoring.

---

## 📱 Mobile Native App

The native mobile shell is in a separate repository: **`aura-fit-native`**

- Wraps the mobile web app in a React Native WebView
- Available for iOS and Android
- Uses Expo for development and building

See `aura-fit-native/README.md` for setup instructions.

---

## 🤝 Contributing

1. **Fork** the repository
2. **Create** a feature branch (`git checkout -b feature/amazing-feature`)
3. **Commit** your changes (`git commit -m 'Add amazing feature'`)
4. **Push** to the branch (`git push origin feature/amazing-feature`)
5. **Open** a Pull Request

### Code Standards
- Use **TypeScript** for frontend code
- Follow **PEP 8** for Python code
- Lint with ESLint (frontend) and Pylint (backend)
- Write **meaningful commit messages**

---

## 🐛 Troubleshooting

### CORS Errors
Add your local/cloud origin to `server/.env` `CORS_ORIGINS`

### Database Connection Failed
Check `DATABASE_URL` in `server/.env` and ensure PostgreSQL is running

### API Not Responding
Verify Flask server is running: `python run.py` in `server/` directory

### Frontend Build Errors
Clear node_modules and reinstall: `rm -rf node_modules && npm install`

---

## 📝 License

This project is proprietary and confidential. Contact [avihhan](https://github.com/avihhan) for licensing information.

---

## 👨‍💼 Support & Contact

- **GitHub Issues:** [Report a bug](https://github.com/avihhan/aura-fit/issues)
- **Author:** [@avihhan](https://github.com/avihhan)
- **Project Started:** January 27, 2026

---

## 🎯 Roadmap

- [ ] Mobile app on App Store & Google Play
- [ ] Payment gateway integration
- [ ] Advanced AI fitness recommendations
- [ ] Social features expansion
- [ ] Multi-language support
- [ ] Enhanced analytics dashboard

---

**Happy coding! 💪**