import os
import shutil
import subprocess
import tempfile
import unittest
from pathlib import Path


SCRIPT = Path(__file__).with_name("push-with-retry.sh")


def git(cwd, *args):
    return subprocess.run(["git", *args], cwd=cwd, check=True, capture_output=True, text=True).stdout.strip()


@unittest.skipUnless(shutil.which("git") and shutil.which("bash"), "git and bash are required")
class PushWithRetryTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        base = Path(self.tmp.name)
        self.remote = base / "remote.git"
        git(base, "init", "-q", "--bare", "-b", "main", str(self.remote))
        self.ours = self.clone("ours")
        (self.ours / "data").mkdir()
        (self.ours / "data/shared.json").write_text("base\n")
        (self.ours / "data/other.json").write_text("base\n")
        git(self.ours, "add", "-A")
        git(self.ours, "commit", "-q", "-m", "base")
        git(self.ours, "push", "-q", "origin", "HEAD:main")
        self.theirs = self.clone("theirs")

    def tearDown(self):
        self.tmp.cleanup()

    def clone(self, name):
        path = Path(self.tmp.name) / name
        git(self.tmp.name, "clone", "-q", str(self.remote), str(path))
        git(path, "config", "user.name", "bot")
        git(path, "config", "user.email", "bot@example.com")
        git(path, "checkout", "-q", "-B", "main")
        return path

    def their_commit(self, files):
        git(self.theirs, "pull", "-q", "origin", "main")
        for name, text in files.items():
            (self.theirs / name).parent.mkdir(parents=True, exist_ok=True)
            (self.theirs / name).write_text(text)
        git(self.theirs, "add", "-A")
        git(self.theirs, "commit", "-q", "-m", "theirs")
        git(self.theirs, "push", "-q", "origin", "HEAD:main")

    def run_script(self, *args):
        env = dict(os.environ, REF="main", PUSH_PAUSE_SECONDS="0")
        return subprocess.run(["bash", str(SCRIPT), *args], cwd=self.ours, env=env, capture_output=True, text=True)

    def remote_file(self, name):
        git(self.ours, "fetch", "-q", "origin")
        return git(self.ours, "show", f"origin/main:{name}")

    def test_nothing_to_commit_exits_cleanly(self):
        result = self.run_script("-m", "msg", "--", "data")
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertIn("No changes", result.stdout)

    def test_rejected_push_rebases_and_keeps_both_writers(self):
        self.their_commit({"data/other.json": "theirs\n"})
        (self.ours / "data/shared.json").write_text("ours\n")
        result = self.run_script("-m", "ours", "--", "data")
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        self.assertEqual(self.remote_file("data/shared.json"), "ours")
        self.assertEqual(self.remote_file("data/other.json"), "theirs")

    def test_conflict_takes_our_files_keeps_theirs_and_regenerates(self):
        self.their_commit({"data/shared.json": "theirs\n", "data/new-from-them.json": "new\n"})
        (self.ours / "data/shared.json").write_text("ours\n")
        regen = "ls data | sort > data/index.txt"
        result = self.run_script("-m", "ours", "-r", regen, "--", "data")
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        self.assertIn("Rebase conflicted", result.stdout)
        self.assertEqual(self.remote_file("data/shared.json"), "ours")
        self.assertEqual(self.remote_file("data/new-from-them.json"), "new")
        self.assertIn("new-from-them.json", self.remote_file("data/index.txt"))
        log = git(self.ours, "log", "--format=%s", "origin/main")
        self.assertEqual(log.splitlines()[:2], ["ours", "theirs"])

    def test_usage_errors(self):
        self.assertEqual(self.run_script("--", "data").returncode, 2)
        self.assertEqual(self.run_script("-m", "x").returncode, 2)


if __name__ == "__main__":
    unittest.main()
