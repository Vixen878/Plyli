const workspace = '/workspaces/{workspaceId}';
const form = `${workspace}/forms/{formId}`;

export const operations = {
  provisionWorkspace: ['POST', '/workspaces/personal', 'session'],
  listForms: ['GET', `${workspace}/forms`, 'authenticated'],
  createForm: ['POST', `${workspace}/forms`, 'authenticated'],
  getForm: ['GET', form, 'authenticated'],
  saveDraft: ['PUT', form, 'authenticated'],
  archiveForm: ['DELETE', form, 'authenticated'],
  publish: ['POST', `${form}/publish`, 'authenticated'],
  unpublish: ['POST', `${form}/unpublish`, 'authenticated'],
  listSubmissions: ['GET', `${form}/submissions`, 'authenticated'],
  listAnalyticsEvents: ['GET', `${form}/analytics-events`, 'authenticated'],
  listRevisions: ['GET', `${form}/revisions`, 'authenticated'],
  importBackup: ['POST', `${workspace}/imports`, 'session'],
  createKey: ['POST', `${workspace}/keys`, 'session'],
  revokeKey: ['DELETE', `${workspace}/keys/{credentialId}`, 'session'],
  listKeys: ['GET', `${workspace}/keys`, 'session'],
  getRetention: ['GET', `${workspace}/retention`, 'session'],
  setRetention: ['PUT', `${workspace}/retention`, 'session'],
  getIntegration: ['GET', `${form}/integration`, 'authenticated'],
  setIntegration: ['PUT', `${form}/integration`, 'session'],
  getPublishedForm: ['GET', `${form}/published`, 'authenticated'],
  validateSubmission: ['POST', `${form}/validate`, 'authenticated'],
  submit: ['POST', `${form}/submissions`, 'authenticated'],
  deleteAllResponses: ['DELETE', `${form}/submissions`, 'authenticated'],
  deleteResponse: ['DELETE', `${form}/submissions/{responseId}`, 'authenticated'],
  listDeletedResponses: ['GET', `${form}/submissions/trash`, 'authenticated'],
  restoreResponse: ['POST', `${form}/submissions/{responseId}/restore`, 'authenticated'],
  restoreForm: ['POST', `${form}/restore`, 'authenticated'],
  getPublicForm: ['GET', '/public/forms/{slug}', 'public'],
  submitPublic: ['POST', '/public/forms/{slug}/submissions', 'public'],
} as const;

export type OperationId = keyof typeof operations;
