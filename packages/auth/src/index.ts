export { ROLE_RANK, hasRole, requireRole, type WorkspaceRole } from "./rbac.js";
export {
  createWorkspaceWithOwner,
  addMember,
  getMembership,
  listWorkspacesForUser,
  listMembers,
  getUserByEmail,
  type WorkspaceSummary,
  type MemberSummary,
} from "./workspaces.js";
export {
  issueSetupToken,
  issueSetupTokenForBootstrap,
  consumeSetupToken,
  verifyPassword,
  type IssuedSetupToken,
} from "./onboarding.js";
export {
  storeCredential,
  getCredentialStatus,
  getDecryptedCredential,
  type CredentialProvider,
  type CredentialStatus,
} from "./credentials.js";
