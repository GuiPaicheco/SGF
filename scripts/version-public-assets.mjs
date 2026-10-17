import {createHash} from 'node:crypto';

// Versão pelo conteúdo: uma alteração do arquivo sempre gera outra URL no build.
export async function versionPublicAssets(html,readAsset) {
 const references=[...new Set([...html.matchAll(/(?:src|href)="(assets\/[a-zA-Z0-9._-]+\.(?:js|css))(?:\?[^"\s]*)?"/g)].map(match=>match[1]))];
 let result=html;
 for(const file of references){const bytes=await readAsset(file);const hash=createHash('sha256').update(bytes).digest('hex').slice(0,16);
  const escaped=file.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
  result=result.replace(new RegExp(`((?:src|href)="${escaped})(?:\\?[^"\\s]*)?"`,'g'),(_all,prefix)=>`${prefix}?v=${hash}"`);
 }
 return result;
}
