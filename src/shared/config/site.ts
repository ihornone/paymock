/**
 * Deployment-wide constants that appear on public surfaces (privacy policy,
 * dashboard footer). Kept in one place so a new deployment can retarget them
 * without touching markup.
 */
export const SITE = {
  supportEmail: 'support@ihornone.site',
  repositoryUrl: 'https://github.com/ihornone/paymock',
} as const;
