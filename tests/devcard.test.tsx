import { describe, it, expect, vi, beforeEach } from "vitest";
import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import DeveloperCardModal from "@/components/profile/DeveloperCardModal";
import type { User } from "@/types/database";

const MOCK_USER: User = {
  id: "user-123",
  github: "arjun_dev",
  name: "Arjun Verma",
  email: "arjun@example.com",
} as any;

describe("Feature 10: Developer Trading Card", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    Object.assign(navigator, {
      clipboard: {
        writeText: vi.fn().mockResolvedValue(undefined),
      },
    });
  });

  it("renders user information, streak, solved problems, and total points", () => {
    render(
      <DeveloperCardModal
        user={MOCK_USER}
        stats={{
          totalPoints: 1250,
          problemsSolved: 14,
          streak: 7,
          rank: 42,
          badges: [{ id: "streak_7", label: "7 Day Streak", icon: "🔥" } as any],
          duelsWon: 5,
        }}
        onClose={vi.fn()}
      />
    );

    expect(screen.getByText("Arjun Verma")).toBeDefined();
    expect(screen.getByText("@arjun_dev")).toBeDefined();
    expect(screen.getByText(/7d/i)).toBeDefined();
    expect(screen.getByText(/14/i)).toBeDefined();
    expect(screen.getByText(/1250/i)).toBeDefined();
    expect(screen.getByText("#42")).toBeDefined();
  });

  it("handles a brand new user with 0 stats and unranked status", () => {
    render(
      <DeveloperCardModal
        user={{ ...MOCK_USER, name: "" }}
        stats={{
          totalPoints: 0,
          problemsSolved: 0,
          streak: 0,
          rank: null,
          badges: [],
          duelsWon: 0,
        }}
        onClose={vi.fn()}
      />
    );

    expect(screen.getByText(/Unranked/i)).toBeDefined();
    expect(screen.getByText("🔥 0d")).toBeDefined();
    expect(screen.getByText("🧩 0")).toBeDefined();
    expect(screen.getByText("⚡ 0")).toBeDefined();
  });

  it("copies shareable card summary to clipboard", () => {
    render(
      <DeveloperCardModal
        user={MOCK_USER}
        stats={{
          totalPoints: 500,
          problemsSolved: 5,
          streak: 3,
          rank: 100,
          badges: [],
        }}
        onClose={vi.fn()}
      />
    );

    const copyBtn = screen.getByRole("button", { name: /Copy Text/i });
    fireEvent.click(copyBtn);

    expect(navigator.clipboard.writeText).toHaveBeenCalledWith(
      expect.stringContaining("BitByBit")
    );
  });

  it("invokes onClose when close button is clicked", () => {
    const handleClose = vi.fn();
    render(
      <DeveloperCardModal
        user={MOCK_USER}
        stats={{
          totalPoints: 0,
          problemsSolved: 0,
          streak: 0,
          rank: null,
          badges: [],
        }}
        onClose={handleClose}
      />
    );

    const closeBtn = screen.getByRole("button", { name: /Close modal/i });
    fireEvent.click(closeBtn);

    expect(handleClose).toHaveBeenCalledTimes(1);
  });
});

