"""Deterministic conditional storage double; never accesses AWS."""
from __future__ import annotations

import copy
import io
import threading
import uuid

from botocore.exceptions import ClientError


def service_error(code: str) -> ClientError:
    return ClientError({"Error": {"Code": code, "Message": code}}, "PutObject")


class ConditionalS3:
    def __init__(self):
        self.objects = {}
        self.lock = threading.RLock()
        self.calls = []
        self.read_error = None
        self.write_error = None
        self.lose_response = False
        self.missing_without_list = False

    def get_object(self, **kwargs):
        self.calls.append(("get", copy.deepcopy(kwargs)))
        if self.read_error:
            raise self.read_error
        with self.lock:
            key = (kwargs["Bucket"], kwargs["Key"])
            if key not in self.objects:
                raise service_error("AccessDenied" if self.missing_without_list else "NoSuchKey")
            value = self.objects[key]
            return {"Body": io.BytesIO(value["Body"]), "ETag": value["ETag"]}

    def put_object(self, **kwargs):
        self.calls.append(("put", copy.deepcopy(kwargs)))
        if self.write_error:
            raise self.write_error
        with self.lock:
            key = (kwargs["Bucket"], kwargs["Key"])
            previous = self.objects.get(key)
            if kwargs.get("IfNoneMatch") == "*" and previous is not None:
                raise service_error("PreconditionFailed")
            if "IfMatch" in kwargs and (
                previous is None or previous["ETag"] != kwargs["IfMatch"]
            ):
                raise service_error("PreconditionFailed")
            etag = '"' + uuid.uuid4().hex + '"'
            self.objects[key] = {"Body": kwargs["Body"], "ETag": etag}
            if self.lose_response:
                self.lose_response = False
                raise TimeoutError("Stored, but response lost")
            return {"ETag": etag}
