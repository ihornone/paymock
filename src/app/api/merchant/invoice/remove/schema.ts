import { z } from 'zod';

/** Validation schema for `POST /api/merchant/invoice/remove`. */
export const removeInvoiceSchema = z.object({
  invoiceId: z.string().min(1).max(64),
});
