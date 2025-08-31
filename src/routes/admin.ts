import { Router } from 'express';
import { requireAuth, getUserProfile, requireRole, AuthenticatedRequest } from '../middleware/auth';
import { prisma } from '../index';

const router = Router();

// Get all students
router.get('/students', requireAuth, getUserProfile, requireRole(['admin']), async (req: AuthenticatedRequest, res) => {
  try {
    const students = await prisma.student.findMany({
      include: {
        enrollments: {
          where: { leftAt: null },
          include: {
            class: {
              include: { grade: true }
            }
          }
        },
        parent: true
      },
      orderBy: { name: 'asc' }
    });

    const formattedStudents = students.map(student => ({
      id: student.id,
      name: student.name,
      surname: student.surname,
      email: student.email,
      StudentId: student.StudentId,
      currentClass: student.enrollments[0]?.class || null,
      parent: student.parent ? {
        name: student.parent.name,
        phone: student.parent.phone
      } : null
    }));

    return res.json({
      success: true,
      data: formattedStudents
    });
  } catch (error) {
    console.error('Get students error:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to get students'
    });
  }
});

// Get all teachers
router.get('/teachers', requireAuth, getUserProfile, requireRole(['admin']), async (req: AuthenticatedRequest, res) => {
  try {
    const teachers = await prisma.teacher.findMany({
      include: {
        subjects: true,
        classes: {
          include: {
            students: {
              include: {
                student: true
              }
            }
          }
        }
      },
      orderBy: { name: 'asc' }
    });

    return res.json({
      success: true,
      data: teachers
    });
  } catch (error) {
    console.error('Get teachers error:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to get teachers'
    });
  }
});

// Get all classes
router.get('/classes', requireAuth, getUserProfile, requireRole(['admin']), async (req: AuthenticatedRequest, res) => {
  try {
    const classes = await prisma.class.findMany({
      include: {
        grade: true,
        students: {
          include: {
            student: true
          }
        },
        supervisor: true
      },
      orderBy: { name: 'asc' }
    });

    return res.json({
      success: true,
      data: classes
    });
  } catch (error) {
    console.error('Get classes error:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to get classes'
    });
  }
});

// Get attendance for a specific class
router.get('/attendance/:classId', requireAuth, getUserProfile, requireRole(['admin']), async (req: AuthenticatedRequest, res) => {
  try {
    const { classId } = req.params;
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const attendance = await prisma.attendance.findMany({
      where: {
        classId: parseInt(classId),
        date: {
          gte: today
        }
      },
      include: {
        student: true
      },
      orderBy: { date: 'desc' }
    });

    return res.json({
      success: true,
      data: attendance
    });
  } catch (error) {
    console.error('Get attendance error:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to get attendance'
    });
  }
});

// Get teacher attendance for today
router.get('/teacher-attendance', requireAuth, getUserProfile, requireRole(['admin']), async (req: AuthenticatedRequest, res) => {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const teacherAttendance = await prisma.teacherAttendance.findMany({
      where: {
        date: {
          gte: today
        }
      },
      include: {
        teacher: true
      },
      orderBy: { date: 'desc' }
    });

    return res.json({
      success: true,
      data: teacherAttendance
    });
  } catch (error) {
    console.error('Get teacher attendance error:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to get teacher attendance'
    });
  }
});

// Mark attendance for a student
router.post('/attendance/mark', requireAuth, getUserProfile, requireRole(['admin']), async (req: AuthenticatedRequest, res) => {
  try {
    const { studentId, classId, status, date } = req.body;

    // Check if attendance already exists for this student on this date
    const existingAttendance = await prisma.attendance.findFirst({
      where: {
        studentId,
        classId: parseInt(classId),
        date: new Date(date)
      }
    });

    if (existingAttendance) {
      // Update existing attendance
      await prisma.attendance.update({
        where: { id: existingAttendance.id },
        data: { status }
      });
    } else {
      // Create new attendance record
      await prisma.attendance.create({
        data: {
          studentId,
          classId: parseInt(classId),
          status,
          date: new Date(date)
        }
      });
    }

    return res.json({
      success: true,
      message: 'Attendance marked successfully'
    });
  } catch (error) {
    console.error('Mark attendance error:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to mark attendance'
    });
  }
});

// Mark attendance for a teacher
router.post('/teacher-attendance/mark', requireAuth, getUserProfile, requireRole(['admin']), async (req: AuthenticatedRequest, res) => {
  try {
    const { teacherId, status, date } = req.body;

    // Check if teacher attendance already exists for this teacher on this date
    const existingAttendance = await prisma.teacherAttendance.findFirst({
      where: {
        teacherId,
        date: new Date(date)
      }
    });

    if (existingAttendance) {
      // Update existing attendance
      await prisma.teacherAttendance.update({
        where: { id: existingAttendance.id },
        data: { status }
      });
    } else {
      // Create new attendance record
      await prisma.teacherAttendance.create({
        data: {
          teacherId,
          status,
          date: new Date(date)
        }
      });
    }

    return res.json({
      success: true,
      message: 'Teacher attendance marked successfully'
    });
  } catch (error) {
    console.error('Mark teacher attendance error:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to mark teacher attendance'
    });
  }
});

// Get system statistics
router.get('/stats', requireAuth, getUserProfile, requireRole(['admin']), async (req: AuthenticatedRequest, res) => {
  try {
    const [
      totalStudents,
      totalTeachers,
      totalParents,
      totalClasses,
      totalFees,
      totalPayments
    ] = await Promise.all([
      prisma.student.count(),
      prisma.teacher.count(),
      prisma.parent.count(),
      prisma.class.count(),
      prisma.fee.count(),
      prisma.payment.count()
    ]);

    return res.json({
      success: true,
      data: {
        totalStudents,
        totalTeachers,
        totalParents,
        totalClasses,
        totalFees,
        totalPayments
      }
    });
  } catch (error) {
    console.error('Get stats error:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to get statistics'
    });
  }
});

export default router;
