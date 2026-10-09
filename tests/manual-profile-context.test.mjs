import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = path => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("cadastro administrativo reutiliza o fluxo atômico de múltiplos vínculos", async () => {
  const [app, profiles] = await Promise.all([
    read("assets/app.js"),
    read("supabase/functions/manage-profiles/index.ts"),
  ]);
  assert.match(app, /id="profile-create-form"/);
  assert.match(app, /\$\{accessBondMarkup\(\)\}/);
  assert.match(app, /name="create-scope"/);
  assert.match(app, /scope_ids: scopeIds/);
  assert.match(profiles, /submit_multi_bond_access_request/);
  assert.match(profiles, /approve_admin_profile/);
  assert.match(profiles, /must_change_password: true/);
  assert.match(profiles, /Cadastro administrativo com múltiplos vínculos/);
});

test("login oferece contexto ativo por perfil, vínculo e CNES", async () => {
  const [app, auth] = await Promise.all([
    read("assets/app.js"),
    read("supabase/functions/access-auth/index.ts"),
  ]);
  assert.match(auth, /action === 'contexts'/);
  assert.match(auth, /employment_bonds/);
  assert.match(auth, /profile_scopes/);
  assert.match(app, /sgf-access-context/);
  assert.match(app, /data-access-context/);
  assert.match(app, /x-sgf-bond/);
  assert.match(app, /x-sgf-cnes/);
  assert.match(app, /x-sgf-lotacao/);
  assert.match(app, /Escolha seu perfil e local de atuação/);
});
