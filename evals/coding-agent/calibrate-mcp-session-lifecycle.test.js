// screenpipe — AI that knows everything you've seen, said, or heard
// https://screenpipe.com
import {afterAll,expect,test} from 'bun:test';
import {execFileSync,spawnSync} from 'node:child_process';
import {mkdtempSync,mkdirSync,readFileSync,writeFileSync,symlinkSync,rmSync} from 'node:fs';
import {resolve,join} from 'node:path';
import {tmpdir} from 'node:os';
const repo=resolve(import.meta.dir,'../..');
const item=JSON.parse(readFileSync(join(import.meta.dir,'cases.json'))).cases.find(c=>c.id==='app-mcp-session-lifecycle');
const root=mkdtempSync(join(tmpdir(),'mcp-session-calibration-'));
afterAll(()=>rmSync(root,{recursive:true,force:true}));
function grade(name,ref,mutate=()=>{}){
 const cwd=join(root,name);mkdirSync(cwd);execFileSync('tar',['-xf','-','-C',cwd],{input:execFileSync('git',['archive',ref,'packages/screenpipe-mcp'],{cwd:repo,maxBuffer:24*1024*1024})});
 const pkg=join(cwd,'packages/screenpipe-mcp');symlinkSync(join(repo,'packages/screenpipe-mcp/node_modules'),join(pkg,'node_modules'),'dir');
 writeFileSync(join(pkg,'src/eval-session.test.ts'),readFileSync(join(import.meta.dir,'graders/mcp-session-lifecycle.fixture.ts.txt')));mutate(pkg);
 const r=spawnSync(process.env.NODE_BIN||'node',['node_modules/vitest/vitest.mjs','run','src/eval-session.test.ts'],{cwd:pkg,encoding:'utf8',timeout:60_000,maxBuffer:4*1024*1024,env:{PATH:process.env.PATH,CI:'true',TZ:'UTC',SCREENPIPE_DISABLE_TELEMETRY:'1',SCREENPIPE_MCP_TELEMETRY_DISABLED:'1',DO_NOT_TRACK:'1',SCREENPIPE_API_URL:'http://127.0.0.1:1'}});
 if(process.env.MCP_SESSION_CALIBRATION_RESULTS){mkdirSync(process.env.MCP_SESSION_CALIBRATION_RESULTS,{recursive:true});writeFileSync(join(process.env.MCP_SESSION_CALIBRATION_RESULTS,name+'.json'),JSON.stringify({status:r.status,signal:r.signal,error:r.error?.message??null,stdout:r.stdout,stderr:r.stderr},null,2)+'\n');}return r;
}
const clean=s=>s.replace(/\x1b\[[0-9;]*m/g,'');
function pass(r){expect(r.error).toBeUndefined();expect(r.signal).toBeNull();expect(r.status,r.stdout+r.stderr).toBe(0);expect(clean(r.stdout)).toContain('6 passed');}
function fail(r){expect(r.error).toBeUndefined();expect(r.signal).toBeNull();expect(r.status).toBe(1);expect(r.stderr).toContain('AssertionError');expect(r.stderr).not.toMatch(/Cannot find module|Failed to load url/);}
function edit(pkg,from,to){const p=join(pkg,'src/http-server.ts'),s=readFileSync(p,'utf8');expect(s.split(from)).toHaveLength(2);writeFileSync(p,s.replace(from,to));}
const noOp=pkg=>{const p=join(pkg,'package.json'),v=JSON.parse(readFileSync(p));v.scripts.test='exit 0';writeFileSync(p,JSON.stringify(v));};
test('parent fails four outcomes and preserves two',()=>{const r=grade('parent',item.base_ref);fail(r);expect(clean(r.stdout)).toContain('4 failed');expect(clean(r.stdout)).toContain('2 passed');});
test('reference passes six public outcomes',()=>pass(grade('reference',item.oracle_ref)));
test('current source passes six public outcomes',()=>pass(grade('current','HEAD')));
test('unused correct server cannot repair the caller',()=>fail(grade('unused',item.base_ref,pkg=>writeFileSync(join(pkg,'src/unused-server.ts'),execFileSync('git',['show',`${item.oracle_ref}:packages/screenpipe-mcp/src/http-server.ts`],{cwd:repo})))));
test('post-request registration is a valid alternative',()=>pass(grade('equivalent',item.oracle_ref,pkg=>{edit(pkg,'            sessions.set(newSessionId, { server, transport });','            // registration occurs after request handling');edit(pkg,'      await session.transport.handleRequest(req, res);','      await session.transport.handleRequest(req, res);\n      if (req.method === "POST" && session.transport.sessionId) sessions.set(session.transport.sessionId, session);');})));
test('registration without deletion accounting fails',()=>fail(grade('no-cleanup',item.oracle_ref,pkg=>edit(pkg,'            sessions.delete(closedSessionId);','            // omitted'))));
test('deleting every session on one close fails preserved clients',()=>fail(grade('clear-all',item.oracle_ref,pkg=>edit(pkg,'            sessions.delete(closedSessionId);','            sessions.clear();'))));
test('constant health zero fails real active accounting',()=>fail(grade('fake-health',item.oracle_ref,pkg=>edit(pkg,'sessions: sessions.size','sessions: 0'))));
test('empty tool listings cannot pass',()=>fail(grade('empty-tools',item.oracle_ref,pkg=>edit(pkg,'async () => ({ tools: TOOLS })','async () => ({ tools: [] })'))));
test('no-op package script does not hide broken behavior',()=>fail(grade('noop-broken',item.base_ref,noOp)));
test('no-op package script does not reject correct behavior',()=>pass(grade('noop-correct',item.oracle_ref,noOp)));
test('missing server is setup failure',()=>{const r=grade('missing',item.oracle_ref,pkg=>rmSync(join(pkg,'src/http-server.ts')));expect(r.status).not.toBe(0);expect(r.stderr).toMatch(/Cannot find module|Failed to load url/);expect(r.stderr).not.toContain('AssertionError');});
