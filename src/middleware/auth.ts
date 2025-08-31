import { Request, Response, NextFunction } from 'express';
import { getAuth } from '@clerk/express';
import jwt from 'jsonwebtoken';

export interface AuthenticatedRequest extends Request {
  userId?: string;
  userRole?: string;
  userEmail?: string;
  signInId?: string;
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

// Middleware to get user profile (deprecated - now handled in routes)
export const getUserProfile = async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  // This middleware is no longer needed as we get user data directly in routes
  next();
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
