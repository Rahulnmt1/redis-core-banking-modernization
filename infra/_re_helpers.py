#!/usr/bin/env python3
"""Helpers for Redis Enterprise REST setup. Reads JSON from stdin, prints transformed JSON to stdout."""
import json
import sys


def db_uid_by_name(name):
    data = json.load(sys.stdin)
    if isinstance(data, list):
        for b in data:
            if b.get("name") == name:
                print(b.get("uid", ""))
                return
    print("")


def db_status_by_name(name):
    data = json.load(sys.stdin)
    if isinstance(data, list):
        for b in data:
            if b.get("name") == name:
                print(b.get("status", "missing"))
                return
    print("missing")


def bootstrap_state():
    data = json.load(sys.stdin)
    print(data.get("bootstrap_status", {}).get("state", "unknown"))


def build_module_list():
    """stdin = full /v1/modules JSON, stdout = list with JSON + Search."""
    mods = json.load(sys.stdin)
    wanted = {"ReJSON": "ReJSON", "search": "search", "searchlight": "search"}
    chosen = {}
    for m in mods:
        name = m.get("module_name") or ""
        sem = m.get("semantic_version") or ""
        key = wanted.get(name)
        if key and key not in chosen:
            chosen[key] = {
                "module_name": name,
                "module_args": "",
                "semantic_version": sem,
            }
    print(json.dumps(list(chosen.values())))


def build_create_cluster(user, password):
    print(
        json.dumps(
            {
                "action": "create_cluster",
                "cluster": {"name": "cluster.local"},
                "node": {
                    "paths": {
                        "persistent_path": "/var/opt/redislabs/persist",
                        "ephemeral_path": "/var/opt/redislabs/tmp",
                    }
                },
                "credentials": {"username": user, "password": password},
                "license": "",
            }
        )
    )


def build_bdb_payload(name, port, module_list_json):
    print(
        json.dumps(
            {
                "name": name,
                "type": "redis",
                "memory_size": 1073741824,
                "port": int(port),
                "replication": False,
                "sharding": False,
                "module_list": json.loads(module_list_json),
            }
        )
    )


if __name__ == "__main__":
    op = sys.argv[1]
    args = sys.argv[2:]
    {
        "db_uid_by_name": lambda: db_uid_by_name(args[0]),
        "db_status_by_name": lambda: db_status_by_name(args[0]),
        "bootstrap_state": lambda: bootstrap_state(),
        "build_module_list": lambda: build_module_list(),
        "build_create_cluster": lambda: build_create_cluster(args[0], args[1]),
        "build_bdb_payload": lambda: build_bdb_payload(args[0], args[1], args[2]),
    }[op]()
