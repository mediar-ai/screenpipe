// screenpipe — AI that knows everything you've seen, said, or heard
// https://screenpipe.com
import {afterAll,expect,test} from 'bun:test';
import {execFileSync,spawnSync} from 'node:child_process';
import {mkdtempSync,mkdirSync,readFileSync,writeFileSync,symlinkSync,rmSync} from 'node:fs';
import {resolve,join} from 'node:path';
import {tmpdir} from 'node:os';
const repo=resolve(import.meta.dir,'../..');
const item=JSON.parse(readFileSync(join(import.meta.dir,'cases.json'))).cases.find(c=>c.id==='app-mcp-browser-boundary');
const root=mkdtempSync(join(tmpdir(),'mcp-browser-calibration-'));
afterAll(()=>rmSync(root,{recursive:true,force:true}));
function grade(name,ref,mutate=()=>{}){
 const cwd=join(root,name);mkdirSync(cwd);execFileSync('tar',['-xf','-','-C',cwd],{input:execFileSync('git',['archive',ref,'packages/screenpipe-mcp'],{cwd:repo,maxBuffer:24*1024*1024})});
 const pkg=join(cwd,'packages/screenpipe-mcp');symlinkSync(join(repo,'packages/screenpipe-mcp/node_modules'),join(pkg,'node_modules'),'dir');
 writeFileSync(join(pkg,'src/eval-browser-boundary.test.ts'),readFileSync(join(import.meta.dir,'graders/mcp-browser-boundary.fixture.ts.txt')));mutate(pkg);
 const r=spawnSync(process.env.NODE_BIN||'node',['node_modules/vitest/vitest.mjs','run','src/eval-browser-boundary.test.ts'],{cwd:pkg,encoding:'utf8',timeout:60_000,maxBuffer:4*1024*1024,env:{PATH:process.env.PATH,CI:'true',TZ:'UTC',SCREENPIPE_DISABLE_TELEMETRY:'1',SCREENPIPE_MCP_TELEMETRY_DISABLED:'1',DO_NOT_TRACK:'1',SCREENPIPE_API_URL:'http://127.0.0.1:1'}});
 if(process.env.MCP_BROWSER_CALIBRATION_RESULTS){mkdirSync(process.env.MCP_BROWSER_CALIBRATION_RESULTS,{recursive:true});writeFileSync(join(process.env.MCP_BROWSER_CALIBRATION_RESULTS,name+'.json'),JSON.stringify({status:r.status,signal:r.signal,error:r.error?.message??null,stdout:r.stdout,stderr:r.stderr},null,2)+'\n');}return r;
}
const clean=s=>s.replace(/\x1b\[[0-9;]*m/g,'');
function pass(r){expect(r.error).toBeUndefined();expect(r.signal).toBeNull();expect(r.status,r.stdout+r.stderr).toBe(0);expect(clean(r.stdout)).toContain('9 passed');}
function fail(r){expect(r.error).toBeUndefined();expect(r.signal).toBeNull();expect(r.status).toBe(1);expect(r.stderr).toContain('AssertionError');expect(r.stderr).not.toMatch(/Cannot find module|Failed to load url/);}
function edit(pkg,from,to){const p=join(pkg,'src/http-server.ts'),s=readFileSync(p,'utf8');expect(s.split(from)).toHaveLength(2);writeFileSync(p,s.replace(from,to));}
const noOp=pkg=>{const p=join(pkg,'package.json'),v=JSON.parse(readFileSync(p));v.scripts.test='exit 0';writeFileSync(p,JSON.stringify(v));};
test('parent fails five security outcomes and preserves four',()=>{const r=grade('parent',item.base_ref);fail(r);expect(clean(r.stdout)).toContain('5 failed');expect(clean(r.stdout)).toContain('4 passed');});
test('reference preserves all nine outcomes',()=>pass(grade('reference',item.oracle_ref)));
test('current source preserves all nine outcomes',()=>pass(grade('current','HEAD')));
test('unused correct source cannot fix caller',()=>fail(grade('unused',item.base_ref,pkg=>writeFileSync(join(pkg,'src/unused.ts'),execFileSync('git',['show',`${item.oracle_ref}:packages/screenpipe-mcp/src/http-server.ts`],{cwd:repo})))));
test('an authority allowlist is an equivalent implementation',()=>pass(grade('equivalent',item.oracle_ref,pkg=>{const p=join(pkg,'src/http-server.ts');const s=readFileSync(p,'utf8');const line=s.split('\n').find(x=>x.includes('return /^(?:localhost|'));expect(line).toBeDefined();writeFileSync(p,s.replace(line,"  return new Set(['localhost', '127.0.0.1', '[::1]']).has(host.toLowerCase().replace(/:[0-9]{1,5}$/, ''));").replaceAll('isTrustedLocalHost','safeAuthority').replaceAll('isTrustedLocalOrigin','safeOrigin'));})));
test('host-only gate is insufficient',()=>fail(grade('host-only',item.oracle_ref,pkg=>edit(pkg,'(req.headers.origin === undefined || isTrustedLocalOrigin(req.headers.origin))','true'))));
test('origin-only gate is insufficient',()=>fail(grade('origin-only',item.oracle_ref,pkg=>edit(pkg,'isTrustedLocalHost(req.headers.host)','true'))));
test('blanket refusal fails preserved clients',()=>fail(grade('refuse-all',item.oracle_ref,pkg=>edit(pkg,'if (!isAuthorized(req, config.apiKey))','if (true)'))));
test('auth bypass at caller fails despite correct helper',()=>fail(grade('caller-bypass',item.oracle_ref,pkg=>edit(pkg,'if (!isAuthorized(req, config.apiKey))','if (false)'))));
test('removing bearer fallback rejects authorized clients',()=>fail(grade('no-bearer',item.oracle_ref,pkg=>edit(pkg,'return constantTimeEq(got, expected);','return false;'))));
test('no-op package script cannot hide broken behavior',()=>fail(grade('noop-broken',item.base_ref,noOp)));
test('no-op package script preserves correct behavior',()=>pass(grade('noop-correct',item.oracle_ref,noOp)));
test('missing source is a setup error',()=>{const r=grade('missing',item.oracle_ref,pkg=>rmSync(join(pkg,'src/http-server.ts')));expect(r.status).not.toBe(0);expect(r.stderr).toMatch(/Cannot find module|Failed to load url/);expect(r.stderr).not.toContain('AssertionError');});
test('unkeyed deployments cannot bypass the boundary',()=>fail(grade('unkeyed-bypass',item.oracle_ref,pkg=>edit(pkg,'if (!apiKey) return false;','if (!apiKey) return true;'))));
