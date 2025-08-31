import { Request, Response, NextFunction } from 'express';
import { prisma } from '../index';
import { getAuth, clerkClient, verifyToken } from '@clerk/express';

// Debug: Check Clerk configuration at import time
console.log('🔧 Clerk middleware import check:');
console.log('  - getAuth function:', typeof getAuth);
console.log('  - clerkClient function:', typeof clerkClient);
console.log('  - verifyToken function:', typeof verifyToken);

export interface AuthenticatedRequest extends Request {
  userId?: string;
  userRole?: string;
  userProfile?: any;
}

// Middleware to require authentication
export const requireAuth = async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    console.log('🔐 Auth middleware - Headers:', req.headers);
    console.log('🔐 Auth middleware - Authorization header:', req.headers.authorization);
    
    // Debug: Check if Clerk is properly configured
    console.log('🔐 Auth middleware - Environment check:');
    console.log('  - CLERK_SECRET_KEY exists:', !!process.env.CLERK_SECRET_KEY);
    console.log('  - CLERK_PUBLISHABLE_KEY exists:', !!process.env.CLERK_PUBLISHABLE_KEY);
    
    // Try to get userId from Clerk middleware
    let userId: string | null = null;
    
    try {
      const auth = getAuth(req);
      userId = auth.userId;
      console.log('🔐 Auth middleware - getAuth result:', auth);
    } catch (getAuthError) {
      console.log('❌ getAuth failed:', getAuthError);
    }
    
    // If getAuth failed, try manual token verification
    if (!userId && req.headers.authorization) {
      try {
        const token = req.headers.authorization.replace('Bearer ', '');
        console.log('🔐 Trying manual token verification...');
        
        const payload = await verifyToken(token, {
          secretKey: process.env.CLERK_SECRET_KEY!,
        });
        userId = payload.sub;
        console.log('🔐 Manual verification successful, userId:', userId);
      } catch (verifyError: any) {
        console.log('❌ Manual verification failed:', verifyError.message);
        
        // Handle specific token errors
        if (verifyError.reason === 'token-expired') {
          console.log('🕐 Token is expired - user needs to refresh their session');
          return res.status(401).json({ 
            success: false, 
            error: 'Token expired. Please sign in again.',
            code: 'TOKEN_EXPIRED'
          });
        } else if (verifyError.reason === 'token-invalid') {
          console.log('❌ Token is invalid');
          return res.status(401).json({ 
            success: false, 
            error: 'Invalid token. Please sign in again.',
            code: 'TOKEN_INVALID'
          });
        }
      }
    }
    
    console.log('🔐 Auth middleware - Final userId:', userId);
    
    if (!userId) {
      console.log('❌ No userId found in request');
      console.log('❌ This usually means Clerk middleware is not properly configured');
      return res.status(401).json({ 
        success: false, 
        error: 'Authentication required' 
      });
    }
    
    req.userId = userId;
    console.log('✅ Authentication successful for userId:', userId);
    return next();
  } catch (error) {
    console.error('❌ Auth middleware error:', error);
    return res.status(401).json({ 
      success: false, 
      error: 'Invalid authentication' 
    });
  }
};

// Middleware to get user profile and role
export const getUserProfile = async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    if (!req.userId) {
      return res.status(401).json({ 
        success: false, 
        error: 'User ID not found' 
      });
    }

    console.log('🔍 Looking for user with ID:', req.userId);

    // Try to find user in each table based on Clerk userId
    console.log('🔍 Searching for user with Clerk ID:', req.userId);
    
    const [student, teacher, parent, admin, accountant] = await Promise.all([
      prisma.student.findFirst({ where: { id: req.userId } }), // Use id field for students
      prisma.teacher.findFirst({ where: { id: req.userId } }), // Use id field for teachers
      prisma.parent.findFirst({ where: { id: req.userId } }), // Use id field for parents
      prisma.admin.findFirst({ where: { id: req.userId } }), // Use id field for admins
      prisma.accountant.findFirst({ where: { id: req.userId } }) // Use id field for accountants
    ]);

    console.log('🔍 Database search results:');
    console.log('  - Student found:', student ? `${student.name} (ID: ${student.id}, StudentId: ${student.StudentId})` : 'No student found');
    console.log('  - Teacher found:', teacher ? `${teacher.name} (ID: ${teacher.id})` : 'No teacher found');
    console.log('  - Parent found:', parent ? `${parent.name} (ID: ${parent.id})` : 'No parent found');
    console.log('  - Admin found:', admin ? `${admin.username} (ID: ${admin.id})` : 'No admin found');
    console.log('  - Accountant found:', accountant ? `${accountant.name} (ID: ${accountant.id})` : 'No accountant found');
    
    // Debug: Check if any students exist with this username
    if (!student) {
      const allStudents = await prisma.student.findMany({
        select: { id: true, username: true, name: true, StudentId: true }
      });
      console.log('🔍 All students in database:', allStudents.length);
      const matchingStudent = allStudents.find(s => s.username === req.userId);
      if (matchingStudent) {
        console.log('✅ Found matching student in full list:', matchingStudent);
      } else {
        console.log('❌ No student found with username:', req.userId);
        console.log('🔍 Sample usernames in database:', allStudents.slice(0, 5).map(s => s.username));
      }
    }

    if (student) {
      req.userRole = 'student';
      req.userProfile = student;
      console.log('✅ Found student:', student.name, 'with ID:', student.id);
    } else if (teacher) {
      req.userRole = 'teacher';
      req.userProfile = teacher;
      console.log('✅ Found teacher:', teacher.name);
    } else if (parent) {
      req.userRole = 'parent';
      req.userProfile = parent;
      console.log('✅ Found parent:', parent.name);
    } else if (admin) {
      req.userRole = 'admin';
      req.userProfile = admin;
      console.log('✅ Found admin:', admin.username);
    } else if (accountant) {
      req.userRole = 'accountant';
      req.userProfile = accountant;
      console.log('✅ Found accountant:', accountant.name);
    } else {
      console.log('❌ User not found in database, checking Clerk public metadata for role...');

      try {
        const clerkUser = await clerkClient.users.getUser(req.userId);
        const publicRole = (clerkUser.publicMetadata?.role as string | undefined)?.toLowerCase();

        if (publicRole && ['student','teacher','parent','admin','accountant'].includes(publicRole)) {
          req.userRole = publicRole;
          
          // For students, try to find them in the database using the Clerk userId as id
          if (publicRole === 'student') {
            const student = await prisma.student.findFirst({
              where: { id: req.userId }
            });
            
            if (student) {
              req.userProfile = student;
              console.log('✅ Found student in database using Clerk userId as username:', student.name);
            } else {
              // Create a temporary profile but this won't work for data access
              req.userProfile = {
                id: req.userId, // Use Clerk userId as temporary ID
                username: req.userId,
                name: clerkUser.fullName || clerkUser.firstName || 'User',
                email: clerkUser.primaryEmailAddress?.emailAddress,
              };
              console.log('⚠️ Student not found in database, using temporary profile');
            }
          } else {
            req.userProfile = {
              username: req.userId,
              name: clerkUser.fullName || clerkUser.firstName || 'User',
              email: clerkUser.primaryEmailAddress?.emailAddress,
            };
          }
          console.log('✅ Using role from Clerk public metadata:', publicRole);
        } else {
          console.log('❌ No valid role in Clerk metadata and user not found in database.');
          console.log('❌ User must be manually added to the database with appropriate role.');
          
          // Return 404 instead of creating a default profile
          return res.status(404).json({ 
            success: false, 
            error: 'User not found in database. Please contact administrator to add your account.' 
          });
        }
      } catch (clerkError) {
        console.error('❌ Error fetching Clerk user:', clerkError);
        // Return error instead of creating default profile
        return res.status(500).json({ 
          success: false, 
          error: 'Failed to verify user account. Please contact administrator.' 
        });
      }
    }

    return next();
  } catch (error) {
    console.error('❌ Get user profile error:', error);
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
