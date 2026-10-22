import { NextRequest, NextResponse } from 'next/server';
import { validateMerchantToken } from '@/server/auth/merchant';
import { InvoicesRepository } from '@/server/db/invoices.repository';
import { removeInvoiceSchema } from './schema';
import type { RemoveInvoiceResponse } from '@/shared/types/acquiring';

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

  const parsed = removeInvoiceSchema.safeParse(rawBody);
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

  if (invoice.status !== 'created') {
    return NextResponse.json(
      { errCode: 'INVALID_STATUS', errText: `cannot remove invoice with status '${invoice.status}'` },
      { status: 400 }
    );
  }

  const now = new Date().toISOString();
  await invoicesRepo.updateStatus(
    invoice.id,
    'expired',
    {
      failureReason: 'Removed by merchant',
    },
    invoice
  );

  const response: RemoveInvoiceResponse = {
    status: 'success',
    createdDate: invoice.created_date,
    modifiedDate: now,
  };

  return NextResponse.json(response);
}
