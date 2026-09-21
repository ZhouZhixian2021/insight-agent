"""Project Academic Session events through the Python SDK and the real dsh CLI."""
from __future__ import annotations

import copy
import json
import os
from pathlib import Path
import shutil
import subprocess
import tempfile
import unittest

from deepseek_harness import DeepSeekHarness


ROOT = Path(__file__).resolve().parents[3]
SCENARIO = ROOT / "snapshots/sdk/academic-evidence"
EXPECTED = Path(__file__).with_name("expected") / "academic.json"


def academic_events(events: list[dict]) -> list[dict]:
    """Retain Academic payloads and sequence references; normalize clocks and message identities."""
    result = []
    message_ids: dict[str, str] = {}
    for original in events:
        if original.get("type") not in {"academic/evidence-request", "academic/evidence-result",
                                         "academic/synthesis-request", "academic/synthesis-result"}:
            continue
        event = copy.deepcopy(original)
        event["time"] = 0
        if event["type"].endswith("-request"):
            for message in event["data"]["messages"]:
                identity = message["id"]
                if identity not in message_ids:
                    message_ids[identity] = "{{message:" + str(len(message_ids) + 1) + "}}"
                message["id"] = message_ids[identity]
        for record in event["data"].get("stream", []):
            for key in ("time", "time0"):
                if key in record:
                    record[key] = 0
            if "dt" in record:
                record["dt"] = [0 for _ in record["dt"]]
        result.append(event)
    return result


@unittest.skipUnless(os.environ.get("DSH_ACADEMIC_SNAPSHOT") == "1", "Opt in after building the workspace with DSH_ACADEMIC_SNAPSHOT=1")
class AcademicSnapshotTest(unittest.TestCase):
    maxDiff = None
    def test_real_dsh_projects_academic_records_without_losing_payloads(self) -> None:
        node = shutil.which("node")
        binary = ROOT / "apps/cli/lib/bin.js"
        self.assertIsNotNone(node, "Build prerequisites require Node.js on PATH")
        self.assertTrue(binary.is_file(), "Build the dsh CLI before running this process test")
        expected = json.loads(EXPECTED.read_text(encoding="utf-8"))
        with tempfile.TemporaryDirectory(prefix="academic-python-sdk-") as temporary:
            cwd = Path(temporary)
            home = cwd / ".dsh"
            fixture = cwd / "replay.v2.jsonl"
            fixture.write_text(
                (SCENARIO / "session.v2.jsonl").read_text(encoding="utf-8")
                .replace("{{cwd}}", json.dumps(str(cwd))[1:-1]), encoding="utf-8",
            )
            env = {
                "DSH_HOME": str(home), "DSH_AGENTS_HOME": str(cwd / ".agents"),
                "DSH_TELEMETRY_DISABLED": "1", "DSH_SNAPSHOT": "replay",
                "DSH_SNAPSHOT_FILE": str(fixture),
                "DSH_SNAPSHOT_PROVIDER": "deepseek-official", "DSH_SNAPSHOT_MODEL": "deepseek-v4-flash",
            }
            patch_root = cwd / "patches"
            patch_root.mkdir()
            materializer = (ROOT / "packages/test-support/session-snapshot/lib/index.js").as_uri()
            prepare = (
                "const {materializeProfilePatch} = await import(process.argv[1]);"
                "process.stdout.write(JSON.stringify(process.argv.slice(4).map((p,i)=>"
                "materializeProfilePatch(p,process.argv[2],process.argv[3],i))));"
            )
            patches = json.loads(subprocess.run(
                [node, "--input-type=module", "-e", prepare, materializer, str(cwd), str(patch_root),
                 str(SCENARIO / "cordis.yml"), str(SCENARIO / "cordis.snapshot.yml")],
                check=True, capture_output=True, text=True, encoding="utf-8", timeout=30,
                env={**os.environ, "NODE_PATH": str(ROOT / "packages/test-support/session-snapshot/node_modules")},
            ).stdout)
            # Private test injection still launches the shipped dsh entry, with no alternate server.
            launch = (node, str(binary), "--profile", "sdk-minimal",
                      "--patch", patches[0], "--patch", patches[1])
            with DeepSeekHarness(cwd=str(cwd), profile="sdk-minimal", env=env,
                                 request_timeout_seconds=30, _launch_args=launch) as harness:
                result = harness.run("Reply with exactly ACADEMIC_DONE. Do not use tools.",
                                     session_id="academic-python-session")
            observed = {"final_response": result.final_response, "finish_reason": result.finish_reason,
                        "events": academic_events(result.events)}
            self.assertEqual(observed, expected)
            notified = [item.payload["event"] for item in result.notifications
                        if item.method == "session.event"]
            self.assertEqual(academic_events(notified), expected["events"])
            logs = list((home / "sessions").rglob("session.v2.jsonl"))
            self.assertEqual(len(logs), 1)
            persisted = [json.loads(line) for line in logs[0].read_text(encoding="utf-8").splitlines() if line]
            self.assertEqual([event for event in persisted if event.get("type", "").startswith("academic/")],
                             [event for event in result.events if event.get("type", "").startswith("academic/")])
            self.assertEqual(academic_events(persisted), expected["events"])


if __name__ == "__main__":
    unittest.main()
