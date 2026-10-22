import { NextRequest, NextResponse } from 'next/server';
import { validateMerchantToken } from '@/server/auth/merchant';
import { InvoicesRepository } from '@/server/db/invoices.repository';
import { sendWebhook } from '@/server/webhook';
import { cancelInvoiceSchema } from './schema';
import type { CancelInvoiceResponse } from '@/shared/types/acquiring';

export async function POST(req: NextRequest) {
  const auth = await validateMerchantToken(req);
  if (auth instanceof NextResponse) return auth;

  let rawBody: unknown;
  try {
    rawBody = await req.json();
  } catch {
    return NextResponse.json(
      { errCode: 'BAD_REQUEST', errText: 'invalid JSON body' },
      { status: 400 }
    );
  }

  const parsed = cancelInvoiceSchema.safeParse(rawBody);
  if (!parsed.success) {
    return NextResponse.json(
      { errCode: 'BAD_REQUEST', errText: "missing 'invoiceId' in body" },
      { status: 400 }
    );
  }
  const body = parsed.data;

  const invoicesRepo = new InvoicesRepository();
  const invoice = await invoicesRepo.findById(body.invoiceId);

  if (!invoice || invoice.project_id !== auth.project.id) {
    return NextResponse.json(
      { errCode: 'NOT_FOUND', errText: 'invoice not found' },
      { status: 404 }
    );
  }

  if (invoice.status !== 'success' && invoice.status !== 'hold') {
    return NextResponse.json(
      { errCode: 'INVALID_STATUS', errText: `cannot cancel invoice with status '${invoice.status}'` },
      { status: 400 }
    );
  }

  const now = new Date().toISOString();
  const cancelItem = {
    status: 'success' as const,
    amount: body.amount ?? invoice.amount,
    ccy: invoice.ccy,
    createdDate: now,
    modifiedDate: now,
    approvalCode: '992144',
    rrn: Math.floor(100000000000 + Math.random() * 900000000000).toString(),
    extRef: body.extRef || undefined,
  };

  const updatedInvoice = await invoicesRepo.updateStatus(
    invoice.id,
    'reversed',
    {
      cancelItem,
      finalAmount: 0,
    },
    invoice
  );

  if (updatedInvoice) {
    sendWebhook(updatedInvoice).catch(console.error);
  }

  const response: CancelInvoiceResponse = {
    status: 'success',
    createdDate: invoice.created_date,
    modifiedDate: now,
  };

  return NextResponse.json(response);
}
