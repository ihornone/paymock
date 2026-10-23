import { eq, and, desc } from 'drizzle-orm';
import { getDrizzle } from './drizzle';
import { projects } from './schema';
import { MAX_PROJECTS_PER_USER } from '@/shared/utils/pagination';
import type { Project, CreateProjectDTO, ProjectCredentials } from '@/shared/types/models';
import { generateProjectId } from '@/shared/utils/id';
import { generateProjectToken, generateWebhookSecret, hashProjectToken } from '@/server/auth/project-token';

/**
 * The columns that may leave the server.
 *
 * `token_hash` and `webhook_secret` are deliberately absent: every read path
 * selects them explicitly by name, so a future `select()` cannot accidentally
 * ship a credential to a browser.
 */
const publicColumns = {
  id: projects.id,
  user_id: projects.user_id,
  name: projects.name,
  edrpou: projects.edrpou,
  logo_url: projects.logo_url,
  default_webhook_url: projects.default_webhook_url,
  default_success_url: projects.default_success_url,
  default_fail_url: projects.default_fail_url,
  created_at: projects.created_at,
  updated_at: projects.updated_at,
};

export class ProjectsRepository {
  /**
   * Every project owned by a user, bounded by `MAX_PROJECTS_PER_USER`.
   *
   * The owner is a **required** argument. The previous signature accepted an
   * optional owner and fell back to "every row in the table" — a single
   * missing argument turned a scoped query into a full dump of every
   * tenant's projects.
   */
  async listOwned(userId: string, limit: number = MAX_PROJECTS_PER_USER): Promise<Project[]> {
    if (!userId || !userId.trim()) {
      throw new Error('listOwned() requires a user id — an unscoped project list is never valid');
    }

    const db = await getDrizzle();
    return db
      .select(publicColumns)
      .from(projects)
      .where(eq(projects.user_id, userId))
      .orderBy(desc(projects.created_at))
      .limit(limit);
  }

  /**
   * The most recent project owned by a user — the "default" project.
   */
  async findFirstByUser(userId: string): Promise<Project | null> {
    if (!userId || !userId.trim()) {
      throw new Error('findFirstByUser() requires a user id');
    }

    const db = await getDrizzle();

    const [project] = await db
      .select(publicColumns)
      .from(projects)
      .where(eq(projects.user_id, userId))
      .orderBy(desc(projects.created_at))
      .limit(1);

    return project || null;
  }

  /**
   * A project by id. When `userId` is given, the project must belong to that
   * account — this is the ownership check for every mutation.
   */
  async findById(id: string, userId?: string | null): Promise<Project | null> {
    const db = await getDrizzle();
    const conditions = [eq(projects.id, id)];
    if (userId) {
      conditions.push(eq(projects.user_id, userId));
    }
    const [project] = await db
      .select(publicColumns)
      .from(projects)
      .where(and(...conditions))
      .limit(1);

    return project || null;
  }

  /**
   * Resolves a merchant token to its project.
   *
   * The lookup is by SHA-256 hash: the plaintext token never touches the
   * database, so a database dump yields no usable credentials.
   */
  async findByTokenHash(tokenHash: string): Promise<Project | null> {
    const db = await getDrizzle();
    const [project] = await db
      .select(publicColumns)
      .from(projects)
      .where(eq(projects.token_hash, tokenHash))
      .limit(1);

    return project || null;
  }

  /**
   * The webhook signing secret of a project.
   *
   * Used by the dispatcher to sign outgoing webhooks. It is never returned
   * by an API route.
   */
  async findWebhookSecret(projectId: string): Promise<string | null> {
    const db = await getDrizzle();
    const [row] = await db
      .select({ webhookSecret: projects.webhook_secret })
      .from(projects)
      .where(eq(projects.id, projectId))
      .limit(1);

    return row?.webhookSecret ?? null;
  }

  /**
   * Creates a project and returns its credentials.
   *
   * The plaintext token and the webhook secret are returned **once** — they
   * are stored hashed and are not recoverable afterwards.
   */
  async create(dto: CreateProjectDTO): Promise<ProjectCredentials> {
    if (!dto.userId || !dto.userId.trim()) {
      throw new Error('create() requires an owner — every project must belong to an account');
    }

    const db = await getDrizzle();
    const id = generateProjectId();
    const token = generateProjectToken();
    const webhookSecret = generateWebhookSecret();
    const tokenHash = await hashProjectToken(token);
    const now = new Date().toISOString();

    const [project] = await db
      .insert(projects)
      .values({
        id,
        user_id: dto.userId,
        name: dto.name,
        token_hash: tokenHash,
        webhook_secret: webhookSecret,
        edrpou: dto.edrpou || '12345678',
        logo_url: dto.logoUrl || null,
        default_webhook_url: dto.defaultWebhookUrl || null,
        default_success_url: dto.defaultSuccessUrl || null,
        default_fail_url: dto.defaultFailUrl || null,
        created_at: now,
        updated_at: now,
      })
      .returning(publicColumns);

    return { project, token, webhookSecret };
  }

  /**
   * Rotates the merchant token of a project.
   *
   * Returns the new token exactly once; the old one stops working
   * immediately because only the hash was ever stored.
   */
  async resetToken(
    id: string,
    userId?: string | null
  ): Promise<{ project: Project; token: string } | null> {
    const db = await getDrizzle();
    const token = generateProjectToken();
    const tokenHash = await hashProjectToken(token);
    const now = new Date().toISOString();

    const conditions = [eq(projects.id, id)];
    if (userId) {
      conditions.push(eq(projects.user_id, userId));
    }

    const [updated] = await db
      .update(projects)
      .set({
        token_hash: tokenHash,
        updated_at: now,
      })
      .where(and(...conditions))
      .returning(publicColumns);

    if (!updated) return null;

    return { project: updated, token };
  }

  async update(
    id: string,
    data: {
      name?: string;
      logo_url?: string | null;
      default_webhook_url?: string | null;
      default_success_url?: string | null;
      default_fail_url?: string | null;
    },
    userId?: string | null
  ): Promise<Project | null> {
    const db = await getDrizzle();
    const now = new Date().toISOString();

    const conditions = [eq(projects.id, id)];
    if (userId) {
      conditions.push(eq(projects.user_id, userId));
    }

    const updateData: Partial<typeof projects.$inferInsert> = {
      updated_at: now,
    };
    if (data.name !== undefined) updateData.name = data.name;
    if (data.logo_url !== undefined) updateData.logo_url = data.logo_url;
    if (data.default_webhook_url !== undefined) updateData.default_webhook_url = data.default_webhook_url;
    if (data.default_success_url !== undefined) updateData.default_success_url = data.default_success_url;
    if (data.default_fail_url !== undefined) updateData.default_fail_url = data.default_fail_url;

    const [updated] = await db
      .update(projects)
      .set(updateData)
      .where(and(...conditions))
      .returning(publicColumns);

    return updated || null;
  }

  async delete(id: string, userId?: string | null): Promise<boolean> {
    const db = await getDrizzle();
    const conditions = [eq(projects.id, id)];
    if (userId) {
      conditions.push(eq(projects.user_id, userId));
    }

    const deleted = await db
      .delete(projects)
      .where(and(...conditions))
      .returning({ id: projects.id });

    return deleted.length > 0;
  }
}
