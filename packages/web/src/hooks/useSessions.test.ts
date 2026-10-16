import { act, renderHook } from "@testing-library/react";
import { createSession } from "../test/fixtures";
import { useSessions } from "./useSessions";

function replyWith(ids: string[]): Response {
  return new Response(JSON.stringify({ sessions: ids.map((id) => createSession({ id })), generatedAt: "now" }));
}

function setHidden(isHidden: boolean): void {
  vi.spyOn(document, "hidden", "get").mockReturnValue(isHidden);
  document.dispatchEvent(new Event("visibilitychange"));
}

describe("useSessions", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("loads the sessions and polls again", async () => {
    const fetchMock = vi.fn(() => Promise.resolve(replyWith(["a"])));
    vi.stubGlobal("fetch", fetchMock);
    const { result } = renderHook(() => useSessions());
    await act(() => vi.advanceTimersByTimeAsync(0));
    expect(result.current.sessions?.map((s) => s.id)).toEqual(["a"]);
    await act(() => vi.advanceTimersByTimeAsync(4000));
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("turns stale on failure, keeps the last sessions, and recovers", async () => {
    const fetchMock = vi
      .fn<() => Promise<Response>>()
      .mockResolvedValueOnce(replyWith(["a"]))
      .mockRejectedValueOnce(new Error("down"))
      .mockResolvedValue(replyWith(["b"]));
    vi.stubGlobal("fetch", fetchMock);
    const { result } = renderHook(() => useSessions());
    await act(() => vi.advanceTimersByTimeAsync(0));
    await act(() => vi.advanceTimersByTimeAsync(4000));
    expect(result.current.isStale).toBe(true);
    expect(result.current.sessions?.map((s) => s.id)).toEqual(["a"]);
    await act(() => vi.advanceTimersByTimeAsync(4000));
    expect(result.current.isStale).toBe(false);
    expect(result.current.sessions?.map((s) => s.id)).toEqual(["b"]);
  });

  it("turns stale when a request takes too long", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        (_url: string, init: RequestInit) =>
          new Promise<Response>((_resolve, reject) => {
            init.signal?.addEventListener("abort", () => {
              reject(new Error("aborted"));
            });
          }),
      ),
    );
    const { result } = renderHook(() => useSessions());
    await act(() => vi.advanceTimersByTimeAsync(5000));
    expect(result.current.isStale).toBe(true);
  });

  it("stops polling when unmounted", async () => {
    const fetchMock = vi.fn(() => Promise.resolve(replyWith(["a"])));
    vi.stubGlobal("fetch", fetchMock);
    const { unmount } = renderHook(() => useSessions());
    await act(() => vi.advanceTimersByTimeAsync(0));
    unmount();
    await act(() => vi.advanceTimersByTimeAsync(20000));
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("does not poll while the tab is hidden and polls at once when it shows again", async () => {
    const fetchMock = vi.fn(() => Promise.resolve(replyWith(["a"])));
    vi.stubGlobal("fetch", fetchMock);
    renderHook(() => useSessions());
    await act(() => vi.advanceTimersByTimeAsync(0));
    act(() => {
      setHidden(true);
    });
    await act(() => vi.advanceTimersByTimeAsync(12000));
    expect(fetchMock).toHaveBeenCalledTimes(2);
    await act(async () => {
      setHidden(false);
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });
});
