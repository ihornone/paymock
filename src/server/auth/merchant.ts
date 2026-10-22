import { NextRequest, NextResponse } from 'next/server';
import { findProjectByToken } from '@/server/auth/token-cache';
import type { Project } from '@/shared/types/models';

export async function validateMerchantToken(req: NextRequest): Promise<{ project: Project } | NextResponse> {
  const token = req.headers.get('X-Token');

  if (!token) {
    return NextResponse.json(
      {
        errCode: 'FORBIDDEN',
        errText: 'invalid or missing X-Token',
      },
      { status: 403 }
    );
  }

  // Resolved through the in-isolate token cache to avoid a D1 round trip on
  // every merchant API call.
  const project = await findProjectByToken(token);

  if (!project) {
    return NextResponse.json(
      {
        errCode: 'FORBIDDEN',
        errText: 'invalid or missing X-Token',
      },
      { status: 403 }
    );
  }

  return { project };
}
