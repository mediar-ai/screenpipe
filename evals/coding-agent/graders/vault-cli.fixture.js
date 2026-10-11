// screenpipe — AI that knows everything you've seen, said, or heard
// https://screenpipe.com
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';

// Only path selection and terminal password input are synthetic. The actual CLI
// handler and complete vault crate execute unchanged in fresh processes.
const source = process.cwd();
const report = { outcomes: [], infrastructure_error: null };
let root;
function command(args, cwd, env = process.env, milliseconds = 10000) {
  return new Promise(resolve => {
    const child = spawn(args[0], args.slice(1), { cwd, env, detached: true, stdio: ['ignore','pipe','pipe'] });
    let stdout = '', stderr = '', timedOut = false;
    child.stdout.on('data', b => stdout += b);
    child.stderr.on('data', b => stderr += b);
    const timer = setTimeout(() => { timedOut = true; try { process.kill(-child.pid, 'SIGKILL'); } catch {} }, milliseconds);
    child.on('error', error => { clearTimeout(timer); resolve({ args, exit: null, stdout, stderr, error: String(error), timedOut }); });
    child.on('close', (exit, signal) => { clearTimeout(timer); resolve({ args, exit, signal, stdout, stderr, timedOut }); });
  });
}
function infrastructure(message) { throw new Error(message); }
function toml(value) {
  if (Array.isArray(value)) return '[' + value.map(toml).join(', ') + ']';
  if (value && typeof value === 'object') return '{' + Object.entries(value).map(([k,v]) => JSON.stringify(k)+' = '+toml(v)).join(', ') + '}';
  return JSON.stringify(value);
}
function table(values) { return Object.entries(values).map(([k,v]) => JSON.stringify(k)+' = '+toml(v)).join('\n'); }
try {
  const read = file => fs.readFileSync(path.join(source,file),'utf8');
  const workspace = Bun.TOML.parse(read('Cargo.toml')).workspace;
  const vault = Bun.TOML.parse(read('crates/screenpipe-vault/Cargo.toml'));
  const engine = Bun.TOML.parse(read('crates/screenpipe-engine/Cargo.toml'));
  const cli = read('crates/screenpipe-engine/src/cli/vault.rs');
  root = fs.mkdtempSync(path.join(source,'.vault-outcomes-'));
  fs.cpSync(path.join(source,'crates/screenpipe-vault'),path.join(root,'vault'),{recursive:true});
  fs.mkdirSync(path.join(root,'probe/src'),{recursive:true});
  fs.writeFileSync(path.join(root,'probe/actual_cli.rs'),cli);
  const names = new Set([...Object.keys(vault.dependencies ?? {}),...Object.keys(vault['dev-dependencies'] ?? {}),'anyhow','tokio','serde_json']);
  const dependencies = Object.fromEntries(Object.entries(workspace.dependencies).filter(([k])=>names.has(k)));
  fs.writeFileSync(path.join(root,'Cargo.toml'),'[workspace]\nresolver = "2"\nmembers = ["vault", "probe"]\n[workspace.package]\n'+table(workspace.package)+'\n[workspace.dependencies]\n'+table(dependencies)+'\n');
  fs.copyFileSync(path.join(source,'Cargo.lock'),path.join(root,'Cargo.lock'));
  fs.writeFileSync(path.join(root,'probe/Cargo.toml'),'[package]\nname = "vault-outcome-probe"\nversion = "0.0.0"\nedition = "2021"\n[dependencies]\nscreenpipe-vault = { path = "../vault" }\n'+table(Object.fromEntries(['anyhow','tokio','serde_json'].map(k=>[k,engine.dependencies[k]])))+'\n');
  fs.writeFileSync(path.join(root,'probe/src/main.rs'),`// screenpipe — AI that knows everything you've seen, said, or heard
// https://screenpipe.com
extern crate self as screenpipe_core;
extern crate self as rpassword;
pub mod paths { pub fn default_screenpipe_data_dir()->std::path::PathBuf { std::env::var("VAULT_EVAL_DIRECTORY").expect("synthetic directory required").into() } }
pub fn read_password()->std::io::Result<String> { Ok(std::env::var("VAULT_EVAL_PASSWORD").expect("synthetic password required")) }
pub enum VaultCommand { Status {port:u16}, Setup {port:u16}, Lock {port:u16}, Unlock {port:u16} }
#[path="../actual_cli.rs"] mod vault_cli;
#[tokio::main]
async fn main()->anyhow::Result<()> { let args:Vec<_>=std::env::args().collect();let command=match args.get(1).map(|x|x.as_str()) {Some("setup")=>VaultCommand::Setup{port:9},Some("lock")=>VaultCommand::Lock{port:9},Some("unlock")=>VaultCommand::Unlock{port:9},_=>VaultCommand::Status{port:9}};vault_cli::handle_vault_command(&command).await }
`);
  report.build = await command(['cargo','build','--offline','-p','vault-outcome-probe'],root,process.env,180000);
  if (report.build.exit !== 0 || report.build.timedOut || report.build.error) infrastructure('Cargo setup/compilation failed before behavioral grading');
  const binary = path.join(root,'target/debug/vault-outcome-probe');
  const hash = file => createHash('sha256').update(fs.readFileSync(file)).digest('hex');
  report.resolved_lock_sha256 = hash(path.join(root,'Cargo.lock'));
  report.binary_sha256 = hash(binary);
  report.runtime = { bun: Bun.version, cargo: await command(['cargo','--version'],root), rustc: await command(['rustc','--version'],root) };
  const invoke = async (op,data,password='synthetic-vault-password') => {
    const result = await command([binary,op],root,{PATH:process.env.PATH,VAULT_EVAL_DIRECTORY:data,VAULT_EVAL_PASSWORD:password});
    if (result.timedOut || result.error || result.signal) infrastructure('CLI process unavailable or timed out: '+JSON.stringify(result));
    return result;
  };
  const state = async data => { const z=await invoke('status',data);assert.equal(z.exit,0,z.stderr);return JSON.parse(z.stdout).state; };
  const contents = {'db.sqlite':Buffer.from('synthetic database\0bytes'),'db.sqlite-wal':Buffer.from('synthetic WAL'),'db.sqlite-shm':Buffer.from('synthetic SHM'),'data/nested/media.txt':Buffer.from('synthetic media bytes')};
  function seed(name) { const d=path.join(root,'data-'+name);for(const [f,b] of Object.entries(contents)){fs.mkdirSync(path.dirname(path.join(d,f)),{recursive:true});fs.writeFileSync(path.join(d,f),b);}return d; }
  const fileBytes = data => Object.fromEntries(Object.keys(contents).map(f=>[f,fs.readFileSync(path.join(data,f)).toString('hex')]));
  const plain = Object.fromEntries(Object.entries(contents).map(([f,b])=>[f,b.toString('hex')]));
  async function outcome(name,fn) { try { await fn();report.outcomes.push({name,passed:true}); } catch(error) { if (!(error instanceof assert.AssertionError)) throw error;report.outcomes.push({name,passed:false,error:String(error)}); } }
  const setup = async d => { const z=await invoke('setup',d);assert.equal(z.exit,0,z.stderr);assert.equal(await state(d),'unlocked');assert.deepEqual(fileBytes(d),plain); };
  await outcome('fresh CLI lock encrypts every file and fresh unlock restores identical bytes',async()=>{
    const d=seed('roundtrip');await setup(d);const z=await invoke('lock',d);assert.equal(z.exit,0,z.stderr);assert.equal(await state(d),'locked');
    for(const [f,b] of Object.entries(contents)){const encrypted=fs.readFileSync(path.join(d,f));assert.equal(encrypted.subarray(0,8).toString(),'SPVAULT1');assert.notDeepEqual(encrypted,b);assert.equal(encrypted.includes(b),false);}
    const before=fileBytes(d);const wrong=await invoke('unlock',d,'wrong-synthetic-password');assert.notEqual(wrong.exit,0);assert.equal(await state(d),'locked');assert.deepEqual(fileBytes(d),before);
    const again=await invoke('lock',d);assert.notEqual(again.exit,0);assert.equal(await state(d),'locked');assert.deepEqual(fileBytes(d),before);
    const unlocked=await invoke('unlock',d);assert.equal(unlocked.exit,0,unlocked.stderr);assert.equal(await state(d),'unlocked');assert.deepEqual(fileBytes(d),plain);
  });
  await outcome('wrong lock password preserves plaintext and unlocked state',async()=>{const d=seed('wrong');await setup(d);const z=await invoke('lock',d,'wrong-synthetic-password');assert.notEqual(z.exit,0);assert.equal(await state(d),'unlocked');assert.deepEqual(fileBytes(d),plain);});
  await outcome('unconfigured lock refuses without mutating data',async()=>{const d=seed('none');const z=await invoke('lock',d);assert.notEqual(z.exit,0);assert.equal(await state(d),'none');assert.deepEqual(fileBytes(d),plain);assert.equal(fs.existsSync(path.join(d,'vault.meta')),false);});
  await outcome('setup preserves data and repeated setup refuses',async()=>{const d=seed('setup');await setup(d);const metadata=fs.readFileSync(path.join(d,'vault.meta'));const z=await invoke('setup',d);assert.notEqual(z.exit,0);assert.equal(await state(d),'unlocked');assert.deepEqual(fileBytes(d),plain);assert.deepEqual(fs.readFileSync(path.join(d,'vault.meta')),metadata);});
} catch(error) { report.infrastructure_error=String(error); }
console.log(JSON.stringify(report));
if (root) fs.rmSync(root,{recursive:true,force:true});
process.exitCode=report.infrastructure_error ? 127 : report.outcomes.every(x=>x.passed) ? 0 : 1;
