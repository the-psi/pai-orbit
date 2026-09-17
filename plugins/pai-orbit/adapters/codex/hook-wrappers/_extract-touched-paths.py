#!/usr/bin/env python3
"""
Shared path-extraction helper for pai-orbit's Codex hook wrappers.

Reads a Codex-shape PostToolUse JSON payload from stdin, extracts the
absolute paths of files touched by the tool call, and prints one path
per line on stdout.

Extraction uses the Primary/Fallback/Future-proof triad:

  Primary:      parse tool_response plaintext for the stable
                "Success. Updated the following files:" block with
                A/M/D line prefixes.
  Fallback:     parse the apply_patch body headers in tool_input.command
                (*** Add File: / *** Update File: / *** Delete File:).
  Future-proof: if tool_response arrives as a structured JSON object
                with a touched-files array, extract from it first.

Advisory only. On any parse error the helper exits 0 with no output so
the calling wrapper is a silent no-op.
"""
import json
import os
import re
import sys


def _from_structured(tool_response):
    """Future-proof branch: structured JSON with a touched-files array."""
    if not isinstance(tool_response, dict):
        return []
    for key in ("files", "touched_files", "file_paths", "changes"):
        val = tool_response.get(key)
        if not isinstance(val, list):
            continue
        out = []
        for item in val:
            if isinstance(item, str):
                out.append(item)
            elif isinstance(item, dict):
                p = item.get("path") or item.get("file_path")
                if p:
                    out.append(p)
        return out
    return []


def _from_tool_response_text(tool_response):
    """Primary branch: 'Updated the following files:' block in plaintext."""
    if not isinstance(tool_response, str):
        return []
    marker = "Updated the following files:"
    idx = tool_response.find(marker)
    if idx == -1:
        return []
    out = []
    # Lines after the marker: `A path`, `M path`, `D path`
    for line in tool_response[idx + len(marker):].splitlines():
        m = re.match(r"^([AMD])\s+(.+)$", line.strip())
        if m:
            out.append(m.group(2))
    return out


def _from_patch_body(command_body):
    """Fallback branch: apply_patch header lines."""
    if not command_body:
        return []
    out = []
    for m in re.finditer(
        r"^\*\*\*\s+(Add|Update|Delete)\s+File:\s+(.+)$",
        command_body,
        re.MULTILINE,
    ):
        out.append(m.group(2).strip())
    return out


def main():
    try:
        payload = json.loads(sys.stdin.read())
    except Exception:
        return 0

    cwd = payload.get("cwd") or os.environ.get("PWD") or os.getcwd()
    tool_response = payload.get("tool_response")
    tool_input = payload.get("tool_input") or {}
    command_body = tool_input.get("command") or ""

    paths = _from_structured(tool_response)
    if not paths:
        paths = _from_tool_response_text(tool_response)
    if not paths:
        paths = _from_patch_body(command_body)

    for p in paths:
        if not os.path.isabs(p):
            p = os.path.join(cwd, p)
        print(p)
    return 0


if __name__ == "__main__":
    sys.exit(main())
