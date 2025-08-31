import { Router } from 'express';
import { requireAuth, getUserProfile, requireRole, AuthenticatedRequest } from '../middleware/auth';
import { prisma } from '../index';

const router = Router();

// Route-level logging middleware
router.use((req, res, next) => {
  console.log(`🎓 Student route accessed: ${req.method} ${req.path}`);
    next();
});

// Test endpoint to verify user identification
router.get('/test', requireAuth, getUserProfile, requireRole(['student']), async (req: AuthenticatedRequest, res) => {
  try {
    const student = req.userProfile;
    
    console.log('🧪 Test endpoint - User identification:');
    console.log('  - User ID:', req.userId);
    console.log('  - Student ID:', student.id);
    console.log('  - Student name:', student.name);
    console.log('  - Student username:', student.username);
    
    // Check if there are any attendance records for this student
    const attendanceCount = await prisma.attendance.count({
      where: { studentId: student.id }
    });
    
    // Check if there are any fees for this student
    const feesCount = await prisma.fee.count({
      where: { studentId: student.id }
    });
    
    console.log('  - Attendance records for this student:', attendanceCount);
    console.log('  - Fees for this student:', feesCount);
    
    return res.json({
      success: true,
      data: {
        user: {
          id: req.userId,
          studentId: student.id,
          name: student.name,
          username: student.username
        },
        counts: {
          attendance: attendanceCount,
          fees: feesCount
        }
      }
    });
  } catch (error) {
    console.error('Test endpoint error:', error);
    return res.status(500).json({
      success: false,
      error: 'Test failed'
    });
  }
});

// Get student profile
router.get('/profile', requireAuth, getUserProfile, async (req: AuthenticatedRequest, res) => {
  try {
    if (req.userRole !== 'student') {
      return res.status(403).json({
        success: false,
        error: 'Access denied. Student role required.'
      });
    }

    const student = req.userProfile;
    
    // Get current enrollment with class and grade info
    const enrollment = await prisma.enrollment.findFirst({
      where: { 
        studentId: student.StudentId,
        leftAt: null
      },
      include: {
        class: {
          include: {
            grade: true,
            supervisor: true
          }
        },
        grade: true
      }
    });

    // Get parent info
    const parent = student.parentId ? await prisma.parent.findUnique({
      where: { id: student.parentId }
    }) : null;

    return res.json({
      success: true,
      data: {
        id: student.id,
        name: `${student.name} ${student.surname}`,
        email: student.email,
        phone: student.phone,
        address: student.address,
        StudentId: student.StudentId,
        bloodType: student.bloodType,
        sex: student.sex,
        birthday: student.birthday,
        fatherName: student.fatherName,
        motherName: student.motherName,
        currentClass: enrollment?.class,
        currentGrade: enrollment?.grade,
        supervisor: enrollment?.class?.supervisor,
        parent: parent
      }
    });
  } catch (error) {
    console.error('Get student profile error:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to get student profile'
    });
  }
});

// Get student attendance
router.get('/attendance', requireAuth, getUserProfile, requireRole(['student']), async (req: AuthenticatedRequest, res) => {
  try {
    const student = req.userProfile;
    const { startDate, endDate, limit = '50' } = req.query;

    console.log('🔍 Student attendance request:');
    console.log('  - User ID:', req.userId);
    console.log('  - Student ID:', student.id);
    console.log('  - Student name:', student.name);

    const whereClause: any = {
      studentId: student.id
    };

    if (startDate || endDate) {
      whereClause.date = {};
      if (startDate) whereClause.date.gte = new Date(startDate as string);
      if (endDate) whereClause.date.lte = new Date(endDate as string);
    }

    console.log('🔍 Attendance query where clause:', whereClause);

    const attendance = await prisma.attendance.findMany({
      where: whereClause,
      include: {
        lesson: {
          include: {
            subject: true
          }
        },
        class: true
      },
      orderBy: { date: 'desc' },
      take: parseInt(limit as string)
    });

    console.log('✅ Found attendance records:', attendance.length);
    console.log('  - First record student ID:', attendance[0]?.studentId);
    console.log('  - Last record student ID:', attendance[attendance.length - 1]?.studentId);

    // Calculate statistics
    const stats = {
      total: attendance.length,
      present: attendance.filter(a => a.status === 'PRESENT').length,
      absent: attendance.filter(a => a.status === 'ABSENT').length,
      late: attendance.filter(a => a.status === 'LATE').length,
      percentage: attendance.length > 0 
        ? Math.round((attendance.filter(a => a.status === 'PRESENT').length / attendance.length) * 100)
        : 0
    };

    return res.json({
      success: true,
      data: {
        attendance,
        stats
      }
    });
  } catch (error) {
    console.error('Get student attendance error:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to get attendance records'
    });
  }
});

// Get student fees
router.get('/fees', requireAuth, getUserProfile, requireRole(['student']), async (req: AuthenticatedRequest, res) => {
  try {
    const student = req.userProfile;
    const { status } = req.query;

    console.log('🔍 Student fees request:');
    console.log('  - User ID:', req.userId);
    console.log('  - Student ID:', student.id);
    console.log('  - Student name:', student.name);

    const whereClause: any = {
      studentId: student.id
    };

    if (status) {
      whereClause.status = status;
    }

    console.log('🔍 Fees query where clause:', whereClause);

    const fees = await prisma.fee.findMany({
      where: whereClause,
      include: {
        payments: true
      },
      orderBy: { dueDate: 'asc' }
    });

    console.log('✅ Found fees records:', fees.length);
    console.log('  - First record student ID:', fees[0]?.studentId);
    console.log('  - Last record student ID:', fees[fees.length - 1]?.studentId);

    // Convert BigInt to string for JSON serialization
    const formattedFees = fees.map(fee => ({
      ...fee,
      totalAmount: fee.totalAmount.toString(),
      paidAmount: fee.paidAmount.toString(),
      payments: fee.payments.map(payment => ({
        ...payment,
        amount: payment.amount.toString()
      }))
    }));

    // Calculate statistics
    const stats = {
      total: formattedFees.length,
      paid: formattedFees.filter(f => f.status === 'PAID').length,
      unpaid: formattedFees.filter(f => f.status === 'UNPAID').length,
      partial: formattedFees.filter(f => f.status === 'PARTIAL').length,
      overdue: formattedFees.filter(f => f.status === 'OVERDUE').length,
      totalDue: formattedFees.reduce((sum, fee) => sum + (Number(fee.totalAmount) - Number(fee.paidAmount)), 0)
    };

    return res.json({
      success: true,
      data: {
        fees: formattedFees,
        stats
      }
    });
  } catch (error) {
    console.error('Get student fees error:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to get fee records'
    });
  }
});

// Get student results
router.get('/results', requireAuth, getUserProfile, requireRole(['student']), async (req: AuthenticatedRequest, res) => {
  try {
    const student = req.userProfile;
    const { limit = '20' } = req.query;

    const results = await prisma.result.findMany({
      where: { studentId: student.id },
      include: {
        exam: {
          include: {
            subject: true,
            class: true
          }
        },
        assignment: {
          include: {
            lesson: {
              include: {
                subject: true,
                class: true
              }
            }
          }
        }
      },
      orderBy: { id: 'desc' },
      take: parseInt(limit as string)
    });

    // Calculate statistics
    const examResults = results.filter(r => r.examId);
    const assignmentResults = results.filter(r => r.assignmentId);
    
    const stats = {
      total: results.length,
      exams: examResults.length,
      assignments: assignmentResults.length,
      averageScore: results.length > 0 
        ? Math.round(results.reduce((sum, r) => sum + r.score, 0) / results.length)
        : 0,
      highestScore: results.length > 0 ? Math.max(...results.map(r => r.score)) : 0,
      lowestScore: results.length > 0 ? Math.min(...results.map(r => r.score)) : 0
    };

    return res.json({
      success: true,
      data: {
        results,
        stats
      }
    });
  } catch (error) {
    console.error('Get student results error:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to get result records'
    });
  }
});

// Get student notifications
router.get('/notifications', requireAuth, getUserProfile, requireRole(['student']), async (req: AuthenticatedRequest, res) => {
  try {
    const student = req.userProfile;
    const { limit = '20', unreadOnly = 'false' } = req.query;

    // Get student's current class for class-wide notifications
    const enrollment = await prisma.enrollment.findFirst({
      where: { 
        studentId: student.StudentId,
        leftAt: null
      }
    });

    const whereClause: any = {
      OR: [
        { studentId: student.id },
        { targetRole: 'student' }
      ]
    };

    if (enrollment) {
      whereClause.OR.push({ relatedClassId: enrollment.classId });
    }

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
    console.error('Get student notifications error:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to get notifications'
    });
  }
});

// Mark notification as read
router.patch('/notifications/:id/read', requireAuth, getUserProfile, requireRole(['student']), async (req: AuthenticatedRequest, res) => {
  try {
    const { id } = req.params;
    const student = req.userProfile;

    const notification = await prisma.notification.updateMany({
      where: {
        id,
        OR: [
          { studentId: student.id },
          { targetRole: 'student' }
        ]
      },
      data: {
        isRead: true,
        readAt: new Date()
      }
    });

    if (notification.count === 0) {
      return res.status(404).json({
        success: false,
        error: 'Notification not found'
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

export default router;
