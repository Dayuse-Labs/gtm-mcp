import { type Preview } from '../entities/preview.js';
import { type Result } from '../../shared/result.js';

export interface PreviewRepository {
  save(preview: Preview): Promise<Result<Preview>>;
  /** Returns null if absent or expired. */
  findById(id: string): Promise<Result<Preview | null>>;
  delete(id: string): Promise<Result<void>>;
}
