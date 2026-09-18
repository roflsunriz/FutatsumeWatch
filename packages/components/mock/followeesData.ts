// https://public.api.nicovideo.jp/v1/user/followees/niconico-users/${userId}.json

interface FolloweesMockData {
  meta?: {
    status?: number;
  };
  data?: unknown;
  [key: string]: unknown;
}

export const followeesData: FolloweesMockData = {
  'meta': {
    'status': 200
  },
  'data': {
    'following': false
  }
};

