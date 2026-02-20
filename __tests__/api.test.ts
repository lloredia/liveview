const ORIGINAL_ENV = process.env;

beforeEach(() => {
  process.env = { ...ORIGINAL_ENV, NEXT_PUBLIC_API_URL: "https://test-api.example.com" };
  global.fetch = jest.fn();
});

afterEach(() => {
  process.env = ORIGINAL_ENV;
  jest.restoreAllMocks();
});

describe("apiFetch retry logic", () => {
  it("retries on network error then succeeds", async () => {
    const { fetchLeagues } = await import("@/lib/api");
    const mockData = [{ sport: "soccer", sport_display: "Soccer", leagues: [] }];

    (global.fetch as jest.Mock)
      .mockRejectedValueOnce(new Error("Network error"))
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockData),
      });

    const result = await fetchLeagues();
    expect(result).toEqual(mockData);
    expect(global.fetch).toHaveBeenCalledTimes(2);
  });

  it("throws after max retries", async () => {
    jest.resetModules();
    const { fetchLeagues } = await import("@/lib/api");

    (global.fetch as jest.Mock).mockRejectedValue(new Error("Network error"));

    await expect(fetchLeagues()).rejects.toThrow();
  });
});
