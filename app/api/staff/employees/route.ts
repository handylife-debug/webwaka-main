import { NextRequest, NextResponse } from 'next/server'
import { execute_sql, withTransaction } from '../../../../lib/database'
import { getTenantContext, validateTenantAccess } from '../../../../lib/tenant-context'
import { withStaffPermissions } from '../../../../lib/permission-middleware'
import { z } from 'zod'

// Employee creation/update schema
const employeeSchema = z.object({
  user_id: z.string().uuid().optional(),
  employee_code: z.string().min(1).max(50).optional(), // Optional for auto-generation
  
  // Personal information
  first_name: z.string().min(1).max(100),
  last_name: z.string().min(1).max(100),
  middle_name: z.string().max(100).optional(),
  email: z.string().email(),
  phone: z.string().max(20).optional(),
  mobile: z.string().max(20).optional(),
  date_of_birth: z.string().optional(), // ISO date string
  gender: z.enum(['male', 'female', 'other', 'prefer_not_to_say']).optional(),
  marital_status: z.enum(['single', 'married', 'divorced', 'widowed', 'other']).optional(),
  
  // Address information
  address: z.string().optional(),
  city: z.string().max(100).optional(),
  state: z.string().max(100).optional(),
  postal_code: z.string().max(20).optional(),
  country: z.string().max(100).optional(),
  
  // Emergency contact
  emergency_contact_name: z.string().max(200).optional(),
  emergency_contact_phone: z.string().max(20).optional(),
  emergency_contact_relationship: z.string().max(50).optional(),
  
  // Employment information
  employee_type: z.enum(['full_time', 'part_time', 'contract', 'intern', 'consultant']).optional(),
  department: z.string().max(100).optional(),
  position_title: z.string().max(100).optional(),
  hire_date: z.string(), // ISO date string - required
  termination_date: z.string().optional(), // ISO date string
  employment_status: z.enum(['active', 'inactive', 'terminated', 'suspended', 'on_leave']).optional(),
  
  // Compensation
  base_salary: z.number().min(0).optional(),
  hourly_rate: z.number().min(0).optional(),
  commission_rate: z.number().min(0).max(1).optional(),
  overtime_rate: z.number().min(0).optional(),
  
  // Work schedule
  work_schedule: z.string().max(50).optional(),
  work_hours_per_week: z.number().min(0).max(168).optional(),
  
  // Additional information
  skills: z.array(z.string()).optional(),
  certifications: z.array(z.record(z.any())).optional(),
  notes: z.string().optional(),
  profile_picture_url: z.string().url().optional(),
  metadata: z.record(z.any()).optional()
});

// Valid columns for sorting (security whitelist)
const VALID_SORT_COLUMNS = [
  'first_name', 'last_name', 'employee_code', 'email', 'department', 
  'position_title', 'employment_status', 'employee_type', 'hire_date', 
  'base_salary', 'hourly_rate', 'created_at'
];
const VALID_SORT_ORDERS = ['ASC', 'DESC'];

// GET - List employees with filtering, search, and pagination
export const GET = withStaffPermissions('employees.view')(async function(request: NextRequest) {
  try {
    const { tenantId } = await getTenantContext(request);
    await validateTenantAccess(tenantId, request);

    const { searchParams } = new URL(request.url);
    
    // Pagination
    const page = parseInt(searchParams.get('page') || '1');
    const limit = Math.min(parseInt(searchParams.get('limit') || '50'), 100);
    const offset = (page - 1) * limit;
    
    // Sorting with security validation
    const sortBy = searchParams.get('sort_by') || 'hire_date';
    const sortOrder = (searchParams.get('sort_order') || 'DESC').toUpperCase();
    
    if (!VALID_SORT_COLUMNS.includes(sortBy)) {
      return NextResponse.json({
        success: false,
        message: 'Invalid sort column'
      }, { status: 400 });
    }
    
    if (!VALID_SORT_ORDERS.includes(sortOrder)) {
      return NextResponse.json({
        success: false,
        message: 'Invalid sort order'
      }, { status: 400 });
    }
    
    // Filters
    const search = searchParams.get('search') || '';
    const status = searchParams.get('status') || '';
    const department = searchParams.get('department') || '';
    const employeeType = searchParams.get('employee_type') || '';
    const minSalary = searchParams.get('min_salary');
    const maxSalary = searchParams.get('max_salary');
    const includeUser = searchParams.get('include_user') === 'true';
    const includeAttendance = searchParams.get('include_attendance') === 'true';
    
    // Build WHERE clause
    let whereConditions = ['e.tenant_id = $1'];
    let queryParams: any[] = [tenantId];
    let paramCount = 1;
    
    if (search) {
      paramCount++;
      whereConditions.push(`(
        e.first_name ILIKE $${paramCount} OR 
        e.last_name ILIKE $${paramCount} OR 
        e.email ILIKE $${paramCount} OR 
        e.employee_code ILIKE $${paramCount} OR
        e.position_title ILIKE $${paramCount} OR
        e.department ILIKE $${paramCount}
      )`);
      queryParams.push(`%${search}%`);
    }
    
    if (status) {
      paramCount++;
      whereConditions.push(`e.employment_status = $${paramCount}`);
      queryParams.push(status);
    }
    
    if (department) {
      paramCount++;
      whereConditions.push(`e.department ILIKE $${paramCount}`);
      queryParams.push(`%${department}%`);
    }
    
    if (employeeType) {
      paramCount++;
      whereConditions.push(`e.employee_type = $${paramCount}`);
      queryParams.push(employeeType);
    }
    
    if (minSalary) {
      paramCount++;
      whereConditions.push(`(e.base_salary >= $${paramCount} OR (e.base_salary IS NULL AND e.hourly_rate * e.work_hours_per_week * 52 >= $${paramCount}))`);
      queryParams.push(parseFloat(minSalary));
    }
    
    if (maxSalary) {
      paramCount++;
      whereConditions.push(`(e.base_salary <= $${paramCount} OR (e.base_salary IS NULL AND e.hourly_rate * e.work_hours_per_week * 52 <= $${paramCount}))`);
      queryParams.push(parseFloat(maxSalary));
    }
    
    const whereClause = whereConditions.length > 0 ? `WHERE ${whereConditions.join(' AND ')}` : '';
    
    // Base select fields
    const baseSelect = includeUser ? 
      `e.*, u.email as user_email, u.username, u.is_active as user_active, u.last_login_at` :
      `e.id, e.employee_code, e.first_name, e.last_name, e.email, e.department, 
       e.position_title, e.employment_status, e.employee_type, e.hire_date, 
       e.base_salary, e.hourly_rate, e.work_hours_per_week, e.created_at`;
    
    const userJoin = includeUser ? 'LEFT JOIN users u ON u.id = e.user_id' : '';
    
    // Main query
    const query = `
      SELECT ${baseSelect}
      FROM employees e
      ${userJoin}
      ${whereClause}
      ORDER BY e.${sortBy} ${sortOrder}
      LIMIT $${paramCount + 1} OFFSET $${paramCount + 2}
    `;
    
    queryParams.push(limit, offset);
    
    const result = await execute_sql(query, queryParams);
    
    // Get attendance summary for each employee if requested
    if (includeAttendance) {
      for (const employee of result.rows) {
        const attendanceQuery = `
          SELECT 
            COUNT(*) as total_days,
            COUNT(*) FILTER (WHERE actual_start_time IS NOT NULL) as present_days,
            AVG(actual_hours) as avg_hours_per_day,
            SUM(actual_hours) as total_hours_this_month,
            SUM(overtime_hours) as total_overtime_this_month
          FROM attendance_records
          WHERE tenant_id = $1 AND employee_id = $2 
            AND attendance_date >= date_trunc('month', CURRENT_DATE)
            AND attendance_date < date_trunc('month', CURRENT_DATE) + interval '1 month'
        `;
        
        const attendanceResult = await execute_sql(attendanceQuery, [tenantId, employee.id]);
        employee.attendance_summary = attendanceResult.rows[0];
      }
    }
    
    // Get total count for pagination
    const countQuery = `
      SELECT COUNT(*) as total 
      FROM employees e
      ${whereClause}
    `;
    const countResult = await execute_sql(countQuery, queryParams.slice(0, -2)); // Remove limit/offset
    const total = parseInt(countResult.rows[0].total);
    
    // Get employee statistics
    const statsQuery = `
      SELECT 
        COUNT(*) as total_employees,
        COUNT(*) FILTER (WHERE employment_status = 'active') as active_employees,
        COUNT(*) FILTER (WHERE employee_type = 'full_time') as full_time_employees,
        COUNT(*) FILTER (WHERE employee_type = 'part_time') as part_time_employees,
        COUNT(*) FILTER (WHERE employee_type = 'contract') as contract_employees,
        COUNT(DISTINCT department) FILTER (WHERE department IS NOT NULL) as total_departments,
        AVG(base_salary) FILTER (WHERE base_salary IS NOT NULL) as avg_salary,
        AVG(hourly_rate) FILTER (WHERE hourly_rate IS NOT NULL) as avg_hourly_rate
      FROM employees
      WHERE tenant_id = $1
    `;
    
    const statsResult = await execute_sql(statsQuery, [tenantId]);
    const stats = statsResult.rows[0];
    
    return NextResponse.json({
      success: true,
      data: result.rows,
      statistics: {
        total_employees: parseInt(stats.total_employees || 0),
        active_employees: parseInt(stats.active_employees || 0),
        full_time_employees: parseInt(stats.full_time_employees || 0),
        part_time_employees: parseInt(stats.part_time_employees || 0),
        contract_employees: parseInt(stats.contract_employees || 0),
        total_departments: parseInt(stats.total_departments || 0),
        avg_salary: parseFloat(stats.avg_salary || 0),
        avg_hourly_rate: parseFloat(stats.avg_hourly_rate || 0)
      },
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
        hasNext: page * limit < total,
        hasPrev: page > 1
      }
    });
    
  } catch (error) {
    console.error('Error fetching employees:', error);
    return NextResponse.json({
      success: false,
      message: 'Failed to fetch employees',
      error: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
});

// POST - Create new employee
export const POST = withStaffPermissions('employees.create')(async function(request: NextRequest) {
  try {
    const { tenantId } = await getTenantContext(request);
    await validateTenantAccess(tenantId, request);

    const body = await request.json();
    const validatedData = employeeSchema.parse(body);
    
    // SECURITY: Use transaction for atomicity in multi-step employee creation
    return await withTransaction(async (client) => {
      // Auto-generate employee code if not provided
      if (!validatedData.employee_code) {
        const codePrefix = validatedData.department ? 
          validatedData.department.substring(0, 3).toUpperCase() : 'EMP';
        
        const lastEmployee = await client.query(`
          SELECT employee_code FROM employees 
          WHERE tenant_id = $1 AND employee_code LIKE $2
          ORDER BY employee_code DESC LIMIT 1
        `, [tenantId, `${codePrefix}%`]);
        
        const lastCode = lastEmployee.rows[0]?.employee_code;
        const lastNumber = lastCode ? parseInt(lastCode.slice(-4)) || 0 : 0;
        const newNumber = (lastNumber + 1).toString().padStart(4, '0');
        validatedData.employee_code = `${codePrefix}${newNumber}`;
      }
      
      // Check for duplicate employee code
      const duplicateCodeCheck = await client.query(`
        SELECT id FROM employees 
        WHERE tenant_id = $1 AND employee_code = $2
      `, [tenantId, validatedData.employee_code]);
      
      if (duplicateCodeCheck.rows.length > 0) {
        return NextResponse.json({
          success: false,
          message: 'Employee code already exists'
        }, { status: 409 });
      }
      
      // Check for duplicate email
      const duplicateEmailCheck = await client.query(`
        SELECT id FROM employees 
        WHERE tenant_id = $1 AND email = $2
      `, [tenantId, validatedData.email]);
      
      if (duplicateEmailCheck.rows.length > 0) {
        return NextResponse.json({
          success: false,
          message: 'Email already exists'
        }, { status: 409 });
      }
      
      // Validate user_id if provided
      if (validatedData.user_id) {
        const userExists = await client.query(`
          SELECT id FROM users WHERE id = $1
        `, [validatedData.user_id]);
        
        if (userExists.rows.length === 0) {
          return NextResponse.json({
            success: false,
            message: 'User not found'
          }, { status: 404 });
        }
        
        // Check if user is already linked to another employee
        const userLinked = await client.query(`
          SELECT id FROM employees 
          WHERE tenant_id = $1 AND user_id = $2 AND employment_status != 'terminated'
        `, [tenantId, validatedData.user_id]);
        
        if (userLinked.rows.length > 0) {
          return NextResponse.json({
            success: false,
            message: 'User is already linked to another active employee'
          }, { status: 409 });
        }
      }
      
      // Insert new employee
      const insertQuery = `
        INSERT INTO employees (
          tenant_id, user_id, employee_code, first_name, last_name, middle_name,
          email, phone, mobile, date_of_birth, gender, marital_status,
          address, city, state, postal_code, country,
          emergency_contact_name, emergency_contact_phone, emergency_contact_relationship,
          employee_type, department, position_title, hire_date, termination_date, employment_status,
          base_salary, hourly_rate, commission_rate, overtime_rate,
          work_schedule, work_hours_per_week, skills, certifications, notes,
          profile_picture_url, metadata, created_by
        ) VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17,
          $18, $19, $20, $21, $22, $23, $24, $25, $26, $27, $28, $29, $30, $31, $32,
          $33, $34, $35, $36, $37, $38
        )
        RETURNING *
      `;
      
      const result = await client.query(insertQuery, [
        tenantId,
        validatedData.user_id || null,
        validatedData.employee_code,
        validatedData.first_name,
        validatedData.last_name,
        validatedData.middle_name || null,
        validatedData.email,
        validatedData.phone || null,
        validatedData.mobile || null,
        validatedData.date_of_birth || null,
        validatedData.gender || null,
        validatedData.marital_status || null,
        validatedData.address || null,
        validatedData.city || null,
        validatedData.state || null,
        validatedData.postal_code || null,
        validatedData.country || null,
        validatedData.emergency_contact_name || null,
        validatedData.emergency_contact_phone || null,
        validatedData.emergency_contact_relationship || null,
        validatedData.employee_type || 'full_time',
        validatedData.department || null,
        validatedData.position_title || null,
        validatedData.hire_date,
        validatedData.termination_date || null,
        validatedData.employment_status || 'active',
        validatedData.base_salary || null,
        validatedData.hourly_rate || null,
        validatedData.commission_rate || null,
        validatedData.overtime_rate || null,
        validatedData.work_schedule || 'standard',
        validatedData.work_hours_per_week || 40.00,
        validatedData.skills ? JSON.stringify(validatedData.skills) : null,
        validatedData.certifications ? JSON.stringify(validatedData.certifications) : '[]',
        validatedData.notes || null,
        validatedData.profile_picture_url || null,
        validatedData.metadata ? JSON.stringify(validatedData.metadata) : '{}',
        null // TODO: Get user ID from session
      ]);
      
      const newEmployee = result.rows[0];
      
      return NextResponse.json({
        success: true,
        message: 'Employee created successfully',
        data: newEmployee
      }, { status: 201 });
    });
    
  } catch (error) {
    console.error('Error creating employee:', error);
    
    if (error instanceof z.ZodError) {
      return NextResponse.json({
        success: false,
        message: 'Validation error',
        errors: error.errors
      }, { status: 400 });
    }
    
    return NextResponse.json({
      success: false,
      message: 'Failed to create employee',
      error: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
});