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
  const headers={'User-Agent':'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/131.0 Safari/537.36','Accept':'text/html,application/xhtml+xml','Accept-Language':'en-US,en;q=0.9'};
  let source='';
  try{
   const response=await fetch('https://html.duckduckgo.com/html/?q='+encodeURIComponent(searchQuery),{headers,signal:AbortSignal.timeout(10000)});
   if(response.ok)source=await response.text();
  }catch(error){console.warn('DuckDuckGo HTML search failed:',error.message)}
  let results=[];
  if(source){
   const re=/<a[^>]*class="result__a"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi;let m;
   while((m=re.exec(source))&&results.length<10){const url=cleanUrl(m[1]);if(!url)continue;const title=stripTags(m[2]);if(!title)continue;const block=source.slice(m.index,Math.min(source.length,m.index+1800));const sm=block.match(/class="result__snippet"[^>]*>([\s\S]*?)<\/(?:a|td|div)>/i);results.push({title,url,snippet:sm?stripTags(sm[1]):'',youtubeId:getYoutubeId(url)})}
  }
  if(!results.length){
   try{
    const backup=await fetch('https://lite.duckduckgo.com/lite/?q='+encodeURIComponent(searchQuery),{headers,signal:AbortSignal.timeout(10000)});
    if(backup.ok){
     const page=await backup.text();const re=/<a[^>]*class="result-link"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi;let m;
     while((m=re.exec(page))&&results.length<10){const url=cleanUrl(m[1]);const title=stripTags(m[2]);if(url&&title)results.push({title,url,snippet:'',youtubeId:getYoutubeId(url)})}
    }
   }catch(error){console.warn('DuckDuckGo Lite search failed:',error.message)}
  }
  return res.status(200).json({results,query});
 }catch(error){console.error('Public search failed:',error.message);return res.status(502).json({error:'SEARCH_UNAVAILABLE'})}
}