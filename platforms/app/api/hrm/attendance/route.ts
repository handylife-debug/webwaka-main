import { NextRequest, NextResponse } from 'next/server'
import { execute_sql, withTransaction } from '../../../../lib/database'
import { getTenantContext, validateTenantAccess } from '../../../../lib/tenant-context'
import { withStaffPermissions } from '../../../../lib/permission-middleware'
import { z } from 'zod'

// Attendance record creation/update schema
const attendanceRecordSchema = z.object({
  employee_id: z.string().uuid(),
  attendance_date: z.string(), // ISO date string (YYYY-MM-DD)
  
  // Schedule information
  shift_type: z.string().max(50).optional(),
  scheduled_start_time: z.string().optional(), // Time string (HH:MM)
  scheduled_end_time: z.string().optional(), // Time string (HH:MM)
  scheduled_hours: z.number().min(0).max(24).optional(),
  
  // Actual time tracking (will be populated from time clock entries)
  actual_start_time: z.string().optional(), // ISO timestamp
  actual_end_time: z.string().optional(), // ISO timestamp
  break_start_time: z.string().optional(), // ISO timestamp
  break_end_time: z.string().optional(), // ISO timestamp
  
  // Calculated hours
  actual_hours: z.number().min(0).max(24).optional(),
  overtime_hours: z.number().min(0).max(24).optional(),
  break_hours: z.number().min(0).max(24).optional(),
  
  // Attendance status
  status: z.enum(['present', 'absent', 'late', 'half_day', 'sick', 'vacation', 'holiday', 'unpaid_leave']),
  
  // Location and approval
  clock_in_location: z.string().max(200).optional(),
  clock_out_location: z.string().max(200).optional(),
  notes: z.string().optional(),
  approved_by: z.string().uuid().optional()
});

// Bulk attendance update schema
const bulkAttendanceSchema = z.object({
  date_range: z.object({
    start_date: z.string(),
    end_date: z.string()
  }),
  employee_ids: z.array(z.string().uuid()).optional(),
  department: z.string().optional(),
  updates: z.object({
    status: z.enum(['present', 'absent', 'late', 'half_day', 'sick', 'vacation', 'holiday', 'unpaid_leave']).optional(),
    scheduled_hours: z.number().min(0).max(24).optional(),
    approved_by: z.string().uuid().optional(),
    notes: z.string().optional()
  })
});

// Valid columns for sorting (security whitelist)
const VALID_SORT_COLUMNS = [
  'attendance_date', 'employee_id', 'status', 'actual_hours', 'overtime_hours', 
  'scheduled_hours', 'created_at', 'updated_at'
];
const VALID_SORT_ORDERS = ['ASC', 'DESC'];

// GET - List attendance records with filtering and analytics
export const GET = withStaffPermissions('employees.attendance')(async function(request: NextRequest) {
  try {
    const { tenantId } = await getTenantContext(request);
    await validateTenantAccess(tenantId, request);

    const { searchParams } = new URL(request.url);
    
    // Pagination
    const page = parseInt(searchParams.get('page') || '1');
    const limit = Math.min(parseInt(searchParams.get('limit') || '50'), 100);
    const offset = (page - 1) * limit;
    
    // Sorting with security validation
    const sortBy = searchParams.get('sort_by') || 'attendance_date';
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
    const employeeId = searchParams.get('employee_id') || '';
    const status = searchParams.get('status') || '';
    const department = searchParams.get('department') || '';
    const startDate = searchParams.get('start_date') || '';
    const endDate = searchParams.get('end_date') || '';
    const includeEmployee = searchParams.get('include_employee') === 'true';
    const includeTimeEntries = searchParams.get('include_time_entries') === 'true';
    const includeAnalytics = searchParams.get('include_analytics') === 'true';
    
    // Build WHERE clause
    let whereConditions = ['ar.tenant_id = $1'];
    let queryParams: any[] = [tenantId];
    let paramCount = 1;
    
    if (employeeId) {
      paramCount++;
      whereConditions.push(`ar.employee_id = $${paramCount}`);
      queryParams.push(employeeId);
    }
    
    if (status) {
      paramCount++;
      whereConditions.push(`ar.status = $${paramCount}`);
      queryParams.push(status);
    }
    
    if (department) {
      paramCount++;
      whereConditions.push(`e.department ILIKE $${paramCount}`);
      queryParams.push(`%${department}%`);
    }
    
    if (startDate) {
      paramCount++;
      whereConditions.push(`ar.attendance_date >= $${paramCount}`);
      queryParams.push(startDate);
    }
    
    if (endDate) {
      paramCount++;
      whereConditions.push(`ar.attendance_date <= $${paramCount}`);
      queryParams.push(endDate);
    }
    
    const whereClause = whereConditions.length > 0 ? `WHERE ${whereConditions.join(' AND ')}` : '';
    
    // Base select fields
    const baseSelect = includeEmployee ? 
      `ar.*, e.first_name, e.last_name, e.employee_code, e.department, e.position_title, e.hourly_rate` :
      `ar.id, ar.employee_id, ar.attendance_date, ar.status, ar.actual_hours, ar.overtime_hours, 
       ar.scheduled_hours, ar.break_hours, ar.is_overtime, ar.created_at, ar.updated_at`;
    
    // Main query
    const query = `
      SELECT ${baseSelect}
      FROM attendance_records ar
      JOIN employees e ON e.id = ar.employee_id
      ${whereClause}
      ORDER BY ar.${sortBy} ${sortOrder}
      LIMIT $${paramCount + 1} OFFSET $${paramCount + 2}
    `;
    
    queryParams.push(limit, offset);
    
    const result = await execute_sql(query, queryParams);
    
    // Get time clock entries for all records in a single batched query if requested
    if (includeTimeEntries && result.rows.length > 0) {
      // Create list of employee-date pairs for efficient batch query
      const employeeDatePairs = result.rows.map((record: any, index: number) => ({
        employee_id: record.employee_id,
        attendance_date: record.attendance_date,
        record_index: index
      }));
      
      // Build single query to get all time entries at once
      const timeEntriesQuery = `
        SELECT tce.id, tce.entry_type, tce.entry_timestamp, tce.location, 
               tce.is_manual_entry, tce.notes, tce.employee_id,
               DATE(tce.entry_timestamp AT TIME ZONE 'UTC') as entry_date
        FROM time_clock_entries tce
        WHERE tce.tenant_id = $1 
          AND (tce.employee_id, DATE(tce.entry_timestamp AT TIME ZONE 'UTC')) IN (
            ${employeeDatePairs.map((_: any, i: number) => `($${i * 2 + 2}, $${i * 2 + 3})`).join(', ')}
          )
        ORDER BY tce.employee_id, tce.entry_timestamp ASC
      `;
      
      // Build parameters array: [tenantId, emp1, date1, emp2, date2, ...]
      const timeEntriesParams = [tenantId];
      employeeDatePairs.forEach((pair: any) => {
        timeEntriesParams.push(pair.employee_id, pair.attendance_date);
      });
      
      const allTimeEntriesResult = await execute_sql(timeEntriesQuery, timeEntriesParams);
      
      // Group time entries by employee_id and date for efficient assignment
      const timeEntriesMap = new Map();
      allTimeEntriesResult.rows.forEach((entry: any) => {
        const key = `${entry.employee_id}:${entry.entry_date}`;
        if (!timeEntriesMap.has(key)) {
          timeEntriesMap.set(key, []);
        }
        timeEntriesMap.get(key).push(entry);
      });
      
      // Assign time entries to their respective attendance records
      result.rows.forEach((record: any) => {
        const key = `${record.employee_id}:${record.attendance_date}`;
        record.time_entries = timeEntriesMap.get(key) || [];
      });
    }
    
    // Get total count for pagination
    const countQuery = `
      SELECT COUNT(*) as total 
      FROM attendance_records ar
      JOIN employees e ON e.id = ar.employee_id
      ${whereClause}
    `;
    const countResult = await execute_sql(countQuery, queryParams.slice(0, -2)); // Remove limit/offset
    const total = parseInt(countResult.rows[0].total);
    
    // Get attendance analytics if requested
    let analytics: any = null;
    if (includeAnalytics) {
      const analyticsQuery = `
        SELECT 
          COUNT(*) as total_records,
          COUNT(*) FILTER (WHERE status = 'present') as present_count,
          COUNT(*) FILTER (WHERE status = 'absent') as absent_count,
          COUNT(*) FILTER (WHERE status = 'late') as late_count,
          COUNT(*) FILTER (WHERE status = 'sick') as sick_count,
          COUNT(*) FILTER (WHERE status = 'vacation') as vacation_count,
          COUNT(*) FILTER (WHERE is_overtime = true) as overtime_count,
          AVG(actual_hours) FILTER (WHERE actual_hours IS NOT NULL) as avg_hours_worked,
          SUM(actual_hours) FILTER (WHERE actual_hours IS NOT NULL) as total_hours_worked,
          SUM(overtime_hours) as total_overtime_hours,
          AVG(overtime_hours) FILTER (WHERE overtime_hours > 0) as avg_overtime_hours,
          COUNT(DISTINCT employee_id) as unique_employees,
          ROUND(
            (COUNT(*) FILTER (WHERE status = 'present') * 100.0 / COUNT(*))::numeric, 2
          ) as attendance_rate
        FROM attendance_records ar
        JOIN employees e ON e.id = ar.employee_id
        ${whereClause}
      `;
      
      const analyticsResult = await execute_sql(analyticsQuery, queryParams.slice(0, -2));
      analytics = analyticsResult.rows[0];
      
      // Convert string numbers to proper types
      Object.keys(analytics).forEach(key => {
        if (analytics[key] !== null && !isNaN(analytics[key])) {
          analytics[key] = parseFloat(analytics[key]);
        }
      });
    }
    
    return NextResponse.json({
      success: true,
      data: result.rows,
      analytics: analytics,
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
    console.error('Error fetching attendance records:', error);
    return NextResponse.json({
      success: false,
      message: 'Failed to fetch attendance records',
      error: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
});

// POST - Create attendance record or bulk update
export const POST = withStaffPermissions('employees.attendance')(async function(request: NextRequest) {
  try {
    const { tenantId } = await getTenantContext(request);
    await validateTenantAccess(tenantId, request);

    const body = await request.json();
    
    // Check if this is a bulk operation
    if (body.date_range && body.updates) {
      return await handleBulkAttendanceUpdate(tenantId, body);
    } else {
      return await handleSingleAttendanceRecord(tenantId, body);
    }
    
  } catch (error) {
    console.error('Error creating attendance record:', error);
    
    if (error instanceof z.ZodError) {
      return NextResponse.json({
        success: false,
        message: 'Validation error',
        errors: error.errors
      }, { status: 400 });
    }
    
    return NextResponse.json({
      success: false,
      message: 'Failed to create attendance record',
      error: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
});

async function handleSingleAttendanceRecord(tenantId: string, body: any) {
  const validatedData = attendanceRecordSchema.parse(body);
  
  // Verify employee exists and belongs to tenant
  const employeeCheck = await execute_sql(`
    SELECT id, first_name, last_name, employee_code, employment_status
    FROM employees 
    WHERE tenant_id = $1 AND id = $2
  `, [tenantId, validatedData.employee_id]);
  
  if (employeeCheck.rows.length === 0) {
    return NextResponse.json({
      success: false,
      message: 'Employee not found'
    }, { status: 404 });
  }
  
  const employee = employeeCheck.rows[0];
  
  if (employee.employment_status !== 'active') {
    return NextResponse.json({
      success: false,
      message: 'Cannot create attendance record for inactive employee'
    }, { status: 400 });
  }
  
  return await withTransaction(async (client) => {
    // Check for duplicate record
    const duplicateCheck = await client.query(`
      SELECT id FROM attendance_records 
      WHERE tenant_id = $1 AND employee_id = $2 AND attendance_date = $3
    `, [tenantId, validatedData.employee_id, validatedData.attendance_date]);
    
    if (duplicateCheck.rows.length > 0) {
      return NextResponse.json({
        success: false,
        message: 'Attendance record already exists for this employee and date'
      }, { status: 409 });
    }
    
    // If actual times are not provided, try to populate from time clock entries
    let actualStartTime = validatedData.actual_start_time;
    let actualEndTime = validatedData.actual_end_time;
    let calculatedHours = validatedData.actual_hours;
    let overtimeHours = validatedData.overtime_hours || 0;
    let breakHours = validatedData.break_hours || 0;
    
    if (!actualStartTime || !actualEndTime) {
      const timeEntriesQuery = `
        SELECT entry_type, entry_timestamp 
        FROM time_clock_entries 
        WHERE tenant_id = $1 AND employee_id = $2 AND DATE(entry_timestamp) = $3
        ORDER BY entry_timestamp ASC
      `;
      
      const timeEntriesResult = await client.query(timeEntriesQuery, [
        tenantId, validatedData.employee_id, validatedData.attendance_date
      ]);
      
      const entries = timeEntriesResult.rows;
      const clockIn = entries.find((e: any) => e.entry_type === 'clock_in');
      const clockOut = entries.find((e: any) => e.entry_type === 'clock_out');
      
      if (clockIn) actualStartTime = clockIn.entry_timestamp;
      if (clockOut) actualEndTime = clockOut.entry_timestamp;
      
      // Calculate hours if both times are available
      if (actualStartTime && actualEndTime && !calculatedHours) {
        const totalTime = (new Date(actualEndTime).getTime() - new Date(actualStartTime).getTime()) / (1000 * 60 * 60);
        calculatedHours = Math.max(0, totalTime - breakHours);
        
        // Calculate overtime based on standard hours (8 hours default)
        const standardHours = validatedData.scheduled_hours || 8;
        overtimeHours = Math.max(0, calculatedHours - standardHours);
      }
    }
    
    // Insert attendance record
    const insertQuery = `
      INSERT INTO attendance_records (
        tenant_id, employee_id, attendance_date, shift_type, 
        scheduled_start_time, scheduled_end_time, scheduled_hours,
        actual_start_time, actual_end_time, break_start_time, break_end_time,
        actual_hours, overtime_hours, break_hours, status, is_overtime,
        clock_in_location, clock_out_location, notes, approved_by
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20)
      RETURNING *
    `;
    
    const result = await client.query(insertQuery, [
      tenantId,
      validatedData.employee_id,
      validatedData.attendance_date,
      validatedData.shift_type || 'regular',
      validatedData.scheduled_start_time || null,
      validatedData.scheduled_end_time || null,
      validatedData.scheduled_hours || null,
      actualStartTime || null,
      actualEndTime || null,
      validatedData.break_start_time || null,
      validatedData.break_end_time || null,
      calculatedHours || null,
      overtimeHours,
      breakHours,
      validatedData.status,
      overtimeHours > 0,
      validatedData.clock_in_location || null,
      validatedData.clock_out_location || null,
      validatedData.notes || null,
      validatedData.approved_by || null
    ]);
    
    const newRecord = result.rows[0];
    
    return NextResponse.json({
      success: true,
      message: 'Attendance record created successfully',
      data: {
        record: newRecord,
        employee: {
          id: employee.id,
          name: `${employee.first_name} ${employee.last_name}`,
          employee_code: employee.employee_code
        }
      }
    }, { status: 201 });
  });
}

async function handleBulkAttendanceUpdate(tenantId: string, body: any) {
  const validatedData = bulkAttendanceSchema.parse(body);
  
  return await withTransaction(async (client) => {
    // Build employee filter
    let employeeFilter = '';
    let employeeParams: any[] = [];
    
    if (validatedData.employee_ids && validatedData.employee_ids.length > 0) {
      employeeFilter = `AND e.id = ANY($3)`;
      employeeParams = [validatedData.employee_ids];
    } else if (validatedData.department) {
      employeeFilter = `AND e.department ILIKE $3`;
      employeeParams = [`%${validatedData.department}%`];
    }
    
    // Generate date range
    const startDate = new Date(validatedData.date_range.start_date);
    const endDate = new Date(validatedData.date_range.end_date);
    const dates: string[] = [];
    
    for (let d = new Date(startDate); d <= endDate; d.setDate(d.getDate() + 1)) {
      dates.push(d.toISOString().split('T')[0]);
    }
    
    if (dates.length > 31) {
      return NextResponse.json({
        success: false,
        message: 'Date range cannot exceed 31 days for bulk operations'
      }, { status: 400 });
    }
    
    // Get eligible employees
    const employeesQuery = `
      SELECT id, first_name, last_name, employee_code
      FROM employees e
      WHERE tenant_id = $1 AND employment_status = 'active' ${employeeFilter}
    `;
    
    const employeesResult = await client.query(employeesQuery, [tenantId, ...employeeParams]);
    const employees = employeesResult.rows;
    
    if (employees.length === 0) {
      return NextResponse.json({
        success: false,
        message: 'No eligible employees found for bulk update'
      }, { status: 400 });
    }
    
    let updatedRecords = 0;
    let createdRecords = 0;
    
    // Process each employee and date combination
    for (const employee of employees) {
      for (const date of dates) {
        // Build update fields
        const updateFields: string[] = [];
        const updateValues: any[] = [tenantId, employee.id, date];
        let paramCount = 3;
        
        Object.entries(validatedData.updates).forEach(([key, value]) => {
          if (value !== undefined) {
            paramCount++;
            updateFields.push(`${key} = $${paramCount}`);
            updateValues.push(value);
          }
        });
        
        if (updateFields.length === 0) continue;
        
        // Add updated_at
        paramCount++;
        updateFields.push(`updated_at = $${paramCount}`);
        updateValues.push(new Date().toISOString());
        
        // Upsert attendance record
        const upsertQuery = `
          INSERT INTO attendance_records (tenant_id, employee_id, attendance_date, ${Object.keys(validatedData.updates).join(', ')}, updated_at)
          VALUES ($1, $2, $3, ${Object.values(validatedData.updates).map((_, i) => `$${i + 4}`).join(', ')}, $${paramCount})
          ON CONFLICT (tenant_id, employee_id, attendance_date)
          DO UPDATE SET ${updateFields.join(', ')}
          RETURNING (xmax = 0) AS was_insert
        `;
        
        const upsertResult = await client.query(upsertQuery, updateValues);
        
        if (upsertResult.rows[0]?.was_insert) {
          createdRecords++;
        } else {
          updatedRecords++;
        }
      }
    }
    
    return NextResponse.json({
      success: true,
      message: `Bulk attendance update completed`,
      data: {
        employees_affected: employees.length,
        dates_processed: dates.length,
        records_created: createdRecords,
        records_updated: updatedRecords,
        total_records_affected: createdRecords + updatedRecords
      }
    });
  });
}