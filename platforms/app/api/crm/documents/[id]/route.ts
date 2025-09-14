import { NextRequest, NextResponse } from 'next/server'
import { execute_sql, withTransaction } from '../../../../../lib/database'
import { getTenantContext, validateTenantAccess } from '../../../../../lib/tenant-context'
import { withStaffPermissions } from '../../../../../lib/permission-middleware'
import { z } from 'zod'

// Document update schema (partial updates allowed)
const documentUpdateSchema = z.object({
  // Document Classification
  document_type: z.enum(['contract', 'invoice', 'receipt', 'proposal', 'agreement', 'certificate', 'identification', 'compliance', 'marketing', 'support', 'legal', 'other']).optional(),
  document_category: z.enum(['financial', 'legal', 'operational', 'marketing', 'support', 'compliance', 'personal', 'technical']).optional(),
  
  // Document Identification
  document_name: z.string().min(1).max(255).optional(),
  description: z.string().max(1000).optional(),
  document_number: z.string().max(100).optional(),
  
  // File Information (usually not updated, but allow for corrections)
  file_name: z.string().min(1).max(255).optional(),
  file_type: z.string().max(50).optional(),
  file_extension: z.string().max(10).optional(),
  file_url: z.string().url().optional(),
  file_path: z.string().optional(),
  
  // Security & Access
  is_confidential: z.boolean().optional(),
  access_level: z.enum(['public', 'internal', 'restricted', 'confidential']).optional(),
  password_protected: z.boolean().optional(),
  
  // Versioning
  version: z.string().max(20).optional(),
  is_latest_version: z.boolean().optional(),
  
  // Business Context
  related_interaction_id: z.string().uuid().optional(),
  related_note_id: z.string().uuid().optional(),
  contract_start_date: z.string().optional(),
  contract_end_date: z.string().optional(),
  document_date: z.string().optional(),
  
  // Approval & Workflow
  approval_status: z.enum(['pending', 'approved', 'rejected', 'under_review']).optional(),
  approved_by: z.string().uuid().optional(),
  approved_at: z.string().optional(),
  
  // Organization & Search
  tags: z.array(z.string()).optional(),
  custom_fields: z.record(z.any()).optional(),
  
  // Compliance & Retention
  retention_period_years: z.number().min(0).max(50).optional(),
  retention_end_date: z.string().optional(),
  compliance_flags: z.array(z.string()).optional(),
  
  // External References
  external_system_id: z.string().max(100).optional(),
  external_url: z.string().url().optional(),
  
  // Audit fields
  updated_by: z.string().uuid().optional()
});

// Access control helper function
async function checkDocumentAccess(
  documentId: string, 
  tenantId: string, 
  userId: string, 
  requiredLevel: 'read' | 'write' | 'delete'
): Promise<{ allowed: boolean; document?: any; error?: string }> {
  try {
    // Get document with access level and user permissions
    const documentQuery = `
      SELECT 
        cd.*,
        c.company_name as customer_company_name,
        c.customer_status,
        c.customer_tier,
        creator.first_name as creator_first_name,
        creator.last_name as creator_last_name
      FROM customer_documents cd
      LEFT JOIN customers c ON c.id = cd.customer_id
      LEFT JOIN users creator ON creator.id = cd.created_by
      WHERE cd.tenant_id = $1 AND cd.id = $2
    `;
    
    const result = await execute_sql(documentQuery, [tenantId, documentId]);
    
    if (result.rows.length === 0) {
      console.warn(`Document access denied: Document ${documentId} not found in tenant ${tenantId}`);
      return { allowed: false, error: 'Document not found' };
    }
    
    const document = result.rows[0];
    const accessLevel = document.access_level;
    const isConfidential = document.is_confidential;
    const isOwner = document.created_by === userId;
    
    // Log access attempt for audit
    console.log(`Document access check: User ${userId} requesting ${requiredLevel} access to document ${documentId} (level: ${accessLevel}, confidential: ${isConfidential})`);
    
    // Get user permissions for enhanced access control
    const { getUserPermissions } = await import('../../../../../lib/permission-middleware');
    const userPermissions = await getUserPermissions(userId, tenantId);
    
    // Enhanced access control logic
    switch (accessLevel) {
      case 'public':
        // Public documents can be read by anyone with basic customer view permission
        if (requiredLevel === 'read') {
          return { allowed: true, document };
        }
        // Write/delete still requires appropriate permissions
        break;
        
      case 'internal':
        // Internal documents require staff permissions (already validated by middleware)
        if (requiredLevel === 'read' && userPermissions.allPermissions.includes('customers.view')) {
          return { allowed: true, document };
        }
        if (requiredLevel === 'write' && userPermissions.allPermissions.includes('customers.edit')) {
          return { allowed: true, document };
        }
        if (requiredLevel === 'delete' && userPermissions.allPermissions.includes('customers.delete')) {
          return { allowed: true, document };
        }
        break;
        
      case 'restricted':
        // Restricted documents require higher permissions or ownership
        if (isOwner) {
          return { allowed: true, document };
        }
        // Check if user has admin/manager permissions
        if (userPermissions.allPermissions.includes('system.settings') || 
            userPermissions.allPermissions.includes('customers.delete')) {
          return { allowed: true, document };
        }
        console.warn(`Access denied: User ${userId} lacks sufficient permissions for restricted document ${documentId}`);
        return { allowed: false, error: 'Insufficient permissions for restricted document' };
        
      case 'confidential':
        // Confidential documents require ownership or explicit admin permissions
        if (isOwner) {
          return { allowed: true, document };
        }
        // Only system admins can access confidential documents they don't own
        if (userPermissions.allPermissions.includes('system.settings')) {
          return { allowed: true, document };
        }
        console.warn(`Access denied: User ${userId} cannot access confidential document ${documentId} (not owner)`);
        return { allowed: false, error: 'Access denied: confidential document' };
        
      default:
        console.warn(`Unknown access level: ${accessLevel} for document ${documentId}`);
        return { allowed: false, error: 'Invalid document access level' };
    }
    
    // Additional confidential flag check
    if (isConfidential && !isOwner && !userPermissions.allPermissions.includes('system.settings')) {
      console.warn(`Access denied: User ${userId} cannot access confidential document ${documentId}`);
      return { allowed: false, error: 'Document is marked as confidential' };
    }
    
    // If we reach here, check basic permission requirements
    const requiredPermissions = {
      read: 'customers.view',
      write: 'customers.edit', 
      delete: 'customers.delete'
    };
    
    const requiredPermission = requiredPermissions[requiredLevel];
    if (!userPermissions.allPermissions.includes(requiredPermission)) {
      console.warn(`Access denied: User ${userId} lacks ${requiredPermission} permission`);
      return { allowed: false, error: `Missing required permission: ${requiredPermission}` };
    }
    
    return { allowed: true, document };
    
  } catch (error) {
    console.error('Error checking document access:', error);
    return { allowed: false, error: 'Access validation failed' };
  }
}

// GET - Retrieve specific document with detailed information
export const GET = withStaffPermissions('customers.view')(async function(request: NextRequest, { params }: { params: { id: string } }, context: any) {
  try {
    const { tenantId } = await getTenantContext(request);
    await validateTenantAccess(tenantId, request);

    const documentId = params.id;
    const { searchParams } = new URL(request.url);
    const currentUserId = context?.user?.id;
    
    if (!currentUserId) {
      return NextResponse.json({
        success: false,
        message: 'User authentication required'
      }, { status: 401 });
    }
    
    const includeVersions = searchParams.get('include_versions') === 'true';
    const includeAuditLog = searchParams.get('include_audit_log') === 'true';
    const includeRelatedDocs = searchParams.get('include_related') === 'true';
    
    // Check access and get document
    const accessCheck = await checkDocumentAccess(documentId, tenantId, currentUserId, 'read');
    if (!accessCheck.allowed) {
      return NextResponse.json({
        success: false,
        message: accessCheck.error || 'Access denied'
      }, { status: accessCheck.error === 'Document not found' ? 404 : 403 });
    }
    
    // Get detailed document information
    const documentQuery = `
      SELECT 
        cd.*,
        c.company_name as customer_company_name,
        c.first_name as customer_first_name,
        c.last_name as customer_last_name,
        c.customer_tier,
        c.customer_status,
        uploader.first_name as uploaded_by_first_name,
        uploader.last_name as uploaded_by_last_name,
        approver.first_name as approved_by_first_name,
        approver.last_name as approved_by_last_name,
        accessor.first_name as last_accessed_by_first_name,
        accessor.last_name as last_accessed_by_last_name
      FROM customer_documents cd
      LEFT JOIN customers c ON c.id = cd.customer_id
      LEFT JOIN users uploader ON uploader.id = cd.created_by
      LEFT JOIN users approver ON approver.id = cd.approved_by
      LEFT JOIN users accessor ON accessor.id = cd.last_accessed_by
      WHERE cd.tenant_id = $1 AND cd.id = $2
    `;
    
    const documentResult = await execute_sql(documentQuery, [tenantId, documentId]);
    
    if (documentResult.rows.length === 0) {
      return NextResponse.json({
        success: false,
        message: 'Document not found'
      }, { status: 404 });
    }
    
    const document = documentResult.rows[0];
    
    // Add human-readable file size
    document.file_size_human = formatFileSize(document.file_size);
    
    // Track access
    await execute_sql(`
      UPDATE customer_documents 
      SET last_accessed_at = CURRENT_TIMESTAMP, 
          last_accessed_by = $3
      WHERE tenant_id = $1 AND id = $2
    `, [tenantId, documentId, currentUserId]);
    
    // Get document versions if requested
    let versions = null;
    if (includeVersions) {
      const versionsQuery = `
        SELECT 
          id, version, document_name, file_size, created_at, is_latest_version,
          uploader.first_name as uploaded_by_first_name,
          uploader.last_name as uploaded_by_last_name
        FROM customer_documents cd
        LEFT JOIN users uploader ON uploader.id = cd.created_by
        WHERE cd.tenant_id = $1 AND (
          cd.parent_document_id = $2 OR 
          cd.id = $2 OR
          cd.id IN (SELECT parent_document_id FROM customer_documents WHERE id = $2)
        )
        ORDER BY cd.created_at DESC
      `;
      
      const versionsResult = await execute_sql(versionsQuery, [tenantId, documentId]);
      versions = versionsResult.rows.map((v: any) => ({
        ...v,
        file_size_human: formatFileSize(v.file_size)
      }));
    }
    
    // Get related documents if requested
    let relatedDocuments = null;
    if (includeRelatedDocs) {
      const relatedQuery = `
        SELECT 
          id, document_name, document_type, file_size, created_at, access_level
        FROM customer_documents 
        WHERE tenant_id = $1 
          AND customer_id = $2 
          AND id != $3
          AND (
            related_interaction_id = $4 OR
            related_note_id = $5 OR
            document_type = $6
          )
        ORDER BY created_at DESC
        LIMIT 10
      `;
      
      const relatedResult = await execute_sql(relatedQuery, [
        tenantId,
        document.customer_id,
        documentId,
        document.related_interaction_id,
        document.related_note_id,
        document.document_type
      ]);
      
      relatedDocuments = relatedResult.rows.map((d: any) => ({
        ...d,
        file_size_human: formatFileSize(d.file_size)
      }));
    }
    
    return NextResponse.json({
      success: true,
      data: {
        ...document,
        versions,
        relatedDocuments
      }
    });
    
  } catch (error) {
    console.error('Error fetching document:', error);
    return NextResponse.json({
      success: false,
      message: 'Failed to fetch document details',
      error: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
});

// PUT - Update document information
export const PUT = withStaffPermissions('customers.edit')(async function(request: NextRequest, { params }: { params: { id: string } }, context: any) {
  try {
    const { tenantId } = await getTenantContext(request);
    await validateTenantAccess(tenantId, request);

    const documentId = params.id;
    const body = await request.json();
    const currentUserId = context?.user?.id;
    
    if (!currentUserId) {
      return NextResponse.json({
        success: false,
        message: 'User authentication required'
      }, { status: 401 });
    }
    
    // Validate input
    const validatedData = documentUpdateSchema.parse(body);
    
    // Check access and get existing document
    const accessCheck = await checkDocumentAccess(documentId, tenantId, currentUserId, 'write');
    if (!accessCheck.allowed) {
      return NextResponse.json({
        success: false,
        message: accessCheck.error || 'Access denied'
      }, { status: accessCheck.error === 'Document not found' ? 404 : 403 });
    }
    
    const existingDocument = accessCheck.document;
    
    // Validate approval status changes
    if (validatedData.approval_status && validatedData.approval_status !== existingDocument.approval_status) {
      // Log approval status change
      console.log(`Document ${documentId} approval status changed from ${existingDocument.approval_status} to ${validatedData.approval_status}`);
      
      // Set approval metadata with proper audit trail
      if (validatedData.approval_status === 'approved') {
        validatedData.approved_by = validatedData.approved_by || currentUserId;
        validatedData.approved_at = new Date().toISOString();
        
        // Log approval action for audit
        console.log(`Document ${documentId} approved by user ${currentUserId} at ${validatedData.approved_at}`);
      } else if (validatedData.approval_status === 'rejected' || validatedData.approval_status === 'pending') {
        // Clear approval when rejecting or reverting to pending
        validatedData.approved_by = null;
        validatedData.approved_at = null;
        
        // Log status change for audit
        console.log(`Document ${documentId} approval status changed to ${validatedData.approval_status} by user ${currentUserId}`);
      }
    }
    
    // Handle versioning changes
    if (validatedData.is_latest_version === true && !existingDocument.is_latest_version) {
      // If marking this as latest version, need to unmark others
      return await withTransaction(async (client) => {
        // Unmark other versions as latest
        await client.query(`
          UPDATE customer_documents 
          SET is_latest_version = false, updated_at = CURRENT_TIMESTAMP
          WHERE tenant_id = $1 AND customer_id = $2 AND document_type = $3 AND id != $4
        `, [tenantId, existingDocument.customer_id, existingDocument.document_type, documentId]);
        
        // Update this document
        return updateDocument(client, tenantId, documentId, validatedData);
      });
    } else {
      return await withTransaction(async (client) => {
        return updateDocument(client, tenantId, documentId, validatedData);
      });
    }
    
  } catch (error) {
    console.error('Error updating document:', error);
    
    if (error instanceof z.ZodError) {
      return NextResponse.json({
        success: false,
        message: 'Validation error',
        errors: error.errors
      }, { status: 400 });
    }
    
    return NextResponse.json({
      success: false,
      message: 'Failed to update document',
      error: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
});

// DELETE - Delete or archive document
export const DELETE = withStaffPermissions('customers.delete')(async function(request: NextRequest, { params }: { params: { id: string } }, context: any) {
  try {
    const { tenantId } = await getTenantContext(request);
    await validateTenantAccess(tenantId, request);

    const documentId = params.id;
    const { searchParams } = new URL(request.url);
    const currentUserId = context?.user?.id;
    const softDelete = searchParams.get('soft_delete') !== 'false'; // Default to soft delete
    
    if (!currentUserId) {
      return NextResponse.json({
        success: false,
        message: 'User authentication required'
      }, { status: 401 });
    }
    
    // Check access and get document
    const accessCheck = await checkDocumentAccess(documentId, tenantId, currentUserId, 'delete');
    if (!accessCheck.allowed) {
      return NextResponse.json({
        success: false,
        message: accessCheck.error || 'Access denied'
      }, { status: accessCheck.error === 'Document not found' ? 404 : 403 });
    }
    
    const document = accessCheck.document;
    
    // Check if document has dependencies (versions, related docs)
    const dependenciesQuery = `
      SELECT 
        COUNT(*) FILTER (WHERE parent_document_id = $2) as version_count,
        COUNT(*) FILTER (WHERE replaces_document_id = $2) as replacement_count,
        COUNT(*) FILTER (WHERE related_interaction_id IS NOT NULL) as interaction_count
      FROM customer_documents 
      WHERE tenant_id = $1 AND (
        parent_document_id = $2 OR 
        replaces_document_id = $2 OR
        id = $2
      )
    `;
    
    const dependenciesResult = await execute_sql(dependenciesQuery, [tenantId, documentId]);
    const dependencies = dependenciesResult.rows[0];
    
    if (softDelete || dependencies.version_count > 0 || dependencies.replacement_count > 0) {
      // Soft delete: mark as deleted but keep record for audit trail
      const result = await execute_sql(`
        UPDATE customer_documents 
        SET 
          status = 'deleted',
          updated_at = CURRENT_TIMESTAMP,
          updated_by = $3
        WHERE tenant_id = $1 AND id = $2
        RETURNING id, document_name, document_type, status
      `, [tenantId, documentId, currentUserId]);
      
      return NextResponse.json({
        success: true,
        message: 'Document soft deleted successfully',
        data: {
          ...result.rows[0],
          deletion_type: 'soft',
          reason: dependencies.version_count > 0 ? 'Has dependent versions' : 
                  dependencies.replacement_count > 0 ? 'Has replacement documents' : 'Safe deletion'
        }
      });
      
    } else {
      // Hard delete: completely remove record
      const result = await execute_sql(`
        DELETE FROM customer_documents 
        WHERE tenant_id = $1 AND id = $2
        RETURNING id, document_name, document_type
      `, [tenantId, documentId]);
      
      return NextResponse.json({
        success: true,
        message: 'Document permanently deleted',
        data: {
          ...result.rows[0],
          deletion_type: 'hard'
        }
      });
    }
    
  } catch (error) {
    console.error('Error deleting document:', error);
    return NextResponse.json({
      success: false,
      message: 'Failed to delete document',
      error: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
});

// Helper function to update document
async function updateDocument(client: any, tenantId: string, documentId: string, validatedData: any) {
  // Build dynamic update query
  const updateFields: string[] = [];
  const updateValues: any[] = [tenantId, documentId];
  let paramCount = 2;
  
  Object.entries(validatedData).forEach(([key, value]) => {
    if (value !== undefined) {
      paramCount++;
      if (['tags', 'compliance_flags'].includes(key)) {
        updateFields.push(`${key} = $${paramCount}`);
        updateValues.push(value);
      } else if (key === 'custom_fields') {
        updateFields.push(`${key} = $${paramCount}`);
        updateValues.push(JSON.stringify(value));
      } else {
        updateFields.push(`${key} = $${paramCount}`);
        updateValues.push(value);
      }
    }
  });
  
  if (updateFields.length === 0) {
    return NextResponse.json({
      success: false,
      message: 'No fields to update'
    }, { status: 400 });
  }
  
  // Add updated_at
  paramCount++;
  updateFields.push(`updated_at = $${paramCount}`);
  updateValues.push(new Date().toISOString());
  
  const updateQuery = `
    UPDATE customer_documents 
    SET ${updateFields.join(', ')}
    WHERE tenant_id = $1 AND id = $2
    RETURNING *
  `;
  
  const result = await client.query(updateQuery, updateValues);
  const updatedDocument = result.rows[0];
  
  // Add human-readable file size
  updatedDocument.file_size_human = formatFileSize(updatedDocument.file_size);
  
  return NextResponse.json({
    success: true,
    message: 'Document updated successfully',
    data: updatedDocument
  });
}

// Helper function to format file sizes
function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 Bytes';
  
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}