import { z } from 'zod';

export const AIAssistantRequestSchema = z.object({
  message: z
    .string({
      required_error: 'message is required',
      invalid_type_error: 'message must be a string',
    })
    .transform((val) => val.trim())
    .refine((val) => val.length > 0, {
      message: 'message must be a non-empty string',
    })
    .refine((val) => val.length <= 2000, {
      message: 'message must not exceed 2000 characters',
    }),
});

export type AIAssistantRequest = z.infer<typeof AIAssistantRequestSchema>;

export interface AIAssistantResponse {
  datasetId: string;
  message: string;
  answer: string;
}
