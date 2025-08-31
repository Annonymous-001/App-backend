import { Router } from 'express';
import { requireAuth, AuthenticatedRequest } from '../middleware/auth';
import { clerkClient } from '@clerk/express';
import jwt from 'jsonwebtoken';
import { LoginRequest, LoginResponse, JWTPayload, ProfileResponse, VerifyResponse } from '../types/auth';

const router = Router();

// Login endpoint - validates with Clerk backend SDK and returns JWT
router.post('/login', async (req, res) => {
  console.log('📡 Login request received');
  console.log('📍 Request origin:', req.get('origin'));
  console.log('📍 Request headers:', req.headers);
  console.log('📦 Request body:', req.body);
  
  const { email, password }: LoginRequest = req.body;

  if (!email || !password) {
    res.status(400).json({
      success: false,
      error: 'Email and password are required'
    });
    return;
  }

  try {
    console.log('🔐 Login attempt for:', email);

    // Step 1: Find user by email using Clerk SDK
    const usersResponse = await clerkClient.users.getUserList({
      emailAddress: [email]
    });

    if (usersResponse.data.length === 0) {
      console.log('❌ User not found in Clerk:', email);
      res.status(401).json({
        success: false,
        error: 'Invalid email or password'
      });
      return;
    }

    const user = usersResponse.data[0];
    if (!user) {
      console.log('❌ User not found in Clerk:', email);
      res.status(401).json({
        success: false,
        error: 'Invalid email or password'
      });
      return;
    }
    console.log('✅ User found in Clerk:', user.id);

    // Step 2: Verify password using Clerk SDK
    try {
      await clerkClient.users.verifyPassword({
        userId: user.id,
        password: password
      });
      console.log('✅ Password verified successfully');
    } catch (passwordError: any) {
      console.log('❌ Password verification failed:', passwordError.message);
      res.status(401).json({
        success: false,
        error: 'Invalid email or password'
      });
      return;
    }

    // Step 3: Get user details
    const fullName = user.fullName || user.firstName || 'User';
    const emailAddress = user.emailAddresses[0]?.emailAddress;
    const imageUrl = user.imageUrl;
    
    // Get role from Clerk public metadata
    const role = (user.publicMetadata?.role as string) || 'student';
    
    console.log('📋 User data from Clerk:');
    console.log('  - Full Name:', fullName);
    console.log('  - Email:', emailAddress);
    console.log('  - Role:', role);
    console.log('  - Image URL:', imageUrl);

    // Step 4: Generate JWT token
    const jwtPayload: JWTPayload = {
      userId: user.id,
      email: emailAddress || email, // Fallback to original email if emailAddress is undefined
      role: role
    };
    
    const token = jwt.sign(
      jwtPayload,
      process.env.JWT_SECRET || 'your-secret-key',
      { expiresIn: '7d' }
    );

    console.log('✅ JWT generated for user:', user.id, 'Role:', role);

    // Step 5: Return success response
    res.json({
      success: true,
      data: {
        token,
        user: {
          id: user.id,
          name: fullName,
          email: emailAddress,
          role: role,
          imageUrl: imageUrl,
          profile: {
            id: user.id,
            name: fullName,
            email: emailAddress,
            role: role,
            imageUrl: imageUrl
          }
        }
      }
    });

  } catch (error: any) {
    console.error('❌ Login error:', error.message);
    
    // Handle specific Clerk SDK errors
    if (error.errors?.[0]?.code === 'user_not_found') {
      console.log('❌ User not found in Clerk');
      res.status(401).json({
        success: false,
        error: 'Invalid email or password'
      });
      return;
    }

    if (error.errors?.[0]?.code === 'password_verification_failed') {
      console.log('❌ Password verification failed');
      res.status(401).json({
        success: false,
        error: 'Invalid email or password'
      });
      return;
    }

    console.error('❌ Unexpected error:', error);
    res.status(500).json({
      success: false,
      error: 'Login failed'
    });
  }
});

// Get current user profile
router.get('/me', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    if (!req.userId) {
      res.status(401).json({
        success: false,
        error: 'User ID not found'
      });
      return;
    }

    // Get user data from Clerk
    const user = await clerkClient.users.getUser(req.userId);
    
    const fullName = user.fullName || user.firstName || 'User';
    const emailAddress = user.emailAddresses[0]?.emailAddress;
    const imageUrl = user.imageUrl;
    const role = (user.publicMetadata?.role as string) || req.userRole || 'student';

    res.json({
      success: true,
      data: {
        role: role,
        profile: {
          id: user.id,
          name: fullName,
          email: emailAddress,
          role: role,
          imageUrl: imageUrl
        }
      }
    });
  } catch (error: any) {
    console.error('Get profile error:', error.message);
    
    if (error.errors?.[0]?.code === 'user_not_found') {
      res.status(404).json({
        success: false,
        error: 'User not found'
      });
      return;
    }

    res.status(500).json({
      success: false,
      error: 'Failed to get user profile'
    });
  }
});

// Verify authentication status
router.get('/verify', requireAuth, (req: AuthenticatedRequest, res) => {
  res.json({
    success: true,
    data: {
      authenticated: true,
      userId: req.userId,
      role: req.userRole
    }
  });
});

export default router;
