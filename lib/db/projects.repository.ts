import { getDb } from './db';
import type { Project, CreateProjectDTO } from '@/src/types/models';
import { generateProjectId, generateProjectToken } from '@/src/shared/utils/id';

export class ProjectsRepository {
  async list(): Promise<Project[]> {
    const db = await getDb();
    return db.queryAll<Project>('SELECT * FROM projects ORDER BY created_at DESC');
  }

  async findById(id: string): Promise<Project | null> {
    const db = await getDb();
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
        id, name, token, edrpou,
        default_webhook_url, default_success_url, default_fail_url,
        created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        dto.name,
        token,
        dto.edrpou || '12345678',
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

  async resetToken(id: string): Promise<Project | null> {
    const db = await getDb();
    const newToken = generateProjectToken();
    const now = new Date().toISOString();
    const info = await db.execute('UPDATE projects SET token = ?, updated_at = ? WHERE id = ?', [newToken, now, id]);
    if (info.changes === 0) return null;
    return this.findById(id);
  }

  async update(id: string, data: { name?: string; logo_url?: string | null; default_webhook_url?: string | null }): Promise<Project | null> {
    const db = await getDb();
    const now = new Date().toISOString();
    const current = await this.findById(id);
    if (!current) return null;

    const name = data.name !== undefined ? data.name : current.name;
    const logoUrl = data.logo_url !== undefined ? data.logo_url : (current.logo_url ?? null);
    const webhookUrl = data.default_webhook_url !== undefined ? data.default_webhook_url : current.default_webhook_url;

    await db.execute(
      'UPDATE projects SET name = ?, logo_url = ?, default_webhook_url = ?, updated_at = ? WHERE id = ?',
      [name, logoUrl, webhookUrl, now, id]
    );

    return this.findById(id);
  }

  async delete(id: string): Promise<boolean> {
    const db = await getDb();
    const info = await db.execute('DELETE FROM projects WHERE id = ?', [id]);
    return info.changes > 0;
  }
}
