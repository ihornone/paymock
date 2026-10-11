import { NextRequest, NextResponse } from 'next/server';
import { validateMerchantToken } from '@/lib/auth';
import { logger } from '@/src/shared/logger';

export async function GET(req: NextRequest) {
  const auth = await validateMerchantToken(req);
  if (auth instanceof NextResponse) return auth;

  logger.info({
    event: 'merchant_details_requested',
    projectId: auth.project.id,
    merchantName: auth.project.name,
  });

  return NextResponse.json({
    merchantId: auth.project.id,
    merchantName: auth.project.name,
    edrpou: auth.project.edrpou,
  });
}
