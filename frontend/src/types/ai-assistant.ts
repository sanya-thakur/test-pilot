export interface AIAssistantRequest {
  message: string;
}

export interface AIAssistantResponse {
  datasetId: string;
  message: string;
  answer: string;
}
