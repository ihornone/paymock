import { NextRequest, NextResponse } from 'next/server';
import { validateMerchantToken } from '@/lib/auth';
import { InvoicesRepository } from '@/lib/db/invoices.repository';
import { logger } from '@/src/shared/logger';
import type { InvoiceStatusResponse } from '@/src/types/monobank';

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

  const response: InvoiceStatusResponse = {
    invoiceId: invoice.id,
    status: invoice.status,
    failureReason: invoice.failure_reason || undefined,
    errCode: invoice.err_code || undefined,
    amount: invoice.amount,
    ccy: invoice.ccy,
    finalAmount: invoice.final_amount ?? invoice.amount,
    createdDate: invoice.created_date,
    modifiedDate: invoice.modified_date,
    reference: invoice.reference || undefined,
    destination: invoice.destination || undefined,
    cancelList: invoice.cancel_list_json ? JSON.parse(invoice.cancel_list_json) : undefined,
    paymentInfo: invoice.payment_info_json ? JSON.parse(invoice.payment_info_json) : undefined,
  };

  logger.info({
    event: 'invoice_status_checked',
    invoiceId: invoice.id,
    projectId: auth.project.id,
    status: invoice.status,
  });

  return NextResponse.json(response);
}
