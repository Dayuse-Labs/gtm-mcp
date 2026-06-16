import { type Collaborator } from '../entities/collaborator.js';
import { type Result } from '../../shared/result.js';

export interface CollaboratorRepository {
  findByGoogleSub(googleSub: string): Promise<Result<Collaborator | null>>;
  upsertOnLogin(input: { googleSub: string; email: string }): Promise<Result<Collaborator>>;
}
