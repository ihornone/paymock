import { z } from 'zod';

/** Validation schema for `POST /api/merchant/invoice/cancel`. */
export const cancelInvoiceSchema = z.object({
  invoiceId: z.string().min(1).max(64),
  amount: z.number().int().min(0).max(1_000_000_000).optional(),
  extRef: z.string().max(128).optional(),
});
