import axios from 'axios';

const GITHUB_CLIENT_ID = process.env.GITHUB_CLIENT_ID || process.env.NEXT_PUBLIC_GITHUB_CLIENT_ID || '';
const GITHUB_CLIENT_SECRET = process.env.GITHUB_CLIENT_SECRET || '';

export interface GitHubUserProfile {
  id: number;
  login: string;
  name: string | null;
  email: string | null;
  avatar_url: string | null;
}

/**
 * Returns the GitHub OAuth authorization URL.
 */
export function getGitHubAuthUrl(state: string, redirectUri?: string): string {
  const params = new URLSearchParams({
    client_id: GITHUB_CLIENT_ID,
    scope: 'read:user user:email',
    state,
  });

  if (redirectUri) {
    params.set('redirect_uri', redirectUri);
  }

  return `https://github.com/login/oauth/authorize?${params.toString()}`;
}

/**
 * Exchanges a temporary OAuth code for a GitHub access token.
 */
export async function exchangeCodeForToken(code: string, redirectUri?: string): Promise<string> {
  if (!GITHUB_CLIENT_ID || !GITHUB_CLIENT_SECRET) {
    throw new Error('GITHUB_CLIENT_ID or GITHUB_CLIENT_SECRET is not configured in environment.');
  }

  const payload: Record<string, string> = {
    client_id: GITHUB_CLIENT_ID,
    client_secret: GITHUB_CLIENT_SECRET,
    code,
  };

  if (redirectUri) {
    payload.redirect_uri = redirectUri;
  }

  const response = await axios.post('https://github.com/login/oauth/access_token', payload, {
    headers: {
      Accept: 'application/json',
      'User-Agent': 'BitByBit-Auth',
    },
    timeout: 10000,
  });

  const { access_token, error, error_description } = response.data;
  if (error || !access_token) {
    throw new Error(`GitHub OAuth error: ${error_description || error || 'Failed to obtain access token'}`);
  }

  return access_token;
}

/**
 * Fetches the user profile and primary email from GitHub.
 */
export async function getGitHubUserProfile(accessToken: string): Promise<GitHubUserProfile> {
  const headers = {
    Authorization: `Bearer ${accessToken}`,
    Accept: 'application/vnd.github.v3+json',
    'User-Agent': 'BitByBit-Auth',
  };

  const userRes = await axios.get('https://api.github.com/user', {
    headers,
    timeout: 10000,
  });

  const userData = userRes.data;
  let email = userData.email;

  // If email is private, fetch from /user/emails
  if (!email) {
    try {
      const emailRes = await axios.get('https://api.github.com/user/emails', {
        headers,
        timeout: 10000,
      });
      const emails: Array<{ email: string; primary: boolean; verified: boolean }> = emailRes.data;
      const primary = emails.find((e) => e.primary && e.verified) || emails.find((e) => e.verified) || emails[0];
      if (primary) {
        email = primary.email;
      }
    } catch (e: any) {
      console.warn('[auth/github] Could not fetch user emails from GitHub:', e.message);
    }
  }

  return {
    id: userData.id,
    login: userData.login,
    name: userData.name || userData.login,
    email: email || null,
    avatar_url: userData.avatar_url || null,
  };
}
