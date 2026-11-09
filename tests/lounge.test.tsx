import { describe, it, expect, vi, beforeEach } from "vitest";
import React from "react";
import { render, screen, fireEvent, act } from "@testing-library/react";
import LoungePage from "@/components/pages/LoungePage";
import { LOUNGE_CONFIG } from "@/config/community";

// Mock Supabase & Realtime Hook
vi.mock("@/lib/supabase", () => ({
  getSupabaseClient: vi.fn().mockReturnValue({
    channel: vi.fn().mockReturnValue({
      send: vi.fn(),
      on: vi.fn().mockReturnThis(),
      subscribe: vi.fn(),
      track: vi.fn(),
    }),
  }),
}));

vi.mock("@/hooks/useRealtimeChannel", () => ({
  useRealtimeChannel: vi.fn(),
}));

describe("Feature 6: Lo-Fi Lounge", () => {
  const mockNavigate = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    // Mock HTMLMediaElement play, pause, and load
    window.HTMLMediaElement.prototype.play = vi.fn().mockResolvedValue(undefined);
    window.HTMLMediaElement.prototype.pause = vi.fn();
    window.HTMLMediaElement.prototype.load = vi.fn();
  });

  it("renders with default Pomodoro focus timer at 25:00", () => {
    render(<LoungePage user={null} onNavigate={mockNavigate} />);

    expect(screen.getByText("25:00")).toBeDefined();
    expect(screen.getByText(/Live Virtual Coding Lounge/i)).toBeDefined();
  });

  it("switches to break mode timer (05:00) when break button is clicked", () => {
    render(<LoungePage user={null} onNavigate={mockNavigate} />);

    const breakBtn = screen.getByRole("button", { name: /Short Break/i });
    fireEvent.click(breakBtn);

    expect(screen.getByText("05:00")).toBeDefined();
  });

  it("allows setting and completing session study goal", () => {
    render(<LoungePage user={null} onNavigate={mockNavigate} />);

    const goalInput = screen.getByPlaceholderText(/What are you focusing on this session/i);
    fireEvent.change(goalInput, { target: { value: "Solve 3 Binary Search problems" } });

    expect(screen.getByDisplayValue("Solve 3 Binary Search problems")).toBeDefined();
  });

  it("renders configured Lo-Fi music stations from centralized config", () => {
    render(<LoungePage user={null} onNavigate={mockNavigate} />);

    for (const station of LOUNGE_CONFIG.STATIONS) {
      expect(screen.getAllByText(station.name).length).toBeGreaterThan(0);
    }
  });

  it("shows friendly empty state when no other peers are present", () => {
    render(<LoungePage user={null} onNavigate={mockNavigate} />);

    expect(screen.getByText(/peaceful study room/i)).toBeDefined();
  });

  it("plays audio directly on play button click with verified HTTPS URL", async () => {
    const playSpy = vi.spyOn(window.HTMLMediaElement.prototype, "play").mockResolvedValue(undefined);
    const consoleLogSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    render(<LoungePage user={null} onNavigate={mockNavigate} />);

    const playBtn = screen.getByRole("button", { name: /Play music/i });
    await act(async () => {
      fireEvent.click(playBtn);
    });

    expect(playSpy).toHaveBeenCalled();
    expect(consoleLogSpy).toHaveBeenCalledWith(
      "[LoungeAudio] Playing audio src:",
      expect.stringContaining("https://")
    );
    consoleLogSpy.mockRestore();
  });

  it("switches station and plays new station URL directly on station click", async () => {
    const playSpy = vi.spyOn(window.HTMLMediaElement.prototype, "play").mockResolvedValue(undefined);
    const consoleLogSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    render(<LoungePage user={null} onNavigate={mockNavigate} />);

    const secondStation = LOUNGE_CONFIG.STATIONS[1];
    const stationBtn = screen.getByRole("button", { name: new RegExp(secondStation.name, "i") });
    await act(async () => {
      fireEvent.click(stationBtn);
    });

    expect(playSpy).toHaveBeenCalled();
    expect(consoleLogSpy).toHaveBeenCalledWith(
      "[LoungeAudio] Switching station & playing audio src:",
      secondStation.url
    );
    consoleLogSpy.mockRestore();
  });

  it("handles play promise rejection and logs error name and message", async () => {
    const notAllowedError = new Error("play() failed because the user didn't interact with the document first.");
    notAllowedError.name = "NotAllowedError";
    vi.spyOn(window.HTMLMediaElement.prototype, "play").mockRejectedValue(notAllowedError);
    const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    render(<LoungePage user={null} onNavigate={mockNavigate} />);

    const playBtn = screen.getByRole("button", { name: /Play music/i });
    await act(async () => {
      fireEvent.click(playBtn);
      // Wait for promise rejection to propagate
      await new Promise((resolve) => setTimeout(resolve, 10));
    });

    expect(consoleErrorSpy).toHaveBeenCalledWith(
      expect.stringContaining("[LoungeAudio] play() failed: NotAllowedError"),
      notAllowedError
    );
    expect(screen.getByText(/Click play again to enable audio streaming/i)).toBeDefined();
    expect(screen.getByText(new RegExp(`Playback error on "${LOUNGE_CONFIG.STATIONS[0].name}"`, "i"))).toBeDefined();
    consoleErrorSpy.mockRestore();
  });

  it("names the failing station when switching stations fails", async () => {
    const notSupportedError = new Error("Failed to load because no supported source was found.");
    notSupportedError.name = "NotSupportedError";
    vi.spyOn(window.HTMLMediaElement.prototype, "play").mockRejectedValue(notSupportedError);
    const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    render(<LoungePage user={null} onNavigate={mockNavigate} />);

    const targetStation = LOUNGE_CONFIG.STATIONS[1];
    const stationBtn = screen.getByRole("button", { name: new RegExp(targetStation.name, "i") });
    await act(async () => {
      fireEvent.click(stationBtn);
      await new Promise((resolve) => setTimeout(resolve, 10));
    });

    expect(screen.getByText(new RegExp(`Playback error on "${targetStation.name}"`, "i"))).toBeDefined();
    consoleErrorSpy.mockRestore();
  });

  it("does not pause playback on component unmount so background audio persists across pages", async () => {
    const pauseSpy = vi.spyOn(window.HTMLMediaElement.prototype, "pause");

    const { unmount } = render(<LoungePage user={null} onNavigate={mockNavigate} />);

    const playBtn = screen.getByRole("button", { name: /Play music/i });
    await act(async () => {
      fireEvent.click(playBtn);
    });

    // Clear calls from initial play setup
    pauseSpy.mockClear();

    // User navigates away from /lounge to another page (unmounting LoungePage)
    unmount();

    // Background playback must NOT be paused on unmount
    expect(pauseSpy).not.toHaveBeenCalled();
  });
});
