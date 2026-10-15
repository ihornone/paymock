import { NextRequest, NextResponse } from 'next/server';
import { InvoicesRepository } from '@/lib/db/invoices.repository';
import { sendWebhook } from '@/lib/webhook';
import { logger } from '@/src/shared/logger';
import { checkRateLimit, getClientIp, rateLimitResponse } from '@/lib/rate-limit';
import type { InvoiceStatus } from '@/src/types/acquiring';

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ invoiceId: string }> }
) {
  const clientIp = getClientIp(req);
  const rateLimit = checkRateLimit({
    key: `pay_action:${clientIp}`,
    limit: 60,
    windowMs: 60_000,
  });
  if (!rateLimit.success) {
    return rateLimitResponse(rateLimit, 'Rate limit exceeded: too many checkout actions.');
  }

  const { invoiceId } = await params;

  let body: { action: 'success' | 'failure' | 'expired' };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const invoicesRepo = new InvoicesRepository();
  const invoice = await invoicesRepo.findById(invoiceId);

  if (!invoice) {
    return NextResponse.json({ error: 'Invoice not found' }, { status: 404 });
  }

  if (invoice.status !== 'created' && invoice.status !== 'processing') {
    return NextResponse.json(
      { error: `Invoice is already in terminal status '${invoice.status}'` },
      { status: 400 }
    );
  }

  let newStatus: InvoiceStatus = 'success';
  let paymentInfo: any = null;
  let failureReason: string | null = null;
  let errCode: string | null = null;

  if (body.action === 'success') {
    newStatus = 'success';
    paymentInfo = {
      maskedPan: '4441 11** **** 1234',
      approvalCode: '782194',
      rrn: Math.floor(100000000000 + Math.random() * 900000000000).toString(),
      paymentMethod: 'pan',
      paymentSystem: 'Visa',
      country: 'Ukraine',
      fee: 0,
    };
  } else if (body.action === 'failure') {
    newStatus = 'failure';
    failureReason = 'Payment declined by issuing bank (insufficient funds simulation)';
    errCode = 'PAYMENT_DECLINED';
  } else if (body.action === 'expired') {
    newStatus = 'expired';
    failureReason = 'Invoice expired / cancelled by customer';
    errCode = 'INVOICE_EXPIRED';
  }

  const updatedInvoice = await invoicesRepo.updateStatus(invoiceId, newStatus, {
    paymentInfo: paymentInfo || undefined,
    failureReason: failureReason || undefined,
    errCode: errCode || undefined,
    finalAmount: newStatus === 'success' ? invoice.amount : 0,
  });

  if (updatedInvoice) {
    sendWebhook(updatedInvoice).catch(console.error);
  }

  let targetRedirectUrl: string | null = null;
  if (newStatus === 'success') {
    targetRedirectUrl = invoice.success_url || invoice.redirect_url;
  } else if (newStatus === 'failure') {
    targetRedirectUrl = invoice.fail_url || invoice.redirect_url;
  } else {
    targetRedirectUrl = invoice.redirect_url;
  }

  logger.info({
    event: 'invoice_status_updated',
    invoiceId,
    action: body.action,
    newStatus,
    redirectUrl: targetRedirectUrl,
  });

  return NextResponse.json({
    ok: true,
    success: true,
    status: newStatus,
    redirectUrl: targetRedirectUrl,
  });
}
