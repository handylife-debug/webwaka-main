import { NextRequest, NextResponse } from 'next/server'
import { execute_sql } from '../../../../../lib/database'
import { getTenantContext, validateTenantAccess } from '../../../../../lib/tenant-context'
import { withStaffPermissions } from '../../../../../lib/permission-middleware'
import { z } from 'zod'

// Time clock entry update schema
const timeClockUpdateSchema = z.object({
  entry_timestamp: z.string().optional(), // ISO timestamp
  location: z.string().max(200).optional(),
  notes: z.string().optional(),
  verified_by: z.string().uuid().optional(),
  manual_entry_reason: z.string().max(500).optional()
});

// GET - Get specific time clock entry details
export const GET = withStaffPermissions('employees.attendance')(async function(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const { tenantId } = await getTenantContext(request);
    await validateTenantAccess(tenantId, request);

    const entryId = params.id;
    
    // Get time clock entry with employee details
    const entryQuery = `
      SELECT 
        tce.*,
        e.first_name, e.last_name, e.employee_code, e.department, e.position_title,
        verifier.first_name as verifier_first_name, verifier.last_name as verifier_last_name
      FROM time_clock_entries tce
      JOIN employees e ON e.id = tce.employee_id
      LEFT JOIN users verifier ON verifier.id = tce.verified_by
      WHERE tce.tenant_id = $1 AND tce.id = $2
    `;
    
    const entryResult = await execute_sql(entryQuery, [tenantId, entryId]);
    
    if (entryResult.rows.length === 0) {
      return NextResponse.json({
        success: false,
        message: 'Time clock entry not found'
      }, { status: 404 });
    }
    
    const entry = entryResult.rows[0];
    
    // Get related entries for context (same employee, same day)
    const relatedEntriesQuery = `
      SELECT id, entry_type, entry_timestamp, location, is_manual_entry
      FROM time_clock_entries
      WHERE tenant_id = $1 AND employee_id = $2 
        AND DATE(entry_timestamp AT TIME ZONE 'UTC') = DATE($3 AT TIME ZONE 'UTC')
        AND id != $4
      ORDER BY entry_timestamp ASC
    `;
    
    const relatedEntriesResult = await execute_sql(relatedEntriesQuery, [
      tenantId, entry.employee_id, entry.entry_timestamp, entryId
    ]);
    
    // Calculate work session if this is a clock_out entry
    let workSession = null;
    if (entry.entry_type === 'clock_out') {
      const clockInQuery = `
        SELECT entry_timestamp
        FROM time_clock_entries
        WHERE tenant_id = $1 AND employee_id = $2 
          AND DATE(entry_timestamp AT TIME ZONE 'UTC') = DATE($3 AT TIME ZONE 'UTC')
          AND entry_type = 'clock_in'
          AND entry_timestamp < $3
        ORDER BY entry_timestamp DESC
        LIMIT 1
      `;
      
      const clockInResult = await execute_sql(clockInQuery, [
        tenantId, entry.employee_id, entry.entry_timestamp
      ]);
      
      if (clockInResult.rows.length > 0) {
        const clockInTime = new Date(clockInResult.rows[0].entry_timestamp);
        const clockOutTime = new Date(entry.entry_timestamp);
        const totalMinutes = Math.round((clockOutTime.getTime() - clockInTime.getTime()) / (1000 * 60));
        const hours = Math.floor(totalMinutes / 60);
        const minutes = totalMinutes % 60;
        
        workSession = {
          clock_in_time: clockInTime.toISOString(),
          clock_out_time: clockOutTime.toISOString(),
          total_minutes: totalMinutes,
          formatted_duration: `${hours}h ${minutes}m`
        };
      }
    }
    
    return NextResponse.json({
      success: true,
      data: {
        entry,
        related_entries: relatedEntriesResult.rows,
        work_session: workSession
      }
    });
    
  } catch (error) {
    console.error('Error fetching time clock entry:', error);
    return NextResponse.json({
      success: false,
      message: 'Failed to fetch time clock entry',
      error: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
});

// PUT - Update time clock entry (for corrections/verification)
export const PUT = withStaffPermissions('employees.attendance')(async function(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const { tenantId } = await getTenantContext(request);
    await validateTenantAccess(tenantId, request);

    const entryId = params.id;
    const body = await request.json();
    const validatedData = timeClockUpdateSchema.parse(body);
    
    // Check if entry exists and belongs to tenant
    const existingEntry = await execute_sql(`
      SELECT id, employee_id, entry_type, entry_timestamp, is_manual_entry
      FROM time_clock_entries 
      WHERE tenant_id = $1 AND id = $2
    `, [tenantId, entryId]);
    
    if (existingEntry.rows.length === 0) {
      return NextResponse.json({
        success: false,
        message: 'Time clock entry not found'
      }, { status: 404 });
    }
    
    const entry = existingEntry.rows[0];
    
    // Validate timestamp if being updated
    if (validatedData.entry_timestamp) {
      const newTimestamp = new Date(validatedData.entry_timestamp);
      const currentTime = new Date();
      
      // Don't allow future timestamps
      if (newTimestamp > currentTime) {
        return NextResponse.json({
          success: false,
          message: 'Cannot set entry timestamp in the future'
        }, { status: 400 });
      }
      
      // Don't allow timestamps more than 7 days in the past (configurable business rule)
      const sevenDaysAgo = new Date(currentTime.getTime() - (7 * 24 * 60 * 60 * 1000));
      if (newTimestamp < sevenDaysAgo) {
        return NextResponse.json({
          success: false,
          message: 'Cannot set entry timestamp more than 7 days in the past'
        }, { status: 400 });
      }
    }
    
    // Validate tenant access for verified_by user if provided
    if (validatedData.verified_by) {
      const userValidation = await execute_sql(`
        SELECT ut.user_id, ut.tenant_id 
        FROM user_tenants ut 
        WHERE ut.user_id = $1 AND ut.tenant_id = $2 AND ut.status = 'active'
      `, [validatedData.verified_by, tenantId]);
      
      if (userValidation.rows.length === 0) {
        return NextResponse.json({
          success: false,
          message: 'Invalid verified_by user: User does not exist or does not belong to this tenant'
        }, { status: 400 });
      }
    }
    
    // Build dynamic update query
    const updateFields: string[] = [];
    const updateValues: any[] = [tenantId, entryId];
    let paramCount = 2;
    
    Object.entries(validatedData).forEach(([key, value]) => {
      if (value !== undefined) {
        paramCount++;
        updateFields.push(`${key} = $${paramCount}`);
        updateValues.push(value);
      }
    });
    
    if (updateFields.length === 0) {
      return NextResponse.json({
        success: false,
        message: 'No fields to update'
      }, { status: 400 });
    }
    
    // Mark as verified if verified_by is set
    if (validatedData.verified_by) {
      paramCount++;
      updateFields.push(`verified_at = $${paramCount}`);
      updateValues.push(new Date().toISOString());
    }
    
    // Add updated timestamp (automatically handled by trigger, but adding explicitly for consistency)
    paramCount++;
    updateFields.push(`updated_at = $${paramCount}`);
    updateValues.push(new Date().toISOString());
    
    const updateQuery = `
      UPDATE time_clock_entries 
      SET ${updateFields.join(', ')}
      WHERE tenant_id = $1 AND id = $2
      RETURNING *
    `;
    
    const result = await execute_sql(updateQuery, updateValues);
    const updatedEntry = result.rows[0];
    
    // If timestamp was updated, recalculate attendance record for affected date(s)
    if (validatedData.entry_timestamp) {
      const originalDate = new Date(entry.entry_timestamp).toISOString().split('T')[0];
      const newDate = new Date(validatedData.entry_timestamp).toISOString().split('T')[0];
      
      // Recalculate attendance for original date
      await recalculateAttendanceForDate(tenantId, entry.employee_id, originalDate);
      
      // If date changed, also recalculate for new date
      if (originalDate !== newDate) {
        await recalculateAttendanceForDate(tenantId, entry.employee_id, newDate);
      }
    }
    
    return NextResponse.json({
      success: true,
      message: 'Time clock entry updated successfully',
      data: updatedEntry
    });
    
  } catch (error) {
    console.error('Error updating time clock entry:', error);
    
    if (error instanceof z.ZodError) {
      return NextResponse.json({
        success: false,
        message: 'Validation error',
        errors: error.errors
      }, { status: 400 });
    }
    
    return NextResponse.json({
      success: false,
      message: 'Failed to update time clock entry',
      error: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
});

// DELETE - Delete time clock entry (with cascade effects)
export const DELETE = withStaffPermissions('employees.attendance')(async function(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const { tenantId } = await getTenantContext(request);
    await validateTenantAccess(tenantId, request);

    const entryId = params.id;
    
    // Check if entry exists and get details
    const existingEntry = await execute_sql(`
      SELECT id, employee_id, entry_type, entry_timestamp, is_manual_entry
      FROM time_clock_entries 
      WHERE tenant_id = $1 AND id = $2
    `, [tenantId, entryId]);
    
    if (existingEntry.rows.length === 0) {
      return NextResponse.json({
        success: false,
        message: 'Time clock entry not found'
      }, { status: 404 });
    }
    
    const entry = existingEntry.rows[0];
    const entryDate = new Date(entry.entry_timestamp).toISOString().split('T')[0];
    
    // Check if this deletion would break the time clock sequence
    const { searchParams } = new URL(request.url);
    const force = searchParams.get('force') === 'true';
    
    if (!force) {
      // Check for dependent entries (e.g., can't delete clock_in if clock_out exists)
      if (entry.entry_type === 'clock_in') {
        const dependentEntries = await execute_sql(`
          SELECT COUNT(*) as count
          FROM time_clock_entries
          WHERE tenant_id = $1 AND employee_id = $2 
            AND DATE(entry_timestamp) = $3
            AND entry_timestamp > $4
            AND entry_type IN ('clock_out', 'break_start', 'break_end')
        `, [tenantId, entry.employee_id, entryDate, entry.entry_timestamp]);
        
        if (parseInt(dependentEntries.rows[0].count) > 0) {
          return NextResponse.json({
            success: false,
            message: 'Cannot delete clock-in entry with dependent entries. Use force=true to delete all related entries.',
            has_dependencies: true
          }, { status: 409 });
        }
      }
    }
    
    // Delete the entry
    const result = await execute_sql(`
      DELETE FROM time_clock_entries 
      WHERE tenant_id = $1 AND id = $2
      RETURNING id, entry_type, entry_timestamp
    `, [tenantId, entryId]);
    
    // Recalculate attendance record for the affected date
    await recalculateAttendanceForDate(tenantId, entry.employee_id, entryDate);
    
    return NextResponse.json({
      success: true,
      message: 'Time clock entry deleted successfully',
      data: result.rows[0]
    });
    
  } catch (error) {
    console.error('Error deleting time clock entry:', error);
    return NextResponse.json({
      success: false,
      message: 'Failed to delete time clock entry',
      error: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
});

// Helper function to recalculate attendance record for a specific date
async function recalculateAttendanceForDate(tenantId: string, employeeId: string, date: string) {
  try {
    // Get all entries for this employee on this date
    const entriesQuery = `
      SELECT entry_type, entry_timestamp 
      FROM time_clock_entries 
      WHERE tenant_id = $1 AND employee_id = $2 AND DATE(entry_timestamp) = $3
      ORDER BY entry_timestamp ASC
    `;
    
    const entriesResult = await execute_sql(entriesQuery, [tenantId, employeeId, date]);
    const entries = entriesResult.rows;
    
    if (entries.length === 0) {
      // No entries for this date, delete attendance record if it exists
      await execute_sql(`
        DELETE FROM attendance_records 
        WHERE tenant_id = $1 AND employee_id = $2 AND attendance_date = $3
      `, [tenantId, employeeId, date]);
      return;
    }
    
    // Find clock in and clock out times
    const clockIn = entries.find((e: any) => e.entry_type === 'clock_in');
    const clockOut = entries.find((e: any) => e.entry_type === 'clock_out');
    
    if (!clockIn || !clockOut) {
      // Incomplete day, mark as partial
      await execute_sql(`
        INSERT INTO attendance_records (
          tenant_id, employee_id, attendance_date, actual_start_time, status
        ) VALUES ($1, $2, $3, $4, $5)
        ON CONFLICT (tenant_id, employee_id, attendance_date) 
        DO UPDATE SET
          actual_start_time = EXCLUDED.actual_start_time,
          actual_end_time = NULL,
          actual_hours = NULL,
          overtime_hours = 0,
          break_hours = 0,
          status = EXCLUDED.status,
          updated_at = CURRENT_TIMESTAMP
      `, [tenantId, employeeId, date, clockIn?.entry_timestamp || null, 'partial']);
      return;
    }
    
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
    const employeeResult = await execute_sql(employeeQuery, [employeeId]);
    const standardDailyHours = (employeeResult.rows[0]?.work_hours_per_week || 40) / 5; // Assume 5-day work week
    
    const overtimeHours = Math.max(0, actualHours - standardDailyHours);
    
    // Update attendance record
    await execute_sql(`
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
    `, [
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
    console.error('Error recalculating attendance record:', error);
    // Don't throw - this is a background update that shouldn't fail the main operation
  }
}