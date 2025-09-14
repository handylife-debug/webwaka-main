import { NextRequest, NextResponse } from 'next/server'
import { execute_sql, withTransaction } from '../../../../lib/database'
import { getTenantContext, validateTenantAccess } from '../../../../lib/tenant-context'
import { withStaffPermissions } from '../../../../lib/permission-middleware'
import { z } from 'zod'

// Customer document creation/update schema
const customerDocumentSchema = z.object({
  customer_id: z.string().uuid(),
  
  // Document Classification
  document_type: z.enum(['contract', 'invoice', 'receipt', 'proposal', 'agreement', 'certificate', 'identification', 'compliance', 'marketing', 'support', 'legal', 'other']),
  document_category: z.enum(['financial', 'legal', 'operational', 'marketing', 'support', 'compliance', 'personal', 'technical']).optional(),
  
  // Document Identification
  document_name: z.string().min(1).max(255),
  description: z.string().max(1000).optional(),
  document_number: z.string().max(100).optional(), // Invoice number, contract ID, etc.
  
  // File Information
  file_name: z.string().min(1).max(255),
  file_size: z.number().min(1),
  file_type: z.string().max(50), // MIME type
  file_extension: z.string().max(10),
  file_url: z.string().url(),
  file_path: z.string().optional(),
  
  // Security & Access
  is_confidential: z.boolean().default(false),
  access_level: z.enum(['public', 'internal', 'restricted', 'confidential']).default('internal'),
  password_protected: z.boolean().default(false),
  
  // Versioning
  version: z.string().max(20).default('1.0'),
  parent_document_id: z.string().uuid().optional(), // For document versions
  is_latest_version: z.boolean().default(true),
  
  // Business Context
  related_interaction_id: z.string().uuid().optional(),
  related_note_id: z.string().uuid().optional(),
  contract_start_date: z.string().optional(), // ISO date
  contract_end_date: z.string().optional(),
  document_date: z.string().optional(),
  
  // Approval & Workflow
  approval_status: z.enum(['pending', 'approved', 'rejected', 'under_review']).default('pending'),
  approved_by: z.string().uuid().optional(),
  approved_at: z.string().optional(),
  
  // Organization & Search
  tags: z.array(z.string()).default([]),
  custom_fields: z.record(z.any()).default({}),
  
  // Compliance & Retention
  retention_period_years: z.number().min(0).max(50).optional(),
  retention_end_date: z.string().optional(),
  compliance_flags: z.array(z.string()).default([]), // GDPR, SOX, etc.
  
  // External References
  external_system_id: z.string().max(100).optional(),
  external_url: z.string().url().optional()
});

// Bulk operations schema
const bulkDocumentsActionSchema = z.object({
  action: z.enum(['update_access_level', 'assign_tags', 'set_approval_status', 'archive_documents', 'update_retention']),
  document_ids: z.array(z.string().uuid()),
  parameters: z.record(z.any())
});

// Valid columns for sorting (security whitelist)
const VALID_SORT_COLUMNS = [
  'document_type', 'document_category', 'document_name', 'file_size', 'version',
  'access_level', 'approval_status', 'document_date', 'created_at', 'updated_at',
  'contract_start_date', 'contract_end_date', 'retention_end_date'
];
const VALID_SORT_ORDERS = ['ASC', 'DESC'];

// GET - List customer documents with advanced filtering
export const GET = withStaffPermissions('customers.view')(async function(request: NextRequest, context: any) {
  try {
    const { tenantId } = await getTenantContext(request);
    await validateTenantAccess(tenantId, request);
    
    // Get current user context for access control
    const currentUserId = context?.user?.id;
    if (!currentUserId) {
      return NextResponse.json({
        success: false,
        message: 'User authentication required'
      }, { status: 401 });
    }
    
    // Get user permissions for document access control
    const { getUserPermissions } = await import('../../../../lib/permission-middleware');
    const userPermissions = await getUserPermissions(currentUserId, tenantId);
    
    // Determine user access levels for clearance-based filtering
    const hasSystemSettings = userPermissions.allPermissions.includes('system.settings');
    const hasCustomersDelete = userPermissions.allPermissions.includes('customers.delete');
    const hasCustomersView = userPermissions.allPermissions.includes('customers.view');
    
    // Security validation - ensure user has required permission
    if (!hasCustomersView) {
      return NextResponse.json({
        success: false,
        message: 'Insufficient permissions to view documents'
      }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    
    // Pagination
    const page = parseInt(searchParams.get('page') || '1');
    const limit = Math.min(parseInt(searchParams.get('limit') || '50'), 100);
    const offset = (page - 1) * limit;
    
    // Sorting with security validation
    const sortBy = searchParams.get('sort_by') || 'created_at';
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
    
    // Advanced Filters
    const search = searchParams.get('search') || '';
    const customerId = searchParams.get('customer_id') || '';
    const documentType = searchParams.get('document_type') || '';
    const documentCategory = searchParams.get('document_category') || '';
    const accessLevel = searchParams.get('access_level') || '';
    const approvalStatus = searchParams.get('approval_status') || '';
    const isConfidential = searchParams.get('is_confidential');
    const isLatestVersion = searchParams.get('is_latest_version');
    const tags = searchParams.get('tags')?.split(',').filter(t => t.trim()) || [];
    const dateFrom = searchParams.get('date_from') || '';
    const dateTo = searchParams.get('date_to') || '';
    const contractActive = searchParams.get('contract_active');
    const includeCustomer = searchParams.get('include_customer') === 'true';
    const includeVersions = searchParams.get('include_versions') === 'true';
    
    // Build WHERE clause
    let whereConditions = ['cd.tenant_id = $1'];
    let queryParams: any[] = [tenantId];
    let paramCount = 1;
    
    // Text search across multiple fields
    if (search) {
      paramCount++;
      whereConditions.push(`(
        cd.document_name ILIKE $${paramCount} OR 
        cd.description ILIKE $${paramCount} OR
        cd.file_name ILIKE $${paramCount} OR
        cd.document_number ILIKE $${paramCount}
      )`);
      queryParams.push(`%${search}%`);
    }
    
    if (customerId) {
      paramCount++;
      whereConditions.push(`cd.customer_id = $${paramCount}`);
      queryParams.push(customerId);
    }
    
    if (documentType) {
      paramCount++;
      whereConditions.push(`cd.document_type = $${paramCount}`);
      queryParams.push(documentType);
    }
    
    if (documentCategory) {
      paramCount++;
      whereConditions.push(`cd.document_category = $${paramCount}`);
      queryParams.push(documentCategory);
    }
    
    if (accessLevel) {
      paramCount++;
      whereConditions.push(`cd.access_level = $${paramCount}`);
      queryParams.push(accessLevel);
    }
    
    if (approvalStatus) {
      paramCount++;
      whereConditions.push(`cd.approval_status = $${paramCount}`);
      queryParams.push(approvalStatus);
    }
    
    if (isConfidential !== null) {
      paramCount++;
      whereConditions.push(`cd.is_confidential = $${paramCount}`);
      queryParams.push(isConfidential === 'true');
    }
    
    if (isLatestVersion !== null) {
      paramCount++;
      whereConditions.push(`cd.is_latest_version = $${paramCount}`);
      queryParams.push(isLatestVersion === 'true');
    }
    
    if (tags.length > 0) {
      paramCount++;
      whereConditions.push(`cd.tags && $${paramCount}`);
      queryParams.push(tags);
    }
    
    if (dateFrom) {
      paramCount++;
      whereConditions.push(`cd.document_date >= $${paramCount}`);
      queryParams.push(dateFrom);
    }
    
    if (dateTo) {
      paramCount++;
      whereConditions.push(`cd.document_date <= $${paramCount}`);
      queryParams.push(dateTo);
    }
    
    if (contractActive === 'true') {
      whereConditions.push(`cd.document_type IN ('contract', 'agreement')`);
      whereConditions.push(`cd.contract_start_date <= CURRENT_DATE`);
      whereConditions.push(`(cd.contract_end_date IS NULL OR cd.contract_end_date >= CURRENT_DATE)`);
    } else if (contractActive === 'false') {
      whereConditions.push(`cd.document_type IN ('contract', 'agreement')`);
      whereConditions.push(`cd.contract_end_date < CURRENT_DATE`);
    }
    
    // CRITICAL SECURITY: Add clearance-aware filtering based on access_level and user permissions
    // This ensures users can only see documents they have proper clearance to access
    let accessControlConditions = [];
    
    // Always allow public and internal documents for users with customers.view
    accessControlConditions.push("cd.access_level IN ('public', 'internal')");
    
    // Restricted documents: Allow if user is owner OR has advanced permissions
    if (hasSystemSettings || hasCustomersDelete) {
      // User has advanced permissions - can see all restricted documents
      accessControlConditions.push("cd.access_level = 'restricted'");
    } else {
      // User needs ownership to see restricted documents
      paramCount++;
      accessControlConditions.push(`(cd.access_level = 'restricted' AND cd.created_by = $${paramCount})`);
      queryParams.push(currentUserId);
    }
    
    // Confidential documents: Allow if user is owner OR has system.settings
    if (hasSystemSettings) {
      // System admin can see all confidential documents
      accessControlConditions.push("cd.access_level = 'confidential'");
    } else {
      // User needs ownership to see confidential documents
      paramCount++;
      accessControlConditions.push(`(cd.access_level = 'confidential' AND cd.created_by = $${paramCount})`);
      queryParams.push(currentUserId);
    }
    
    // Combine access control conditions with OR
    whereConditions.push(`(${accessControlConditions.join(' OR ')})`);
    
    // Additional confidential flag protection - even more restrictive than access_level
    if (!hasSystemSettings) {
      paramCount++;
      whereConditions.push(`(cd.is_confidential = FALSE OR cd.created_by = $${paramCount})`);
      queryParams.push(currentUserId);
    }
    
    const whereClause = whereConditions.length > 0 ? `WHERE ${whereConditions.join(' AND ')}` : '';
    
    // Main query with customer and approval details
    const query = `
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
        approver.last_name as approved_by_last_name
      FROM customer_documents cd
      LEFT JOIN customers c ON c.id = cd.customer_id
      LEFT JOIN users uploader ON uploader.id = cd.created_by
      LEFT JOIN users approver ON approver.id = cd.approved_by
      ${whereClause}
      ORDER BY cd.${sortBy} ${sortOrder}
      LIMIT $${paramCount + 1} OFFSET $${paramCount + 2}
    `;
    
    queryParams.push(limit, offset);
    
    const result = await execute_sql(query, queryParams);
    
    // Calculate file sizes in human-readable format
    result.rows.forEach((doc: any) => {
      doc.file_size_human = formatFileSize(doc.file_size);
    });
    
    // Get total count for pagination
    const countQuery = `
      SELECT COUNT(*) as total 
      FROM customer_documents cd
      LEFT JOIN customers c ON c.id = cd.customer_id
      ${whereClause}
    `;
    const countResult = await execute_sql(countQuery, queryParams.slice(0, -2)); // Remove limit/offset
    const total = parseInt(countResult.rows[0].total);
    
    // Get document analytics
    const analyticsQuery = `
      SELECT 
        COUNT(*) as total_documents,
        COUNT(*) FILTER (WHERE document_type = 'contract') as contracts,
        COUNT(*) FILTER (WHERE document_type = 'invoice') as invoices,
        COUNT(*) FILTER (WHERE document_type = 'proposal') as proposals,
        COUNT(*) FILTER (WHERE is_confidential = true) as confidential_documents,
        COUNT(*) FILTER (WHERE approval_status = 'approved') as approved_documents,
        COUNT(*) FILTER (WHERE approval_status = 'pending') as pending_approval,
        COUNT(*) FILTER (WHERE is_latest_version = true) as latest_versions,
        COUNT(*) FILTER (WHERE access_level = 'confidential') as restricted_access,
        SUM(file_size) as total_storage_bytes,
        AVG(file_size) as avg_file_size,
        COUNT(DISTINCT customer_id) as customers_with_documents,
        COUNT(DISTINCT file_type) as unique_file_types,
        COUNT(*) FILTER (WHERE contract_end_date < CURRENT_DATE AND document_type IN ('contract', 'agreement')) as expired_contracts
      FROM customer_documents cd
      LEFT JOIN customers c ON c.id = cd.customer_id
      ${whereClause}
    `;
    
    const analyticsResult = await execute_sql(analyticsQuery, queryParams.slice(0, -2));
    const analytics = analyticsResult.rows[0];
    
    // Convert string numbers to proper types and add human-readable storage
    Object.keys(analytics).forEach(key => {
      if (analytics[key] !== null && !isNaN(analytics[key])) {
        analytics[key] = parseFloat(analytics[key]);
      }
    });
    
    analytics.total_storage_human = formatFileSize(analytics.total_storage_bytes || 0);
    analytics.avg_file_size_human = formatFileSize(analytics.avg_file_size || 0);
    
    // Include document versions if requested
    if (includeVersions) {
      const documentIds = result.rows.map((d: any) => d.id);
      if (documentIds.length > 0) {
        const versionsQuery = `
          SELECT 
            id, parent_document_id, version, document_name, file_size, created_at,
            uploader.first_name as uploaded_by_first_name,
            uploader.last_name as uploaded_by_last_name
          FROM customer_documents cd
          LEFT JOIN users uploader ON uploader.id = cd.created_by
          WHERE cd.tenant_id = $1 AND (cd.parent_document_id = ANY($2) OR cd.id IN (
            SELECT parent_document_id FROM customer_documents WHERE id = ANY($2) AND parent_document_id IS NOT NULL
          ))
          ORDER BY cd.created_at DESC
        `;
        
        const versionsResult = await execute_sql(versionsQuery, [tenantId, documentIds]);
        
        // Group versions by parent document
        const versionsByDocument = versionsResult.rows.reduce((acc: any, version: any) => {
          const parentId = version.parent_document_id || version.id;
          if (!acc[parentId]) {
            acc[parentId] = [];
          }
          acc[parentId].push(version);
          return acc;
        }, {});
        
        // Add versions to each document
        result.rows.forEach((doc: any) => {
          doc.versions = versionsByDocument[doc.id] || [];
        });
      }
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
      },
      filters: {
        search, customerId, documentType, documentCategory, accessLevel,
        approvalStatus, isConfidential, isLatestVersion, tags, dateFrom, dateTo,
        contractActive
      }
    });
    
  } catch (error) {
    console.error('Error fetching customer documents:', error);
    return NextResponse.json({
      success: false,
      message: 'Failed to fetch customer documents',
      error: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
});

// POST - Create customer document or bulk operations
export const POST = withStaffPermissions('customers.create')(async function(request: NextRequest, context: any) {
  try {
    const { tenantId } = await getTenantContext(request);
    await validateTenantAccess(tenantId, request);

    const body = await request.json();
    const currentUserId = context?.user?.id;
    
    if (!currentUserId) {
      return NextResponse.json({
        success: false,
        message: 'User authentication required'
      }, { status: 401 });
    }
    
    // Check if this is a bulk operation
    if (body.action && body.document_ids) {
      return await handleBulkDocumentsAction(tenantId, body, currentUserId);
    } else {
      return await handleCreateDocument(tenantId, body, currentUserId);
    }
    
  } catch (error) {
    console.error('Error creating customer document:', error);
    
    if (error instanceof z.ZodError) {
      return NextResponse.json({
        success: false,
        message: 'Validation error',
        errors: error.errors
      }, { status: 400 });
    }
    
    return NextResponse.json({
      success: false,
      message: 'Failed to create customer document',
      error: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
});

async function handleCreateDocument(tenantId: string, body: any, currentUserId?: string) {
  const validatedData = customerDocumentSchema.parse(body);
  
  // Validate customer exists and belongs to tenant
  const customerCheck = await execute_sql(`
    SELECT id, company_name FROM customers 
    WHERE tenant_id = $1 AND id = $2
  `, [tenantId, validatedData.customer_id]);
  
  if (customerCheck.rows.length === 0) {
    return NextResponse.json({
      success: false,
      message: 'Customer not found'
    }, { status: 400 });
  }
  
  return await withTransaction(async (client) => {
    // Comprehensive versioning logic
    if (validatedData.is_latest_version === true) {
      // If this document is being marked as latest version, unmark all other latest versions
      // for the same customer and document type combination
      await client.query(`
        UPDATE customer_documents 
        SET is_latest_version = false, updated_at = CURRENT_TIMESTAMP
        WHERE tenant_id = $1 
          AND customer_id = $2 
          AND document_type = $3
          AND is_latest_version = true
      `, [tenantId, validatedData.customer_id, validatedData.document_type]);
    }
    
    // If this is a new version of an existing document, additional handling
    if (validatedData.parent_document_id) {
      // Validate parent document exists and belongs to same tenant/customer
      const parentCheck = await client.query(`
        SELECT id, customer_id, document_type, is_latest_version 
        FROM customer_documents 
        WHERE tenant_id = $1 AND id = $2 AND customer_id = $3
      `, [tenantId, validatedData.parent_document_id, validatedData.customer_id]);
      
      if (parentCheck.rows.length === 0) {
        throw new Error('Parent document not found or belongs to different customer');
      }
      
      const parentDoc = parentCheck.rows[0];
      
      // Ensure document type consistency for versions
      if (parentDoc.document_type !== validatedData.document_type) {
        throw new Error('Document type must match parent document for versioning');
      }
      
      // Mark the parent document and any existing versions as not latest
      await client.query(`
        UPDATE customer_documents 
        SET is_latest_version = false, updated_at = CURRENT_TIMESTAMP
        WHERE tenant_id = $1 AND (id = $2 OR parent_document_id = $2)
      `, [tenantId, validatedData.parent_document_id]);
      
      // Auto-increment version if not provided
      if (!validatedData.version || validatedData.version === '1.0') {
        const versionQuery = await client.query(`
          SELECT MAX(CAST(SPLIT_PART(version, '.', 1) AS INTEGER)) as max_major,
                 MAX(CAST(SPLIT_PART(version, '.', 2) AS INTEGER)) as max_minor
          FROM customer_documents 
          WHERE tenant_id = $1 AND (id = $2 OR parent_document_id = $2)
        `, [tenantId, validatedData.parent_document_id]);
        
        const maxMajor = versionQuery.rows[0]?.max_major || 1;
        const maxMinor = versionQuery.rows[0]?.max_minor || 0;
        validatedData.version = `${maxMajor}.${maxMinor + 1}`;
      }
    }
    
    // Insert document
    const insertQuery = `
      INSERT INTO customer_documents (
        tenant_id, customer_id, document_type, document_category, document_name,
        description, document_number, file_name, file_size, file_type, file_extension,
        file_url, file_path, is_confidential, access_level, password_protected,
        version, parent_document_id, is_latest_version, related_interaction_id,
        related_note_id, contract_start_date, contract_end_date, document_date,
        approval_status, approved_by, approved_at, tags, custom_fields,
        retention_period_years, retention_end_date, compliance_flags,
        external_system_id, external_url, created_by
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17,
        $18, $19, $20, $21, $22, $23, $24, $25, $26, $27, $28, $29, $30, $31, $32, $33, $34, $35
      )
      RETURNING *
    `;
    
    const result = await client.query(insertQuery, [
      tenantId,
      validatedData.customer_id,
      validatedData.document_type,
      validatedData.document_category || null,
      validatedData.document_name,
      validatedData.description || null,
      validatedData.document_number || null,
      validatedData.file_name,
      validatedData.file_size,
      validatedData.file_type,
      validatedData.file_extension,
      validatedData.file_url,
      validatedData.file_path || null,
      validatedData.is_confidential,
      validatedData.access_level,
      validatedData.password_protected,
      validatedData.version,
      validatedData.parent_document_id || null,
      validatedData.is_latest_version,
      validatedData.related_interaction_id || null,
      validatedData.related_note_id || null,
      validatedData.contract_start_date || null,
      validatedData.contract_end_date || null,
      validatedData.document_date || null,
      validatedData.approval_status,
      validatedData.approved_by || null,
      validatedData.approved_at || null,
      validatedData.tags,
      JSON.stringify(validatedData.custom_fields),
      validatedData.retention_period_years || null,
      validatedData.retention_end_date || null,
      validatedData.compliance_flags,
      validatedData.external_system_id || null,
      validatedData.external_url || null,
      body.created_by || currentUserId || null
    ]);
    
    const newDocument = result.rows[0];
    newDocument.file_size_human = formatFileSize(newDocument.file_size);
    
    return NextResponse.json({
      success: true,
      message: 'Customer document created successfully',
      data: newDocument
    }, { status: 201 });
  });
}

async function handleBulkDocumentsAction(tenantId: string, body: any, currentUserId?: string) {
  const validatedData = bulkDocumentsActionSchema.parse(body);
  
  // Enhanced parameter validation for each action type
  const validateActionParameters = (action: string, parameters: any) => {
    switch (action) {
      case 'update_access_level':
        if (!parameters.access_level) {
          throw new Error('Missing required parameter: access_level');
        }
        if (!['public', 'internal', 'restricted', 'confidential'].includes(parameters.access_level)) {
          throw new Error('Invalid access level. Must be one of: public, internal, restricted, confidential');
        }
        break;
        
      case 'assign_tags':
        if (!parameters.tags) {
          throw new Error('Missing required parameter: tags');
        }
        if (!Array.isArray(parameters.tags)) {
          throw new Error('Tags parameter must be an array');
        }
        if (parameters.tags.length === 0) {
          throw new Error('Tags array cannot be empty');
        }
        if (parameters.tags.some((tag: any) => typeof tag !== 'string' || tag.trim().length === 0)) {
          throw new Error('All tags must be non-empty strings');
        }
        break;
        
      case 'set_approval_status':
        if (!parameters.approval_status) {
          throw new Error('Missing required parameter: approval_status');
        }
        if (!['pending', 'approved', 'rejected', 'under_review'].includes(parameters.approval_status)) {
          throw new Error('Invalid approval status. Must be one of: pending, approved, rejected, under_review');
        }
        if (parameters.approval_status === 'approved' && !parameters.approved_by && !currentUserId) {
          throw new Error('approved_by is required when setting status to approved');
        }
        break;
        
      case 'archive_documents':
        // Archive action is valid with no required parameters
        break;
        
      case 'update_retention':
        if (parameters.retention_period_years !== undefined) {
          if (typeof parameters.retention_period_years !== 'number' || 
              parameters.retention_period_years < 0 || 
              parameters.retention_period_years > 50) {
            throw new Error('retention_period_years must be a number between 0 and 50');
          }
        }
        if (parameters.retention_end_date !== undefined) {
          if (typeof parameters.retention_end_date !== 'string' || 
              isNaN(Date.parse(parameters.retention_end_date))) {
            throw new Error('retention_end_date must be a valid ISO date string');
          }
        }
        break;
        
      default:
        throw new Error(`Unsupported bulk action: ${action}`);
    }
  };
  
  // Validate action parameters
  validateActionParameters(validatedData.action, validatedData.parameters);
  
  // Validate document IDs exist and belong to tenant
  const documentCheckQuery = `
    SELECT id, document_name, access_level, is_confidential, created_by
    FROM customer_documents 
    WHERE tenant_id = $1 AND id = ANY($2)
  `;
  
  const documentCheck = await execute_sql(documentCheckQuery, [tenantId, validatedData.document_ids]);
  
  if (documentCheck.rows.length !== validatedData.document_ids.length) {
    const foundIds = documentCheck.rows.map((doc: any) => doc.id);
    const missingIds = validatedData.document_ids.filter((id: string) => !foundIds.includes(id));
    throw new Error(`Documents not found or access denied: ${missingIds.join(', ')}`);
  }
  
  // Additional access control for restricted/confidential documents
  const restrictedDocs = documentCheck.rows.filter((doc: any) => 
    doc.access_level === 'restricted' || doc.access_level === 'confidential' || doc.is_confidential
  );
  
  if (restrictedDocs.length > 0 && currentUserId) {
    // Check if user has permission to modify restricted documents
    const { getUserPermissions } = await import('../../../../lib/permission-middleware');
    const userPermissions = await getUserPermissions(currentUserId, tenantId);
    
    const hasAdminAccess = userPermissions.allPermissions.includes('system.settings');
    const canDeleteDocs = userPermissions.allPermissions.includes('customers.delete');
    
    if (!hasAdminAccess && !canDeleteDocs) {
      const restrictedDocNames = restrictedDocs.map((doc: any) => doc.document_name);
      throw new Error(`Insufficient permissions to modify restricted/confidential documents: ${restrictedDocNames.join(', ')}`);
    }
  }
  
  return await withTransaction(async (client) => {
    let affectedCount = 0;
    const results: any[] = [];
    const auditLogs: any[] = [];
    
    switch (validatedData.action) {
      case 'update_access_level':
        const newAccessLevel = validatedData.parameters.access_level;
        
        const accessResult = await client.query(`
          UPDATE customer_documents 
          SET access_level = $3, updated_at = CURRENT_TIMESTAMP, updated_by = $4
          WHERE tenant_id = $1 AND id = ANY($2)
          RETURNING id, document_name, document_type, access_level
        `, [tenantId, validatedData.document_ids, newAccessLevel, currentUserId]);
        
        affectedCount = accessResult.rowCount;
        results.push(...accessResult.rows);
        
        // Log access level changes for audit
        accessResult.rows.forEach((doc: any) => {
          auditLogs.push({
            action: 'access_level_changed',
            document_id: doc.id,
            document_name: doc.document_name,
            new_access_level: newAccessLevel,
            changed_by: currentUserId,
            changed_at: new Date().toISOString()
          });
        });
        break;
        
      case 'assign_tags':
        const tagsToAdd = validatedData.parameters.tags;
        
        const tagsResult = await client.query(`
          UPDATE customer_documents 
          SET tags = array(SELECT DISTINCT unnest(tags || $3)), 
              updated_at = CURRENT_TIMESTAMP,
              updated_by = $4
          WHERE tenant_id = $1 AND id = ANY($2)
          RETURNING id, document_name, document_type, tags
        `, [tenantId, validatedData.document_ids, tagsToAdd, currentUserId]);
        
        affectedCount = tagsResult.rowCount;
        results.push(...tagsResult.rows);
        
        // Log tag assignments for audit
        tagsResult.rows.forEach((doc: any) => {
          auditLogs.push({
            action: 'tags_assigned',
            document_id: doc.id,
            document_name: doc.document_name,
            tags_added: tagsToAdd,
            assigned_by: currentUserId,
            assigned_at: new Date().toISOString()
          });
        });
        break;
        
      case 'set_approval_status':
        const newApprovalStatus = validatedData.parameters.approval_status;
        const approvedBy = newApprovalStatus === 'approved' ? 
          (validatedData.parameters.approved_by || currentUserId) : null;
        
        const approvalResult = await client.query(`
          UPDATE customer_documents 
          SET approval_status = $3, 
              approved_by = $4,
              approved_at = CASE WHEN $3 = 'approved' THEN CURRENT_TIMESTAMP ELSE NULL END,
              updated_at = CURRENT_TIMESTAMP,
              updated_by = $5
          WHERE tenant_id = $1 AND id = ANY($2)
          RETURNING id, document_name, document_type, approval_status, approved_by, approved_at
        `, [tenantId, validatedData.document_ids, newApprovalStatus, approvedBy, currentUserId]);
        
        affectedCount = approvalResult.rowCount;
        results.push(...approvalResult.rows);
        
        // Log approval status changes for audit
        approvalResult.rows.forEach((doc: any) => {
          auditLogs.push({
            action: 'approval_status_changed',
            document_id: doc.id,
            document_name: doc.document_name,
            new_status: newApprovalStatus,
            approved_by: approvedBy,
            changed_by: currentUserId,
            changed_at: new Date().toISOString()
          });
        });
        break;
        
      case 'archive_documents':
        const archiveResult = await client.query(`
          UPDATE customer_documents 
          SET status = 'archived', 
              updated_at = CURRENT_TIMESTAMP,
              updated_by = $3
          WHERE tenant_id = $1 AND id = ANY($2) AND status != 'archived'
          RETURNING id, document_name, document_type, status
        `, [tenantId, validatedData.document_ids, currentUserId]);
        
        affectedCount = archiveResult.rowCount;
        results.push(...archiveResult.rows);
        
        // Log archival actions for audit
        archiveResult.rows.forEach((doc: any) => {
          auditLogs.push({
            action: 'document_archived',
            document_id: doc.id,
            document_name: doc.document_name,
            archived_by: currentUserId,
            archived_at: new Date().toISOString()
          });
        });
        break;
        
      case 'update_retention':
        const updateFields: string[] = [];
        const updateValues: any[] = [tenantId, validatedData.document_ids];
        let paramCount = 2;
        
        if (validatedData.parameters.retention_period_years !== undefined) {
          paramCount++;
          updateFields.push(`retention_period_years = $${paramCount}`);
          updateValues.push(validatedData.parameters.retention_period_years);
        }
        
        if (validatedData.parameters.retention_end_date !== undefined) {
          paramCount++;
          updateFields.push(`retention_end_date = $${paramCount}`);
          updateValues.push(validatedData.parameters.retention_end_date);
        }
        
        if (updateFields.length === 0) {
          throw new Error('No retention parameters provided for update');
        }
        
        paramCount++;
        updateFields.push(`updated_at = CURRENT_TIMESTAMP`);
        updateFields.push(`updated_by = $${paramCount}`);
        updateValues.push(currentUserId);
        
        const retentionResult = await client.query(`
          UPDATE customer_documents 
          SET ${updateFields.join(', ')}
          WHERE tenant_id = $1 AND id = ANY($2)
          RETURNING id, document_name, retention_period_years, retention_end_date
        `, updateValues);
        
        affectedCount = retentionResult.rowCount;
        results.push(...retentionResult.rows);
        
        // Log retention updates for audit
        retentionResult.rows.forEach((doc: any) => {
          auditLogs.push({
            action: 'retention_updated',
            document_id: doc.id,
            document_name: doc.document_name,
            retention_period_years: doc.retention_period_years,
            retention_end_date: doc.retention_end_date,
            updated_by: currentUserId,
            updated_at: new Date().toISOString()
          });
        });
        break;
        
      default:
        throw new Error(`Unsupported bulk action: ${validatedData.action}`);
    }
    
    // Log bulk operation summary
    console.log(`Bulk operation completed: ${validatedData.action} affected ${affectedCount} documents by user ${currentUserId}`);
    console.log('Audit trail:', JSON.stringify(auditLogs, null, 2));
    
    return NextResponse.json({
      success: true,
      message: `Bulk ${validatedData.action} completed successfully`,
      data: {
        action: validatedData.action,
        affected_count: affectedCount,
        results: results,
        audit_trail: auditLogs
      }
    });
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