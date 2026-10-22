// screenpipe — AI that knows everything you've seen, said, or heard
// https://screenpipe.com
import { describe, expect, it } from 'bun:test';
import { createProvider } from '../providers';
import type { Env, RequestBody } from '../types';

const schema = {type:'object',properties:{ok:{type:'boolean'}},required:['ok'],additionalProperties:false};
function fixture(model: string) {
  const requests: any[] = [];
  const transport = (async (url: any, init: any) => {
    expect(String(url)).toBe('https://fixture.invalid/v1/responses');
    const body=JSON.parse(init.body); requests.push(body);
    const item = body.tools?.length && body.tool_choice !== 'none'
      ? {type:'function_call',id:'fc_fixture',call_id:'call_fixture',name:'confirm',arguments:'{"ok":true}'}
      : {type:'message',status:'completed',role:'assistant',content:[{type:'output_text',text:body.text?' {"ok":true}':'OK'}]};
    const response={id:'resp_fixture',created_at:1,model,status:'completed',output:[item],usage:{input_tokens:8,output_tokens:2,total_tokens:10}};
    if(!body.stream) return Response.json(response);
    const events:any[]=[{type:'response.created',response:{...response,output:[]}}];
    if(item.type==='function_call') {
      events.push({type:'response.output_item.added',item:{...item,arguments:''}});
      events.push({type:'response.function_call_arguments.delta',item_id:'fc_fixture',delta:item.arguments});
    } else events.push({type:'response.output_text.delta',delta:item.content![0].text});
    events.push({type:'response.completed',response});
    return new Response(events.map(e=>`event: ${e.type}\ndata: ${JSON.stringify(e)}\n\n`).join(''),{headers:{'content-type':'text/event-stream'}});
  }) as typeof fetch;
  const provider=createProvider(model,{} as Env,{apiKey:'synthetic-key',baseURL:'https://fixture.invalid/v1',maxRetries:0,fetch:transport});
  expect(provider.supportsJson).toBe(model==='gpt-5.5-pro');
  const body:RequestBody={model,messages:[{role:'user',content:'Synthetic.'}],max_tokens:2048,reasoning_effort:'medium'};
  return {provider,body,requests};
}
describe('Pro native Responses compatibility',()=>{
  for(const model of ['gpt-5.4-pro','gpt-5.5-pro']) {
    it.each(['medium','high','xhigh'] as const)(`${model} uses Responses and preserves reasoning=%s`,async(effort)=>{
      const {provider,body,requests}=fixture(model);body.reasoning_effort=effort;
      const data=await(await provider.createCompletion(body)).json() as any;
      expect(data.model).toBe(model);expect(data.choices[0].message.content).toBe('OK');
      expect(requests[0]).toMatchObject({model,reasoning:{effort},store:false,service_tier:'default'});
    });
    it(`${model} leaves unspecified effort to the model default`,async()=>{
      const {provider,body,requests}=fixture(model);delete body.reasoning_effort;
      await provider.createCompletion(body);expect(requests[0].reasoning).toBeUndefined();
    });
    it.each([false,true])(`${model} preserves tool identities and usage, stream=%s`,async(stream)=>{
      const {provider,body,requests}=fixture(model);
      body.tools=[{type:'function',function:{name:'confirm',parameters:schema,strict:true}}];body.tool_choice={type:'function',function:{name:'confirm'}};
      if(!stream) {
        const data=await(await provider.createCompletion(body)).json() as any;
        expect(data.choices[0].finish_reason).toBe('tool_calls');expect(data.choices[0].message.tool_calls[0]).toMatchObject({id:'call_fixture',type:'function',function:{name:'confirm',arguments:'{"ok":true}'}});
      } else {
        const text=await new Response(await provider.createStreamingCompletion(body)).text();
        const events=text.split('\n').filter(s=>s.startsWith('data: {')).map(s=>JSON.parse(s.slice(6)));
        expect(text.trimEnd().endsWith('data: [DONE]')).toBe(true);
        expect(events.some(e=>e.choices?.[0]?.finish_reason==='tool_calls')).toBe(true);
        expect(events.some(e=>e.choices?.[0]?.delta?.tool_calls?.[0]?.id==='call_fixture')).toBe(true);
        expect(events.some(e=>e.usage?.completion_tokens===2)).toBe(true);
        expect(requests[0].stream).toBe(model==='gpt-5.4-pro'?true:undefined);
      }
    });
    it(`${model} rejects unsupported caller reasoning before inference`,async()=>{
      const {provider,body,requests}=fixture(model);body.reasoning_effort='none';
      await expect(provider.createCompletion(body)).rejects.toMatchObject({status:400,code:'unsupported_reasoning_effort'});expect(requests).toHaveLength(0);
    });
  }
  it('returns a clear unsupported format for GPT-5.4 Pro without a provider call',async()=>{
    const {provider,body,requests}=fixture('gpt-5.4-pro');body.response_format={type:'json_schema',json_schema:{name:'confirmation',strict:true,schema}};
    await expect(provider.createCompletion(body)).rejects.toMatchObject({status:400,code:'unsupported_response_format'});expect(requests).toHaveLength(0);
  });
  it('keeps native structured output for GPT-5.5 Pro',async()=>{
    const {provider,body,requests}=fixture('gpt-5.5-pro');body.response_format={type:'json_schema',json_schema:{name:'confirmation',strict:true,schema}};
    const data=await(await provider.createCompletion(body)).json() as any;
    expect(JSON.parse(data.choices[0].message.content)).toEqual({ok:true});expect(requests[0].text.format).toMatchObject({type:'json_schema',strict:true,schema});
  });
});
