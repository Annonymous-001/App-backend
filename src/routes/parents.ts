import { Router } from 'express';
import { requireAuth, getUserProfile, requireRole, AuthenticatedRequest } from '../middleware/auth';
import { prisma } from '../index';

const router = Router();

// Get parent profile with children
router.get('/profile', requireAuth, getUserProfile, requireRole(['parent']), async (req: AuthenticatedRequest, res) => {
  try {
    const parent = req.userProfile;
    
    const parentData = await prisma.parent.findUnique({
      where: { id: parent.id },
      include: {
        students: {
          include: {
            enrollments: {
              where: { leftAt: null },
              include: {
                class: {
                  include: {
                    grade: true,
                    supervisor: true
                  }
                }
              }
            }
          }
        }
      }
    });

    return res.json({
      success: true,
      data: parentData
    });
  } catch (error) {
    console.error('Get parent profile error:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to get parent profile'
    });
  }
});

// Get children's attendance
router.get('/children/attendance', requireAuth, getUserProfile, requireRole(['parent']), async (req: AuthenticatedRequest, res) => {
  try {
    const parent = req.userProfile;
    const { childId, startDate, endDate, limit = '50' } = req.query;

    // Get parent's children IDs
    const children = await prisma.student.findMany({
      where: { parentId: parent.id },
      select: { id: true, name: true, surname: true }
    });

    if (children.length === 0) {
      return res.json({
        success: true,
        data: { attendance: [], stats: {} }
      });
    }

    const whereClause: any = {
      studentId: {
        in: childId ? [childId as string] : children.map(child => child.id)
      }
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
        },
        class: true
      },
      orderBy: { date: 'desc' },
      take: parseInt(limit as string)
    });

    // Calculate statistics per child
    const stats = children.map(child => {
      const childAttendance = attendance.filter(a => a.studentId === child.id);
      return {
        childId: child.id,
        childName: `${child.name} ${child.surname}`,
        total: childAttendance.length,
        present: childAttendance.filter(a => a.status === 'PRESENT').length,
        absent: childAttendance.filter(a => a.status === 'ABSENT').length,
        late: childAttendance.filter(a => a.status === 'LATE').length,
        percentage: childAttendance.length > 0 
          ? Math.round((childAttendance.filter(a => a.status === 'PRESENT').length / childAttendance.length) * 100)
          : 0
      };
    });

    return res.json({
      success: true,
      data: {
        attendance,
        stats
      }
    });
  } catch (error) {
    console.error('Get children attendance error:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to get attendance records'
    });
  }
});

// Get children's fees
router.get('/children/fees', requireAuth, getUserProfile, requireRole(['parent']), async (req: AuthenticatedRequest, res) => {
  try {
    const parent = req.userProfile;
    const { childId, status } = req.query;

    // Get parent's children IDs
    const children = await prisma.student.findMany({
      where: { parentId: parent.id },
      select: { id: true, name: true, surname: true }
    });

    if (children.length === 0) {
      return res.json({
        success: true,
        data: { fees: [], stats: {} }
      });
    }

    const whereClause: any = {
      studentId: {
        in: childId ? [childId as string] : children.map(child => child.id)
      }
    };

    if (status) {
      whereClause.status = status;
    }

    const fees = await prisma.fee.findMany({
      where: whereClause,
      include: {
        student: true,
        payments: true
      },
      orderBy: { dueDate: 'asc' }
    });

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
    console.error('Get children fees error:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to get fee records'
    });
  }
});

// Get children's results
router.get('/children/results', requireAuth, getUserProfile, requireRole(['parent']), async (req: AuthenticatedRequest, res) => {
  try {
    const parent = req.userProfile;
    const { childId, limit = '20' } = req.query;

    // Get parent's children IDs
    const children = await prisma.student.findMany({
      where: { parentId: parent.id },
      select: { id: true, name: true, surname: true }
    });

    if (children.length === 0) {
      return res.json({
        success: true,
        data: { results: [], stats: {} }
      });
    }

    const results = await prisma.result.findMany({
      where: {
        studentId: {
          in: childId ? [childId as string] : children.map(child => child.id)
        }
      },
      include: {
        student: true,
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

    // Calculate statistics per child
    const stats = children.map(child => {
      const childResults = results.filter(r => r.studentId === child.id);
      return {
        childId: child.id,
        childName: `${child.name} ${child.surname}`,
        total: childResults.length,
        averageScore: childResults.length > 0 
          ? Math.round(childResults.reduce((sum, r) => sum + r.score, 0) / childResults.length)
          : 0,
        highestScore: childResults.length > 0 ? Math.max(...childResults.map(r => r.score)) : 0,
        lowestScore: childResults.length > 0 ? Math.min(...childResults.map(r => r.score)) : 0
      };
    });

    return res.json({
      success: true,
      data: {
        results,
        stats
      }
    });
  } catch (error) {
    console.error('Get children results error:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to get result records'
    });
  }
});



// Get children data (for frontend compatibility)
router.get('/children', requireAuth, getUserProfile, async (req: AuthenticatedRequest, res) => {
  try {
    if (req.userRole !== 'parent') {
      return res.status(403).json({
        success: false,
        error: 'Access denied. Parent role required.'
      });
    }

    const parent = req.userProfile;
    
    const children = await prisma.student.findMany({
      where: { parentId: parent.id },
      include: {
        enrollments: {
          where: { leftAt: null },
          include: {
            class: {
              include: {
                grade: true
              }
            }
          }
        },
        attendances: {
          orderBy: { date: 'desc' },
          take: 30
        },
        fees: {
          where: {
            status: {
              in: ['UNPAID', 'PARTIAL']
            }
          }
        }
      }
    });

    // Format children data for frontend
    const formattedChildren = children.map(child => {
      const currentEnrollment = child.enrollments[0];
      const attendanceRate = child.attendances.length > 0 
        ? Math.round((child.attendances.filter(a => a.status === 'PRESENT').length / child.attendances.length) * 100)
        : 100;
      
      return {
        id: child.id,
        name: `${child.name} ${child.surname}`,
        StudentId: child.StudentId,
        class: currentEnrollment?.class?.name || 'Not Enrolled',
        grade: currentEnrollment?.class?.grade?.level || 'N/A',
        attendance: attendanceRate,
        pendingFees: child.fees.reduce((sum, fee) => sum + Number(fee.totalAmount - fee.paidAmount), 0),
        email: child.email,
        phone: child.phone
      };
    });

    return res.json({
      success: true,
      data: formattedChildren
    });
  } catch (error) {
    console.error('Get children error:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to get children data'
    });
  }
});

export default router;
