import { NextRequest, NextResponse } from 'next/server';
import { validateMerchantToken } from '@/server/auth/merchant';
import { InvoicesRepository } from '@/server/db/invoices.repository';
import { logger } from '@/shared/logger';
import { toInvoiceStatusResponse } from '@/shared/services/invoice-mapper';

export async function GET(req: NextRequest) {
  const auth = await validateMerchantToken(req);
  if (auth instanceof NextResponse) return auth;

  const invoiceId = req.nextUrl.searchParams.get('invoiceId');
  if (!invoiceId) {
    return NextResponse.json(
      { errCode: 'BAD_REQUEST', errText: "missing 'invoiceId' parameter" },
      { status: 400 }
    );
  }

  const invoicesRepo = new InvoicesRepository();
  const invoice = await invoicesRepo.findById(invoiceId);

  if (!invoice || invoice.project_id !== auth.project.id) {
    return NextResponse.json(
      { errCode: 'NOT_FOUND', errText: 'invoice not found' },
      { status: 404 }
    );
  }

  const response = toInvoiceStatusResponse(invoice);

  logger.info({
    event: 'invoice_status_checked',
    invoiceId: invoice.id,
    projectId: auth.project.id,
    status: invoice.status,
  });

  return NextResponse.json(response);
}
