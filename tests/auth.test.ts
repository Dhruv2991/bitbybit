import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  getAuthenticatedServerUser,
  extractVerifiedGithubIdentity,
  getVerifiedApiUser,
  getVerifiedAdminUser,
  getVerifiedTokenUser,
} from "@/lib/serverAuth";

// Mock next/headers
const mockCookieGet = vi.fn();
vi.mock("next/headers", () => ({
  cookies: () => ({
    get: mockCookieGet,
  }),
}));

// Mock @supabase/ssr
const mockGetUser = vi.fn();
vi.mock("@supabase/ssr", () => ({
  createServerClient: () => ({
    auth: {
      getUser: mockGetUser,
    },
  }),
}));

// Mock @supabase/supabase-js
const mockApiGetUser = vi.fn();
vi.mock("@supabase/supabase-js", () => ({
  createClient: () => ({
    auth: {
      getUser: mockApiGetUser,
    },
  }),
}));

// Mock @/lib/supabase for admin checks
const mockAdminSelect = vi.fn();
vi.mock("@/lib/supabase", () => ({
  createServerSupabaseClient: () => ({
    from: () => ({
      select: () => ({
        ilike: () => ({
          maybeSingle: mockAdminSelect,
        }),
      }),
    }),
  }),
}));

describe("Server-Side Authentication Security (src/lib/serverAuth.ts)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://mock.supabase.co";
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "mock-anon-key";
  });

  describe("extractVerifiedGithubIdentity", () => {
    it("extracts github handle from user.identities identity_data and normalizes to lowercase", () => {
      const user = {
        id: "usr-1",
        identities: [
          {
            provider: "github",
            identity_data: {
              user_name: "AliceDeveloper",
              full_name: "Alice Dev",
            },
          },
        ],
        user_metadata: {
          user_name: "spoofed_bob",
        },
      };

      const result = extractVerifiedGithubIdentity(user);
      expect(result).not.toBeNull();
      expect(result?.github).toBe("alicedeveloper");
      expect(result?.name).toBe("Alice Dev");
    });

    it("extracts github handle from app_metadata when provider is github", () => {
      const user = {
        id: "usr-2",
        app_metadata: {
          provider: "github",
          user_name: "CharlieRoot",
        },
        user_metadata: {
          user_name: "spoofed_eve",
        },
      };

      const result = extractVerifiedGithubIdentity(user);
      expect(result).not.toBeNull();
      expect(result?.github).toBe("charlieroot");
    });

    it("IGNORES user_metadata.user_name spoofing when attacker attempts to claim another user's handle", () => {
      // Attacker has their own github account 'real_attacker' but edited their user_metadata to 'victim_admin'
      const user = {
        id: "usr-3",
        identities: [
          {
            provider: "github",
            identity_data: {
              user_name: "real_attacker",
            },
          },
        ],
        user_metadata: {
          user_name: "victim_admin",
        },
      };

      const result = extractVerifiedGithubIdentity(user);
      expect(result).not.toBeNull();
      expect(result?.github).toBe("real_attacker");
      expect(result?.github).not.toBe("victim_admin");
    });

    it("returns null when user_metadata.user_name is set but user has NO GitHub identity", () => {
      const user = {
        id: "usr-4",
        email: "attacker@gmail.com",
        identities: [
          {
            provider: "google",
            identity_data: { email: "attacker@gmail.com" },
          },
        ],
        user_metadata: {
          user_name: "admin_spoofed",
        },
      };

      const result = extractVerifiedGithubIdentity(user);
      expect(result).toBeNull();
    });

    it("NEVER falls back to email prefix or user.id when github identity is missing", () => {
      const user = {
        id: "superadmin",
        email: "administrator@example.com",
        identities: [],
        user_metadata: {},
      };

      const result = extractVerifiedGithubIdentity(user);
      expect(result).toBeNull();
    });
  });

  describe("getAuthenticatedServerUser", () => {
    it("returns null when session cookies are missing or invalid", async () => {
      mockCookieGet.mockReturnValue(undefined);
      mockGetUser.mockResolvedValue({
        data: { user: null },
        error: { message: "Auth session missing" },
      });

      const authResult = await getAuthenticatedServerUser();
      expect(authResult).toBeNull();
    });

    it("authenticates caller and normalizes github to lowercase when valid cryptographic session is present", async () => {
      mockCookieGet.mockReturnValue({ value: "valid.signed.jwt.cookie" });
      mockGetUser.mockResolvedValue({
        data: {
          user: {
            id: "real-uuid-1234",
            identities: [
              {
                provider: "github",
                identity_data: { user_name: "VerifiedCoder", full_name: "Verified Coder" },
              },
            ],
            user_metadata: { user_name: "ignored_metadata_val" },
          },
        },
        error: null,
      });

      const authResult = await getAuthenticatedServerUser();

      expect(authResult).not.toBeNull();
      expect(authResult?.id).toBe("real-uuid-1234");
      expect(authResult?.github).toBe("verifiedcoder");
      expect(authResult?.name).toBe("Verified Coder");
      expect(authResult?.isCryptographicallyVerified).toBe(true);
    });
  });

  describe("getVerifiedApiUser and getVerifiedAdminUser", () => {
    it("extracts verified user from Bearer authorization header", async () => {
      mockApiGetUser.mockResolvedValue({
        data: {
          user: {
            id: "api-usr-1",
            identities: [
              {
                provider: "github",
                identity_data: { user_name: "ApiTester" },
              },
            ],
          },
        },
        error: null,
      });

      const req = new Request("https://example.com/api/test", {
        headers: {
          authorization: "Bearer valid_jwt_token",
        },
      });

      const result = await getVerifiedApiUser(req);
      expect(result).not.toBeNull();
      expect(result?.github).toBe("apitester");
    });

    it("getVerifiedAdminUser validates membership against admins table", async () => {
      mockApiGetUser.mockResolvedValue({
        data: {
          user: {
            id: "admin-usr-1",
            identities: [
              {
                provider: "github",
                identity_data: { user_name: "SiteAdmin" },
              },
            ],
          },
        },
        error: null,
      });

      mockAdminSelect.mockResolvedValue({ data: { github: "siteadmin" } });

      const req = new Request("https://example.com/api/admin/test", {
        headers: {
          authorization: "Bearer admin_token",
        },
      });

      const adminUser = await getVerifiedAdminUser(req);
      expect(adminUser).not.toBeNull();
      expect(adminUser?.github).toBe("siteadmin");
    });

    it("getVerifiedAdminUser rejects non-admin users", async () => {
      mockApiGetUser.mockResolvedValue({
        data: {
          user: {
            id: "regular-usr-1",
            identities: [
              {
                provider: "github",
                identity_data: { user_name: "NormalUser" },
              },
            ],
          },
        },
        error: null,
      });

      mockAdminSelect.mockResolvedValue({ data: null });

      const req = new Request("https://example.com/api/admin/test", {
        headers: {
          authorization: "Bearer regular_token",
        },
      });

      const adminUser = await getVerifiedAdminUser(req);
      expect(adminUser).toBeNull();
    });

    describe("getVerifiedTokenUser (Server Action Auth Transport)", () => {
      it("authenticates a caller with a valid JWT access token from localStorage", async () => {
        mockApiGetUser.mockResolvedValueOnce({
          data: {
            user: {
              id: "usr-token-1",
              identities: [
                {
                  provider: "github",
                  identity_data: { user_name: "ActionCaller", full_name: "Action Caller" },
                },
              ],
            },
          },
          error: null,
        });

        const user = await getVerifiedTokenUser("valid_localStorage_jwt");
        expect(user).not.toBeNull();
        expect(user?.github).toBe("actioncaller");
        expect(user?.name).toBe("Action Caller");
        expect(user?.isCryptographicallyVerified).toBe(true);
      });

      it("rejects an invalid, expired or forged access token", async () => {
        mockApiGetUser.mockResolvedValueOnce({
          data: { user: null },
          error: { message: "Invalid JWT token signature" },
        });

        const user = await getVerifiedTokenUser("tampered_or_expired_jwt");
        expect(user).toBeNull();
      });

      it("rejects an attacker who spoofed user_metadata.user_name inside their JWT", async () => {
        mockApiGetUser.mockResolvedValueOnce({
          data: {
            user: {
              id: "usr-attacker-99",
              identities: [
                {
                  provider: "github",
                  identity_data: { user_name: "RealAttackerAccount" },
                },
              ],
              user_metadata: {
                user_name: "TargetVictimHandle",
              },
            },
          },
          error: null,
        });

        const user = await getVerifiedTokenUser("token_with_spoofed_metadata");
        expect(user).not.toBeNull();
        expect(user?.github).toBe("realattackeraccount");
        expect(user?.github).not.toBe("targetvictimhandle");
      });

      it("returns null if token caller has no verified GitHub identity", async () => {
        mockApiGetUser.mockResolvedValueOnce({
          data: {
            user: {
              id: "google-usr-1",
              identities: [
                {
                  provider: "google",
                  identity_data: { email: "user@example.com" },
                },
              ],
            },
          },
          error: null,
        });

        const user = await getVerifiedTokenUser("token_no_github");
        expect(user).toBeNull();
      });
    });
  });
});
