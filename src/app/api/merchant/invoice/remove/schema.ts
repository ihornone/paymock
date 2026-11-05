import { z } from 'zod';

export const removeInvoiceSchema = z.object({
  invoiceId: z.string().min(1).max(64),
});
