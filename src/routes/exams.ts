import { Router } from 'express';
import { requireAuth, getUserProfile, AuthenticatedRequest } from '../middleware/auth';
import { prisma } from '../index';

const router = Router();

// Get exam results
router.get('/results', requireAuth, getUserProfile, async (req: AuthenticatedRequest, res) => {
  try {
    const { studentId, examId } = req.query;
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
      // Teachers can access results from their classes
      const teacherClasses = await prisma.class.findMany({
        where: { supervisorId: userProfile.id },
        include: {
          students: {
            select: { 
              studentId: true,
              student: { select: { id: true } }
            }
          }
        }
      });
      // Results.studentId references Student.id, so map via enrollment.student.id
      targetStudentIds = teacherClasses.flatMap(cls => 
        cls.students.map(enrollment => enrollment.student?.id).filter((id): id is string => !!id)
      );
    } else if (userRole === 'admin') {
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
        data: { results: [] }
      });
    }

    const whereClause: any = {
      studentId: {
        in: studentId ? [studentId as string] : targetStudentIds
      }
    };

    if (examId) {
      whereClause.examId = parseInt(examId as string);
    }

    const results = await prisma.result.findMany({
      where: whereClause,
      include: {
        student: true,
        exam: {
          include: {
            subject: true,
            class: {
              include: {
                grade: true
              }
            }
          }
        },
        assignment: {
          include: {
            lesson: {
              include: {
                subject: true,
                class: {
                  include: {
                    grade: true
                  }
                }
              }
            }
          }
        }
      },
      orderBy: { id: 'desc' }
    });

   return res.json({
      success: true,
      data: { results }
    });
  } catch (error) {
    console.error('Get exam results error:', error);
   return res.status(500).json({
      success: false,
      error: 'Failed to get exam results'
    });
  }
});

// Get upcoming exams
router.get('/upcoming', requireAuth, getUserProfile, async (req: AuthenticatedRequest, res) => {
  try {
    const { classId } = req.query;
    const userRole = req.userRole;
    const userProfile = req.userProfile;

    let targetClassIds: number[] = [];

    // Determine which classes the user can access
    if (userRole === 'student') {
      const enrollment = await prisma.enrollment.findFirst({
        where: { 
          studentId: userProfile.StudentId,
          leftAt: null
        }
      });
      if (enrollment) {
        targetClassIds = [enrollment.classId];
      }
    } else if (userRole === 'parent') {
      const children = await prisma.student.findMany({
        where: { parentId: userProfile.id },
        include: {
          enrollments: {
            where: { leftAt: null }
          }
        }
      });
      targetClassIds = children.flatMap(child => 
        child.enrollments.map(enrollment => enrollment.classId)
      );
    } else if (userRole === 'teacher') {
      const teacherClasses = await prisma.class.findMany({
        where: { supervisorId: userProfile.id },
        select: { id: true }
      });
      targetClassIds = teacherClasses.map(cls => cls.id);
    } else if (userRole === 'admin') {
      if (classId) {
        targetClassIds = [parseInt(classId as string)];
      } else {
        const allClasses = await prisma.class.findMany({
          select: { id: true }
        });
        targetClassIds = allClasses.map(cls => cls.id);
      }
    }

    if (targetClassIds.length === 0) {
      return res.json({
        success: true,
        data: { exams: [] }
      });
    }

    const exams = await prisma.exam.findMany({
      where: {
        classId: {
          in: classId ? [parseInt(classId as string)] : targetClassIds
        },
        startTime: {
          gte: new Date()
        }
      },
      include: {
        subject: true,
        class: {
          include: {
            grade: true
          }
        }
      },
      orderBy: { startTime: 'asc' }
    });

   return res.json({
      success: true,
      data: { exams }
    });
  } catch (error) {
    console.error('Get upcoming exams error:', error);
     return res.status(500).json({
      success: false,
      error: 'Failed to get upcoming exams'
    });
  }
});

// Get report card for student
router.get('/report-card', requireAuth, getUserProfile, async (req: AuthenticatedRequest, res) => {
  try {
    const { studentId } = req.query;
    const userRole = req.userRole;
    const userProfile = req.userProfile;

    let targetStudentId: string;

    // Determine which student the user can access
    if (userRole === 'student') {
      targetStudentId = userProfile.id;
    } else if (userRole === 'parent') {
      if (!studentId) {
        return res.status(400).json({
          success: false,
          error: 'Student ID is required for parents'
        });
      }
      
      const child = await prisma.student.findFirst({
        where: {
          id: studentId as string,
          parentId: userProfile.id
        }
      });
      
      if (!child) {
        return res.status(403).json({
          success: false,
          error: 'Access denied to this student'
        });
      }
      
      targetStudentId = child.id;
    } else if (userRole === 'admin' || userRole === 'teacher') {
      if (!studentId) {
        return res.status(400).json({
          success: false,
          error: 'Student ID is required'
        });
      }
      targetStudentId = studentId as string;
    } else {
      return res.status(403).json({
        success: false,
        error: 'Access denied'
      });
    }

    // Get student info
    const student = await prisma.student.findUnique({
      where: { id: targetStudentId },
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
        }
      }
    });

    if (!student) {
      return res.status(404).json({
        success: false,
        error: 'Student not found'
      });
    }

    // Get all results for the student
    const results = await prisma.result.findMany({
      where: { studentId: targetStudentId },
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
      orderBy: { id: 'desc' }
    });

    // Group results by subject
    const subjectResults: { [key: string]: any } = {};
    
    results.forEach(result => {
      const subject = result.exam?.subject || result.assignment?.lesson.subject;
      if (subject) {
        if (!subjectResults[subject.name]) {
          subjectResults[subject.name] = {
            subjectId: subject.id,
            subjectName: subject.name,
            examResults: [],
            assignmentResults: [],
            averageScore: 0
          };
        }
        
        if (result.examId) {
          subjectResults[subject.name].examResults.push(result);
        } else {
          subjectResults[subject.name].assignmentResults.push(result);
        }
      }
    });

    // Calculate averages
    Object.keys(subjectResults).forEach(subjectName => {
      const subject = subjectResults[subjectName];
      const allScores = [...subject.examResults, ...subject.assignmentResults];
      if (allScores.length > 0) {
        subject.averageScore = Math.round(
          allScores.reduce((sum: number, result: any) => sum + result.score, 0) / allScores.length
        );
      }
    });

    return res.json({
      success: true,
      data: {
        student: {
          ...student,
          currentClass: student.enrollments[0]?.class,
          currentGrade: student.enrollments[0]?.class?.grade
        },
        subjectResults: Object.values(subjectResults),
        overallAverage: results.length > 0 
          ? Math.round(results.reduce((sum, r) => sum + r.score, 0) / results.length)
          : 0
      }
    });
  } catch (error) {
    console.error('Get report card error:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to get report card'
    });
  }
});

export default router;
