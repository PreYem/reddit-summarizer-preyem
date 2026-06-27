export interface SummarizeRequest {
  currentSubreddit: string;
  title: string;
  body: string;
  author: string;
  comments: string[];
}

export interface SummarizeResponse {
  post: string;
  community: string;
  communityReaction: string;
  communityReactionBreakdown: string;
  subredditDescription: string;
  aiModel: string;
}
