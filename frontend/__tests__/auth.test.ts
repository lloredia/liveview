/**
 * Auth-related tests: module exports, backend token, auth-api client.
 */
const ORIGINAL_ENV = process.env;

beforeEach(() => {
  process.env = { ...ORIGINAL_ENV };
  jest.resetModules();
  global.fetch = jest.fn();
});

afterEach(() => {
  process.env = ORIGINAL_ENV;
  jest.restoreAllMocks();
});

// Auth module export test skipped in Jest: next-auth is ESM and not transformed.
// Manual check: ensure @/auth exports handlers, auth, signIn, signOut.

describe("getBackendToken", () => {
  it("returns token when backend-token responds with token", async () => {
    process.env.NEXT_PUBLIC_API_URL = "https://api.test.com";
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ token: "jwt.here" }),
    });
    const { getBackendToken } = await import("@/lib/auth-api");
    const token = await getBackendToken();
    expect(token).toBe("jwt.here");
    expect(global.fetch).toHaveBeenCalledWith(
      "/api/auth/backend-token",
      expect.objectContaining({ credentials: "include" })
    );
  });

  it("returns null when backend-token returns not ok", async () => {
    (global.fetch as jest.Mock).mockResolvedValue({ ok: false });
    const { getBackendToken } = await import("@/lib/auth-api");
    const token = await getBackendToken();
    expect(token).toBeNull();
  });

  it("returns null when fetch throws", async () => {
    (global.fetch as jest.Mock).mockRejectedValue(new Error("Network error"));
    const { getBackendToken } = await import("@/lib/auth-api");
    const token = await getBackendToken();
    expect(token).toBeNull();
  });
});

describe("auth-api (user tracked games)", () => {
  it("fetchUserTrackedGames returns game ids when authorized", async () => {
    process.env.NEXT_PUBLIC_API_URL = "https://api.test.com";
    const mockToken = "bearer-token";
    (global.fetch as jest.Mock)
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ token: mockToken }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve([
            { game_id: "game-1", sport: "soccer" },
            { game_id: "game-2", sport: "basketball" },
          ]),
      });
    const { fetchUserTrackedGames } = await import("@/lib/auth-api");
    const ids = await fetchUserTrackedGames();
    expect(ids).toEqual(["game-1", "game-2"]);
    expect(global.fetch).toHaveBeenCalledTimes(2);
    const authCall = (global.fetch as jest.Mock).mock.calls[1];
    expect(authCall[0]).toContain("/v1/user/tracked-games");
    expect(authCall[1].headers.get("Authorization")).toBe(`Bearer ${mockToken}`);
  });

  it("fetchUserTrackedGames returns empty array when unauthorized", async () => {
    (global.fetch as jest.Mock).mockResolvedValue({ ok: false });
    const { fetchUserTrackedGames } = await import("@/lib/auth-api");
    const ids = await fetchUserTrackedGames("dummy-token");
    expect(ids).toEqual([]);
  });
});
