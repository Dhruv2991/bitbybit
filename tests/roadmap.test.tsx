import { describe, it, expect, vi, beforeEach } from "vitest";
import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import ProblemQuestRoadmap from "@/components/problems/ProblemQuestRoadmap";
import type { Problem } from "@/types/database";

const MOCK_PROBLEMS: Problem[] = [
  {
    id: "two-sum",
    title: "Two Sum",
    difficulty: "Easy",
    points: 100,
    tags: ["array", "hash-table"],
    description: "Find two numbers...",
  } as any,
  {
    id: "valid-parentheses",
    title: "Valid Parentheses",
    difficulty: "Easy",
    points: 100,
    tags: ["stack", "string"],
    description: "Check matching brackets...",
  } as any,
  {
    id: "invert-binary-tree",
    title: "Invert Binary Tree",
    difficulty: "Medium",
    points: 200,
    tags: ["tree", "bfs"],
    description: "Invert a binary tree...",
  } as any,
  {
    id: "climbing-stairs",
    title: "Climbing Stairs",
    difficulty: "Hard",
    points: 300,
    tags: ["dp", "dynamic-programming"],
    description: "Count distinct ways...",
  } as any,
];

describe("Feature 8: Interactive Quest Roadmap", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("handles empty database gracefully with encouraging empty state", () => {
    render(
      <ProblemQuestRoadmap
        problems={[]}
        solvedIds={[]}
        onSelectProblem={vi.fn()}
      />
    );

    expect(screen.getByText(/No problems loaded yet in the DSA Quest Realms/i)).toBeDefined();
    expect(screen.getByText("0 / 0")).toBeDefined();
  });

  it("categorizes problems into progressive realms and calculates completion", () => {
    render(
      <ProblemQuestRoadmap
        problems={MOCK_PROBLEMS}
        solvedIds={["two-sum"]}
        onSelectProblem={vi.fn()}
      />
    );

    expect(screen.getByText(/1 \/ 4/i)).toBeDefined();
    expect(screen.getByText("Two Sum")).toBeDefined();
    expect(screen.getByText("Valid Parentheses")).toBeDefined();
    expect(screen.getByText("Invert Binary Tree")).toBeDefined();
    expect(screen.getByText("Climbing Stairs")).toBeDefined();

    // Two sum is solved
    expect(screen.getByText("✓ Solved")).toBeDefined();
  });

  it("calls onSelectProblem when a quest card is clicked", () => {
    const handleSelect = vi.fn();
    render(
      <ProblemQuestRoadmap
        problems={MOCK_PROBLEMS}
        solvedIds={[]}
        onSelectProblem={handleSelect}
      />
    );

    const twoSumBtn = screen.getByRole("button", { name: /Two Sum/i });
    fireEvent.click(twoSumBtn);

    expect(handleSelect).toHaveBeenCalledTimes(1);
    expect(handleSelect).toHaveBeenCalledWith(MOCK_PROBLEMS[0]);
  });
});

