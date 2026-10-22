// screenpipe — AI that knows everything you've seen, said, or heard
// https://screenpipe.com
import {expect,test} from 'bun:test';
import {LocalGatewayHarness} from './local-gateway-harness';

test('real Worker serves retained features on the same model, labels both routes, and rolls back with D1 intact',async()=>{
  let spendBlocked=false;
  let vendorQuota=false;
  const calls:{path:string;body:any;metadata:any}[]=[];
  const harness=await LocalGatewayHarness.start({experientialHybrid:true,cloudflareSpendRules:true,outboundResponse:async(request,body)=>{
    const path=new URL(request.url).pathname;
    if(!path.includes('/custom-experiential-fixture/')&&!path.includes('/openai/'))return undefined;
    const metadata=JSON.parse(request.headers.get('cf-aig-metadata')!);
    calls.push({path,body,metadata});
    if(path.includes('/custom-')){
      expect(request.headers.get('authorization')).toBe(`Bearer xpl_${'0'.repeat(40)}`);
      expect(request.headers.get('cf-aig-authorization')).toBe('Bearer screenpipe-local-e2e-gateway-token');
      expect(request.headers.has('cf-aig-custom-cost')).toBe(true);
      expect(body.provider).toBeUndefined();
      if(vendorQuota)return Response.json({error:{message:'Model not available: provider quota exhausted',code:'insufficient_quota'}},{status:403});
      if(spendBlocked)return Response.json({name:'AiGatewayError',internalCode:2045,error:[{code:2045,message:"Spend limit exceeded: rule 'local-business-total' (cost limit 10 per 604800s, fixed)"}]},{status:429});
      if(body.model==='gpt-5.5')return Response.json({error:{message:'The selected model route cannot accept this unsupported request',code:'unsupported_capability'}},{status:400});
    }
    if(path.endsWith('/responses'))return Response.json({id:'resp_fixture',model:body.model,status:'completed',output:[{type:'message',role:'assistant',status:'completed',content:[{type:'output_text',text:'OK'}]}],usage:{input_tokens:10,output_tokens:4,total_tokens:14}});
    return Response.json({id:'chat_fixture',model:body.model,choices:[{index:0,message:{role:'assistant',content:'OK'},finish_reason:'stop'}],usage:{prompt_tokens:10,completion_tokens:4,total_tokens:14}});
  }});
  const call=(model:string,content:any='Synthetic.')=>harness.fetch('/chat/completions',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({model,messages:[{role:'user',content}],max_tokens:2048})});
  try{
    const unauthorized=await harness.fetch('/chat/completions',{method:'POST',headers:{authorization:'','content-type':'application/json','x-screenpipe-gateway':'experiential','x-plan':'business'},body:JSON.stringify({model:'gpt-5.4-mini',messages:[{role:'user',content:'Synthetic.'}]})});
    expect(unauthorized.status).toBe(401);expect(calls).toHaveLength(0);
    await harness.seedDailyCostUsd(0.37);
    const text=await call('gpt-5.4-mini');expect(text.status).toBe(200);expect(text.headers.get('x-screenpipe-gateway')).toBe('experiential');
    expect(text.headers.get('x-screenpipe-gateway-reason')).toBe('experiential_supported');await text.text();
    const vision=await call('gpt-5.4-mini',[{type:'image_url',image_url:{url:'data:image/png;base64,synthetic'}}]);
    expect(vision.status).toBe(200);expect(vision.headers.get('x-screenpipe-model')).toBe('gpt-5.4-mini');expect(vision.headers.get('x-screenpipe-gateway')).toBe('cloudflare');
    expect(vision.headers.get('x-screenpipe-gateway-reason')).toBe('experiential_vision_unavailable');await vision.text();
    const pro=await call('gpt-5.4-pro');expect(pro.status).toBe(200);expect(pro.headers.get('x-screenpipe-model')).toBe('gpt-5.4-pro');expect(pro.headers.get('x-screenpipe-gateway')).toBe('cloudflare');await pro.text();
    const recovered=await call('gpt-5.5');expect(recovered.status).toBe(200);expect(recovered.headers.get('x-screenpipe-model')).toBe('gpt-5.5');expect(recovered.headers.get('x-screenpipe-gateway-reason')).toBe('experiential_unsupported_request');await recovered.text();
    const attempts=calls.filter(c=>c.body.model==='gpt-5.5');expect(attempts).toHaveLength(2);expect(attempts[0].body).toEqual(attempts[1].body);
    expect(new Set(calls.map(c=>JSON.stringify(c.metadata))).size).toBe(2); // Pro is the frontier lane; actor, plan and workload stay fixed.
    for(const c of calls){expect(c.metadata.plan).toBe('internal');expect(c.metadata.user_id).toBe(calls[0].metadata.user_id);}
    vendorQuota=true;
    const quotaStart=calls.length;
    const quota=await call('gpt-5.5');expect(quota.status).toBe(403);await quota.text();
    expect(calls.length-quotaStart).toBe(1);expect(calls.at(-1)!.path).toContain('/custom-experiential-fixture/');
    vendorQuota=false;
    spendBlocked=true;
    const before=calls.length;
    const blocked=await call('gpt-5.4-mini');expect(blocked.status).toBe(429);expect(blocked.headers.get('x-screenpipe-gateway')).toBe('experiential');expect(await blocked.text()).toContain('hosted_ai_allowance_exceeded');expect(calls.length-before).toBe(1);
    await harness.setHostedChatGateway('cloudflare');
    const rollback=await call('gpt-5.4-mini');expect(rollback.status).toBe(200);expect(rollback.headers.get('x-screenpipe-gateway')).toBe('cloudflare');await rollback.text();
    expect((await harness.readCostState()).dailyCostUsd).toBeGreaterThanOrEqual(0.37);
    harness.assertNoUnexpectedOutboundRequests();
  }finally{await harness.dispose();}
},30000);
