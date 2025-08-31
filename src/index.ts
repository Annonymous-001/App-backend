import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import dotenv from 'dotenv';

import { PrismaClient } from '@prisma/client';

// Import routes
import authRoutes from './routes/auth';
import studentRoutes from './routes/students';
import teacherRoutes from './routes/teachers';
import parentRoutes from './routes/parents';
import dashboardRoutes from './routes/dashboard';
import attendanceRoutes from './routes/attendance';
import feeRoutes from './routes/fees';
import examRoutes from './routes/exams';

import adminRoutes from './routes/admin';

// Load environment variables
dotenv.config();

// Debug: Check if Clerk environment variables are loaded
console.log('🔧 Environment check:');
console.log('  - CLERK_SECRET_KEY:', process.env.CLERK_SECRET_KEY ? '✅ Set' : '❌ Missing');
console.log('  - CLERK_PUBLISHABLE_KEY:', process.env.CLERK_PUBLISHABLE_KEY ? '✅ Set' : '❌ Missing');
console.log('  - NODE_ENV:', process.env.NODE_ENV || 'development');

// Initialize Prisma Client
export const prisma = new PrismaClient();

// Initialize Express app
const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(helmet());
app.use(morgan('combined'));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// CORS configuration for Expo and mobile apps
const allowedOrigins = [
  'exp://localhost:8081',
  'exp://127.0.0.1:8081',
  'exp://192.168.101.73:8081',
  'exp://192.168.101.75:8081',
  'http://localhost:8081',
  'http://127.0.0.1:8081',
  'http://192.168.101.73:8081',
  'http://192.168.101.75:8081',
  'http://localhost:3000',
  'http://127.0.0.1:3000',
  'http://localhost:19006', // Expo dev server
  'http://192.168.101.75:19006', // Expo dev server on your IP
  process.env.FRONTEND_URL || 'exp://192.168.101.75:8081',
];

app.use(cors({
  origin: function (origin: string | undefined, callback: (err: Error | null, allow?: boolean) => void) {
    // Allow requests with no origin (mobile apps, curl, Postman)
    if (!origin) return callback(null, true);

    console.log('🌐 CORS check for origin:', origin);
    
    if (allowedOrigins.indexOf(origin) !== -1) {
      console.log('✅ CORS allowed for:', origin);
      callback(null, true);
    } else {
      console.log('❌ CORS blocked for:', origin);
      callback(new Error(`CORS policy: Origin ${origin} not allowed`));
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'x-clerk-auth-token'],
}));


// Note: Clerk middleware is now handled manually in auth routes

// Request logging middleware
app.use((req, res, next) => {
  console.log(`📡 ${req.method} ${req.path} - ${new Date().toISOString()}`);
  next();
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ 
    status: 'OK', 
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'development'
  });
});

// Lightweight ping for devices
app.get('/api/ping', (req, res) => {
  res.json({ ok: true, message: 'pong' });
});

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/students', studentRoutes);
app.use('/api/teachers', teacherRoutes);
app.use('/api/parents', parentRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/attendance', attendanceRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/fees', feeRoutes);
app.use('/api/exams', examRoutes);


// Error handling middleware
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error('Error:', err);
  
  if (err.name === 'UnauthorizedError') {
    return res.status(401).json({ 
      success: false, 
      error: 'Unauthorized access' 
    });
  }
  
  return res.status(500).json({ 
    success: false, 
    error: process.env.NODE_ENV === 'development' ? err.message : 'Internal server error' 
  });
});

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({ 
    success: false, 
    error: 'Route not found' 
  });
});

// Start server
async function startServer() {
  try {
    // Test database connection
    await prisma.$connect();
    console.log('✅ Database connected successfully');
    
    app.listen(Number(PORT), '0.0.0.0', () => {
      console.log(`🚀 Server running on port ${PORT}`);
      console.log(`📱 Health check (local): http://localhost:${PORT}/health`);
      console.log('📡 If testing from a phone, visit http://<YOUR_PC_IP>:' + PORT + '/health');
    });
  } catch (error) {
    console.error('❌ Failed to start server:', error);
    process.exit(1);
  }
}

// Graceful shutdown
process.on('SIGINT', async () => {
  console.log('\n🛑 Shutting down server...');
  await prisma.$disconnect();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  console.log('\n🛑 Shutting down server...');
  await prisma.$disconnect();
  process.exit(0);
});

startServer();

