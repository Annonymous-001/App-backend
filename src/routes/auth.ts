import { Router } from 'express';
import { requireAuth, getUserProfile, AuthenticatedRequest } from '../middleware/auth';

const router = Router();

// Get current user profile
router.get('/me', requireAuth, getUserProfile, (req: AuthenticatedRequest, res) => {
  try {
  res.json({
      success: true,
      data: {
        userId: req.userId,
        role: req.userRole,
        profile: req.userProfile
      }
    });
  } catch (error) {
    console.error('Get profile error:', error);
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
      userId: req.userId
    }
  });
});

export default router;
