# School Management Backend API

A minimal Express.js backend API for the School Management mobile app, designed to work with your existing web database and Clerk authentication.

## Features

- 🔐 Clerk Authentication Integration
- 📊 Role-based API access (Student, Teacher, Parent, Admin)
- 🗄️ Connects to existing Prisma database
- 📱 Optimized for mobile app consumption
- 🔄 Real-time data synchronization
- 🛡️ Secure API endpoints

## Quick Start

### 1. Install Dependencies

```bash
cd backend
npm install
```

### 2. Environment Setup

Copy the environment example file:

```bash
cp env.example .env
```

Update `.env` with your actual values:

```env
# Database - Use the same URL from your web project
DATABASE_URL="postgresql://username:password@localhost:5432/school_db"

# Clerk Authentication - Get these from your Clerk dashboard
CLERK_PUBLISHABLE_KEY="pk_test_your_publishable_key"
CLERK_SECRET_KEY="sk_test_your_secret_key"

# Server Configuration
PORT=3001
NODE_ENV=development

# CORS - Update with your Expo development server URL
FRONTEND_URL="exp://192.168.1.100:8081"  # Replace with your local IP
```

### 3. Database Setup

Since you're using the existing database, just generate the Prisma client:

```bash
npm run db:generate
```

### 4. Start Development Server

```bash
npm run dev
```

The server will start on `http://localhost:3001`

## API Endpoints

### Authentication
- `GET /api/auth/me` - Get current user profile
- `GET /api/auth/verify` - Verify authentication status

### Dashboard
- `GET /api/dashboard/student` - Student dashboard data
- `GET /api/dashboard/teacher` - Teacher dashboard data  
- `GET /api/dashboard/parent` - Parent dashboard data

### Students
- `GET /api/students/profile` - Get student profile
- `GET /api/students/attendance` - Get attendance records
- `GET /api/students/fees` - Get fee records
- `GET /api/students/results` - Get exam/assignment results
- `GET /api/students/notifications` - Get notifications

### Teachers
- `GET /api/teachers/profile` - Get teacher profile
- `GET /api/teachers/classes` - Get assigned classes
- `GET /api/teachers/lessons` - Get lessons
- `GET /api/teachers/attendance` - Get teacher attendance
- `POST /api/teachers/mark-attendance` - Mark student attendance

### Parents
- `GET /api/parents/profile` - Get parent profile with children
- `GET /api/parents/children/attendance` - Get children's attendance
- `GET /api/parents/children/fees` - Get children's fees
- `GET /api/parents/children/results` - Get children's results

### General
- `GET /api/attendance/report` - Attendance reports
- `GET /api/fees/history` - Fee history
- `GET /api/fees/pending` - Pending fees
- `POST /api/fees/payment` - Record payment
- `GET /api/exams/results` - Exam results
- `GET /api/exams/upcoming` - Upcoming exams
- `GET /api/notifications` - User notifications

## Authentication Flow

The API uses Clerk for authentication. Users must:

1. Sign in through the mobile app using Clerk
2. The mobile app sends the Clerk auth token with each request
3. The backend validates the token and maps it to the user's role in the database

### User Mapping

Users are mapped based on their Clerk `userId` matching the `username` field in the database:

- Students: `Student.username = clerkUserId`
- Teachers: `Teacher.username = clerkUserId`
- Parents: `Parent.username = clerkUserId`
- Admins: `Admin.username = clerkUserId`

## Mobile App Integration

Update your mobile app's API configuration:

```typescript
// Frontend/lib/constants.ts
export const APP_CONFIG = {
  apiBaseUrl: 'http://192.168.1.100:3001/api', // Your backend URL
  // ... other config
};
```

## Security Features

- ✅ Clerk JWT validation
- ✅ Role-based access control
- ✅ CORS protection
- ✅ Request validation
- ✅ Error handling
- ✅ Rate limiting ready

## Database Schema

The backend uses the same Prisma schema as your web project, ensuring data consistency across both applications.

## Development

### Available Scripts

- `npm run dev` - Start development server with hot reload
- `npm run build` - Build for production
- `npm start` - Start production server
- `npm run db:generate` - Generate Prisma client
- `npm run db:push` - Push schema changes to database

### Project Structure

```
backend/
├── src/
│   ├── index.ts              # Main server file
│   ├── middleware/
│   │   └── auth.ts           # Authentication middleware
│   └── routes/
│       ├── auth.ts           # Auth routes
│       ├── dashboard.ts      # Dashboard routes
│       ├── students.ts       # Student routes
│       ├── teachers.ts       # Teacher routes
│       ├── parents.ts        # Parent routes
│       ├── attendance.ts     # Attendance routes
│       ├── fees.ts           # Fee routes
│       ├── exams.ts          # Exam routes
│       └── notifications.ts  # Notification routes
├── prisma/
│   └── schema.prisma         # Database schema
└── package.json
```

## Production Deployment

1. Set `NODE_ENV=production`
2. Update CORS origins for your production mobile app
3. Use a process manager like PM2
4. Set up proper logging
5. Configure SSL/HTTPS

## Troubleshooting

### Common Issues

1. **CORS Errors**: Update `FRONTEND_URL` in `.env` with your correct Expo development server URL
2. **Database Connection**: Ensure `DATABASE_URL` matches your web project's database
3. **Authentication**: Verify Clerk keys are correct and users exist in the database
4. **Port Conflicts**: Change `PORT` in `.env` if 3001 is occupied

### Health Check

Visit `http://localhost:3001/health` to verify the server is running.

## License

This project is part of your School Management System.

