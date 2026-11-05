import { z } from 'zod';

export const createProjectSchema = z.object({
  name: z.string().trim().min(1).max(120),
  edrpou: z.string().trim().max(32).optional(),
});

export const updateProjectSchema = z.object({
  id: z.string().min(1).max(64),
  name: z.string().trim().min(1).max(120).optional(),
  logo_url: z.string().max(2_048).nullish(),
  default_webhook_url: z.string().max(2_048).nullish(),
  default_success_url: z.string().max(2_048).nullish(),
  default_fail_url: z.string().max(2_048).nullish(),
});
