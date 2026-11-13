// Search public web pages, music and videos. Only publicly indexed results are returned.
function decodeHtml(value=''){return value.replace(/&amp;/g,'&').replace(/&quot;/g,'"').replace(/&#x27;|&#39;/g,"'").replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&#(\d+);/g,(_,n)=>String.fromCharCode(Number(n)))}
function stripTags(value=''){return decodeHtml(value.replace(/<[^>]*>/g,' ').replace(/\s+/g,' ').trim())}
function cleanUrl(raw=''){try{const u=new URL(decodeHtml(raw),'https://duckduckgo.com');const target=u.searchParams.get('uddg');const finalUrl=target?new URL(target):u;return /^https?:$/.test(finalUrl.protocol)?finalUrl.href:null}catch{return null}}
function getYoutubeId(url){try{const u=new URL(url);if(u.hostname.endsWith('youtu.be'))return u.pathname.slice(1).split('/')[0]||null;if(u.hostname.includes('youtube.com'))return u.searchParams.get('v')||(u.pathname.startsWith('/shorts/')?u.pathname.split('/')[2]:null)}catch{}return null}
export default async function handler(req,res){
 if(req.method!=='POST')return res.status(405).json({error:'METHOD_NOT_ALLOWED'});
 const query=typeof req.body?.query==='string'?req.body.query.trim().slice(0,180):'';
 if(!query)return res.status(400).json({error:'QUERY_REQUIRED'});
 const person=/\b(person|munthu|facebook|profile|account)\b/i.test(query);
 const media=/\b(video|kanema|music|nyimbo|song|watch|play)\b/i.test(query);
 const searchQuery=person?'site:facebook.com '+query:media?query+' (site:youtube.com OR site:facebook.com OR site:soundcloud.com)':query;
 try{
  const response=await fetch('https://html.duckduckgo.com/html/?q='+encodeURIComponent(searchQuery),{headers:{'User-Agent':'Mozilla/5.0 (compatible; ChatBuwabaSearch/1.0)','Accept':'text/html'},signal:AbortSignal.timeout(12000)});
  if(!response.ok)throw new Error('SEARCH_PROVIDER_ERROR');
  const source=await response.text(),results=[];const re=/<a[^>]*class="result__a"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi;let m;
  while((m=re.exec(source))&&results.length<10){const url=cleanUrl(m[1]);if(!url)continue;const title=stripTags(m[2]);if(!title)continue;const block=source.slice(m.index,Math.min(source.length,m.index+1800));const sm=block.match(/class="result__snippet"[^>]*>([\s\S]*?)<\/(?:a|td|div)>/i);results.push({title,url,snippet:sm?stripTags(sm[1]):'',youtubeId:getYoutubeId(url)})}
  return res.status(200).json({results,query});
 }catch(error){console.error('Public search failed:',error.message);return res.status(502).json({error:'SEARCH_UNAVAILABLE'})}
}