"""Illustrative Monte Carlo search over hypothetical dispute review options.

Fixed scenario inputs are not empirical evidence, settlement forecasts or legal advice.
The search has no jurisdiction/evidence model and cannot authorize or execute redress.
"""

from __future__ import annotations

import math
import random
from dataclasses import dataclass, field
from enum import StrEnum
from typing import Any

from hestia.domain.warranties import LEGAL_SOURCES_CHECKED_ON, REDRESS_GUIDANCE

ADR_DIRECTORY_URL = (
    "https://consumer-redress.ec.europa.eu/list-alternative-dispute-resolution-adr-bodies_en"
)


class LegalAction(StrEnum):
    SELLER_REVIEW = "Path A: Seller Evidence and Remedy Review"
    ADR_REVIEW = "Path B: Review Applicable ADR Bodies"
    AMICABLE_VOUCHER = "Path C: Review Voluntary Store Voucher Offer"
    SMALL_CLAIMS_COURT = "Path D: Review Small Claims Eligibility"
    # Import compatibility only; iteration and returned action IDs use current names.
    DIRECT_BGB_437 = SELLER_REVIEW
    EU_ODR_MEDIATION = ADR_REVIEW


# Invented illustration inputs: (scenario_probability, days, payoff_ratio, risk_weight).
# The historical field names remain for callers; none is a measured recovery or forecast.
ACTION_PRIORS: dict[LegalAction, tuple[float, int, float, float]] = {
    LegalAction.SELLER_REVIEW: (0.92, 8, 1.00, 0.05),
    LegalAction.ADR_REVIEW: (0.68, 45, 0.95, 0.15),
    LegalAction.AMICABLE_VOUCHER: (0.45, 2, 0.70, 0.02),
    LegalAction.SMALL_CLAIMS_COURT: (0.82, 120, 1.05, 0.35),
}


@dataclass
class MCTSNode:
    """A node in the legal dispute negotiation search tree."""

    action: LegalAction | None = None
    parent: MCTSNode | None = None
    children: list[MCTSNode] = field(default_factory=list)
    visits: int = 0
    total_reward: float = 0.0

    @property
    def value(self) -> float:
        return (self.total_reward / self.visits) if self.visits > 0 else 0.0

    def uct_score(self, total_parent_visits: int, exploration_constant: float = 1.414) -> float:
        if self.visits == 0:
            return float("inf")
        exploitation = self.total_reward / self.visits
        exploration = exploration_constant * math.sqrt(math.log(total_parent_visits) / self.visits)
        return exploitation + exploration

    def is_fully_expanded(self) -> bool:
        return len(self.children) == len(LegalAction)

    def untried_actions(self) -> list[LegalAction]:
        tried = {child.action for child in self.children}
        return [a for a in LegalAction if a not in tried]


class LegalNegotiationMCTS:
    """Monte Carlo Tree Search simulator for legal dispute resolution."""

    def __init__(
        self,
        exploration_constant: float = 1.414,
        random_seed: int | None = 42,
    ) -> None:
        self.c = exploration_constant
        self.rng = random.Random(random_seed)

    def select(self, node: MCTSNode) -> MCTSNode:
        """Traverse down tree to find the most promising expandable node using UCT."""
        current = node
        while current.is_fully_expanded() and current.children:
            current = max(current.children, key=lambda c: c.uct_score(current.visits, self.c))
        return current

    def expand(self, node: MCTSNode) -> MCTSNode:
        """Add a child node for an untried legal action."""
        untried = node.untried_actions()
        if not untried:
            return node
        action = self.rng.choice(untried)
        child = MCTSNode(action=action, parent=node)
        node.children.append(child)
        return child

    def simulate(self, node: MCTSNode) -> float:
        """Run random rollout evaluating expected utility of the legal action."""
        action = node.action
        if action is None:
            action = self.rng.choice(list(LegalAction))

        base_p, days, recovery, risk = ACTION_PRIORS[action]
        # Stochastic fluctuation around an invented scenario input.
        sampled_p = max(0.0, min(1.0, self.rng.gauss(base_p, 0.05)))
        success = 1.0 if self.rng.random() < sampled_p else 0.0

        # Time discount factor: e^(-0.005 * days)
        time_discount = math.exp(-0.005 * days)
        # Expected utility: Success * Recovery * TimeDiscount - Risk
        utility = (success * recovery * time_discount) - (risk * (1.0 - success))
        return max(0.0, min(1.0, utility))

    def backpropagate(self, node: MCTSNode, reward: float) -> None:
        """Propagate evaluation results back up to the root."""
        current: MCTSNode | None = node
        while current is not None:
            current.visits += 1
            current.total_reward += reward
            current = current.parent

    def search(self, iterations: int = 500) -> dict[str, Any]:
        """Return the most visited illustrative option, never an optimal legal policy."""
        root = MCTSNode()

        for _ in range(iterations):
            leaf = self.select(root)
            expanded = self.expand(leaf)
            reward = self.simulate(expanded)
            self.backpropagate(expanded, reward)

        results: list[dict[str, Any]] = []
        for child in root.children:
            action = child.action
            base_p, days, rec_pct, _ = ACTION_PRIORS[action]  # type: ignore[index]
            results.append({
                "action": action.value if action else "Unknown",
                "action_id": action.name if action else "UNKNOWN",
                "visits": child.visits,
                "win_rate": round(child.value, 4),
                "settlement_probability": f"{round(base_p * 100)}%",
                "avg_days": days,
                "recovery_pct": f"{round(rec_pct * 100)}%",
                "uct_score": round(child.uct_score(root.visits, self.c), 4),
                "mode": "illustrative", "empirical": False, "review_required": True,
                "metrics_basis": "Invented scenario inputs and simulated utility, not forecasts",
                "guidance_url": (ADR_DIRECTORY_URL if action == LegalAction.ADR_REVIEW
                                 else "https://consumer-redress.ec.europa.eu/index_en"),
            })

        # Sort by visit count (most robust MCTS criterion)
        results.sort(key=lambda r: r["visits"], reverse=True)
        best = results[0] if results else None

        return {
            "iterations": iterations,
            "total_visits": root.visits,
            "exploration_constant": self.c,
            "optimal_action": best["action"] if best else None,
            "optimal_action_id": best["action_id"] if best else None,
            "actions": results,
            "framework": "Monte Carlo Tree Search (UCT / UCB1)",
            "mode": "illustrative", "empirical": False, "review_required": True,
            "entitlement_status": "not_determined",
            "limitations": (
                "No jurisdiction or case evidence was evaluated. The legacy optimal_action field "
                "identifies the most visited simulated option only. Probability, duration, "
                "recovery and reward fields are illustrative, not measured outcomes or advice. "
                "Review the seller's response, applicable law and the chosen body's eligibility "
                "and participation rules before deciding any next step. No external action occurs."
            ),
            "redress_guidance": REDRESS_GUIDANCE,
            "sources": [ADR_DIRECTORY_URL, "https://eur-lex.europa.eu/eli/reg/2024/3228/oj/eng"],
            "sources_checked_on": LEGAL_SOURCES_CHECKED_ON,
        }
