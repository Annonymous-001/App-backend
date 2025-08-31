import { Router } from 'express';
import { requireAuth, getUserProfile, AuthenticatedRequest, requireRole } from '../middleware/auth';
import { prisma } from '../index';

const router = Router();

// Route-level logging middleware
router.use((req, res, next) => {
  console.log(`📊 Attendance route accessed: ${req.method} ${req.path}`);
  next();
});

// Get classes for the current user (for teachers and admins)
router.get('/classes', requireAuth, getUserProfile, async (req: AuthenticatedRequest, res) => {
  try {
    const userRole = req.userRole;
    const userProfile = req.userProfile;

    let classes: any[] = [];

    if (userRole === 'teacher') {
      classes = await prisma.class.findMany({
        where: { supervisorId: userProfile.id },
        include: {
          grade: true,
          students: {
            include: {
              student: {
                select: {
                  id: true,
                  name: true,
                  surname: true,
                  StudentId: true
                }
              }
            }
          }
        }
      });
    } else if (userRole === 'admin') {
      classes = await prisma.class.findMany({
        include: {
          grade: true,
          students: {
            include: {
              student: {
                select: {
                  id: true,
                  name: true,
                  surname: true,
                  StudentId: true
                }
              }
            }
          }
        }
      });
    }

    return res.json({
      success: true,
      data: { classes }
    });
  } catch (error) {
    console.error('Get classes error:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to get classes'
    });
  }
});

// Get attendance summary statistics
router.get('/summary', requireAuth, getUserProfile, async (req: AuthenticatedRequest, res) => {
  try {
    const { startDate, endDate, classId } = req.query;
    const userRole = req.userRole;
    const userProfile = req.userProfile;

    let targetStudentIds: string[] = [];

    // Determine which students the user can access
    if (userRole === 'student') {
      targetStudentIds = [userProfile.id];
    } else if (userRole === 'parent') {
      const children = await prisma.student.findMany({
        where: { parentId: userProfile.id },
        select: { id: true }
      });
      targetStudentIds = children.map(child => child.id);
    } else if (userRole === 'teacher') {
      const teacherClasses = await prisma.class.findMany({
        where: { supervisorId: userProfile.id },
        include: {
          students: {
            select: { studentId: true }
          }
        }
      });
      targetStudentIds = teacherClasses.flatMap(cls => 
        cls.students.map(enrollment => enrollment.studentId)
      );
    } else if (userRole === 'admin') {
      const allStudents = await prisma.student.findMany({
        select: { id: true }
      });
      targetStudentIds = allStudents.map(s => s.id);
    }

    if (targetStudentIds.length === 0) {
      return res.json({
        success: true,
        data: { 
          summary: [],
          overallStats: {
            totalStudents: 0,
            averageAttendance: 0,
            excellentAttendance: 0,
            poorAttendance: 0
          }
        }
      });
    }

    const whereClause: any = {
      studentId: {
        in: targetStudentIds
      }
    };

    if (startDate || endDate) {
      whereClause.date = {};
      if (startDate) whereClause.date.gte = new Date(startDate as string);
      if (endDate) whereClause.date.lte = new Date(endDate as string);
    }

    if (classId && classId !== 'all') {
      whereClause.classId = parseInt(classId as string);
    }

    // Get all attendance records for the period
    const attendanceRecords = await prisma.attendance.findMany({
      where: whereClause,
      include: {
        student: {
          select: {
            id: true,
            name: true,
            surname: true,
            StudentId: true
          }
        },
        class: {
          include: {
            grade: true
          }
        }
      },
      orderBy: [
        { date: 'desc' },
        { student: { name: 'asc' } }
      ]
    });

    // Calculate summary statistics for each student
    const studentSummary = new Map();

    attendanceRecords.forEach(record => {
      const studentId = record.studentId;
      if (!studentSummary.has(studentId)) {
        studentSummary.set(studentId, {
          studentId: studentId,
          studentName: `${record.student.name} ${record.student.surname}`,
          rollNumber: record.student.StudentId,
          totalDays: 0,
          presentDays: 0,
          absentDays: 0,
          lateDays: 0,
          percentage: 0
        });
      }

      const summary = studentSummary.get(studentId);
      summary.totalDays++;
      
      switch (record.status) {
        case 'PRESENT':
          summary.presentDays++;
          break;
        case 'ABSENT':
          summary.absentDays++;
          break;
        case 'LATE':
          summary.lateDays++;
          break;
      }
    });

    // Calculate percentages
    const summaryArray = Array.from(studentSummary.values()).map(summary => ({
      ...summary,
      percentage: summary.totalDays > 0 ? Math.round((summary.presentDays / summary.totalDays) * 100) : 0
    }));

    // Calculate overall statistics
    const totalStudents = summaryArray.length;
    const averageAttendance = totalStudents > 0 
      ? summaryArray.reduce((sum, student) => sum + student.percentage, 0) / totalStudents 
      : 0;
    const excellentAttendance = summaryArray.filter(s => s.percentage >= 95).length;
    const poorAttendance = summaryArray.filter(s => s.percentage < 75).length;

    return res.json({
      success: true,
      data: {
        summary: summaryArray,
        overallStats: {
          totalStudents,
          averageAttendance: Math.round(averageAttendance * 10) / 10,
          excellentAttendance,
          poorAttendance
        }
      }
    });
  } catch (error) {
    console.error('Get attendance summary error:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to get attendance summary'
    });
  }
});

// Get attendance trend data for charts
router.get('/trend', requireAuth, getUserProfile, async (req: AuthenticatedRequest, res) => {
  try {
    const { startDate, endDate, classId, period = 'week' } = req.query;
    const userRole = req.userRole;
    const userProfile = req.userProfile;

    let targetStudentIds: string[] = [];

    // Determine which students the user can access
    if (userRole === 'student') {
      targetStudentIds = [userProfile.id];
    } else if (userRole === 'parent') {
      const children = await prisma.student.findMany({
        where: { parentId: userProfile.id },
        select: { id: true }
      });
      targetStudentIds = children.map(child => child.id);
    } else if (userRole === 'teacher') {
      const teacherClasses = await prisma.class.findMany({
        where: { supervisorId: userProfile.id },
        include: {
          students: {
            select: { studentId: true }
          }
        }
      });
      targetStudentIds = teacherClasses.flatMap(cls => 
        cls.students.map(enrollment => enrollment.studentId)
      );
    } else if (userRole === 'admin') {
      const allStudents = await prisma.student.findMany({
        select: { id: true }
      });
      targetStudentIds = allStudents.map(s => s.id);
    }

    if (targetStudentIds.length === 0) {
      return res.json({
        success: true,
        data: { trend: [] }
      });
    }

    const whereClause: any = {
      studentId: {
        in: targetStudentIds
      }
    };

    if (startDate || endDate) {
      whereClause.date = {};
      if (startDate) whereClause.date.gte = new Date(startDate as string);
      if (endDate) whereClause.date.lte = new Date(endDate as string);
    }

    if (classId && classId !== 'all') {
      whereClause.classId = parseInt(classId as string);
    }

    const attendanceRecords = await prisma.attendance.findMany({
      where: whereClause,
      select: {
        date: true,
        status: true
      },
      orderBy: { date: 'asc' }
    });

    // Group by date and calculate daily attendance percentage
    const dailyStats = new Map();

    attendanceRecords.forEach(record => {
      const dateKey = record.date.toISOString().split('T')[0];
      if (!dailyStats.has(dateKey)) {
        dailyStats.set(dateKey, {
          date: dateKey,
          total: 0,
          present: 0,
          absent: 0,
          late: 0
        });
      }

      const stats = dailyStats.get(dateKey);
      stats.total++;
      
      switch (record.status) {
        case 'PRESENT':
          stats.present++;
          break;
        case 'ABSENT':
          stats.absent++;
          break;
        case 'LATE':
          stats.late++;
          break;
      }
    });

    // Convert to trend data format
    const trend = Array.from(dailyStats.values())
      .map(stats => ({
        x: new Date(stats.date).toLocaleDateString('en-US', { 
          weekday: 'short',
          month: 'short',
          day: 'numeric'
        }),
        y: stats.total > 0 ? Math.round((stats.present / stats.total) * 100) : 0
      }))
      .sort((a, b) => new Date(a.x).getTime() - new Date(b.x).getTime());

    return res.json({
      success: true,
      data: { trend }
    });
  } catch (error) {
    console.error('Get attendance trend error:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to get attendance trend'
    });
  }
});

// Get attendance report (for students and parents)
router.get('/report', requireAuth, getUserProfile, async (req: AuthenticatedRequest, res) => {
  try {
    const { studentId, startDate, endDate, classId } = req.query;
    const userRole = req.userRole;
    const userProfile = req.userProfile;

    let targetStudentIds: string[] = [];

    // Determine which students the user can access
    if (userRole === 'student') {
      targetStudentIds = [userProfile.id];
    } else if (userRole === 'parent') {
      const children = await prisma.student.findMany({
        where: { parentId: userProfile.id },
        select: { id: true }
      });
      targetStudentIds = children.map(child => child.id);
    } else if (userRole === 'teacher') {
      // Teachers can access students from their classes
      const teacherClasses = await prisma.class.findMany({
        where: { supervisorId: userProfile.id },
        include: {
          students: {
            select: { studentId: true }
          }
        }
      });
      targetStudentIds = teacherClasses.flatMap(cls => 
        cls.students.map(enrollment => enrollment.studentId)
      );
    } else if (userRole === 'admin') {
      // Admins can access all students
      if (studentId) {
        targetStudentIds = [studentId as string];
      } else {
        const allStudents = await prisma.student.findMany({
          select: { id: true }
        });
        targetStudentIds = allStudents.map(s => s.id);
      }
    }

    if (targetStudentIds.length === 0) {
      return res.json({
        success: true,
        data: { attendance: [] }
      });
    }

    const whereClause: any = {
      studentId: {
        in: studentId ? [studentId as string] : targetStudentIds
      }
    };

    if (startDate || endDate) {
      whereClause.date = {};
      if (startDate) whereClause.date.gte = new Date(startDate as string);
      if (endDate) whereClause.date.lte = new Date(endDate as string);
    }

    if (classId && classId !== 'all') {
      whereClause.classId = parseInt(classId as string);
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
        class: {
          include: {
            grade: true
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
      data: { attendance }
    });
  } catch (error) {
    console.error('Get attendance report error:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to get attendance report'
    });
  }
});

// Mark attendance
router.post('/mark', requireAuth, getUserProfile, requireRole(['teacher']), async (req: AuthenticatedRequest, res) => {
  try {
    const { studentId, classId, date, status } = req.body;
    const userProfile = req.userProfile;
    const userRole = req.userRole;

    if (userRole !== 'teacher') {
      return res.status(403).json({ success: false, error: 'Unauthorized' });
    }

    const attendance = await prisma.attendance.create({
      data: {
        studentId,
        classId: parseInt(classId as string),
        date: new Date(date),
        status
      }
    });

    return res.json({ success: true, data: attendance });
  } catch (error) {
    console.error('Mark attendance error:', error);
    return res.status(500).json({ success: false, error: 'Failed to mark attendance' });
  }
});

export default router;
