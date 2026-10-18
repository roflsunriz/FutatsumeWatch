// 2026-10-18の匿名sm20516122応答から、個人情報を含まない拒否理由だけを保持する。
export const watchLoginRequired = {
  meta: { status: 400, code: 'FORBIDDEN' },
  data: {
    googleTagManager: { user: { login_status: 'not_login' } },
    response: { errorCode: 'FORBIDDEN', reasonCode: 'HARMFUL_VIDEO', statusCode: 400 },
  },
};
