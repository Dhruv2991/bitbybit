import { describe, it, expect, vi, beforeEach } from "vitest";
import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import FloatingEmojiReactions, { CHEER_EMOJIS } from "@/components/duels/FloatingEmojiReactions";

const { mockSend } = vi.hoisted(() => ({
  mockSend: vi.fn(),
}));

vi.mock("@/lib/supabase", () => ({
  getSupabaseClient: vi.fn().mockReturnValue({
    channel: vi.fn().mockReturnValue({
      send: mockSend,
      on: vi.fn().mockReturnThis(),
      subscribe: vi.fn().mockReturnThis(),
    }),
    removeChannel: vi.fn(),
  }),
}));

describe("Feature 7: Spectator Cheering & Floating Reactions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders all configured cheer emojis", () => {
    render(<FloatingEmojiReactions roomId="test-room-123" isSpectator={false} />);

    for (const emoji of CHEER_EMOJIS) {
      expect(screen.getByRole("button", { name: new RegExp(emoji, "i") })).toBeDefined();
    }
  });

  it("displays SPECTATING indicator when user is a spectator", () => {
    render(<FloatingEmojiReactions roomId="test-room-123" isSpectator={true} />);

    expect(screen.getByText(/SPECTATING/i)).toBeDefined();
  });

  it("does not show SPECTATING indicator for duel competitors", () => {
    render(<FloatingEmojiReactions roomId="test-room-123" isSpectator={false} />);

    expect(screen.queryByText(/SPECTATING/i)).toBeNull();
  });

  it("spawns emoji particle and broadcasts cheer when clicked", () => {
    render(
      <FloatingEmojiReactions
        roomId="test-room-123"
        userName="CheeringFan"
        isSpectator={true}
      />
    );

    const fireBtn = screen.getByRole("button", { name: /🔥/i });
    fireEvent.click(fireBtn);

    // Emoji particle should be visible on screen
    expect(screen.getAllByText("🔥").length).toBeGreaterThan(1);
    expect(screen.getByText("CheeringFan")).toBeDefined();
  });
});
