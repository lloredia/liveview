import { getFavoriteLeagues, toggleFavoriteLeague, isFavoriteLeague } from "@/lib/favorites";

const mockStorage: Record<string, string> = {};

beforeEach(() => {
  Object.keys(mockStorage).forEach((k) => delete mockStorage[k]);
  jest.spyOn(Storage.prototype, "getItem").mockImplementation((key) => mockStorage[key] ?? null);
  jest.spyOn(Storage.prototype, "setItem").mockImplementation((key, val) => {
    mockStorage[key] = val;
  });
  global.fetch = jest.fn();
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe("favorites", () => {
  it("returns empty array when nothing stored", () => {
    expect(getFavoriteLeagues()).toEqual([]);
  });

  it("toggleFavoriteLeague adds a league", () => {
    const result = toggleFavoriteLeague("league-1");
    expect(result).toBe(true);
    expect(isFavoriteLeague("league-1")).toBe(true);
  });

  it("toggleFavoriteLeague removes on second call", () => {
    toggleFavoriteLeague("league-1");
    const result = toggleFavoriteLeague("league-1");
    expect(result).toBe(false);
    expect(isFavoriteLeague("league-1")).toBe(false);
  });

  it("manages multiple favorites", () => {
    toggleFavoriteLeague("a");
    toggleFavoriteLeague("b");
    toggleFavoriteLeague("c");
    expect(getFavoriteLeagues()).toEqual(["a", "b", "c"]);
    toggleFavoriteLeague("b");
    expect(getFavoriteLeagues()).toEqual(["a", "c"]);
  });
});
