/** Consistent JSON envelope used by every API endpoint. */
export type ApiSuccess<T> = { success: true; data: T };
export type ApiError = {
  success: false;
  error: { code: string; message: string };
};
export type ApiResponse<T> = ApiSuccess<T> | ApiError;

export interface PublicConfig {
  collegeName: string;
  academicStatusOptions: { value: string; label: string }[];
  genderOptions: { value: string; label: string }[];
  postCategories: { value: string; label: string }[];
  reactionTypes: string[];
  reportReasons: string[];
  limits: {
    maxPostLength: number;
    maxCommentLength: number;
    maxBioLength: number;
  };
}

export interface PublicUser {
  id: string;
  hasProfile: boolean;
  accountStatus: string;
}

export interface PublicAnonymousProfile {
  id: string;
  displayName: string;
  avatarUrl: string | null;
  bio: string | null;
  academicStatus: string;
  gender: string;
  course: string | null;
  interests: string[];
  createdAt: string;
  /** Present only when viewing your own profile. */
  isSelf?: boolean;
}

export interface PublicPost {
  id: string;
  category: string | null;
  content: string;
  createdAt: string;
  likeCount: number;
  commentCount: number;
  reactionCount: number;
  author: {
    anonymousProfileId: string;
    displayName: string;
    avatarUrl: string | null;
  };
  viewerHasLiked: boolean;
}
