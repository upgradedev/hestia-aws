"""HE4: conditional persistence, failed writes and isolated workspace regressions."""
from __future__ import annotations

import copy
import json
from concurrent.futures import ThreadPoolExecutor
from datetime import date, timedelta
from unittest.mock import MagicMock

import pytest

from hestia.adapters.storage import (
    S3HouseholdStore,
    StateMissing,
    StorageConflict,
    StorageError,
    fresh_demo_state,
)
from tests.fakes import ConditionalS3, service_error

SCOPE = "a" * 32


def cloud_store(s3=None, scope=SCOPE):
    return S3HouseholdStore(bucket_name="test-bucket", workspace_id=scope,
                            s3_client=s3 or ConditionalS3())


def test_in_memory_load_and_save_are_copies(monkeypatch):
    monkeypatch.setenv("HESTIA_STATE_BUCKET", "must-not-be-used")
    store = S3HouseholdStore(bucket_name="")
    state = store.load_state()
    state["household_name"] = "Updated"
    assert store.load_state()["household_name"] != "Updated"
    store.save_state(state)
    assert store.load_state()["household_name"] == "Updated"
    assert state["version_seq"] == 2
    assert store.bucket == ""


def test_independent_default_memory_workspaces():
    first, second = S3HouseholdStore(bucket_name=""), S3HouseholdStore(bucket_name="")
    state = first.load_state()
    state["household_name"] = "Private A"
    first.save_state(state)
    assert second.load_state()["household_name"] != "Private A"


def test_s3_requires_trusted_scope_and_scopes_all_prefixes():
    with pytest.raises(ValueError):
        S3HouseholdStore(bucket_name="bucket")
    for invalid in ("../state", "A" * 32, "", "a" * 33, "a/b"):
        with pytest.raises(ValueError):
            cloud_store(scope=invalid)
    store = cloud_store()
    assert store.state_key == f"demo/workspaces/{SCOPE}/state.json"
    assert store.audit_prefix.startswith(store.prefix)
    assert store.outbox_prefix.startswith(store.prefix)


def test_bootstrap_only_missing_and_conditional():
    s3 = ConditionalS3()
    store = cloud_store(s3)
    initial = store.load_state()
    assert initial["version_seq"] == 1
    assert s3.calls[-1][1]["IfNoneMatch"] == "*"
    assert store.load_state() == initial
    assert len([c for c in s3.calls if c[0] == "put"]) == 1


def test_fresh_scope_creation_does_not_require_list_or_read_authority():
    s3 = ConditionalS3()
    s3.missing_without_list = True
    state = cloud_store(s3).create_workspace()
    assert [kind for kind, _ in s3.calls] == ["put"]
    assert s3.calls[0][1]["IfNoneMatch"] == "*"
    assert cloud_store(s3).load_state(create=False) == state
    before = copy.deepcopy(s3.objects)
    with pytest.raises(StorageConflict):
        cloud_store(s3).create_workspace()
    assert s3.objects == before


def test_memory_scope_collision_cannot_issue_access_to_existing_state():
    store = S3HouseholdStore(bucket_name="", workspace_id=SCOPE)
    initial = store.create_workspace()
    with pytest.raises(StorageConflict):
        store.create_workspace()
    assert store.load_state(create=False) == initial


@pytest.mark.parametrize("error", [service_error("AccessDenied"), TimeoutError()])
def test_explicit_creation_failure_never_falls_back(error):
    s3 = ConditionalS3()
    s3.write_error = error
    with pytest.raises(StorageError):
        cloud_store(s3).create_workspace()
    assert s3.objects == {}


def test_lost_creation_reply_keeps_reservation_and_does_not_overwrite():
    s3 = ConditionalS3()
    s3.lose_response = True
    with pytest.raises(StorageError):
        cloud_store(s3).create_workspace()
    before = copy.deepcopy(s3.objects)
    with pytest.raises(StorageConflict):
        cloud_store(s3).create_workspace()
    assert s3.objects == before


@pytest.mark.parametrize("error", [
    service_error("AccessDenied"), service_error("NoSuchBucket"), TimeoutError(),
    Exception("NoSuchKey"),
])
def test_read_failure_never_seeds_or_resets(error):
    s3 = ConditionalS3()
    s3.read_error = error
    with pytest.raises(StorageError):
        cloud_store(s3).load_state()
    assert not any(c[0] == "put" for c in s3.calls)


def test_missing_existing_session_not_recreated():
    s3 = ConditionalS3()
    with pytest.raises(StateMissing):
        cloud_store(s3).load_state(create=False)
    assert not any(c[0] == "put" for c in s3.calls)


def test_corrupt_state_never_replaced():
    s3 = ConditionalS3()
    store = cloud_store(s3)
    store.load_state()
    key = (store.bucket, store.state_key)
    for content in (b"{broken", b"[]", b'{"version_seq":true}', b"\xff"):
        s3.objects[key]["Body"] = content
        count = len(s3.calls)
        with pytest.raises(StorageError):
            store.load_state()
        assert not any(c[0] == "put" for c in s3.calls[count:])
        assert s3.objects[key]["Body"] == content


def test_missing_etag_and_unreadable_body_fail_closed():
    s3 = MagicMock()
    s3.get_object.return_value = {"Body": MagicMock()}
    s3.get_object.return_value["Body"].read.return_value = json.dumps(fresh_demo_state()).encode()
    with pytest.raises(StorageError, match="revision"):
        cloud_store(s3).load_state()
    s3.get_object.return_value["Body"].read.side_effect = OSError()
    with pytest.raises(StorageError, match="unreadable"):
        cloud_store(s3).load_state()
    s3.put_object.assert_not_called()


def test_stale_s3_and_memory_writers_cannot_overwrite():
    for shared in (None, ConditionalS3()):
        scope = "b" * 32 if shared is None else "c" * 32
        first = (cloud_store(shared, scope) if shared
                 else S3HouseholdStore(bucket_name="", workspace_id=scope))
        second = (cloud_store(shared, scope) if shared
                  else S3HouseholdStore(bucket_name="", workspace_id=scope))
        left, right = first.load_state(), second.load_state()
        left["household_name"] = "Winner"
        right["household_name"] = "Loser"
        first.save_state(left)
        with pytest.raises(StorageConflict):
            second.save_state(right)
        assert second.load_state()["household_name"] == "Winner"


def test_failed_write_does_not_update_caller_or_committed_state():
    s3 = ConditionalS3()
    store = cloud_store(s3)
    original = store.load_state()
    candidate = copy.deepcopy(original)
    candidate["household_name"] = "Unsaved"
    s3.write_error = service_error("AccessDenied")
    with pytest.raises(StorageError):
        store.save_state(candidate)
    assert candidate["version_seq"] == original["version_seq"]
    assert store.load_state() == original


def test_lost_write_response_requires_readback_not_success_fallback():
    s3 = ConditionalS3()
    store = cloud_store(s3)
    state = store.load_state()
    s3.lose_response = True
    state["household_name"] = "Committed"
    with pytest.raises(StorageError, match="unconfirmed"):
        store.save_state(state)
    assert state["version_seq"] == 1
    assert store.load_state()["household_name"] == "Committed"
    assert store.load_state()["version_seq"] == 2


def test_parallel_bootstrap_does_not_replace_winner():
    s3 = ConditionalS3()
    with ThreadPoolExecutor(max_workers=4) as pool:
        values = list(pool.map(lambda _: cloud_store(s3).load_state(), range(4)))
    assert all(v["version_seq"] == 1 for v in values)


def test_audit_and_reset_preserve_history_and_monotonic_version():
    store = S3HouseholdStore(bucket_name="")
    state = store.load_state()
    state["drafts"]["consumed"] = {"consumed": True}
    state["action_count"] = 5
    store.save_state(state)
    seal = store.append_audit_event("review", {"amount": 18500})
    assert len(seal) == 64
    before = store.load_state()
    fresh = store.reset_state()
    assert fresh["drafts"] == before["drafts"]
    assert fresh["action_count"] == 5
    assert fresh["version_seq"] > before["version_seq"]
    assert fresh["generation"] == 1
    assert len(fresh["audit_events"]) == len(before["audit_events"]) + 1
    assert fresh["dispatch_records"] == []


def test_audit_failure_propagates_and_direct_transport_is_closed():
    s3 = ConditionalS3()
    store = cloud_store(s3)
    store.load_state()
    s3.write_error = service_error("AccessDenied")
    with pytest.raises(StorageError):
        store.append_audit_event("review", {})
    assert store.load_state()["audit_events"] == []
    with pytest.raises(PermissionError):
        store.save_outbox_email("unapproved")
    with pytest.raises(PermissionError):
        store.record_claim_dispatch("unapproved")
    with pytest.raises(NotImplementedError):
        store.record_ingest_batch()
    assert store.get_outbox_status()["delivered_count"] == 0


def test_size_limit_invalid_state_and_unloaded_save():
    store = S3HouseholdStore(bucket_name="")
    with pytest.raises(StorageConflict):
        store.save_state(fresh_demo_state())
    state = store.load_state()
    state["oversize"] = "x" * store.MAX_STATE_BYTES
    with pytest.raises(StorageError, match="size"):
        store.save_state(state)
    with pytest.raises(StorageError):
        store.save_state({"version_seq": 1})


def test_client_initialization_failure_is_not_memory_fallback():
    with pytest.raises(StorageError):
        S3HouseholdStore(
            bucket_name="test", workspace_id=SCOPE,
        ).load_state()


def test_sample_trial_ends_three_days_after_the_copy_opens():
    opened = fresh_demo_state(date(2026, 12, 1))
    [trial] = [s for s in opened["subscriptions"] if s["id"] == "sub-001"]
    assert trial["is_trial"] is True and trial["trial_end_date"] == "2026-12-04"
    [today] = [s for s in fresh_demo_state()["subscriptions"] if s["id"] == "sub-001"]
    assert date.fromisoformat(today["trial_end_date"]) - date.today() == timedelta(days=3)
