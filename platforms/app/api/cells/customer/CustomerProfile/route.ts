import { NextRequest, NextResponse } from 'next/server';
import { getTenantContext, validateTenantAccess } from '@/lib/tenant-context';
import { withStaffPermissions } from '@/lib/permission-middleware';
import { customerProfileCell } from '@/cells/customer/CustomerProfile/src/server';

// GET - Handle query actions for CustomerProfile Cell
export const GET = withStaffPermissions('customers.view')(async function(request: NextRequest) {
  try {
    const { tenantId } = await getTenantContext(request);
    await validateTenantAccess(tenantId, request);

    const { searchParams } = new URL(request.url);
    const action = searchParams.get('action');
    const customerId = searchParams.get('customerId');

    switch (action) {
      case 'getCustomer':
        if (!customerId) {
          return NextResponse.json({
            success: false,
            message: 'Customer ID is required'
          }, { status: 400 });
        }

        const includeContacts = searchParams.get('includeContacts') === 'true';
        const includeAddresses = searchParams.get('includeAddresses') === 'true';
        const includeNotes = searchParams.get('includeNotes') === 'true';
        const includeDocuments = searchParams.get('includeDocuments') === 'true';

        const result = await customerProfileCell.getCustomer({
          customerId,
          includeContacts,
          includeAddresses,
          includeNotes,
          includeDocuments
        }, tenantId);

        return NextResponse.json(result);

      case 'searchCustomers':
        const query = searchParams.get('query') || '';
        const page = parseInt(searchParams.get('page') || '1');
        const limit = parseInt(searchParams.get('limit') || '25');
        const customerType = searchParams.get('customerType') || '';
        const status = searchParams.get('status') || '';
        const tier = searchParams.get('tier') || '';
        const state = searchParams.get('state') || '';
        const lga = searchParams.get('lga') || '';
        const preferredLanguage = searchParams.get('preferredLanguage') || '';
        const industry = searchParams.get('industry') || '';
        const tags = searchParams.get('tags')?.split(',').filter(t => t.trim()) || [];
        const createdAfter = searchParams.get('createdAfter') || '';
        const createdBefore = searchParams.get('createdBefore') || '';

        const searchResult = await customerProfileCell.searchCustomers({
          query,
          filters: {
            customerType: customerType || undefined,
            status: status || undefined,
            tier: tier || undefined,
            state: state || undefined,
            lga: lga || undefined,
            preferredLanguage: preferredLanguage || undefined,
            industry: industry || undefined,
            tags: tags.length > 0 ? tags : undefined,
            createdAfter: createdAfter || undefined,
            createdBefore: createdBefore || undefined
          },
          pagination: { page, limit }
        }, tenantId);

        return NextResponse.json(searchResult);

      default:
        return NextResponse.json({
          success: false,
          message: 'Invalid action'
        }, { status: 400 });
    }
  } catch (error) {
    console.error('CustomerProfile GET error:', error);
    return NextResponse.json({
      success: false,
      message: 'Internal server error',
      error: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
});

// POST - Handle create and update actions for CustomerProfile Cell
export const POST = withStaffPermissions('customers.edit')(async function(request: NextRequest) {
  try {
    const { tenantId } = await getTenantContext(request);
    await validateTenantAccess(tenantId, request);

    const { searchParams } = new URL(request.url);
    const action = searchParams.get('action');
    
    const body = await request.json();
    const userId = request.headers.get('user-id') || 'system';

    switch (action) {
      case 'createCustomer':
        const createResult = await customerProfileCell.createCustomer(
          body.customerData, 
          tenantId, 
          userId
        );
        return NextResponse.json(createResult);

      case 'updateCustomer':
        if (!body.customerId) {
          return NextResponse.json({
            success: false,
            message: 'Customer ID is required'
          }, { status: 400 });
        }

        const updateResult = await customerProfileCell.updateCustomer({
          customerId: body.customerId,
          updates: body.updates
        }, tenantId, userId);

        return NextResponse.json(updateResult);

      case 'getCustomer':
        const getResult = await customerProfileCell.getCustomer(body, tenantId);
        return NextResponse.json(getResult);

      case 'searchCustomers':
        const searchResult = await customerProfileCell.searchCustomers(body, tenantId);
        return NextResponse.json(searchResult);

      case 'sendCommunication':
        if (!body.customerId) {
          return NextResponse.json({
            success: false,
            message: 'Customer ID is required'
          }, { status: 400 });
        }

        const commResult = await customerProfileCell.sendCommunication(
          {
            communicationType: body.communicationType,
            message: body.message,
            language: body.language,
            templateId: body.templateId,
            urgent: body.urgent,
            sendAt: body.sendAt
          },
          tenantId,
          body.customerId
        );

        return NextResponse.json(commResult);

      case 'manageContacts':
        if (!body.customerId) {
          return NextResponse.json({
            success: false,
            message: 'Customer ID is required'
          }, { status: 400 });
        }

        // Handle contact management actions
        const contactResult = await customerProfileCell.manageContacts({
          customerId: body.customerId,
          contactData: body.contactData,
          action: body.contactAction
        }, tenantId, userId);

        return NextResponse.json(contactResult);

      case 'manageAddresses':
        if (!body.customerId) {
          return NextResponse.json({
            success: false,
            message: 'Customer ID is required'
          }, { status: 400 });
        }

        // Handle address management actions
        const addressResult = await customerProfileCell.manageAddresses({
          customerId: body.customerId,
          addressData: body.addressData,
          action: body.addressAction
        }, tenantId, userId);

        return NextResponse.json(addressResult);

      case 'validatePhoneNumber':
        if (!body.phoneNumber) {
          return NextResponse.json({
            success: false,
            message: 'Phone number is required'
          }, { status: 400 });
        }

        const validateResult = await customerProfileCell.validateNigerianPhone(body.phoneNumber);
        return NextResponse.json({
          success: true,
          validation: validateResult
        });

      case 'getCustomerStats':
        if (!body.customerId) {
          return NextResponse.json({
            success: false,
            message: 'Customer ID is required'
          }, { status: 400 });
        }

        const statsResult = await customerProfileCell.getCustomerStats(body.customerId, tenantId);
        return NextResponse.json(statsResult);

      case 'exportCustomerData':
        const exportResult = await customerProfileCell.exportCustomerData({
          filters: body.filters,
          format: body.format || 'csv',
          fields: body.fields
        }, tenantId);

        return NextResponse.json(exportResult);

      default:
        return NextResponse.json({
          success: false,
          message: 'Invalid action'
        }, { status: 400 });
    }
  } catch (error) {
    console.error('CustomerProfile POST error:', error);
    return NextResponse.json({
      success: false,
      message: 'Internal server error',
      error: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
});

// PUT - Handle customer updates
export const PUT = withStaffPermissions('customers.edit')(async function(request: NextRequest) {
  try {
    const { tenantId } = await getTenantContext(request);
    await validateTenantAccess(tenantId, request);

    const body = await request.json();
    const userId = request.headers.get('user-id') || 'system';

    if (!body.customerId) {
      return NextResponse.json({
        success: false,
        message: 'Customer ID is required'
      }, { status: 400 });
    }

    const result = await customerProfileCell.updateCustomer({
      customerId: body.customerId,
      updates: body.updates
    }, tenantId, userId);

    return NextResponse.json(result);
  } catch (error) {
    console.error('CustomerProfile PUT error:', error);
    return NextResponse.json({
      success: false,
      message: 'Internal server error',
      error: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
});

// DELETE - Handle customer deletion/archiving
export const DELETE = withStaffPermissions('customers.delete')(async function(request: NextRequest) {
  try {
    const { tenantId } = await getTenantContext(request);
    await validateTenantAccess(tenantId, request);

    const { searchParams } = new URL(request.url);
    const customerId = searchParams.get('customerId');

    if (!customerId) {
      return NextResponse.json({
        success: false,
        message: 'Customer ID is required'
      }, { status: 400 });
    }

    const userId = request.headers.get('user-id') || 'system';

    // Soft delete - archive the customer instead of hard delete
    const result = await customerProfileCell.updateCustomer({
      customerId,
      updates: { status: 'archived' }
    }, tenantId, userId);

    return NextResponse.json(result);
  } catch (error) {
    console.error('CustomerProfile DELETE error:', error);
    return NextResponse.json({
      success: false,
      message: 'Internal server error',
      error: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
});