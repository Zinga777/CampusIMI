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
  imageUrl: string | null;
  linkUrl: string | null;
  isPromoted: boolean;
}

export interface PostRequest {
  id: string;
  content: string;
  category: string | null;
  requestType: string;
  linkUrl: string | null;
  imageUrl: string | null;
  status: "pending" | "approved" | "rejected";
  adminNote: string | null;
  createdAt: string;
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

export interface DiscoverProfile {
  id: string;
  displayName: string;
  avatarUrl: string | null;
  bio: string | null;
  academicStatus: string;
  gender: string;
}
