export interface PostAuthor {
  anonymousProfileId: string;
  displayName: string;
  avatarUrl: string | null;
}

export interface Post {
  id: string;
  content: string;
  category: string | null;
  createdAt: string;
  likeCount: number;
  commentCount: number;
  reactionCount: number;
  author: PostAuthor;
  viewerHasLiked: boolean;
}

export interface Comment {
  id: string;
  content: string;
  parentCommentId: string | null;
  createdAt: string;
  likeCount: number;
  author: PostAuthor;
  viewerHasLiked: boolean;
}

export type FeedMode = "trending" | "latest" | "discussed" | "popular";
