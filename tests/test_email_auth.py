"""Run with python -m unittest discover -s tests -p test_email_auth.py -v.

Requires fakeredis[lua]. Exercises the production Lua scripts with Redis semantics.
"""
import json
import re
import unittest
from pathlib import Path
import fakeredis

SOURCE = (Path(__file__).parents[1] / "lib/email-auth.ts").read_text()
ISSUE = re.search(r"export const ISSUE = `(.*?)`;", SOURCE, re.S)[1]
VERIFY = re.search(r"export const VERIFY = `(.*?)`;", SOURCE, re.S)[1]


class EmailAuthTests(unittest.TestCase):
    def setUp(self):
        self.db = fakeredis.FakeRedis(decode_responses=True)

    def issue(self):
        return self.db.eval(ISSUE, 3, "hour", "cooldown", "code",
                            json.dumps({"hash": "correct", "attempts": 0}))

    def verify(self, value="correct", session="session"):
        return self.db.eval(VERIFY, 3, "attempts", "code", session, value)

    def test_single_use_and_session_expiry(self):
        self.assertEqual(self.issue(), 1)
        self.assertGreater(self.db.ttl("code"), 598)
        self.assertLessEqual(self.db.ttl("code"), 600)
        self.assertEqual(self.verify(), 1)
        self.assertEqual(self.db.get("session"), "1")
        self.assertEqual(self.db.ttl("session"), 43200)
        self.assertEqual(self.verify(session="replay"), 0)
        self.assertIsNone(self.db.get("replay"))

    def test_expired_code_rejected(self):
        self.issue()
        self.db.expire("code", 0)
        self.assertEqual(self.verify(), 0)

    def test_five_guesses_invalidate_code_without_extending_expiry(self):
        self.issue()
        self.db.expire("code", 100)
        for _ in range(4):
            self.assertEqual(self.verify("wrong"), 0)
            self.assertLessEqual(self.db.ttl("code"), 100)
        self.assertEqual(self.verify("wrong"), 0)
        self.assertEqual(self.verify(), 0)

    def test_resend_invalidates_previous_code(self):
        self.issue()
        self.db.delete("cooldown")
        self.db.eval(ISSUE, 3, "hour", "cooldown", "code",
                     json.dumps({"hash": "new", "attempts": 0}))
        self.assertEqual(self.verify(), 0)
        self.assertEqual(self.verify("new"), 1)

    def test_send_cooldown_and_hourly_limit(self):
        self.assertEqual(self.issue(), 1)
        self.assertEqual(self.issue(), 0)
        self.db.delete("cooldown")
        for _ in range(3):
            self.assertEqual(self.issue(), 1)
            self.db.delete("cooldown")
        self.assertEqual(self.issue(), 0)

    def test_verification_window_limit(self):
        self.db.set("attempts", 10, ex=600)
        self.issue()
        self.assertEqual(self.verify(), 0)
        self.assertIsNone(self.db.get("session"))
