import { Request, Response, NextFunction } from 'express';
import { getAuth } from '@clerk/express';
import jwt from 'jsonwebtoken';

export interface AuthenticatedRequest extends Request {
  userId?: string;
  userRole?: string;
  userEmail?: string;
  signInId?: string;
  userProfile?: any; // User profile data from database
}

// Middleware to require authentication
export const requireAuth = async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      res.status(401).json({
        success: false,
        error: 'Authorization header required'
      });
      return;
    }

    const token = authHeader.substring(7); // Remove 'Bearer ' prefix

    // First try to verify JWT token (for mobile app)
    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET || 'your-secret-key') as any;
      
      req.userId = decoded.userId;
      req.userRole = decoded.role;
      req.userEmail = decoded.email;
      req.signInId = decoded.signInId;
      
      console.log('✅ JWT token validated for user:', decoded.userId);
      next();
      return;
    } catch (jwtError) {
      console.log('❌ JWT validation failed, trying Clerk token...');
    }

    // Fallback to Clerk token validation (for web apps)
    try {
      const { userId } = await getAuth(req);
      
      if (!userId) {
        res.status(401).json({
          success: false,
          error: 'Invalid token'
        });
        return;
      }

      req.userId = userId;
      console.log('✅ Clerk token validated for user:', userId);
      next();
      return;
    } catch (clerkError) {
      console.error('❌ Clerk token validation failed:', clerkError);
    }

    // If both validations fail
    res.status(401).json({
      success: false,
      error: 'Invalid authentication token'
    });

  } catch (error) {
    console.error('Auth middleware error:', error);
    res.status(500).json({
      success: false,
      error: 'Authentication failed'
    });
  }
};

// Middleware to get user profile from database
export const getUserProfile = async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    if (!req.userId || !req.userRole) {
      return res.status(401).json({
        success: false,
        error: 'User authentication required'
      });
    }

    // Import Prisma client dynamically to avoid circular dependencies
    const { PrismaClient } = await import('@prisma/client');
    const prisma = new PrismaClient();

    let userProfile = null;

    // Get user profile based on role
    switch (req.userRole) {
      case 'student':
        userProfile = await prisma.student.findFirst({
          where: { 
            OR: [
              { id: req.userId },
              { username: req.userEmail }
            ]
          }
        });
        break;
      case 'teacher':
        userProfile = await prisma.teacher.findFirst({
          where: { 
            OR: [
              { id: req.userId },
              { username: req.userEmail }
            ]
          }
        });
        break;
      case 'parent':
        userProfile = await prisma.parent.findFirst({
          where: { 
            OR: [
              { id: req.userId },
              { username: req.userEmail }
            ]
          }
        });
        break;
      case 'admin':
        userProfile = await prisma.admin.findFirst({
          where: { 
            OR: [
              { id: req.userId },
              { username: req.userEmail }
            ]
          }
        });
        break;
      default:
        return res.status(400).json({
          success: false,
          error: 'Invalid user role'
        });
    }

    if (!userProfile) {
      return res.status(404).json({
        success: false,
        error: 'User profile not found'
      });
    }

    req.userProfile = userProfile;
    return next();
  } catch (error) {
    console.error('Get user profile error:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to get user profile'
    });
  }
};

// Middleware to require specific role
export const requireRole = (allowedRoles: string[]) => {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    if (!req.userRole || !allowedRoles.includes(req.userRole)) {
      return res.status(403).json({ 
        success: false, 
        error: 'Insufficient permissions' 
      });
    }
    return next();
  };
};
