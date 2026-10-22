import { eq, and, desc } from 'drizzle-orm';
import { getDrizzle } from './drizzle';
import { projects } from './schema';
import { MAX_PROJECTS_PER_USER } from '@/shared/utils/pagination';
import type { Project, CreateProjectDTO } from '@/shared/types/models';
import { generateProjectId, generateProjectToken } from '@/shared/utils/id';

export class ProjectsRepository {
  /**
   * Every project owned by a user, bounded by `MAX_PROJECTS_PER_USER`.
   * The limit is mandatory: this query is the entry point of the dashboard and
   * of `resolveTargetProject`, and without it the `userId === undefined`
   * branch returns every row in the table.
   */
  async list(userId?: string | null, limit: number = MAX_PROJECTS_PER_USER): Promise<Project[]> {
    const db = await getDrizzle();
    if (userId) {
      return db
        .select()
        .from(projects)
        .where(eq(projects.user_id, userId))
        .orderBy(desc(projects.created_at))
        .limit(limit);
    }
    return db.select().from(projects).orderBy(desc(projects.created_at)).limit(limit);
  }

  /**
   * The most recent project owned by a user — the "default" project.
   * Replaces the previous pattern of loading the whole list to take `[0]`.
   */
  async findFirstByUser(userId: string): Promise<Project | null> {
    const db = await getDrizzle();

    const [project] = await db
      .select()
      .from(projects)
      .where(eq(projects.user_id, userId))
      .orderBy(desc(projects.created_at))
      .limit(1);

    return project || null;
  }

  async findById(id: string, userId?: string | null): Promise<Project | null> {
    const db = await getDrizzle();
    const conditions = [eq(projects.id, id)];
    if (userId) {
      conditions.push(eq(projects.user_id, userId));
    }
    const [project] = await db
      .select()
      .from(projects)
      .where(and(...conditions))
      .limit(1);

    return project || null;
  }

  async findByToken(token: string): Promise<Project | null> {
    const db = await getDrizzle();
    const [project] = await db
      .select()
      .from(projects)
      .where(eq(projects.token, token))
      .limit(1);

    return project || null;
  }

  async create(dto: CreateProjectDTO): Promise<Project> {
    const db = await getDrizzle();
    const id = generateProjectId();
    const token = generateProjectToken();
    const now = new Date().toISOString();

    const [project] = await db
      .insert(projects)
      .values({
        id,
        user_id: dto.userId || null,
        name: dto.name,
        token,
        edrpou: dto.edrpou || '12345678',
        logo_url: dto.logoUrl || null,
        default_webhook_url: dto.defaultWebhookUrl || null,
        default_success_url: dto.defaultSuccessUrl || null,
        default_fail_url: dto.defaultFailUrl || null,
        created_at: now,
        updated_at: now,
      })
      .returning();

    return project;
  }

  async resetToken(id: string, userId?: string | null): Promise<Project | null> {
    const db = await getDrizzle();
    const newToken = generateProjectToken();
    const now = new Date().toISOString();

    const conditions = [eq(projects.id, id)];
    if (userId) {
      conditions.push(eq(projects.user_id, userId));
    }

    const [updated] = await db
      .update(projects)
      .set({
        token: newToken,
        updated_at: now,
      })
      .where(and(...conditions))
      .returning();

    return updated || null;
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
      .returning();

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
