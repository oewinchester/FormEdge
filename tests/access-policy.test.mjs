import assert from "node:assert/strict";
import test from "node:test";
import { parseConfiguredOwnerEmails } from "../lib/access-policy.ts";

test("configured owner emails are normalized, validated and deduplicated", () => {
  const owners = parseConfiguredOwnerEmails(
    " Owner@Example.com,editor@example.com ",
    "owner@example.com,not-an-email,,",
    null,
  );

  assert.deepEqual([...owners], ["owner@example.com", "editor@example.com"]);
});

test("an absent owner configuration never grants a match", () => {
  assert.equal(parseConfiguredOwnerEmails(undefined, "").size, 0);
});

