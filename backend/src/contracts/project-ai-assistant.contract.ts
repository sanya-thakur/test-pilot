import { z } from 'zod';

const message = z.string().transform((value) => value.trim()).refine((value) => value.length > 0 && value.length <= 2000, 'message must be 1-2,000 characters');
export const ProjectAIAssistantRequestSchema = z.object({
  message,
  history: z.array(z.object({ role: z.enum(['user', 'assistant']), content: message })).max(12).optional().default([]),
});
export type ProjectAIAssistantRequest = z.infer<typeof ProjectAIAssistantRequestSchema>;
export interface ProjectAIAssistantResponse { projectId: string; message: string; answer: string; evidence: Array<{ path: string; reason: string }>; }
