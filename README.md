# Trainer Portal - Full Stack Application

A comprehensive trainer management system with separate portals for administrators and trainers, featuring real-time updates, Gmail OTP authentication, and program management.

## Features

### Admin Portal
- **Gmail OTP Authentication**: Secure login with Gmail-based OTP verification
- **Trainer Management**: Create, view, edit, and deactivate trainer accounts
- **Program Management**: Create and manage training programs with categorization
- **Dashboard Analytics**: Real-time statistics and charts
- **Export Functionality**: Export trainers and programs data to CSV
- **Real-time Updates**: WebSocket integration for live notifications

### Trainer Portal
- **Secure Authentication**: Username/password based login
- **Profile Management**: Update personal information and certifications
- **Program Viewing**: Browse available training programs
- **Dashboard**: Personal statistics and recent activities
- **Responsive Design**: Mobile-friendly interface

## Tech Stack

### Backend
- **FastAPI**: Modern Python web framework
- **PostgreSQL**: Primary database (Supabase compatible)
- **SQLAlchemy**: ORM for database operations
- **JWT**: Authentication and authorization
- **Socket.IO**: Real-time WebSocket communication
- **Nodemailer**: Gmail SMTP for OTP emails

### Frontend (Admin)
- **React 18**: Modern UI framework
- **Vite**: Fast build tool
- **TailwindCSS**: Utility-first CSS framework
- **React Hook Form**: Form management
- **Recharts**: Data visualization
- **Lucide React**: Icon library

### Frontend (Trainer)
- **React 18**: Modern UI framework
- **Vite**: Fast build tool
- **TailwindCSS**: Utility-first CSS framework
- **React Hook Form**: Form management
- **Lucide React**: Icon library

## Project Structure

```
RTC_Human_Resource/
├── backend/                 # FastAPI backend
│   ├── main.py             # Main application entry point
│   ├── database.py         # Database configuration
│   ├── models.py           # SQLAlchemy models
│   ├── schemas.py          # Pydantic schemas
│   ├── routers/            # API route handlers
│   │   ├── auth.py         # Authentication routes
│   │   ├── trainers.py     # Trainer management
│   │   ├── programs.py     # Program management
│   │   └── admin.py        # Admin-specific routes
│   ├── socket_manager.py   # WebSocket handling
│   ├── requirements.txt    # Python dependencies
│   └── .env.example       # Environment variables template
├── frontend_admin/         # Admin React frontend
│   ├── src/
│   │   ├── components/     # Reusable components
│   │   ├── contexts/       # React contexts
│   │   ├── pages/          # Page components
│   │   ├── App.jsx         # Main App component
│   │   └── main.jsx        # Entry point
│   ├── package.json        # Node.js dependencies
│   ├── vite.config.js      # Vite configuration
│   └── .env.example       # Environment variables template
├── frontend_user/          # Trainer React frontend
│   ├── src/
│   │   ├── components/     # Reusable components
│   │   ├── contexts/       # React contexts
│   │   ├── pages/          # Page components
│   │   ├── App.jsx         # Main App component
│   │   └── main.jsx        # Entry point
│   ├── package.json        # Node.js dependencies
│   ├── vite.config.js      # Vite configuration
│   └── .env.example       # Environment variables template
├── seed_data.sql           # Initial database seed data
└── README.md               # This file
```

## Installation and Setup

### Prerequisites
- Node.js 16+ 
- Python 3.8+
- PostgreSQL database (or Supabase account)
- Gmail account with App Password enabled

### 1. Database Setup

#### Option A: Local PostgreSQL
```sql
-- Create database
CREATE DATABASE trainer_portal;

-- Create user (optional)
CREATE USER trainer_user WITH PASSWORD 'your_password';
GRANT ALL PRIVILEGES ON DATABASE trainer_portal TO trainer_user;
```

#### Option B: Supabase
1. Create a new Supabase project
2. Go to SQL Editor and run the `seed_data.sql` file
3. Note your database URL and API keys

### 2. Backend Setup

```bash
# Navigate to backend directory
cd backend

# Create virtual environment
python -m venv venv

# Activate virtual environment
# Windows:
venv\Scripts\activate
# macOS/Linux:
source venv/bin/activate

# Install dependencies
pip install -r requirements.txt

# Create .env file from template
cp .env.example .env

# Edit .env file with your configuration
# DATABASE_URL, SMTP credentials, JWT secret, etc.
```

### 3. Frontend Setup

#### Admin Portal
```bash
# Navigate to admin frontend
cd frontend_admin

# Install dependencies
npm install

# Create .env file from template
cp .env.example .env.local

# Edit .env.local if needed (usually defaults work)
```

#### Trainer Portal
```bash
# Navigate to trainer frontend
cd frontend_user

# Install dependencies
npm install

# Create .env file from template
cp .env.example .env.local

# Edit .env.local if needed (usually defaults work)
```

### 4. Gmail SMTP Setup

1. Enable 2-factor authentication on your Gmail account
2. Generate an App Password:
   - Go to Google Account settings
   - Security → 2-Step Verification → App passwords
   - Generate a new app password for "Mail"
3. Add the Gmail address and app password to your backend `.env` file

### 5. Database Seeding

Run the SQL commands from `seed_data.sql` in your database:
- If using Supabase: Copy-paste into the SQL Editor
- If using local PostgreSQL: `psql -d trainer_portal -f seed_data.sql`

## Running the Application

### Method 1: Concurrent Development (Recommended)

Open three terminal windows:

```bash
# Terminal 1: Backend
cd backend
python -m uvicorn main:app --reload --host 0.0.0.0 --port 5000

# Terminal 2: Admin Frontend
cd frontend_admin
npm run dev

# Terminal 3: Trainer Frontend  
cd frontend_user
npm run dev
```

### Method 2: Individual Services

**Backend:**
```bash
cd backend
python -m uvicorn main:app --reload --host 0.0.0.0 --port 5000
```

**Admin Frontend:**
```bash
cd frontend_admin
npm run dev
```

**Trainer Frontend:**
```bash
cd frontend_user
npm run dev
```

## Access Points

- **Admin Portal**: http://localhost:3001
- **Trainer Portal**: http://localhost:3000
- **Backend API**: http://localhost:5000
- **API Documentation**: http://localhost:5000/docs

## Default Login Credentials

After seeding the database:

### Admin Accounts
- **Username**: `admin`
- **Password**: `password` (hashed in database)

### Trainer Accounts
- **Username**: `trainer1`
- **Password**: `password` (hashed in database)

Additional trainer accounts: `trainer2` through `trainer10` with same password.

## Gmail OTP Setup for Admin Login

### Prerequisites
1. Enable 2-Step Verification on your Gmail account: https://myaccount.google.com/security
2. Generate an App Password: https://myaccount.google.com/apppasswords
   - Select "Mail" and "Windows Computer"
   - Copy the 16-character password
3. Set the environment variable: `SMTP_PASSWORD=<your-app-password>`
4. Restart the backend server

### Registering Email for Admin Access
1. Your email must be added to the `verified_admin_emails` table in the database:
   ```sql
   INSERT INTO verified_admin_emails (email, is_active) VALUES
   ('your-email@gmail.com', true);
   ```
2. On the admin login page, click "Send OTP"
3. Enter your verified Gmail address
4. You'll receive a 6-digit OTP code in your email
5. Enter the OTP code to verify your email
6. After verification, you can log in with your admin credentials

## API Endpoints

### Authentication
- `POST /api/auth/login` - User login
- `POST /api/auth/send-otp` - Send OTP to email
- `POST /api/auth/verify-otp` - Verify OTP code
- `GET /api/auth/me` - Get current user info

### Trainers (Admin only)
- `GET /api/trainers/` - List all trainers
- `POST /api/trainers/` - Create new trainer
- `GET /api/trainers/{id}` - Get trainer details
- `PUT /api/trainers/{id}` - Update trainer
- `DELETE /api/trainers/{id}` - Deactivate trainer
- `PUT /api/trainers/profile` - Update own profile (trainers)

### Programs
- `GET /api/programs/` - List all programs
- `POST /api/programs/` - Create new program (Admin)
- `GET /api/programs/{id}` - Get program details
- `PUT /api/programs/{id}` - Update program (Admin)
- `DELETE /api/programs/{id}` - Deactivate program (Admin)

### Admin
- `GET /api/admin/dashboard/stats` - Dashboard statistics
- `GET /api/admin/notifications` - Get notifications
- `POST /api/admin/notifications` - Create notification
- `GET /api/admin/trainers/export` - Export trainers data
- `GET /api/admin/programs/export` - Export programs data

## WebSocket Events

### Client → Server
- `register_user` - Register user for real-time updates

### Server → Client
- `notification` - Real-time notification
- `program_update` - Program update notification
- `trainer_update` - Trainer update notification (admin only)

## Environment Variables

### Backend (.env)
```env
# Database
DATABASE_URL=postgresql://postgres:password@localhost:5432/trainer_portal

# JWT
SECRET_KEY=your-super-secret-jwt-key
ACCESS_TOKEN_EXPIRE_MINUTES=30

# Gmail SMTP
SMTP_USERNAME=your-gmail@gmail.com
SMTP_PASSWORD=your-app-password

# Supabase (if using)
SUPABASE_URL=your-supabase-url
SUPABASE_ANON_KEY=your-supabase-anon-key
```

### Frontend (.env.local)
```env
VITE_API_BASE_URL=http://localhost:5000
VITE_SOCKET_URL=http://localhost:5000
```

## Development Notes

### Code Quality
- ESLint configured for both frontends
- Prettier recommended for code formatting
- TypeScript interfaces defined for API responses

### Security
- JWT tokens for authentication
- Password hashing with bcrypt
- CORS properly configured
- Input validation on all endpoints

### Performance
- React.memo for component optimization
- Efficient database queries
- WebSocket connection management
- Lazy loading where appropriate

## Troubleshooting

### Common Issues

1. **Database Connection Error**
   - Check DATABASE_URL in backend/.env
   - Ensure PostgreSQL is running
   - Verify database exists

2. **Gmail OTP Not Working**
   - Ensure your email is registered in the `verified_admin_emails` table
   - Enable 2-factor authentication on Gmail: https://myaccount.google.com/security
   - Generate App Password:
     1. Go to https://myaccount.google.com/apppasswords
     2. Select "Mail" and "Windows Computer" 
     3. Copy the 16-character generated password
   - Set environment variable: `SMTP_PASSWORD=your-app-password`
   - Restart backend server
   - Check backend console for detailed error messages
   - If using `.env` file, copy `.env.example` to `.env` and fill in your credentials

3. **CORS Issues**
   - Verify ALLOWED_ORIGINS in backend/.env
   - Check frontend URLs match allowed origins

4. **Socket Connection Issues**
   - Ensure backend is running on port 5000
   - Check firewall settings
   - Verify WebSocket URLs in frontend

5. **Build Errors**
   - Clear node_modules and reinstall: `rm -rf node_modules package-lock.json && npm install`
   - Check Node.js version compatibility
   - Verify all environment variables are set

### Logs and Debugging

- Backend logs shown in terminal
- Frontend console logs in browser dev tools
- Network requests visible in browser Network tab
- Database queries can be logged with SQLAlchemy echo=True

## Production Deployment

### Backend
1. Set environment variables for production
2. Use a production WSGI server (Gunicorn/Uvicorn)
3. Configure proper database connection pooling
4. Set up SSL certificates
5. Configure reverse proxy (Nginx)

### Frontend
1. Build for production: `npm run build`
2. Serve static files with Nginx or CDN
3. Configure proper caching headers
4. Set up environment-specific API URLs

### Database
1. Use managed PostgreSQL service
2. Set up regular backups
3. Configure connection limits
4. Monitor performance metrics

## Contributing

1. Fork the repository
2. Create feature branch: `git checkout -b feature-name`
3. Make changes and test thoroughly
4. Commit changes: `git commit -am 'Add feature'`
5. Push to branch: `git push origin feature-name`
6. Submit pull request

## License

This project is licensed under the MIT License - see the LICENSE file for details.

## Support

For support and questions:
- Create an issue in the repository
- Check the troubleshooting section above
- Review the API documentation at `/docs` endpoint
