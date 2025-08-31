import { Router } from 'express';
import { requireAuth, getUserProfile, AuthenticatedRequest } from '../middleware/auth';
import { prisma } from '../index';

const router = Router();

// Get notifications for current user
router.get('/', requireAuth, getUserProfile, async (req: AuthenticatedRequest, res) => {
  try {
    const { limit = '20', unreadOnly = 'false', type } = req.query;
    const userRole = req.userRole;
    const userProfile = req.userProfile;

    let whereClause: any = {
      OR: []
    };

    // Add role-based filters
    if (userRole === 'student') {
      whereClause.OR.push(
        { studentId: userProfile.id },
        { targetRole: 'student' }
      );
      
      // Add class-wide notifications
      const enrollment = await prisma.enrollment.findFirst({
        where: { 
          studentId: userProfile.StudentId,
          leftAt: null
        }
      });
      
      if (enrollment) {
        whereClause.OR.push({ relatedClassId: enrollment.classId });
      }
    } else if (userRole === 'teacher') {
      whereClause.OR.push(
        { teacherId: userProfile.id },
        { targetRole: 'teacher' }
      );
    } else if (userRole === 'parent') {
      whereClause.OR.push(
        { parentId: userProfile.id },
        { targetRole: 'parent' }
      );
      
      // Add child-specific notifications
      const children = await prisma.student.findMany({
        where: { parentId: userProfile.id },
        select: { id: true }
      });
      
      if (children.length > 0) {
        whereClause.OR.push({
          studentId: {
            in: children.map(child => child.id)
          }
        });
      }
    } else if (userRole === 'admin') {
      whereClause.OR.push(
        { adminId: userProfile.id },
        { targetRole: 'admin' }
      );
    } else if (userRole === 'accountant') {
      whereClause.OR.push(
        { accountantId: userProfile.id },
        { targetRole: 'accountant' }
      );
    }

    // Filter by read status
    if (unreadOnly === 'true') {
      whereClause.isRead = false;
    }

    // Filter by type
    if (type) {
      whereClause.type = type;
    }

    const notifications = await prisma.notification.findMany({
      where: whereClause,
      include: {
        student: true,
        teacher: true,
        parent: true,
        relatedClass: true,
        relatedEvent: true,
        relatedAnnouncement: true,
        relatedFee: {
          include: {
            student: true
          }
        }
      },
      orderBy: { createdAt: 'desc' },
      take: parseInt(limit as string)
    });

    // Get unread count
    const unreadCount = await prisma.notification.count({
      where: {
        ...whereClause,
        isRead: false
      }
    });

    return res.json({
      success: true,
      data: {
        notifications,
        unreadCount
      }
    });
  } catch (error) {
    console.error('Get notifications error:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to get notifications'
    });
  }
});

// Mark notification as read
router.patch('/:id/read', requireAuth, getUserProfile, async (req: AuthenticatedRequest, res) => {
  try {
    const { id } = req.params;
    const userRole = req.userRole;
    const userProfile = req.userProfile;

    // Build where clause to ensure user has access to this notification
    let whereClause: any = {
      id,
      OR: []
    };

    if (userRole === 'student') {
      whereClause.OR.push(
        { studentId: userProfile.id },
        { targetRole: 'student' }
      );
    } else if (userRole === 'teacher') {
      whereClause.OR.push(
        { teacherId: userProfile.id },
        { targetRole: 'teacher' }
      );
    } else if (userRole === 'parent') {
      whereClause.OR.push(
        { parentId: userProfile.id },
        { targetRole: 'parent' }
      );
      
      // Add child-specific notifications
      const children = await prisma.student.findMany({
        where: { parentId: userProfile.id },
        select: { id: true }
      });
      
      if (children.length > 0) {
        whereClause.OR.push({
          studentId: {
            in: children.map(child => child.id)
          }
        });
      }
    } else if (userRole === 'admin') {
      whereClause.OR.push(
        { adminId: userProfile.id },
        { targetRole: 'admin' }
      );
    } else if (userRole === 'accountant') {
      whereClause.OR.push(
        { accountantId: userProfile.id },
        { targetRole: 'accountant' }
      );
    }

    const result = await prisma.notification.updateMany({
      where: whereClause,
      data: {
        isRead: true,
        readAt: new Date()
      }
    });

    if (result.count === 0) {
      return res.status(404).json({
        success: false,
        error: 'Notification not found or access denied'
      });
    }

    return res.json({
      success: true,
      message: 'Notification marked as read'
    });
  } catch (error) {
    console.error('Mark notification read error:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to mark notification as read'
    });
  }
});

// Mark all notifications as read
router.patch('/read-all', requireAuth, getUserProfile, async (req: AuthenticatedRequest, res) => {
  try {
    const userRole = req.userRole;
    const userProfile = req.userProfile;

    let whereClause: any = {
      OR: [],
      isRead: false
    };

    // Add role-based filters
    if (userRole === 'student') {
      whereClause.OR.push(
        { studentId: userProfile.id },
        { targetRole: 'student' }
      );
    } else if (userRole === 'teacher') {
      whereClause.OR.push(
        { teacherId: userProfile.id },
        { targetRole: 'teacher' }
      );
    } else if (userRole === 'parent') {
      whereClause.OR.push(
        { parentId: userProfile.id },
        { targetRole: 'parent' }
      );
      
      const children = await prisma.student.findMany({
        where: { parentId: userProfile.id },
        select: { id: true }
      });
      
      if (children.length > 0) {
        whereClause.OR.push({
          studentId: {
            in: children.map(child => child.id)
          }
        });
      }
    } else if (userRole === 'admin') {
      whereClause.OR.push(
        { adminId: userProfile.id },
        { targetRole: 'admin' }
      );
    } else if (userRole === 'accountant') {
      whereClause.OR.push(
        { accountantId: userProfile.id },
        { targetRole: 'accountant' }
      );
    }

    const result = await prisma.notification.updateMany({
      where: whereClause,
      data: {
        isRead: true,
        readAt: new Date()
      }
    });

    res.json({
      success: true,
      message: `Marked ${result.count} notifications as read`
    });
  } catch (error) {
    console.error('Mark all notifications read error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to mark notifications as read'
    });
  }
});

// Get unread count
router.get('/unread-count', requireAuth, getUserProfile, async (req: AuthenticatedRequest, res) => {
  try {
    const userRole = req.userRole;
    const userProfile = req.userProfile;

    let whereClause: any = {
      OR: [],
      isRead: false
    };

    // Add role-based filters
    if (userRole === 'student') {
      whereClause.OR.push(
        { studentId: userProfile.id },
        { targetRole: 'student' }
      );
      
      const enrollment = await prisma.enrollment.findFirst({
        where: { 
          studentId: userProfile.StudentId,
          leftAt: null
        }
      });
      
      if (enrollment) {
        whereClause.OR.push({ relatedClassId: enrollment.classId });
      }
    } else if (userRole === 'teacher') {
      whereClause.OR.push(
        { teacherId: userProfile.id },
        { targetRole: 'teacher' }
      );
    } else if (userRole === 'parent') {
      whereClause.OR.push(
        { parentId: userProfile.id },
        { targetRole: 'parent' }
      );
      
      const children = await prisma.student.findMany({
        where: { parentId: userProfile.id },
        select: { id: true }
      });
      
      if (children.length > 0) {
        whereClause.OR.push({
          studentId: {
            in: children.map(child => child.id)
          }
        });
      }
    } else if (userRole === 'admin') {
      whereClause.OR.push(
        { adminId: userProfile.id },
        { targetRole: 'admin' }
      );
    } else if (userRole === 'accountant') {
      whereClause.OR.push(
        { accountantId: userProfile.id },
        { targetRole: 'accountant' }
      );
    }

    const count = await prisma.notification.count({
      where: whereClause
    });

    res.json({
      success: true,
      data: { count }
    });
  } catch (error) {
    console.error('Get unread count error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get unread count'
    });
  }
});

export default router;
