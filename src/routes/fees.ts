import { Router } from 'express';
import { requireAuth, getUserProfile, requireRole, AuthenticatedRequest } from '../middleware/auth';
import { prisma } from '../index';

const router = Router();

// Route-level logging middleware
router.use((req, res, next) => {
  console.log(`💰 Fees route accessed: ${req.method} ${req.path}`);
  next();
});

// Get fee history
router.get('/history', requireAuth, getUserProfile, async (req: AuthenticatedRequest, res) => {
  try {
    const { studentId } = req.query;
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
    } else if (userRole === 'admin' || userRole === 'accountant') {
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
        data: { fees: [] }
      });
    }

    const fees = await prisma.fee.findMany({
      where: {
        studentId: {
          in: studentId ? [studentId as string] : targetStudentIds
        }
      },
      include: {
        student: true,
        payments: {
          orderBy: { date: 'desc' }
        }
      },
      orderBy: { createdAt: 'desc' }
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

   return res.json({
      success: true,
      data: { fees: formattedFees }
    });
  } catch (error) {
    console.error('Get fee history error:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to get fee history'
    });
  }
});

// Get pending fees
router.get('/pending', requireAuth, getUserProfile, async (req: AuthenticatedRequest, res) => {
  try {
    const { studentId } = req.query;
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
    } else if (userRole === 'admin' || userRole === 'accountant') {
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
        data: { fees: [] }
      });
    }

    const fees = await prisma.fee.findMany({
      where: {
        studentId: {
          in: studentId ? [studentId as string] : targetStudentIds
        },
        status: {
          in: ['UNPAID', 'PARTIAL']
        }
      },
      include: {
        student: true,
        payments: {
          orderBy: { date: 'desc' }
        }
      },
      orderBy: { dueDate: 'asc' }
    });

    // Convert BigInt to string for JSON serialization
    const formattedFees = fees.map(fee => ({
      ...fee,
      totalAmount: fee.totalAmount.toString(),
      paidAmount: fee.paidAmount.toString(),
      remainingAmount: (fee.totalAmount - fee.paidAmount).toString(),
      payments: fee.payments.map(payment => ({
        ...payment,
        amount: payment.amount.toString()
      }))
    }));

    return res.json({
      success: true,
      data: { fees: formattedFees }
    });
  } catch (error) {
    console.error('Get pending fees error:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to get pending fees'
    });
  }
});

// Create payment (for mobile app - simplified)
router.post('/payment', requireAuth, getUserProfile, requireRole(['student', 'parent']), async (req: AuthenticatedRequest, res) => {
  try {
    const { feeId, amount, method, reference } = req.body;
    const userRole = req.userRole;
    const userProfile = req.userProfile;

    // Verify user has access to this fee
    let fee;
    if (userRole === 'student') {
      fee = await prisma.fee.findFirst({
        where: {
          id: feeId,
          studentId: userProfile.id
        }
      });
    } else if (userRole === 'parent') {
      const children = await prisma.student.findMany({
        where: { parentId: userProfile.id },
        select: { id: true }
      });
      
      fee = await prisma.fee.findFirst({
        where: {
          id: feeId,
          studentId: {
            in: children.map(child => child.id)
          }
        }
      });
    }

    if (!fee) {
      return res.status(404).json({
        success: false,
        error: 'Fee not found or access denied'
      });
    }

    // Create payment record
    const payment = await prisma.payment.create({
      data: {
        amount: BigInt(amount),
        method,
        reference,
        feeId
      }
    });

    // Update fee status
    const newPaidAmount = fee.paidAmount + BigInt(amount);
    const newStatus = newPaidAmount >= fee.totalAmount ? 'PAID' : 'PARTIAL';

    await prisma.fee.update({
      where: { id: feeId },
      data: {
        paidAmount: newPaidAmount,
        status: newStatus
      }
    });

    return res.json({
      success: true,
      message: 'Payment recorded successfully',
      data: {
        payment: {
          ...payment,
          amount: payment.amount.toString()
        },
        newStatus
      }
    });
  } catch (error) {
    console.error('Create payment error:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to process payment'
    });
  }
});

// Get fee summary (for accountant dashboard)
router.get('/summary', requireAuth, getUserProfile, async (req: AuthenticatedRequest, res) => {
  try {
    if (req.userRole !== 'accountant' && req.userRole !== 'admin') {
      return res.status(403).json({
        success: false,
        error: 'Access denied. Accountant or Admin role required.'
      });
    }

    // Get financial statistics
    const [
      allFees,
      recentPayments,
      monthlyTarget
    ] = await Promise.all([
      prisma.fee.findMany({
        include: {
          student: true,
          payments: true
        }
      }),
      prisma.payment.findMany({
        where: {
          date: {
            gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) // Last 30 days
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
        take: 10
      }),
      prisma.finance.findFirst({
        where: {
          expenseType: 'OTHER', // You can use this for target tracking
          createdAt: {
            gte: new Date(new Date().getFullYear(), new Date().getMonth(), 1)
          }
        }
      })
    ]);

    // Calculate statistics
    const totalCollected = allFees.reduce((sum, fee) => sum + Number(fee.paidAmount), 0);
    const totalPending = allFees.reduce((sum, fee) => sum + Number(fee.totalAmount - fee.paidAmount), 0);
    const totalOverdue = allFees
      .filter(fee => fee.status === 'OVERDUE')
      .reduce((sum, fee) => sum + Number(fee.totalAmount - fee.paidAmount), 0);

    // Format recent payments
    const formattedPayments = recentPayments.map(payment => ({
      id: payment.id,
      student: `${payment.fee.student.name} ${payment.fee.student.surname}`,
      amount: Number(payment.amount),
      date: payment.date.toISOString().split('T')[0],
      method: payment.method,
      status: 'completed'
    }));

    return res.json({
      success: true,
      data: {
        financial: {
          totalCollected,
          totalPending,
          totalOverdue,
          monthlyTarget: monthlyTarget ? Number(monthlyTarget.amount) : 150000
        },
        recentPayments: formattedPayments,
        stats: {
          totalFees: allFees.length,
          paidFees: allFees.filter(f => f.status === 'PAID').length,
          unpaidFees: allFees.filter(f => f.status === 'UNPAID').length,
          overdueFees: allFees.filter(f => f.status === 'OVERDUE').length
        }
      }
    });
  } catch (error) {
    console.error('Get fees summary error:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to get fees summary'
    });
  }
});

export default router;
