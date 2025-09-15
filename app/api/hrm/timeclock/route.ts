import { NextRequest, NextResponse } from 'next/server'
import { execute_sql, withTransaction } from '../../../../lib/database'
import { getTenantContext, validateTenantAccess } from '../../../../lib/tenant-context'
import { withStaffPermissions } from '../../../../lib/permission-middleware'
import { z } from 'zod'

// Time clock entry schema
const timeClockEntrySchema = z.object({
  employee_id: z.string().uuid(),
  entry_type: z.enum(['clock_in', 'clock_out', 'break_start', 'break_end']),
  entry_timestamp: z.string().optional(), // ISO timestamp, defaults to current time
  location: z.string().max(200).optional(),
  notes: z.string().optional(),
  photo_url: z.string().url().optional(),
  gps_coordinates: z.object({
    latitude: z.number(),
    longitude: z.number()
  }).optional(),
  device_info: z.record(z.any()).optional()
});

// Manual entry schema (for managers/supervisors)
const manualEntrySchema = z.object({
  employee_id: z.string().uuid(),
  entry_type: z.enum(['clock_in', 'clock_out', 'break_start', 'break_end']),
  entry_timestamp: z.string(), // Required for manual entries
  location: z.string().max(200).optional(),
  manual_entry_reason: z.string().min(1).max(500),
  notes: z.string().optional()
});

// Valid columns for sorting (security whitelist)
const VALID_SORT_COLUMNS = [
  'entry_timestamp', 'entry_type', 'employee_id', 'created_at', 'location'
];
const VALID_SORT_ORDERS = ['ASC', 'DESC'];

// GET - List time clock entries with filtering
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
    const sortBy = searchParams.get('sort_by') || 'entry_timestamp';
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
    const entryType = searchParams.get('entry_type') || '';
    const startDate = searchParams.get('start_date') || '';
    const endDate = searchParams.get('end_date') || '';
    const location = searchParams.get('location') || '';
    const includeEmployee = searchParams.get('include_employee') === 'true';
    
    // Build WHERE clause
    let whereConditions = ['tce.tenant_id = $1'];
    let queryParams: any[] = [tenantId];
    let paramCount = 1;
    
    if (employeeId) {
      paramCount++;
      whereConditions.push(`tce.employee_id = $${paramCount}`);
      queryParams.push(employeeId);
    }
    
    if (entryType) {
      paramCount++;
      whereConditions.push(`tce.entry_type = $${paramCount}`);
      queryParams.push(entryType);
    }
    
    if (location) {
      paramCount++;
      whereConditions.push(`tce.location ILIKE $${paramCount}`);
      queryParams.push(`%${location}%`);
    }
    
    if (startDate) {
      paramCount++;
      whereConditions.push(`DATE(tce.entry_timestamp AT TIME ZONE 'UTC') >= $${paramCount}`);
      queryParams.push(startDate);
    }
    
    if (endDate) {
      paramCount++;
      whereConditions.push(`DATE(tce.entry_timestamp AT TIME ZONE 'UTC') <= $${paramCount}`);
      queryParams.push(endDate);
    }
    
    const whereClause = whereConditions.length > 0 ? `WHERE ${whereConditions.join(' AND ')}` : '';
    
    // Base select fields
    const baseSelect = includeEmployee ? 
      `tce.*, e.first_name, e.last_name, e.employee_code, e.department, e.position_title` :
      `tce.id, tce.employee_id, tce.entry_type, tce.entry_timestamp, tce.location, 
       tce.is_manual_entry, tce.verified_by, tce.verified_at, tce.created_at`;
    
    const employeeJoin = includeEmployee ? 'JOIN employees e ON e.id = tce.employee_id' : '';
    
    // Main query
    const query = `
      SELECT ${baseSelect}
      FROM time_clock_entries tce
      ${employeeJoin}
      ${whereClause}
      ORDER BY tce.${sortBy} ${sortOrder}
      LIMIT $${paramCount + 1} OFFSET $${paramCount + 2}
    `;
    
    queryParams.push(limit, offset);
    
    const result = await execute_sql(query, queryParams);
    
    // Get total count for pagination
    const countQuery = `
      SELECT COUNT(*) as total 
      FROM time_clock_entries tce
      ${whereClause}
    `;
    const countResult = await execute_sql(countQuery, queryParams.slice(0, -2)); // Remove limit/offset
    const total = parseInt(countResult.rows[0].total);
    
    // Get statistics for today
    const statsQuery = `
      SELECT 
        COUNT(*) as total_entries_today,
        COUNT(*) FILTER (WHERE entry_type = 'clock_in') as clock_ins_today,
        COUNT(*) FILTER (WHERE entry_type = 'clock_out') as clock_outs_today,
        COUNT(*) FILTER (WHERE is_manual_entry = true) as manual_entries_today,
        COUNT(DISTINCT employee_id) as active_employees_today
      FROM time_clock_entries
      WHERE tenant_id = $1 AND DATE(entry_timestamp) = CURRENT_DATE
    `;
    
    const statsResult = await execute_sql(statsQuery, [tenantId]);
    const stats = statsResult.rows[0];
    
    return NextResponse.json({
      success: true,
      data: result.rows,
      statistics: {
        total_entries_today: parseInt(stats.total_entries_today || 0),
        clock_ins_today: parseInt(stats.clock_ins_today || 0),
        clock_outs_today: parseInt(stats.clock_outs_today || 0),
        manual_entries_today: parseInt(stats.manual_entries_today || 0),
        active_employees_today: parseInt(stats.active_employees_today || 0)
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
    console.error('Error fetching time clock entries:', error);
    return NextResponse.json({
      success: false,
      message: 'Failed to fetch time clock entries',
      error: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
});

// POST - Create new time clock entry (clock in/out/break)
export const POST = withStaffPermissions('employees.attendance')(async function(request: NextRequest) {
  try {
    const { tenantId } = await getTenantContext(request);
    await validateTenantAccess(tenantId, request);

    const body = await request.json();
    const isManualEntry = body.manual_entry_reason ? true : false;
    
    // Validate based on entry type
    const validatedData = isManualEntry ? 
      manualEntrySchema.parse(body) : 
      timeClockEntrySchema.parse(body);
    
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
        message: 'Cannot create time clock entry for inactive employee'
      }, { status: 400 });
    }
    
    return await withTransaction(async (client) => {
      // Business logic validation for time clock entries
      const currentTime = validatedData.entry_timestamp ? 
        new Date(validatedData.entry_timestamp) : new Date();
      const today = currentTime.toISOString().split('T')[0];
      
      // Get today's entries for this employee
      const todayEntriesQuery = `
        SELECT entry_type, entry_timestamp 
        FROM time_clock_entries 
        WHERE tenant_id = $1 AND employee_id = $2 AND DATE(entry_timestamp AT TIME ZONE 'UTC') = $3
        ORDER BY entry_timestamp DESC
      `;
      
      const todayEntriesResult = await client.query(todayEntriesQuery, [
        tenantId, validatedData.employee_id, today
      ]);
      
      const todayEntries = todayEntriesResult.rows;
      const lastEntry = todayEntries[0];
      
      // Validate entry sequence
      if (validatedData.entry_type === 'clock_in') {
        // Can only clock in if not already clocked in
        if (lastEntry && (lastEntry.entry_type === 'clock_in' || lastEntry.entry_type === 'break_end')) {
          return NextResponse.json({
            success: false,
            message: 'Employee is already clocked in'
          }, { status: 400 });
        }
      } else if (validatedData.entry_type === 'clock_out') {
        // Can only clock out if currently clocked in
        if (!lastEntry || (lastEntry.entry_type !== 'clock_in' && lastEntry.entry_type !== 'break_end')) {
          return NextResponse.json({
            success: false,
            message: 'Employee must clock in before clocking out'
          }, { status: 400 });
        }
      } else if (validatedData.entry_type === 'break_start') {
        // Can only start break if currently clocked in
        if (!lastEntry || lastEntry.entry_type !== 'clock_in') {
          return NextResponse.json({
            success: false,
            message: 'Employee must be clocked in to start break'
          }, { status: 400 });
        }
      } else if (validatedData.entry_type === 'break_end') {
        // Can only end break if currently on break
        if (!lastEntry || lastEntry.entry_type !== 'break_start') {
          return NextResponse.json({
            success: false,
            message: 'Employee must be on break to end break'
          }, { status: 400 });
        }
      }
      
      // Get client IP address
      const clientIp = request.headers.get('x-forwarded-for') || 
                      request.headers.get('x-real-ip') || 
                      '127.0.0.1';
      
      // Prepare GPS coordinates for database
      let gpsPoint = null;
      if (!isManualEntry && 'gps_coordinates' in validatedData && validatedData.gps_coordinates) {
        gpsPoint = `(${validatedData.gps_coordinates.longitude},${validatedData.gps_coordinates.latitude})`;
      }
      
      // Insert time clock entry
      const insertQuery = `
        INSERT INTO time_clock_entries (
          tenant_id, employee_id, entry_type, entry_timestamp, location, ip_address,
          device_info, gps_coordinates, is_manual_entry, manual_entry_reason,
          photo_url, notes, metadata
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
        RETURNING *
      `;
      
      const insertResult = await client.query(insertQuery, [
        tenantId,
        validatedData.employee_id,
        validatedData.entry_type,
        currentTime.toISOString(),
        validatedData.location || null,
        clientIp,
        (!isManualEntry && 'device_info' in validatedData && validatedData.device_info) ? JSON.stringify(validatedData.device_info) : '{}',
        gpsPoint,
        isManualEntry,
        isManualEntry ? (validatedData as any).manual_entry_reason : null,
        (!isManualEntry && 'photo_url' in validatedData) ? validatedData.photo_url || null : null,
        validatedData.notes || null,
        '{}'
      ]);
      
      const newEntry = insertResult.rows[0];
      
      // Auto-update or create attendance record if this completes a day
      if (validatedData.entry_type === 'clock_out') {
        await updateAttendanceRecord(client, tenantId, validatedData.employee_id, today);
      }
      
      return NextResponse.json({
        success: true,
        message: `${validatedData.entry_type.replace('_', ' ')} recorded successfully`,
        data: {
          entry: newEntry,
          employee: {
            id: employee.id,
            name: `${employee.first_name} ${employee.last_name}`,
            employee_code: employee.employee_code
          }
        }
      }, { status: 201 });
    });
    
  } catch (error) {
    console.error('Error creating time clock entry:', error);
    
    if (error instanceof z.ZodError) {
      return NextResponse.json({
        success: false,
        message: 'Validation error',
        errors: error.errors
      }, { status: 400 });
    }
    
    return NextResponse.json({
      success: false,
      message: 'Failed to create time clock entry',
      error: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
});

// Helper function to update attendance record when day is complete
async function updateAttendanceRecord(client: any, tenantId: string, employeeId: string, date: string) {
  try {
    // Get all entries for this employee on this date
    const entriesQuery = `
      SELECT entry_type, entry_timestamp 
      FROM time_clock_entries 
      WHERE tenant_id = $1 AND employee_id = $2 AND DATE(entry_timestamp AT TIME ZONE 'UTC') = $3
      ORDER BY entry_timestamp ASC
    `;
    
    const entriesResult = await client.query(entriesQuery, [tenantId, employeeId, date]);
    const entries = entriesResult.rows;
    
    if (entries.length === 0) return;
    
    // Find clock in and clock out times
    const clockIn = entries.find((e: any) => e.entry_type === 'clock_in');
    const clockOut = entries.find((e: any) => e.entry_type === 'clock_out');
    
    if (!clockIn || !clockOut) return;
    
    // Calculate break time
    const breakEntries = entries.filter((e: any) => e.entry_type === 'break_start' || e.entry_type === 'break_end');
    let totalBreakHours = 0;
    
    for (let i = 0; i < breakEntries.length; i += 2) {
      const breakStart = breakEntries[i];
      const breakEnd = breakEntries[i + 1];
      
      if (breakStart && breakEnd && breakStart.entry_type === 'break_start' && breakEnd.entry_type === 'break_end') {
        const breakDuration = (new Date(breakEnd.entry_timestamp).getTime() - new Date(breakStart.entry_timestamp).getTime()) / (1000 * 60 * 60);
        totalBreakHours += breakDuration;
      }
    }
    
    // Calculate total hours worked
    const totalTime = (new Date(clockOut.entry_timestamp).getTime() - new Date(clockIn.entry_timestamp).getTime()) / (1000 * 60 * 60);
    const actualHours = Math.max(0, totalTime - totalBreakHours);
    
    // Get employee's standard work hours for overtime calculation
    const employeeQuery = `SELECT work_hours_per_week FROM employees WHERE id = $1`;
    const employeeResult = await client.query(employeeQuery, [employeeId]);
    const standardDailyHours = (employeeResult.rows[0]?.work_hours_per_week || 40) / 5; // Assume 5-day work week
    
    const overtimeHours = Math.max(0, actualHours - standardDailyHours);
    const regularHours = actualHours - overtimeHours;
    
    // Insert or update attendance record
    const upsertQuery = `
      INSERT INTO attendance_records (
        tenant_id, employee_id, attendance_date, actual_start_time, actual_end_time,
        actual_hours, overtime_hours, break_hours, status, is_overtime
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      ON CONFLICT (tenant_id, employee_id, attendance_date) 
      DO UPDATE SET
        actual_start_time = EXCLUDED.actual_start_time,
        actual_end_time = EXCLUDED.actual_end_time,
        actual_hours = EXCLUDED.actual_hours,
        overtime_hours = EXCLUDED.overtime_hours,
        break_hours = EXCLUDED.break_hours,
        status = EXCLUDED.status,
        is_overtime = EXCLUDED.is_overtime,
        updated_at = CURRENT_TIMESTAMP
    `;
    
    await client.query(upsertQuery, [
      tenantId,
      employeeId,
      date,
      clockIn.entry_timestamp,
      clockOut.entry_timestamp,
      actualHours,
      overtimeHours,
      totalBreakHours,
      'present',
      overtimeHours > 0
    ]);
    
  } catch (error) {
    console.error('Error updating attendance record:', error);
    // Don't throw - this is a background update that shouldn't fail the main operation
  }
}