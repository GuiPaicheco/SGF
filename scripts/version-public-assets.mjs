import {createHash} from 'node:crypto';
import path from 'node:path';

export async function versionModuleAsset(file,readAsset,cache=new Map(),parents=[]) {
 if(cache.has(file))return cache.get(file);
 if(parents.includes(file))throw Error('Dependência circular de arquivos públicos.');
 const raw=await readAsset(file);
 if(!/\.m?js$/.test(file)||file.startsWith('assets/vendor/')){cache.set(file,raw);return raw;}
 let source=String(raw);const refs=[...source.matchAll(/(['"])(\.\/[a-zA-Z0-9_./-]+\.m?js)\1/g)];
 for(const match of refs){const target=path.posix.normalize(path.posix.join(path.posix.dirname(file),match[2]));if(!target.startsWith('assets/'))throw Error('Dependência fora dos arquivos públicos.');
  const content=await versionModuleAsset(target,readAsset,cache,[...parents,file]);const hash=createHash('sha256').update(content).digest('hex').slice(0,16);
  source=source.replaceAll(match[0],`${match[1]}${match[2]}?v=${hash}${match[1]}`);
 }
 cache.set(file,source);return source;
}

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
