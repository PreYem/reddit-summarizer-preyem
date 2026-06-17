export interface SummarizeRequest {
  title: string;
  body: string;
  comments: string[];
}

export interface SummarizeResponse {
  post: string;
  community: string;
  communityReaction: string;
}
