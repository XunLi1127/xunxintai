const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { createWindowsCredentialStore, createProviderCredentialManager } = require('../windows-credential-store.cjs');

function fixture() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'xun-credentials-'));
  const filePath = path.join(dir, 'credentials.json');
  const safeStorage = {
    isEncryptionAvailable: () => true,
    encryptString: value => Buffer.from(`protected:${value}`, 'utf8'),
    decryptString: value => {
      const decoded = value.toString('utf8');
      if (!decoded.startsWith('protected:')) throw new Error('decrypt secret detail');
      return decoded.slice('protected:'.length);
    },
  };
  return { dir, filePath, safeStorage };
}

test('凭据按不透明引用加密落盘且磁盘不含明文', () => {
  const f = fixture();
  const store = createWindowsCredentialStore({ safeStorage: f.safeStorage, fs, filePath: f.filePath, randomId: () => 'ref-1234567890abcdef' });
  const reference = store.set('provider-secret-value');
  assert.equal(reference, 'ref-1234567890abcdef');
  assert.equal(store.get(reference), 'provider-secret-value');
  const disk = fs.readFileSync(f.filePath, 'utf8');
  assert.doesNotMatch(disk, /provider-secret-value/);
  assert.match(disk, /ref-1234567890abcdef/);
  fs.rmSync(f.dir, { recursive: true, force: true });
});

test('删除后引用稳定报告缺失且错误不泄密', () => {
  const f = fixture();
  const store = createWindowsCredentialStore({ safeStorage: f.safeStorage, fs, filePath: f.filePath, randomId: () => 'ref-1234567890abcdef' });
  const reference = store.set('secret-delete-me');
  assert.equal(store.delete(reference), true);
  assert.throws(() => store.get(reference), error => error.code === 'CREDENTIAL_NOT_FOUND' && !/secret/i.test(error.message));
  fs.rmSync(f.dir, { recursive: true, force: true });
});

test('安全存储不可用和密文损坏只返回稳定错误码', () => {
  const f = fixture();
  const unavailable = createWindowsCredentialStore({ safeStorage: { isEncryptionAvailable: () => false }, fs, filePath: f.filePath });
  assert.throws(() => unavailable.set('never-written-secret'), error => error.code === 'CREDENTIAL_STORE_UNAVAILABLE' && !/never-written/i.test(error.message));

  fs.writeFileSync(f.filePath, JSON.stringify({ version: 1, credentials: { 'ref-1234567890abcdef': 'bad' } }));
  const broken = createWindowsCredentialStore({ safeStorage: f.safeStorage, fs, filePath: f.filePath });
  assert.throws(() => broken.get('ref-1234567890abcdef'), error => error.code === 'CREDENTIAL_DECRYPT_FAILED' && !/decrypt secret detail/i.test(error.message));
  fs.rmSync(f.dir, { recursive: true, force: true });
});

test('provider 管理器迁移明文并只公开非敏感元数据', () => {
  const values = new Map(); let sequence = 0;
  const manager = createProviderCredentialManager({ store: {
    set(value, reference) { const ref = reference || `reference-${++sequence}-abcdef`; values.set(ref, value); return ref; },
    get(reference) { return values.get(reference); },
    delete(reference) { return values.delete(reference); },
  } });
  const providers = [{ id: 'p1', name: 'Fixture', apiKey: 'legacy-secret', baseUrl: 'https://example.invalid' }];
  let saved = 0;
  manager.migrate(providers, () => { saved += 1; });
  assert.equal(saved, 1);
  assert.equal(providers[0].apiKey, undefined);
  assert.equal(manager.resolve(providers[0]), 'legacy-secret');
  assert.deepEqual(manager.toPublic(providers[0]), { id: 'p1', name: 'Fixture', baseUrl: 'https://example.invalid', hasCredential: true });
});

test('provider 创建更新删除沿引用调用且不把输入 key 留在记录中', () => {
  const values = new Map();
  const manager = createProviderCredentialManager({ store: {
    set(value, reference) { const ref = reference || 'reference-create-abcdef'; values.set(ref, value); return ref; },
    get(reference) { return values.get(reference); },
    delete(reference) { return values.delete(reference); },
    snapshot: () => new Map(values), restore: snapshot => { values.clear(); for (const pair of snapshot) values.set(...pair); },
  } });
  const provider = { id: 'p2', name: 'Fixture' };
  manager.applyInput(provider, { apiKey: 'new-secret', enabled: true, id: 'attacker-id', credentialRef: 'attacker-reference', hasCredential: false });
  assert.equal(provider.apiKey, undefined);
  assert.equal(provider.id, 'p2');
  assert.equal(provider.credentialRef, 'reference-create-abcdef');
  assert.equal(manager.resolve(provider), 'new-secret');
  assert.equal(provider.enabled, true);
  manager.remove(provider);
  assert.throws(() => manager.resolve(provider), error => error.code === 'CREDENTIAL_NOT_FOUND');
});

test('旧明文迁移失败及后续元数据更新都不删除原凭据', () => {
  const manager = createProviderCredentialManager({ store: {
    set() { throw Object.assign(new Error('do not leak legacy-secret'), { code: 'CREDENTIAL_STORE_UNAVAILABLE' }); },
    get() { throw new Error('unused'); }, delete() { return false; },
  } });
  const provider = { id: 'legacy', apiKey: 'legacy-secret', name: 'Before' };
  assert.throws(() => manager.migrate([provider], () => {}), error => error.code === 'CREDENTIAL_STORE_UNAVAILABLE');
  assert.equal(provider.apiKey, 'legacy-secret');
  manager.applyInput(provider, { name: 'After' });
  assert.equal(provider.apiKey, 'legacy-secret');
  assert.equal(manager.resolve(provider), 'legacy-secret');
});

test('bridge 的 provider 持久化、公开列表和聊天解析均接入安全凭据引用', () => {
  const bridge = fs.readFileSync(path.join(__dirname, '..', 'bridge-server.cjs'), 'utf8');
  assert.match(bridge, /createWindowsCredentialStore/);
  assert.match(bridge, /providerCredentials\.migrate\(providers, saveProviders\)/);
  assert.match(bridge, /providers\.map\(provider => providerCredentials\.toPublic\(provider\)\)/);
  assert.match(bridge, /providerCredentials\.applyInput\(p, req\.body/);
  assert.match(bridge, /apiKey = providerCredentials\.resolve\(provider\)/);
  assert.doesNotMatch(bridge, /apiKey = provider\.apiKey/);
});

test('PATCH 缺失或空 apiKey 保留旧凭据，只有显式 deleteCredential true 删除', () => {
  const values = new Map([['reference-existing', 'old-secret']]);
  const manager = createProviderCredentialManager({ store: {
    set(value, ref) { values.set(ref, value); return ref; }, get: ref => values.get(ref), delete: ref => values.delete(ref),
    snapshot: () => new Map(values), restore: snapshot => { values.clear(); for (const pair of snapshot) values.set(...pair); },
  } });
  const provider = { id: 'p', credentialRef: 'reference-existing', name: 'Before' };
  manager.applyInput(provider, { name: 'Missing' }, () => {});
  manager.applyInput(provider, { apiKey: '', name: 'Empty from UI' }, () => {});
  assert.equal(manager.resolve(provider), 'old-secret');
  assert.throws(() => manager.applyInput(provider, { deleteCredential: 'true' }, () => {}), /deleteCredential/);
  manager.applyInput(provider, { deleteCredential: true }, () => {});
  assert.equal(provider.credentialRef, undefined);
  assert.throws(() => manager.resolve(provider), error => error.code === 'CREDENTIAL_NOT_FOUND');
});

test('替换和显式删除在 provider 元数据保存失败时恢复旧密文与记录', () => {
  const values = new Map([['reference-existing', 'old-secret']]);
  const manager = createProviderCredentialManager({ store: {
    set(value, ref) { values.set(ref, value); return ref; }, get: ref => values.get(ref), delete: ref => values.delete(ref),
    snapshot: () => new Map(values), restore: snapshot => { values.clear(); for (const pair of snapshot) values.set(...pair); },
  } });
  for (const patch of [{ apiKey: 'replacement-secret' }, { deleteCredential: true }]) {
    const provider = { id: 'p', credentialRef: 'reference-existing', name: 'Before' };
    assert.throws(() => manager.applyInput(provider, patch, () => { throw new Error('metadata save failed'); }), /metadata save failed/);
    assert.equal(provider.credentialRef, 'reference-existing');
    assert.equal(manager.resolve(provider), 'old-secret');
  }
});

test('删除 provider 保存失败时恢复 provider 和旧密文', () => {
  const values = new Map([['reference-existing', 'old-secret']]);
  const manager = createProviderCredentialManager({ store: {
    set() {}, get: ref => values.get(ref), delete: ref => values.delete(ref),
    snapshot: () => new Map(values), restore: snapshot => { values.clear(); for (const pair of snapshot) values.set(...pair); },
  } });
  const provider = { id: 'p', credentialRef: 'reference-existing' };
  const providers = [provider];
  assert.throws(() => manager.removeProvider(providers, provider, () => { throw new Error('provider delete save failed'); }), /provider delete save failed/);
  assert.deepEqual(providers, [provider]);
  assert.equal(manager.resolve(provider), 'old-secret');
});

test('可解析但 schema 非法的凭据文件拒绝 set/delete 且原字节不变', () => {
  for (const invalid of [JSON.stringify({ version: 2, credentials: {} }), 'null', '[]', JSON.stringify({ version: 1, credentials: [] })]) {
    const f = fixture(); fs.writeFileSync(f.filePath, invalid);
    const store = createWindowsCredentialStore({ safeStorage: f.safeStorage, fs, filePath: f.filePath, randomId: () => 'ref-1234567890abcdef' });
    assert.throws(() => store.set('new-secret'), error => error.code === 'CREDENTIAL_STORE_CORRUPT');
    assert.equal(fs.readFileSync(f.filePath, 'utf8'), invalid);
    assert.throws(() => store.delete('ref-1234567890abcdef'), error => error.code === 'CREDENTIAL_STORE_CORRUPT');
    assert.equal(fs.readFileSync(f.filePath, 'utf8'), invalid);
    fs.rmSync(f.dir, { recursive: true, force: true });
  }
});
