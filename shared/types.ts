export interface SummarizeRequest {
  title: string;
  body: string;
  comments: string[];
}

export interface SummarizeResponse {
  summary: string;
}