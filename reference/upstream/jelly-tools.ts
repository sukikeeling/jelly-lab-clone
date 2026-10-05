export type JellyToolState = { flavor: string; firmness: number; damping: number; slow: boolean; wireframe: boolean; paused: boolean };
type Tool = { name:string;description:string;inputSchema:object;annotations:{readOnlyHint:boolean};execute(input:unknown):unknown };
type Context = {registerTool(tool:Tool,options:{signal:AbortSignal}):void|Promise<void>};
export function registerJellyTools(getState:()=>JellyToolState, apply:(value:Partial<JellyToolState>)=>void, action:(kind:'nudge'|'reset')=>void) {
  const context=(document as Document & {modelContext?:Context}).modelContext;
  if(!context?.registerTool)return ()=>{};
  const lifecycle=new AbortController();
  const waitForPaint=()=>new Promise<void>(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>resolve())));
  const register=(tool:Tool)=> {
    try {void Promise.resolve(context.registerTool(tool,{signal:lifecycle.signal})).catch(error=>console.warn('Jelly tool registration unavailable',error));}
    catch(error) {console.warn('Jelly tool registration unavailable',error);}
  };
  register({name:'get_jelly_settings',description:'Read the current jelly color, firmness, damping, and playback settings.',inputSchema:{type:'object',properties:{},additionalProperties:false},annotations:{readOnlyHint:true},execute:()=>getState()});
  register({
    name:'configure_jelly',
    description:'Change the visible jelly controls. Settings are relative values from 0 to 100.',
    inputSchema:{type:'object',properties:{flavor:{type:'string',enum:['honey','berry','mint']},firmness:{type:'number',minimum:0,maximum:100},damping:{type:'number',minimum:0,maximum:100},slow:{type:'boolean'},wireframe:{type:'boolean'},paused:{type:'boolean'}},additionalProperties:false},
    annotations:{readOnlyHint:false},
    async execute(input) {
      if(!input||typeof input!=='object'||Array.isArray(input))throw new Error('Expected settings object');
      const value=input as Record<string,unknown>;
      for(const [key,v] of Object.entries(value)) {
        if(key==='flavor') {if(!['honey','berry','mint'].includes(String(v)))throw new Error('Unknown flavor');}
        else if(key==='firmness'||key==='damping') {if(typeof v!=='number'||!Number.isFinite(v)||v<0||v>100)throw new Error('Expected a number from 0 to 100');}
        else if(['slow','wireframe','paused'].includes(key)) {if(typeof v!=='boolean')throw new Error('Expected a boolean');}
        else throw new Error('Unknown setting');
      }
      apply(value);await waitForPaint();return getState();
    }
  });
  register({name:'move_jelly',description:'Nudge the jelly upward, or reset its position. Both actions resume playback.',inputSchema:{type:'object',properties:{action:{type:'string',enum:['nudge','reset']}},required:['action'],additionalProperties:false},annotations:{readOnlyHint:false},
    async execute(input) {
      if(!input||typeof input!=='object'||Array.isArray(input))throw new Error('Expected action object');
      const value=input as Record<string,unknown>;
      if(Object.keys(value).length!==1||(value.action!=='nudge'&&value.action!=='reset'))throw new Error('Expected nudge or reset');
      action(value.action);await waitForPaint();return {action:value.action,...getState()};
    }
  });
  return ()=>lifecycle.abort();
}
