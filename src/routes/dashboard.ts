import { Router } from 'express';
import { requireAuth, getUserProfile, requireRole, AuthenticatedRequest } from '../middleware/auth';
import { prisma } from '../index';

const router = Router();

// Student Dashboard
router.get('/student', requireAuth, getUserProfile, requireRole(['student']), async (req: AuthenticatedRequest, res) => {
  try {
    const student = req.userProfile;
    
    // Get student's enrollment to find current class
    const enrollment = await prisma.enrollment.findFirst({
      where: { 
        studentId: student.StudentId,
        leftAt: null // Current enrollment
      },
      include: {
        class: {
          include: {
            grade: true
          }
        }
      }
    });

    // Get recent attendance (last 30 days)
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    
    const attendance = await prisma.attendance.findMany({
      where: {
        studentId: student.id,
        date: {
          gte: thirtyDaysAgo
        }
      },
      orderBy: { date: 'desc' },
      take: 10
    });

    // Get pending fees
    const fees = await prisma.fee.findMany({
      where: {
        studentId: student.id,
        status: {
          in: ['UNPAID', 'PARTIAL']
        }
      },
      orderBy: { dueDate: 'asc' }
    });

    // Get recent results
    const results = await prisma.result.findMany({
      where: { studentId: student.id },
      include: {
        exam: {
          include: { subject: true }
        },
        assignment: {
          include: {
            lesson: {
              include: { subject: true }
            }
          }
        }
      },
      orderBy: { id: 'desc' },
      take: 5
    });



    // Get upcoming exams
    const upcomingExams = await prisma.exam.findMany({
      where: {
        classId: enrollment?.classId || 0,
        startTime: {
          gte: new Date()
        }
      },
      include: {
        subject: true,
        class: true
      },
      orderBy: { startTime: 'asc' },
      take: 5
    });

    res.json({
      success: true,
      data: {
        student: {
          ...student,
          class: enrollment?.class,
          grade: enrollment?.class?.grade
        },
        attendance,
        fees: fees.map(fee => ({
          ...fee,
          totalAmount: fee.totalAmount.toString(),
          paidAmount: fee.paidAmount.toString()
        })),
        results,
        upcomingExams,
        stats: {
          attendancePercentage: attendance.length > 0 
            ? Math.round((attendance.filter(a => a.status === 'PRESENT').length / attendance.length) * 100)
            : 0,
          totalFeesDue: fees.reduce((sum, fee) => sum + Number(fee.totalAmount - fee.paidAmount), 0),
          averageGrade: results.length > 0 
            ? Math.round(results.reduce((sum, r) => sum + r.score, 0) / results.length)
            : 0
        }
      }
    });
  } catch (error) {
    console.error('Student dashboard error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to load student dashboard'
    });
  }
});

// Teacher Dashboard
router.get('/teacher', requireAuth, getUserProfile, requireRole(['teacher']), async (req: AuthenticatedRequest, res) => {
  try {
    const teacher = req.userProfile;
    
    // Get teacher's classes
    const classes = await prisma.class.findMany({
      where: { supervisorId: teacher.id },
      include: {
        grade: true,
        students: {
          include: { student: true }
        }
      }
    });

    // Get teacher's lessons for today
    const today = new Date();
    const todayLessons = await prisma.lesson.findMany({
      where: {
        teacherId: teacher.id,
        startTime: {
          gte: new Date(today.setHours(0, 0, 0, 0)),
          lt: new Date(today.setHours(23, 59, 59, 999))
        }
      },
      include: {
        subject: true,
        class: true
      },
      orderBy: { startTime: 'asc' }
    });

    // Get teacher attendance for current month
    const firstDayOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
    const teacherAttendance = await prisma.teacherAttendance.findMany({
      where: {
        teacherId: teacher.id,
        date: {
          gte: firstDayOfMonth
        }
      },
      orderBy: { date: 'desc' }
    });



    // Get upcoming exams for teacher's classes
    const upcomingExams = await prisma.exam.findMany({
      where: {
        classId: {
          in: classes.map(c => c.id)
        },
        startTime: {
          gte: new Date()
        }
      },
      include: {
        subject: true,
        class: true
      },
      orderBy: { startTime: 'asc' },
      take: 10
    });

    res.json({
      success: true,
      data: {
        teacher,
        classes,
        todayLessons,
        teacherAttendance,
        upcomingExams,
        stats: {
          totalClasses: classes.length,
          totalStudents: classes.reduce((sum, c) => sum + c.students.length, 0),
          attendancePercentage: teacherAttendance.length > 0 
            ? Math.round((teacherAttendance.filter(a => a.status === 'PRESENT').length / teacherAttendance.length) * 100)
            : 100,
          pendingTasks: upcomingExams.length
        }
      }
    });
  } catch (error) {
    console.error('Teacher dashboard error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to load teacher dashboard'
    });
  }
});

// Parent Dashboard
router.get('/parent', requireAuth, getUserProfile, requireRole(['parent']), async (req: AuthenticatedRequest, res) => {
  try {
    const parent = req.userProfile;
    
    // Get parent's children
    const children = await prisma.student.findMany({
      where: { parentId: parent.id },
      include: {
        enrollments: {
          where: { leftAt: null },
          include: {
            class: {
              include: { grade: true }
            }
          }
        }
      }
    });

    // Get attendance for all children (last 30 days)
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    
    const attendance = await prisma.attendance.findMany({
      where: {
        studentId: {
          in: children.map(child => child.id)
        },
        date: {
          gte: thirtyDaysAgo
        }
      },
      include: {
        student: true,
        class: true
      },
      orderBy: { date: 'desc' }
    });

    // Get fees for all children
    const fees = await prisma.fee.findMany({
      where: {
        studentId: {
          in: children.map(child => child.id)
        },
        status: {
          in: ['UNPAID', 'PARTIAL']
        }
      },
      include: {
        student: true
      },
      orderBy: { dueDate: 'asc' }
    });



    // Get upcoming exams for children's classes
    const classIds = children.flatMap(child => 
      child.enrollments.map(enrollment => enrollment.classId)
    );
    
    const upcomingExams = await prisma.exam.findMany({
      where: {
        classId: {
          in: classIds
        },
        startTime: {
          gte: new Date()
        }
      },
      include: {
        subject: true,
        class: true
      },
      orderBy: { startTime: 'asc' },
      take: 10
    });

    res.json({
      success: true,
      data: {
        parent,
        children: children.map(child => ({
          ...child,
          currentClass: child.enrollments[0]?.class,
          currentGrade: child.enrollments[0]?.class?.grade
        })),
        attendance,
        fees: fees.map(fee => ({
          ...fee,
          totalAmount: fee.totalAmount.toString(),
          paidAmount: fee.paidAmount.toString()
        })),
        upcomingExams,
        stats: {
          totalChildren: children.length,
          totalFeesDue: fees.reduce((sum, fee) => sum + Number(fee.totalAmount - fee.paidAmount), 0),
          overallAttendancePercentage: attendance.length > 0 
            ? Math.round((attendance.filter(a => a.status === 'PRESENT').length / attendance.length) * 100)
            : 0
        }
      }
    });
  } catch (error) {
    console.error('Parent dashboard error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to load parent dashboard'
    });
  }
});

// Admin Dashboard
router.get('/admin', requireAuth, getUserProfile, async (req: AuthenticatedRequest, res) => {
  try {
    if (req.userRole !== 'admin') {
      return res.status(403).json({
        success: false,
        error: 'Access denied. Admin role required.'
      });
    }

    // Get system statistics
    const [
      totalStudents,
      totalTeachers,
      totalParents,
      totalClasses,
      recentEnrollments,
      recentPayments,
      recentAttendance
    ] = await Promise.all([
      prisma.student.count(),
      prisma.teacher.count(),
      prisma.parent.count(),
      prisma.class.count(),
      prisma.enrollment.findMany({
        where: {
          joinedAt: {
            gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) // Last 7 days
          }
        },
        include: {
          student: true,
          class: true
        },
        orderBy: { joinedAt: 'desc' },
        take: 5
      }),
      prisma.payment.findMany({
        where: {
          date: {
            gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) // Last 7 days
          }
        },
        include: {
          fee: {
            include: {
              student: true
            }
          }
        },
        orderBy: { date: 'desc' },
        take: 5
      }),
      prisma.attendance.findMany({
        where: {
          date: {
            gte: new Date(Date.now() - 24 * 60 * 60 * 1000) // Last 24 hours
          }
        },
        include: {
          class: true
        },
        orderBy: { date: 'desc' },
        take: 5
      })
    ]);

    // Format recent activity
    const recentActivity = [
      ...recentEnrollments.map(enrollment => ({
        id: enrollment.id,
        type: 'enrollment',
        message: `${enrollment.student.name} ${enrollment.student.surname} enrolled in ${enrollment.class.name}`,
        time: enrollment.joinedAt.toISOString()
      })),
      ...recentPayments.map(payment => ({
        id: payment.id,
        type: 'payment',
        message: `Fee payment of $${payment.amount.toString()} received from ${payment.fee.student.name} ${payment.fee.student.surname}`,
        time: payment.date.toISOString()
      })),
      ...recentAttendance.map(attendance => ({
        id: attendance.id.toString(),
        type: 'attendance',
        message: `Attendance marked for ${attendance.class.name}`,
        time: attendance.date.toISOString()
      }))
    ].sort((a, b) => new Date(b.time).getTime() - new Date(a.time).getTime()).slice(0, 10);

    return res.json({
      success: true,
      data: {
        stats: {
          totalStudents,
          totalTeachers,
          totalParents,
          totalClasses
        },
        recentActivity: recentActivity.map(activity => ({
          ...activity,
          time: new Date(activity.time).toLocaleString()
        }))
      }
    });
  } catch (error) {
    console.error('Get admin dashboard error:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to get admin dashboard data'
    });
  }
});

export default router;
