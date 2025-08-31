import { Router } from 'express';
import { requireAuth, getUserProfile, requireRole, AuthenticatedRequest } from '../middleware/auth';
import { prisma } from '../index';

const router = Router();

// Get teacher profile
router.get('/profile', requireAuth, getUserProfile, requireRole(['teacher']), async (req: AuthenticatedRequest, res) => {
  try {
    const teacher = req.userProfile;
    
    // Get teacher's subjects and classes
    const teacherData = await prisma.teacher.findUnique({
      where: { id: teacher.id },
      include: {
        subjects: true,
        classes: {
          include: {
            grade: true,
            students: {
              include: {
                student: true
              }
            }
          }
        }
      }
    });

    return res.json({
      success: true,
      data: teacherData
    });
  } catch (error) {
    console.error('Get teacher profile error:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to get teacher profile'
    });
  }
});

// Get teacher's classes
router.get('/classes', requireAuth, getUserProfile, requireRole(['teacher']), async (req: AuthenticatedRequest, res) => {
  try {
    const teacher = req.userProfile;
    
    const classes = await prisma.class.findMany({
      where: { 
        OR: [
          { supervisorId: teacher.id },
          { lessons: { some: { teacherId: teacher.id } } }
        ]
      },
      include: {
        grade: true,
        students: {
          include: {
            student: true
          }
        },
        lessons: {
          where: { teacherId: teacher.id },
          include: {
            subject: true
          }
        }
      }
    });

    return res.json({
      success: true,
      data: classes
    });
  } catch (error) {
    console.error('Get teacher classes error:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to get classes'
    });
  }
});

// Get teacher's lessons
router.get('/lessons', requireAuth, getUserProfile, requireRole(['teacher']), async (req: AuthenticatedRequest, res) => {
  try {
    const teacher = req.userProfile;
    const { date, classId } = req.query;

    const whereClause: any = {
      teacherId: teacher.id
    };

    if (date) {
      const targetDate = new Date(date as string);
      const startOfDay = new Date(targetDate.setHours(0, 0, 0, 0));
      const endOfDay = new Date(targetDate.setHours(23, 59, 59, 999));
      
      whereClause.startTime = {
        gte: startOfDay,
        lte: endOfDay
      };
    }

    if (classId) {
      whereClause.classId = parseInt(classId as string);
    }

    const lessons = await prisma.lesson.findMany({
      where: whereClause,
      include: {
        subject: true,
        class: {
          include: {
            grade: true
          }
        },
        attendances: {
          include: {
            student: true
          }
        }
      },
      orderBy: { startTime: 'asc' }
    });

    return res.json({
      success: true,
      data: lessons
    });
  } catch (error) {
    console.error('Get teacher lessons error:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to get lessons'
    });
  }
});

// Get teacher attendance (student attendance for teacher's classes)
router.get('/attendance', requireAuth, getUserProfile, requireRole(['teacher']), async (req: AuthenticatedRequest, res) => {
  try {
    const teacher = req.userProfile;
    const { startDate, endDate, limit = '50' } = req.query;

    // Get teacher's class IDs (both supervised and teaching)
    const teacherClasses = await prisma.class.findMany({
      where: { 
        OR: [
          { supervisorId: teacher.id },
          { lessons: { some: { teacherId: teacher.id } } }
        ]
      },
      select: { id: true }
    });

    const classIds = teacherClasses.map(c => c.id);

    const whereClause: any = {
      classId: { in: classIds }
    };

    if (startDate || endDate) {
      whereClause.date = {};
      if (startDate) whereClause.date.gte = new Date(startDate as string);
      if (endDate) whereClause.date.lte = new Date(endDate as string);
    }

    const attendance = await prisma.attendance.findMany({
      where: whereClause,
      include: {
        student: true,
        lesson: {
          include: {
            subject: true
          }
        }
      },
      orderBy: { date: 'desc' },
      take: parseInt(limit as string)
    });

    // Calculate statistics
    const stats = {
      total: attendance.length,
      present: attendance.filter(a => a.status === 'PRESENT').length,
      absent: attendance.filter(a => a.status === 'ABSENT').length,
      late: attendance.filter(a => a.status === 'LATE').length,
      percentage: attendance.length > 0 
        ? Math.round((attendance.filter(a => a.status === 'PRESENT').length / attendance.length) * 100)
        : 100
    };

    return res.json({
      success: true,
      data: {
        attendance,
        stats
      }
    });
  } catch (error) {
    console.error('Get teacher attendance error:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to get attendance records'
    });
  }
});

// Mark student attendance (for teachers)
router.post('/mark-attendance', requireAuth, getUserProfile, requireRole(['teacher']), async (req: AuthenticatedRequest, res) => {
  try {
    const teacher = req.userProfile;
    const { lessonId, classId, attendanceRecords } = req.body;

    // Verify teacher owns this lesson/class
    const lesson = await prisma.lesson.findFirst({
      where: {
        id: lessonId,
        teacherId: teacher.id
      }
    });

    if (!lesson && classId) {
      // Check if teacher supervises this class
      const teacherClass = await prisma.class.findFirst({
        where: {
          id: classId,
          supervisorId: teacher.id
        }
      });
      
      if (!teacherClass) {
        return res.status(403).json({
          success: false,
          error: 'You do not have permission to mark attendance for this class'
        });
      }
    }

    // Normalize status to Prisma enum (PRESENT | ABSENT | LATE)
    const normalizeStatus = (s: string) => {
      const up = String(s).toUpperCase();
      return ['PRESENT','ABSENT','LATE'].includes(up) ? up : 'PRESENT';
    };

    // Create attendance records
    const attendanceData = attendanceRecords.map((record: any) => ({
      date: new Date(),
      studentId: record.studentId,
      lessonId: lessonId || null,
      classId: classId || lesson?.classId,
      status: normalizeStatus(record.status) as any,
      inTime: record.inTime ? new Date(record.inTime) : null,
      outTime: record.outTime ? new Date(record.outTime) : null
    }));

    const createdAttendance = await prisma.attendance.createMany({
      data: attendanceData
    });

    return res.json({
      success: true,
      message: `Marked attendance for ${createdAttendance.count} students`,
      data: { count: createdAttendance.count }
    });
  } catch (error) {
    console.error('Mark attendance error:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to mark attendance'
    });
  }
});

// Get class attendance report
router.get('/class/:classId/attendance', requireAuth, getUserProfile, requireRole(['teacher']), async (req: AuthenticatedRequest, res) => {
  try {
    const teacher = req.userProfile;
    const { classId } = req.params;
    const { date } = req.query;

    // Verify teacher has access to this class
    const teacherClass = await prisma.class.findFirst({
      where: {
        id: parseInt(classId as string),
        OR: [
          { supervisorId: teacher.id },
          { lessons: { some: { teacherId: teacher.id } } }
        ]
      }
    });

    if (!teacherClass) {
      return res.status(403).json({
        success: false,
        error: 'You do not have access to this class'
      });
    }

    const whereClause: any = {
      classId: parseInt(classId as string)
    };

    if (date) {
      const targetDate = new Date(date as string);
      const startOfDay = new Date(targetDate.setHours(0, 0, 0, 0));
      const endOfDay = new Date(targetDate.setHours(23, 59, 59, 999));
      
      whereClause.date = {
        gte: startOfDay,
        lte: endOfDay
      };
    }

    const attendance = await prisma.attendance.findMany({
      where: whereClause,
      include: {
        student: true,
        lesson: {
          include: {
            subject: true
          }
        }
      },
      orderBy: [
        { date: 'desc' },
        { student: { name: 'asc' } }
      ]
    });

    return res.json({
      success: true,
      data: attendance
    });
  } catch (error) {
    console.error('Get class attendance error:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to get class attendance'
    });
  }
});

// Get teacher notifications
router.get('/notifications', requireAuth, getUserProfile, requireRole(['teacher']), async (req: AuthenticatedRequest, res) => {
  try {
    const teacher = req.userProfile;
    const { limit = '20', unreadOnly = 'false' } = req.query;

    const whereClause: any = {
      OR: [
        { teacherId: teacher.id },
        { targetRole: 'teacher' }
      ]
    };

    if (unreadOnly === 'true') {
      whereClause.isRead = false;
    }

    const notifications = await prisma.notification.findMany({
      where: whereClause,
      orderBy: { createdAt: 'desc' },
      take: parseInt(limit as string)
    });

    return res.json({
      success: true,
      data: {
        notifications,
        unreadCount: notifications.filter(n => !n.isRead).length
      }
    });
  } catch (error) {
    console.error('Get teacher notifications error:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to get notifications'
    });
  }
});

// Test endpoint for debugging teacher authentication
router.get('/test', requireAuth, getUserProfile, requireRole(['teacher']), async (req: AuthenticatedRequest, res) => {
  try {
    const teacher = req.userProfile;
    
    return res.json({
      success: true,
      data: {
        message: 'Teacher authentication working!',
        teacherId: teacher.id,
        teacherName: teacher.name,
        userRole: req.userRole,
        clerkUserId: req.userId
      }
    });
  } catch (error) {
    console.error('Teacher test endpoint error:', error);
    return res.status(500).json({
      success: false,
      error: 'Test endpoint failed'
    });
  }
});

export default router;
