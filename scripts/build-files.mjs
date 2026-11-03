import {build} from 'esbuild';
import {copyFile, mkdir} from 'node:fs/promises';
await mkdir('web/generated', {recursive:true});
await build({entryPoints:['src/files.mjs'], outfile:'web/generated/files.mjs', bundle:true, platform:'browser', format:'esm', target:'es2022', minify:true});
await copyFile('node_modules/pdfjs-dist/build/pdf.worker.min.mjs','web/generated/pdf.worker.min.mjs');
