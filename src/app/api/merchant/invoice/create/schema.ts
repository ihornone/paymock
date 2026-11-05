import { z } from 'zod';

export const MAX_BASKET_ITEMS = 50;

export const MAX_TEXT_LENGTH = 512;

export const MAX_ITEM_NAME_LENGTH = 128;

const basketItemSchema = z
  .object({
    name: z.string().max(MAX_ITEM_NAME_LENGTH).optional(),
    qty: z.number().int().min(0).max(1_000_000).optional(),
    sum: z.number().int().min(0).max(1_000_000_000).optional(),
    icon: z.string().max(2_048).nullish(),
    img: z.string().max(2_048).nullish(),
    image: z.string().max(2_048).nullish(),
    picture: z.string().max(2_048).nullish(),
  })
  .passthrough();

const merchantPaymInfoSchema = z.object({
  destination: z.string().max(MAX_TEXT_LENGTH).optional(),
  reference: z.string().max(MAX_TEXT_LENGTH).optional(),
  comment: z.string().max(MAX_TEXT_LENGTH).optional(),
  logoUrl: z.string().max(2_048).optional(),
  avatarUrl: z.string().max(2_048).optional(),
  icon: z.string().max(2_048).optional(),
  basketOrder: z.array(basketItemSchema).max(MAX_BASKET_ITEMS).optional(),
});

export const createInvoiceSchema = z.object({
  amount: z.number().int().min(0).max(1_000_000_000),
  ccy: z.number().int().min(1).max(999).optional(),
  paymentType: z.enum(['debit', 'credit', 'verification']).optional(),
  withAppUrl: z.boolean().optional(),
  webHookUrl: z.string().max(2_048).optional(),
  redirectUrl: z.string().max(2_048).optional(),
  successUrl: z.string().max(2_048).optional(),
  failUrl: z.string().max(2_048).optional(),
  validity: z.number().int().min(30).max(86_400).optional(),
  merchantPaymInfo: merchantPaymInfoSchema.optional(),
});

export type CreateInvoiceInput = z.infer<typeof createInvoiceSchema>;
