import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function debugUser() {
  const targetUsername = 'user_2wflGvsadMKcAXI3Et6eKtnaYPu';
  
  console.log('🔍 Debugging user:', targetUsername);
  
  try {
    // Check if user exists as student
    const student = await prisma.student.findFirst({
      where: { id: targetUsername } // Use id field, not username
    });
    
    if (student) {
      console.log('✅ Found student:', {
        id: student.id,
        username: student.username,
        name: student.name,
        StudentId: student.StudentId,
        email: student.email
      });
      
      // Check attendance records
      const attendanceCount = await prisma.attendance.count({
        where: { studentId: student.id }
      });
      
      // Check fees records
      const feesCount = await prisma.fee.count({
        where: { studentId: student.id }
      });
      
      console.log('📊 Records for this student:');
      console.log('  - Attendance:', attendanceCount);
      console.log('  - Fees:', feesCount);
      
    } else {
      console.log('❌ Student not found');
    }

         // Check if user exists as teacher
     const teacher = await prisma.teacher.findFirst({
       where: { id: targetUsername } // Use id field like students
     });
    
    if (teacher) {
      console.log('✅ Found teacher:', {
        id: teacher.id,
        username: teacher.username,
        name: teacher.name,
        teacherId: teacher.teacherId,
        email: teacher.email
      });
      
      // Check classes
      const classesCount = await prisma.class.count({
        where: { supervisorId: teacher.id }
      });
      
      console.log('📊 Records for this teacher:');
      console.log('  - Classes supervised:', classesCount);
      
    } else {
      console.log('❌ Teacher not found');
      
      // Create a teacher user for testing
      console.log('🔧 Creating teacher user for testing...');
      
      const newTeacher = await prisma.teacher.create({
        data: {
          username: targetUsername,
          name: 'Test',
          surname: 'Teacher',
          email: 'test.teacher@demo.com',
          phone: '1234567890',
          address: '123 Test St',
          bloodType: 'O+',
          sex: 'MALE',
          birthday: new Date('1985-01-01'),
          teacherId: 'TCH_TEST'
        }
      });
      
      console.log('✅ Created teacher:', {
        id: newTeacher.id,
        username: newTeacher.username,
        name: newTeacher.name,
        teacherId: newTeacher.teacherId
      });
    }
    
    // List all teachers to see what's in the database
    const allTeachers = await prisma.teacher.findMany({
      select: { id: true, username: true, name: true, teacherId: true }
    });
    
    console.log('📋 All teachers in database:', allTeachers.length);
    allTeachers.forEach((t, i) => {
      console.log(`  ${i + 1}. ${t.name} (username: ${t.username}, TeacherId: ${t.teacherId})`);
    });
    
  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await prisma.$disconnect();
  }
}

debugUser();
