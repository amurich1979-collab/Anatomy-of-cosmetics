import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import {
  createClient, createInvitation, createRecord, getClient, initCrmDatabase, redeemInvitation
} from "../src/crmDatabase.js";

const dbPath = path.resolve("data/crm-db.json");
const backup = fs.existsSync(dbPath) ? fs.readFileSync(dbPath) : null;

test.after(() => {
  if (backup) fs.writeFileSync(dbPath, backup);
  else fs.rmSync(dbPath, { force: true });
});

test("client invitation is single-use and access is bound to one card", async () => {
  await initCrmDatabase();
  const staff = { id: "staff_test", role: "cosmetologist", workspaceId: "test-workspace" };
  const clientUser = { id: "user_client_test", role: "client", workspaceId: "test-workspace" };
  const first = await createClient(staff, { fullName: "Первый клиент" });
  const second = await createClient(staff, { fullName: "Второй клиент" });
  const invitation = await createInvitation(staff, first.id, "client@example.test");

  assert.deepEqual(await redeemInvitation(clientUser, invitation.token), { clientId: first.id });
  assert.equal(await redeemInvitation(clientUser, invitation.token), null, "invitation must not be reusable");
  assert.equal((await getClient(clientUser, first.id)).id, first.id);
  assert.equal(await getClient(clientUser, second.id), null, "client must not access another card");
});

test("injection point coordinates are validated as percentages", async () => {
  const staff = { id: "staff_test", role: "cosmetologist", workspaceId: "test-workspace" };
  await assert.rejects(
    createRecord(staff, "client_test", "injectionPoints", { faceMapId: "map_front", x: 101, y: 25 }),
    /диапазоне от 0 до 100/
  );
});
