import { NextRequest, NextResponse } from 'next/server'
import { execute_sql, withTransaction } from '../../../../../lib/database'
import { getTenantContext, validateTenantAccess } from '../../../../../lib/tenant-context'
import { withStaffPermissions } from '../../../../../lib/permission-middleware'
import { z } from 'zod'

// Attendance record update schema
const attendanceUpdateSchema = z.object({
  // Schedule information
  shift_type: z.string().max(50).optional(),
  scheduled_start_time: z.string().optional(), // Time string (HH:MM)
  scheduled_end_time: z.string().optional(), // Time string (HH:MM)
  scheduled_hours: z.number().min(0).max(24).optional(),
  
  // Manual time adjustments
  actual_start_time: z.string().optional(), // ISO timestamp
  actual_end_time: z.string().optional(), // ISO timestamp
  break_start_time: z.string().optional(), // ISO timestamp
  break_end_time: z.string().optional(), // ISO timestamp
  
  // Calculated hours
  actual_hours: z.number().min(0).max(24).optional(),
  overtime_hours: z.number().min(0).max(24).optional(),
  break_hours: z.number().min(0).max(24).optional(),
  
  // Attendance status
  status: z.enum(['present', 'absent', 'late', 'half_day', 'sick', 'vacation', 'holiday', 'unpaid_leave']).optional(),
  
  // Location and approval
  clock_in_location: z.string().max(200).optional(),
  clock_out_location: z.string().max(200).optional(),
  notes: z.string().optional(),
  approved_by: z.string().uuid().optional()
});

// Approval action schema
const approvalActionSchema = z.object({
  action: z.enum(['approve', 'reject']),
  approved_by: z.string().uuid(),
  approval_notes: z.string().optional()
});

// GET - Get specific attendance record with detailed information
export const GET = withStaffPermissions('employees.attendance')(async function(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { tenantId } = await getTenantContext(request);
    await validateTenantAccess(tenantId, request);

    const { id } = await params;
    const recordId = id;
    const { searchParams } = new URL(request.url);
    const includeTimeEntries = searchParams.get('include_time_entries') === 'true';
    const includePayroll = searchParams.get('include_payroll') === 'true';
    
    // Get attendance record with employee details
    const recordQuery = `
      SELECT 
        ar.*,
        e.first_name, e.last_name, e.employee_code, e.department, e.position_title,
        e.hourly_rate, e.overtime_rate, e.work_hours_per_week, e.employee_type,
        approver.first_name as approver_first_name, approver.last_name as approver_last_name
      FROM attendance_records ar
      JOIN employees e ON e.id = ar.employee_id
      LEFT JOIN users approver ON approver.id = ar.approved_by
      WHERE ar.tenant_id = $1 AND ar.id = $2
    `;
    
    const recordResult = await execute_sql(recordQuery, [tenantId, recordId]);
    
    if (recordResult.rows.length === 0) {
      return NextResponse.json({
        success: false,
        message: 'Attendance record not found'
      }, { status: 404 });
    }
    
    const record = recordResult.rows[0];
    
    let timeEntries = null;
    let payrollCalculation = null;
    
    // Get time clock entries if requested
    if (includeTimeEntries) {
      const timeEntriesQuery = `
        SELECT 
          id, entry_type, entry_timestamp, location, ip_address, 
          is_manual_entry, manual_entry_reason, verified_by, verified_at,
          photo_url, notes, gps_coordinates, device_info
        FROM time_clock_entries
        WHERE tenant_id = $1 AND employee_id = $2 AND DATE(entry_timestamp AT TIME ZONE 'UTC') = $3
        ORDER BY entry_timestamp ASC
      `;
      
      const timeEntriesResult = await execute_sql(timeEntriesQuery, [
        tenantId, record.employee_id, record.attendance_date
      ]);
      
      timeEntries = timeEntriesResult.rows;
    }
    
    // Calculate payroll information if requested
    if (includePayroll && record.actual_hours) {
      const regularHours = Math.max(0, record.actual_hours - (record.overtime_hours || 0));
      const overtimeHours = record.overtime_hours || 0;
      
      // Use overtime_rate if already set, otherwise calculate from hourly_rate * 1.5
      const effectiveOvertimeRate = record.overtime_rate || ((record.hourly_rate || 0) * 1.5);
      
      const regularPay = regularHours * (record.hourly_rate || 0);
      const overtimePay = overtimeHours * effectiveOvertimeRate;
      const totalPay = regularPay + overtimePay;
      
      payrollCalculation = {
        regular_hours: regularHours,
        overtime_hours: overtimeHours,
        hourly_rate: record.hourly_rate || 0,
        overtime_rate: effectiveOvertimeRate,
        regular_pay: regularPay,
        overtime_pay: overtimePay,
        total_pay: totalPay,
        break_hours: record.break_hours || 0,
        scheduled_hours: record.scheduled_hours || 0,
        actual_hours: record.actual_hours || 0
      };
    }
    
    // Calculate time variance analysis
    let timeVariance = null;
    if (record.scheduled_start_time && record.actual_start_time) {
      const scheduledStart = new Date(`${record.attendance_date}T${record.scheduled_start_time}:00`);
      const actualStart = new Date(record.actual_start_time);
      const startVarianceMinutes = Math.round((actualStart.getTime() - scheduledStart.getTime()) / (1000 * 60));
      
      let endVarianceMinutes = 0;
      if (record.scheduled_end_time && record.actual_end_time) {
        const scheduledEnd = new Date(`${record.attendance_date}T${record.scheduled_end_time}:00`);
        const actualEnd = new Date(record.actual_end_time);
        endVarianceMinutes = Math.round((actualEnd.getTime() - scheduledEnd.getTime()) / (1000 * 60));
      }
      
      timeVariance = {
        start_variance_minutes: startVarianceMinutes,
        end_variance_minutes: endVarianceMinutes,
        is_late: startVarianceMinutes > 0,
        is_early_departure: endVarianceMinutes < 0,
        total_variance_minutes: startVarianceMinutes + endVarianceMinutes
      };
    }
    
    return NextResponse.json({
      success: true,
      data: {
        record,
        time_entries: timeEntries,
        payroll_calculation: payrollCalculation,
        time_variance: timeVariance
      }
    });
    
  } catch (error) {
    console.error('Error fetching attendance record:', error);
    return NextResponse.json({
      success: false,
      message: 'Failed to fetch attendance record',
      error: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
});

// PUT - Update attendance record
export const PUT = withStaffPermissions('employees.attendance')(async function(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { tenantId } = await getTenantContext(request);
    await validateTenantAccess(tenantId, request);

    const { id } = await params;
    const recordId = id;
    const body = await request.json();
    
    // Check if this is an approval action
    if (body.action && ['approve', 'reject'].includes(body.action)) {
      return await handleApprovalAction(tenantId, recordId, body);
    }
    
    const validatedData = attendanceUpdateSchema.parse(body);
    
    // Check if record exists and belongs to tenant
    const existingRecord = await execute_sql(`
      SELECT id, employee_id, attendance_date, status, approved_by, approved_at
      FROM attendance_records 
      WHERE tenant_id = $1 AND id = $2
    `, [tenantId, recordId]);
    
    if (existingRecord.rows.length === 0) {
      return NextResponse.json({
        success: false,
        message: 'Attendance record not found'
      }, { status: 404 });
    }
    
    const record = existingRecord.rows[0];
    
    return await withTransaction(async (client) => {
      // Build dynamic update query
      const updateFields: string[] = [];
      const updateValues: any[] = [tenantId, recordId];
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
      
      // Recalculate derived fields if times are updated
      if (validatedData.actual_start_time || validatedData.actual_end_time || validatedData.break_hours !== undefined) {
        const updatedRecord = await calculateDerivedFields(
          client, 
          tenantId, 
          record.employee_id, 
          record.attendance_date, 
          validatedData
        );
        
        // Add calculated fields to update
        if (updatedRecord.actual_hours !== undefined) {
          paramCount++;
          updateFields.push(`actual_hours = $${paramCount}`);
          updateValues.push(updatedRecord.actual_hours);
        }
        
        if (updatedRecord.overtime_hours !== undefined) {
          paramCount++;
          updateFields.push(`overtime_hours = $${paramCount}`);
          updateValues.push(updatedRecord.overtime_hours);
          
          paramCount++;
          updateFields.push(`is_overtime = $${paramCount}`);
          updateValues.push(updatedRecord.overtime_hours > 0);
        }
      }
      
      // If approving, add approval fields
      if (validatedData.approved_by) {
        paramCount++;
        updateFields.push(`approved_at = $${paramCount}`);
        updateValues.push(new Date().toISOString());
      }
      
      // Add updated_at field
      paramCount++;
      updateFields.push(`updated_at = $${paramCount}`);
      updateValues.push(new Date().toISOString());
      
      const updateQuery = `
        UPDATE attendance_records 
        SET ${updateFields.join(', ')}
        WHERE tenant_id = $1 AND id = $2
        RETURNING *
      `;
      
      const result = await client.query(updateQuery, updateValues);
      const updatedRecord = result.rows[0];
      
      return NextResponse.json({
        success: true,
        message: 'Attendance record updated successfully',
        data: updatedRecord
      });
    });
    
  } catch (error) {
    console.error('Error updating attendance record:', error);
    
    if (error instanceof z.ZodError) {
      return NextResponse.json({
        success: false,
        message: 'Validation error',
        errors: error.errors
      }, { status: 400 });
    }
    
    return NextResponse.json({
      success: false,
      message: 'Failed to update attendance record',
      error: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
});

// DELETE - Delete attendance record
export const DELETE = withStaffPermissions('employees.attendance')(async function(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { tenantId } = await getTenantContext(request);
    await validateTenantAccess(tenantId, request);

    const { id } = await params;
    const recordId = id;
    
    // Check if record exists and get details
    const existingRecord = await execute_sql(`
      SELECT id, employee_id, attendance_date, status
      FROM attendance_records 
      WHERE tenant_id = $1 AND id = $2
    `, [tenantId, recordId]);
    
    if (existingRecord.rows.length === 0) {
      return NextResponse.json({
        success: false,
        message: 'Attendance record not found'
      }, { status: 404 });
    }
    
    const record = existingRecord.rows[0];
    
    // Check if there are associated time clock entries
    const timeEntriesCount = await execute_sql(`
      SELECT COUNT(*) as count
      FROM time_clock_entries
      WHERE tenant_id = $1 AND employee_id = $2 AND DATE(entry_timestamp) = $3
    `, [tenantId, record.employee_id, record.attendance_date]);
    
    const hasTimeEntries = parseInt(timeEntriesCount.rows[0].count) > 0;
    
    const { searchParams } = new URL(request.url);
    const deleteTimeEntries = searchParams.get('delete_time_entries') === 'true';
    
    if (hasTimeEntries && !deleteTimeEntries) {
      return NextResponse.json({
        success: false,
        message: 'Cannot delete attendance record with associated time clock entries. Use delete_time_entries=true to also delete time entries.',
        has_time_entries: true
      }, { status: 409 });
    }
    
    return await withTransaction(async (client) => {
      // Delete associated time clock entries if requested
      if (deleteTimeEntries) {
        await client.query(`
          DELETE FROM time_clock_entries
          WHERE tenant_id = $1 AND employee_id = $2 AND DATE(entry_timestamp) = $3
        `, [tenantId, record.employee_id, record.attendance_date]);
      }
      
      // Delete attendance record
      const result = await client.query(`
        DELETE FROM attendance_records 
        WHERE tenant_id = $1 AND id = $2
        RETURNING id, employee_id, attendance_date, status
      `, [tenantId, recordId]);
      
      return NextResponse.json({
        success: true,
        message: `Attendance record deleted successfully${deleteTimeEntries ? ' (including time clock entries)' : ''}`,
        data: result.rows[0]
      });
    });
    
  } catch (error) {
    console.error('Error deleting attendance record:', error);
    return NextResponse.json({
      success: false,
      message: 'Failed to delete attendance record',
      error: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
});

// Helper function to handle approval actions
async function handleApprovalAction(tenantId: string, recordId: string, body: any) {
  const validatedData = approvalActionSchema.parse(body);
  
  // Validate tenant access for approved_by user
  const userValidation = await execute_sql(`
    SELECT ut.user_id, ut.tenant_id 
    FROM user_tenants ut 
    WHERE ut.user_id = $1 AND ut.tenant_id = $2 AND ut.status = 'active'
  `, [validatedData.approved_by, tenantId]);
  
  if (userValidation.rows.length === 0) {
    return NextResponse.json({
      success: false,
      message: 'Invalid approved_by user: User does not exist or does not belong to this tenant'
    }, { status: 400 });
  }
  
  const updateQuery = `
    UPDATE attendance_records 
    SET approved_by = $3, approved_at = $4, notes = COALESCE(notes, '') || $5, updated_at = $6
    WHERE tenant_id = $1 AND id = $2
    RETURNING *
  `;
  
  const approvalNote = validatedData.approval_notes ? 
    `\n[${validatedData.action.toUpperCase()}] ${validatedData.approval_notes}` : 
    `\n[${validatedData.action.toUpperCase()}] by supervisor`;
  
  const result = await execute_sql(updateQuery, [
    tenantId,
    recordId,
    validatedData.approved_by,
    new Date().toISOString(),
    approvalNote,
    new Date().toISOString()
  ]);
  
  if (result.rows.length === 0) {
    return NextResponse.json({
      success: false,
      message: 'Attendance record not found'
    }, { status: 404 });
  }
  
  return NextResponse.json({
    success: true,
    message: `Attendance record ${validatedData.action}d successfully`,
    data: result.rows[0]
  });
}

// Helper function to calculate derived fields (hours, overtime)
async function calculateDerivedFields(client: any, tenantId: string, employeeId: string, date: string, updates: any) {
  // Get current record data
  const currentRecord = await client.query(`
    SELECT actual_start_time, actual_end_time, break_hours, scheduled_hours
    FROM attendance_records
    WHERE tenant_id = $1 AND employee_id = $2 AND attendance_date = $3
  `, [tenantId, employeeId, date]);
  
  if (currentRecord.rows.length === 0) {
    return { actual_hours: 0, overtime_hours: 0 };
  }
  
  const record = currentRecord.rows[0];
  
  // Use updated values or existing values
  const startTime = updates.actual_start_time || record.actual_start_time;
  const endTime = updates.actual_end_time || record.actual_end_time;
  const breakHours = updates.break_hours !== undefined ? updates.break_hours : (record.break_hours || 0);
  const scheduledHours = updates.scheduled_hours !== undefined ? updates.scheduled_hours : (record.scheduled_hours || 8);
  
  if (!startTime || !endTime) {
    return { actual_hours: null, overtime_hours: 0 };
  }
  
  // Calculate total time worked
  const totalTime = (new Date(endTime).getTime() - new Date(startTime).getTime()) / (1000 * 60 * 60);
  const actualHours = Math.max(0, totalTime - breakHours);
  const overtimeHours = Math.max(0, actualHours - scheduledHours);
  
  return {
    actual_hours: Math.round(actualHours * 100) / 100, // Round to 2 decimal places
    overtime_hours: Math.round(overtimeHours * 100) / 100
  };
}