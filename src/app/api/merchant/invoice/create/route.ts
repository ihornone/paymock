import { NextRequest, NextResponse } from 'next/server';
import { validateMerchantToken } from '@/server/auth/merchant';
import { InvoicesRepository } from '@/server/db/invoices.repository';
import { ProjectsRepository } from '@/server/db/projects.repository';
import { generateInvoiceId } from '@/shared/utils/id';
import { logger } from '@/shared/logger';
import { isSafeWebhookUrl } from '@/server/webhook';
import { checkRateLimit, getClientIp, rateLimitResponse } from '@/server/rate-limit';
import { updateCachedProject } from '@/server/auth/token-cache';
import { createInvoiceSchema } from './schema';

export async function POST(req: NextRequest) {
  const auth = await validateMerchantToken(req);
  if (auth instanceof NextResponse) return auth;

  // Rate limit: 120 invoice creations per minute per project
  const clientIp = getClientIp(req);
  const rateLimit = checkRateLimit({
    key: `invoice_create:${auth.project.id}:${clientIp}`,
    limit: 120,
    windowMs: 60_000,
  });
  if (!rateLimit.success) {
    return rateLimitResponse(rateLimit, 'Rate limit exceeded: too many invoice creation requests.');
  }

  let rawBody: unknown;
  try {
    rawBody = await req.json();
  } catch {
    return NextResponse.json({ errCode: 'BAD_REQUEST', errText: 'invalid json body' }, { status: 400 });
  }

  // Server-side validation: the request body is untrusted input.
  const parsed = createInvoiceSchema.safeParse(rawBody);
  if (!parsed.success) {
    logger.info({
      event: 'invoice_create_validation_failed',
      projectId: auth.project.id,
      issues: parsed.error.issues.map((issue) => ({
        path: issue.path.join('.'),
        code: issue.code,
      })),
    });
    return NextResponse.json(
      { errCode: 'BAD_REQUEST', errText: "missing or invalid 'amount' parameter" },
      { status: 400 }
    );
  }
  const body = parsed.data;

  const paymentType = body.paymentType ?? 'debit';
  if (paymentType === 'verification') {
    if (body.amount !== 0) {
      return NextResponse.json({ errCode: 'BAD_REQUEST', errText: "amount must be 0 for 'verification' paymentType" }, { status: 400 });
    }
  } else if (body.amount <= 0) {
    return NextResponse.json({ errCode: 'BAD_REQUEST', errText: "'amount' must be greater than 0" }, { status: 400 });
  }

  if (body.webHookUrl && !isSafeWebhookUrl(body.webHookUrl)) {
    return NextResponse.json(
      { errCode: 'BAD_REQUEST', errText: "invalid or unsafe 'webHookUrl' destination" },
      { status: 400 }
    );
  }

  const invoiceId = generateInvoiceId();
  const origin = process.env.NEXT_PUBLIC_APP_URL || req.nextUrl.origin;
  const pageUrl = `${origin}/pay/${invoiceId}`;
  const appUrl = body.withAppUrl ? `paymock://pay?invoiceId=${invoiceId}` : undefined;

  const merchantLogo =
    body.merchantPaymInfo?.logoUrl ||
    body.merchantPaymInfo?.avatarUrl ||
    body.merchantPaymInfo?.icon;

  if (merchantLogo && !auth.project.logo_url) {
    // Automatically attach merchant logo to project if not set yet.
    // The token cache is updated as well, otherwise the cached project would
    // still report a NULL logo and this UPDATE would repeat on every request.
    const projectsRepo = new ProjectsRepository();
    const updated = await projectsRepo.update(auth.project.id, { logo_url: merchantLogo });
    if (updated) {
      updateCachedProject(auth.project.id, { logo_url: merchantLogo });
    }
  }

  // Normalize basket items so real images from icon, img, image or picture are captured
  const normalizedBasket = body.merchantPaymInfo?.basketOrder?.map((item) => {
    const itemImg = item.icon || item.img || item.image || item.picture || null;
    return {
      ...item,
      icon: itemImg,
    };
  });

  const basketJson = normalizedBasket ? JSON.stringify(normalizedBasket) : null;
  const webhookUrl = body.webHookUrl || auth.project.default_webhook_url || undefined;
  const successUrl = body.successUrl || auth.project.default_success_url || undefined;
  const failUrl = body.failUrl || auth.project.default_fail_url || undefined;

  const invoicesRepo = new InvoicesRepository();
  await invoicesRepo.create({
    id: invoiceId,
    projectId: auth.project.id,
    amount: body.amount,
    ccy: body.ccy ?? 980,
    paymentType,
    reference: body.merchantPaymInfo?.reference,
    destination: body.merchantPaymInfo?.destination,
    comment: body.merchantPaymInfo?.comment,
    basketJson,
    redirectUrl: body.redirectUrl,
    successUrl,
    failUrl,
    webhookUrl,
    validity: body.validity ?? 900,
  });

  logger.info({
    event: 'invoice_created',
    invoiceId,
    projectId: auth.project.id,
    amount: body.amount,
    ccy: body.ccy ?? 980,
    paymentType,
    pageUrl,
  });

  return NextResponse.json({
    invoiceId,
    pageUrl,
    appUrl,
  });
}
