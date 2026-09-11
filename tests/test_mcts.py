"""Unit tests for the MCTS legal negotiation simulation engine."""

from __future__ import annotations

from hestia.domain.mcts import (
    ACTION_PRIORS,
    LegalAction,
    LegalNegotiationMCTS,
    MCTSNode,
)


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

    # The direct statutory claim BGB § 437 is evaluated and visited heavily
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
