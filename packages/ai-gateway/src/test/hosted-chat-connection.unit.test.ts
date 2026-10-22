// screenpipe — AI that knows everything you've seen, said, or heard
// https://screenpipe.com
import { describe, expect, it } from 'bun:test';
import { createProvider } from '../providers';
import { resolveHostedChatConnection } from '../services/hosted-chat-connection';
import type { HostedChatGatewayContext } from '../services/cloudflare-ai-gateway';
import type { Env } from '../types';
const key = `xpl_${'0'.repeat(40)}`;
const env = { EXPERIENTIAL_CANARY_MODE: 'internal', EXPERIENTIAL_API_KEY: key,
  CLOUDFLARE_AI_GATEWAY_ID: 'fixture', CLOUDFLARE_AI_GATEWAY_BASE_URL: 'https://gateway.ai.cloudflare.com/v1/account/fixture' } as Env;
const context: HostedChatGatewayContext = { user_id: 'server-owned-actor', plan: 'internal', lane: 'auto', workload: 'interactive', trial: false };
describe('real hosted chat connection selector', () => {
  it.each(['free','basic','business','business_max','business_ultra','super_admin'] as const)('keeps authenticated %s customers on existing allowance enforcement', async plan => {
    const c = await resolveHostedChatConnection(env, 'openai', { ...context, plan }, 'gpt-5.4-mini');
    expect(c.gateway).toBe('cloudflare');
    expect(c.baseURL).toBe('https://gateway.ai.cloudflare.com/v1/account/fixture/openai');
    expect(c.apiKey).not.toBe(key);
    expect(JSON.parse(c.defaultHeaders['cf-aig-metadata']!)).toEqual({ ...context, plan });
  });
  it.each([undefined, 'off'] as const)('rolls internal requests back to Cloudflare in mode %s', async EXPERIENTIAL_CANARY_MODE => {
    const c = await resolveHostedChatConnection({ ...env, EXPERIENTIAL_CANARY_MODE, EXPERIENTIAL_API_KEY: undefined }, 'openai', context, 'gpt-5.4-mini');
    expect(c.gateway).toBe('cloudflare');
    expect(c.defaultHeaders.Authorization).toBeNull();
  });
  it.each(['openai','anthropic'] as const)('selects native %s with dedicated auth and no Cloudflare/ZDR headers', async provider => {
    const c = await resolveHostedChatConnection(env, provider, context, provider === 'anthropic' ? 'claude-haiku-5-5' : 'gpt-6-astra');
    expect(c.gateway).toBe('experiential'); expect(c.maxRetries).toBe(0);
    expect(new Headers(c.defaultHeaders).get('authorization')).toBe(`Bearer ${key}`);
    expect(Object.keys(c.defaultHeaders).some(k => k.startsWith('cf-') || k.includes('zdr'))).toBe(false);
    if(provider === 'anthropic') { expect(c.model).toBe('claude-haiku-5.5'); expect(c.defaultHeaders['x-api-key']).toBeNull(); }
    else { expect(c.model).toBe('gpt-6-astra'); expect(c.baseURL).toBe('https://api.experientiallabs.ai/v1'); }
  });
  it.each([undefined,'','not-a-key'])('refuses an enabled canary with missing/invalid credential %s', async EXPERIENTIAL_API_KEY => {
    await expect(resolveHostedChatConnection({ ...env, EXPERIENTIAL_API_KEY }, 'openai', context, 'gpt-5.4-mini')).rejects.toMatchObject({status:503,transient:false});
  });
  it.each(['google-vertex-ai','custom-tinfoil','elevenlabs'] as const)('retains the separate %s route during the canary', async provider => {
    const c = await resolveHostedChatConnection({ ...env, TINFOIL_GLM_API_KEY: 'synthetic-glm' }, provider, context, 'retained-model');
    expect(c.gateway).toBe('cloudflare');
    expect(c.baseURL).toContain(`/${provider}`);
    expect(c.apiKey).not.toBe(key);
  });
  it.each([
    ['openai','gpt-5.4-mini','chat/completions'],
    ['anthropic','claude-haiku-5-5','v1/messages'],
    ['openai','gpt-6-astra','responses'],
  ] as const)('authenticates canary rollback through the binding for %s %s', async (provider, model, endpoint) => {
    const calls: any[] = [];
    const nativeEnv = { ...env, EXPERIENTIAL_CANARY_MODE:'off', CLOUDFLARE_AI_GATEWAY_BASE_URL:undefined,
      AI:{gateway:()=>({getUrl:async (p: string)=>`https://gateway.ai.cloudflare.com/v1/account/fixture/${p}`,
        run:async (request: any, options: any)=>{
          calls.push({request,options});
          if(endpoint==='v1/messages') return Response.json({id:'msg_fixture',type:'message',role:'assistant',model,content:[{type:'text',text:'OK'}],stop_reason:'end_turn',usage:{input_tokens:8,output_tokens:2}});
          if(endpoint==='responses') return Response.json({id:'resp_fixture',status:'completed',model,output:[{type:'message',status:'completed',role:'assistant',content:[{type:'output_text',text:'OK'}]}],usage:{input_tokens:8,output_tokens:2,total_tokens:10}});
          return Response.json({choices:[{message:{role:'assistant',content:'OK'},finish_reason:'stop'}],usage:{prompt_tokens:8,completion_tokens:2}});
        }})}} as unknown as Env;
    const c = await resolveHostedChatConnection(nativeEnv, provider, context, model);
    expect(typeof (c as any).fetch).toBe('function');
    const actual = createProvider(model,nativeEnv,c);
    const response=await actual.createCompletion({model,messages:[{role:'user',content:'Synthetic.'}],max_tokens:2048});
    expect((await response.json() as any).choices[0].message.content).toContain('OK');
    expect(calls).toHaveLength(1);
    expect(calls[0].request).toMatchObject({provider,endpoint,query:{model}});
    expect(JSON.stringify(calls)).not.toContain(key);
    expect(calls[0].options.extraHeaders['cf-aig-metadata']).toBe(JSON.stringify(context));
    expect(calls[0].options.extraHeaders['cf-aig-max-attempts']).toBe('1');
  });
  it.each(['internal','business'] as const)('preserves token-configured %s rollback transport', async plan => {
    const tokenEnv = { ...env, EXPERIENTIAL_CANARY_MODE:'off', CLOUDFLARE_AI_GATEWAY_BASE_URL:undefined,
      CLOUDFLARE_AI_GATEWAY_TOKEN:'synthetic-existing-gateway-token',
      AI:{gateway:()=>({getUrl:async()=> 'https://gateway.ai.cloudflare.com/v1/account/fixture/openai',
        run:async()=>{ throw new Error('Configured native transport must remain unchanged'); }})}} as unknown as Env;
    const c=await resolveHostedChatConnection(tokenEnv,'openai',{...context,plan},'gpt-5.4-mini');
    expect(c.gateway).toBe('cloudflare'); expect(c.fetch).toBeUndefined();
    expect(c.defaultHeaders['cf-aig-authorization']).toBe('Bearer synthetic-existing-gateway-token');
  });
  it('maps the documented GPT-5.6 alias to Sol only for Experiential', async () => {
    const c=await resolveHostedChatConnection(env,'openai',context,'gpt-5.6'); expect(c.model).toBe('gpt-5.6-sol');
    const original=await resolveHostedChatConnection({ ...env, EXPERIENTIAL_CANARY_MODE:'off' },'openai',context,'gpt-5.6');
    expect(original.model).toBe('gpt-5.6');
  });
  it('never rewrites unverified model names', async () => {
    const c=await resolveHostedChatConnection(env,'openai',context,'gpt-5.6-unknown'); expect(c.model).toBe('gpt-5.6-unknown');
  });
});
