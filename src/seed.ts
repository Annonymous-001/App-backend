import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Seeding database...');

  // Create Grades
  const grades = await Promise.all([
    prisma.grade.upsert({
      where: { level: 9 },
      update: {},
      create: { level: 9 }
    }),
    prisma.grade.upsert({
      where: { level: 10 },
      update: {},
      create: { level: 10 }
    }),
    prisma.grade.upsert({
      where: { level: 11 },
      update: {},
      create: { level: 11 }
    }),
    prisma.grade.upsert({
      where: { level: 12 },
      update: {},
      create: { level: 12 }
    })
  ]);

  console.log('✅ Grades created');

  // Create Subjects
  const subjects = await Promise.all([
    prisma.subject.upsert({
      where: { name: 'Mathematics' },
      update: {},
      create: { name: 'Mathematics' }
    }),
    prisma.subject.upsert({
      where: { name: 'Science' },
      update: {},
      create: { name: 'Science' }
    }),
    prisma.subject.upsert({
      where: { name: 'English' },
      update: {},
      create: { name: 'English' }
    }),
    prisma.subject.upsert({
      where: { name: 'History' },
      update: {},
      create: { name: 'History' }
    })
  ]);

  console.log('✅ Subjects created');

  // Create Sample Teacher (using Clerk userId as id, like students)
  const teacher = await prisma.teacher.upsert({
    where: { id: 'user_31g2YonmajY2niQ1yzfLmiFaOAO' }, // Use Clerk userId as id
    update: {},
    create: {
      id: 'user_31g2YonmajY2niQ1yzfLmiFaOAO', // Use Clerk userId as id
      username: 'teacher_demo',
      name: 'John',
      surname: 'Smith',
      email: 'teacher@demo.com',
      phone: '1234567890',
      address: '123 Teacher St',
      bloodType: 'O+',
      sex: 'MALE',
      birthday: new Date('1985-05-15'),
      teacherId: 'TCH001'
    }
  });

  console.log('✅ Sample teacher created');

  // Create Classes
  const classes = await Promise.all([
    prisma.class.upsert({
      where: { name: '9th Grade A' },
      update: {},
      create: {
        name: '9th Grade A',
        capacity: 35,
        gradeId: grades[0].id,
        supervisorId: teacher.id
      }
    }),
    prisma.class.upsert({
      where: { name: '10th Grade A' },
      update: {},
      create: {
        name: '10th Grade A',
        capacity: 35,
        gradeId: grades[1].id,
        supervisorId: teacher.id
      }
    }),
    prisma.class.upsert({
      where: { name: '11th Grade A' },
      update: {},
      create: {
        name: '11th Grade A',
        capacity: 30,
        gradeId: grades[2].id,
        supervisorId: teacher.id
      }
    })
  ]);

  console.log('✅ Classes created');

  // Create Sample Parent (using Clerk userId as id, like students)
  const parent = await prisma.parent.upsert({
    where: { id: 'user_parent_demo' }, // Use Clerk userId as id
    update: {},
    create: {
      id: 'user_parent_demo', // Use Clerk userId as id
      username: 'parent_demo',
      name: 'Jane',
      surname: 'Doe',
      email: 'parent@demo.com',
      phone: '0987654321',
      address: '456 Parent Ave',
      parentId: 'PAR001'
    }
  });

  console.log('✅ Sample parent created');

  // Create Sample Students
  const students = await Promise.all([
    prisma.student.upsert({
      where: { username: 'student_demo_1' },
      update: {},
      create: {
        username: 'student_demo_1',
        name: 'Alice',
        surname: 'Johnson',
        email: 'alice@demo.com',
        phone: '1111111111',
        address: '789 Student Rd',
        bloodType: 'A+',
        sex: 'FEMALE',
        birthday: new Date('2008-03-10'),
        StudentId: 'STU001',
        IEMISCODE: 12345,
        fatherName: 'Bob Johnson',
        motherName: 'Carol Johnson',
        parentId: parent.id
      }
    }),
    prisma.student.upsert({
      where: { username: 'student_demo_2' },
      update: {},
      create: {
        username: 'student_demo_2',
        name: 'Bob',
        surname: 'Wilson',
        email: 'bob@demo.com',
        phone: '2222222222',
        address: '321 Student Ave',
        bloodType: 'B+',
        sex: 'MALE',
        birthday: new Date('2007-08-20'),
        StudentId: 'STU002',
        IEMISCODE: 12346,
        fatherName: 'David Wilson',
        motherName: 'Emma Wilson',
        parentId: parent.id
      }
    })
  ]);

  console.log('✅ Sample students created');

  // Create Enrollments
  await Promise.all([
    prisma.enrollment.upsert({
      where: { 
        studentId_year: {
          studentId: students[0].StudentId,
          year: 2024
        }
      },
      update: {},
      create: {
        studentId: students[0].StudentId,
        classId: classes[1].id, // 10th Grade A
        gradeId: grades[1].id,
        year: 2024
      }
    }),
    prisma.enrollment.upsert({
      where: { 
        studentId_year: {
          studentId: students[1].StudentId,
          year: 2024
        }
      },
      update: {},
      create: {
        studentId: students[1].StudentId,
        classId: classes[0].id, // 9th Grade A
        gradeId: grades[0].id,
        year: 2024
      }
    })
  ]);

  console.log('✅ Enrollments created');

  // Create Sample Fees
  await Promise.all([
    prisma.fee.create({
      data: {
        studentId: students[0].id,
        totalAmount: BigInt(5000),
        paidAmount: BigInt(2500),
        status: 'PARTIAL',
        description: 'Tuition Fee - Semester 1',
        dueDate: new Date('2024-03-01')
      }
    }),
    prisma.fee.create({
      data: {
        studentId: students[1].id,
        totalAmount: BigInt(5000),
        paidAmount: BigInt(5000),
        status: 'PAID',
        description: 'Tuition Fee - Semester 1',
        dueDate: new Date('2024-03-01')
      }
    })
  ]);

  console.log('✅ Sample fees created');

  // Create Sample Attendance Records
  const currentDate = new Date();
  const attendanceRecords = [];
  
  // Create 30 days of attendance for both students
  for (let i = 0; i < 30; i++) {
    const date = new Date(currentDate);
    date.setDate(date.getDate() - i);
    
    // Skip weekends
    if (date.getDay() === 0 || date.getDay() === 6) continue;
    
    // Alice Johnson attendance (mostly present)
    attendanceRecords.push(
      prisma.attendance.create({
        data: {
          date,
          studentId: students[0].id,
          classId: classes[1].id, // 10th Grade A
          status: Math.random() > 0.1 ? 'PRESENT' : (Math.random() > 0.5 ? 'LATE' : 'ABSENT')
        }
      })
    );
    
    // Bob Wilson attendance (some absences)
    attendanceRecords.push(
      prisma.attendance.create({
        data: {
          date,
          studentId: students[1].id,
          classId: classes[0].id, // 9th Grade A
          status: Math.random() > 0.2 ? 'PRESENT' : (Math.random() > 0.5 ? 'LATE' : 'ABSENT')
        }
      })
    );
  }
  
  await Promise.all(attendanceRecords);
  console.log('✅ Sample attendance records created');

  // Create Sample Admin
  await prisma.admin.upsert({
    where: { username: 'admin_demo' },
    update: {},
    create: {
      username: 'admin_demo'
    }
  });

  // Create Sample Accountant
  await prisma.accountant.upsert({
    where: { username: 'accountant_demo' },
    update: {},
    create: {
      username: 'accountant_demo',
      name: 'Sarah',
      surname: 'Miller',
      email: 'accountant@demo.com',
      phone: '5555555555',
      address: '999 Finance St'
    }
  });

  console.log('✅ Sample admin and accountant created');

  console.log('🎉 Database seeded successfully!');
  console.log('\n📋 Test Users Created:');
  console.log('👨‍🎓 Student: student_demo_1 (Alice Johnson)');
  console.log('👨‍🎓 Student: student_demo_2 (Bob Wilson)');
  console.log('👨‍🏫 Teacher: teacher_demo (John Smith)');
  console.log('👨‍👩‍👧‍👦 Parent: parent_demo (Jane Doe)');
  console.log('👨‍💼 Admin: admin_demo');
  console.log('💰 Accountant: accountant_demo (Sarah Miller)');
}

main()
  .catch((e) => {
    console.error('❌ Seeding failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
