#!/usr/bin/env bash
# Convenience wrapper — delegates to demo.sh
exec "$(dirname "$0")/demo.sh" down
