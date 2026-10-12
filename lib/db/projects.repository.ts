import { getDb } from './db';
import type { Project, CreateProjectDTO } from '@/src/types/models';
import { generateProjectId, generateProjectToken } from '@/src/shared/utils/id';

export class ProjectsRepository {
  async list(userId?: string | null): Promise<Project[]> {
    const db = await getDb();
    if (userId) {
      return db.queryAll<Project>(
        'SELECT * FROM projects WHERE user_id = ? ORDER BY created_at DESC',
        [userId]
      );
    }
    return db.queryAll<Project>('SELECT * FROM projects ORDER BY created_at DESC');
  }

  async findById(id: string, userId?: string | null): Promise<Project | null> {
    const db = await getDb();
    if (userId) {
      return db.queryFirst<Project>(
        'SELECT * FROM projects WHERE id = ? AND user_id = ?',
        [id, userId]
      );
    }
    return db.queryFirst<Project>('SELECT * FROM projects WHERE id = ?', [id]);
  }

  async findByToken(token: string): Promise<Project | null> {
    const db = await getDb();
    return db.queryFirst<Project>('SELECT * FROM projects WHERE token = ?', [token]);
  }

  async create(dto: CreateProjectDTO): Promise<Project> {
    const db = await getDb();
    const id = generateProjectId();
    const token = generateProjectToken();
    const now = new Date().toISOString();

    await db.execute(
      `INSERT INTO projects (
        id, user_id, name, token, edrpou,
        logo_url,
        default_webhook_url, default_success_url, default_fail_url,
        created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        dto.userId || null,
        dto.name,
        token,
        dto.edrpou || '12345678',
        dto.logoUrl || null,
        dto.defaultWebhookUrl || null,
        dto.defaultSuccessUrl || null,
        dto.defaultFailUrl || null,
        now,
        now,
      ]
    );

    const project = await this.findById(id);
    return project!;
  }

  async resetToken(id: string, userId?: string | null): Promise<Project | null> {
    const db = await getDb();
    const newToken = generateProjectToken();
    const now = new Date().toISOString();

    let sql = 'UPDATE projects SET token = ?, updated_at = ? WHERE id = ?';
    const params: any[] = [newToken, now, id];

    if (userId) {
      sql += ' AND user_id = ?';
      params.push(userId);
    }

    const info = await db.execute(sql, params);
    if (info.changes === 0) return null;
    return this.findById(id);
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
    const db = await getDb();
    const now = new Date().toISOString();
    const current = await this.findById(id, userId);
    if (!current) return null;

    const name = data.name !== undefined ? data.name : current.name;
    const logoUrl = data.logo_url !== undefined ? data.logo_url : (current.logo_url ?? null);
    const webhookUrl = data.default_webhook_url !== undefined ? data.default_webhook_url : current.default_webhook_url;
    const successUrl = data.default_success_url !== undefined ? data.default_success_url : current.default_success_url;
    const failUrl = data.default_fail_url !== undefined ? data.default_fail_url : current.default_fail_url;

    let sql = 'UPDATE projects SET name = ?, logo_url = ?, default_webhook_url = ?, default_success_url = ?, default_fail_url = ?, updated_at = ? WHERE id = ?';
    const params: any[] = [name, logoUrl, webhookUrl, successUrl, failUrl, now, id];

    if (userId) {
      sql += ' AND user_id = ?';
      params.push(userId);
    }

    await db.execute(sql, params);

    return this.findById(id);
  }

  async delete(id: string, userId?: string | null): Promise<boolean> {
    const db = await getDb();
    let sql = 'DELETE FROM projects WHERE id = ?';
    const params: any[] = [id];

    if (userId) {
      sql += ' AND user_id = ?';
      params.push(userId);
    }

    const info = await db.execute(sql, params);
    return info.changes > 0;
  }
}
