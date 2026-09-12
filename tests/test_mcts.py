"""Unit tests for the MCTS legal negotiation simulation engine."""

from __future__ import annotations

from hestia.domain.mcts import (
    ACTION_PRIORS,
    LegalAction,
    LegalNegotiationMCTS,
    MCTSNode,
)
from tests.test_web import call


def test_mcts_node_properties():
    node = MCTSNode(action=LegalAction.DIRECT_BGB_437)
    assert node.value == 0.0
    assert node.uct_score(10) == float("inf")
    assert node.is_fully_expanded() is False
    assert len(node.untried_actions()) == len(LegalAction)

    # Add child
    child = MCTSNode(action=LegalAction.DIRECT_BGB_437, parent=node)
    node.children.append(child)
    assert len(node.untried_actions()) == len(LegalAction) - 1

    # Simulate visits
    node.visits = 10
    node.total_reward = 8.0
    assert node.value == 0.8
    assert node.uct_score(20) > 0.8


def test_mcts_search_convergence():
    mcts = LegalNegotiationMCTS(random_seed=42)
    results = mcts.search(iterations=200)

    assert results["iterations"] == 200
    assert results["total_visits"] >= 200
    assert results["optimal_action"] is not None
    assert len(results["actions"]) == len(LegalAction)

    # The seller review option is visited heavily under the fixed illustrative inputs.
    assert any(a["action"] == LegalAction.DIRECT_BGB_437.value for a in results["actions"])
    bgb_action = next(
        a for a in results["actions"] if a["action"] == LegalAction.DIRECT_BGB_437.value
    )
    assert bgb_action["visits"] > 30


def test_mcts_expand_all_actions():
    mcts = LegalNegotiationMCTS(random_seed=123)
    root = MCTSNode()
    for _ in range(len(LegalAction)):
        mcts.expand(root)
    assert root.is_fully_expanded() is True
    # Expanding a fully expanded node returns node without adding
    child_count = len(root.children)
    same = mcts.expand(root)
    assert same == root
    assert len(root.children) == child_count


def test_mcts_simulate_and_backpropagate():
    mcts = LegalNegotiationMCTS(random_seed=77)
    node = MCTSNode(action=LegalAction.EU_ODR_MEDIATION)
    reward = mcts.simulate(node)
    assert 0.0 <= reward <= 1.0

    # Test simulate with None action (random fallback)
    empty_node = MCTSNode(action=None)
    reward_empty = mcts.simulate(empty_node)
    assert 0.0 <= reward_empty <= 1.0

    # Backpropagation
    mcts.backpropagate(node, 0.75)
    assert node.visits == 1
    assert node.total_reward == 0.75


def test_action_priors_integrity():
    for action in LegalAction:
        assert action in ACTION_PRIORS
        p, days, rec, risk = ACTION_PRIORS[action]
        assert 0.0 < p <= 1.0
        assert days > 0
        assert rec > 0.0
        assert risk >= 0.0


def test_legacy_enum_names_resolve_only_to_current_review_options():
    assert LegalAction.EU_ODR_MEDIATION is LegalAction.ADR_REVIEW
    assert LegalAction.DIRECT_BGB_437 is LegalAction.SELLER_REVIEW
    assert LegalAction.EU_ODR_MEDIATION.name == "ADR_REVIEW"
    assert len(LegalAction) == 4
    assert "ODR" not in LegalAction.EU_ODR_MEDIATION.value
    assert "BGB" not in LegalAction.DIRECT_BGB_437.value


def test_every_returned_option_is_review_only_and_metrics_are_not_empirical():
    result = LegalNegotiationMCTS(random_seed=7).search(iterations=100)
    assert {row["action_id"] for row in result["actions"]} == {
        "SELLER_REVIEW", "ADR_REVIEW", "AMICABLE_VOUCHER", "SMALL_CLAIMS_COURT",
    }
    for row in result["actions"]:
        assert "ODR" not in row["action"] and "BGB" not in row["action"]
        assert row["empirical"] is False and row["review_required"] is True
        assert row["mode"] == "illustrative"
        assert "not forecasts" in row["metrics_basis"]
    adr = next(row for row in result["actions"] if row["action_id"] == "ADR_REVIEW")
    assert adr["guidance_url"] == (
        "https://consumer-redress.ec.europa.eu/list-alternative-dispute-resolution-adr-bodies_en"
    )
    assert result["optimal_action_id"] in {row["action_id"] for row in result["actions"]}
    assert result["empirical"] is False and result["entitlement_status"] == "not_determined"
    assert "No jurisdiction or case evidence was evaluated" in result["limitations"]


def test_zero_iteration_illustration_does_not_invent_a_recommended_action():
    result = LegalNegotiationMCTS().search(iterations=0)
    assert result["optimal_action"] is None and result["actions"] == []
    assert result["review_required"] and result["empirical"] is False


def test_public_simulation_api_returns_current_adr_and_no_executable_odr_route():
    code, result = call("/api/simulation/mcts", method="GET")
    assert code == 200
    adr = next(row for row in result["actions"] if row["action_id"] == "ADR_REVIEW")
    assert "Review Applicable ADR Bodies" in adr["action"]
    assert adr["review_required"] and adr["empirical"] is False
    assert result["sources_checked_on"] == "2026-09-12"
    assert "EU ODR platform closed on 20 July 2025" in result["redress_guidance"]
    assert "No external action occurs" in result["limitations"]
