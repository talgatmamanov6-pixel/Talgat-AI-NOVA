import mammoth from 'mammoth/mammoth.browser.js';
import ExcelJS from 'exceljs/dist/exceljs.min.js';
import {getDocument, GlobalWorkerOptions} from 'pdfjs-dist/build/pdf.mjs';
import {Document, Paragraph, HeadingLevel, Packer} from 'docx';

GlobalWorkerOptions.workerSrc = new URL('./pdf.worker.min.mjs',import.meta.url).href;
const maxText = 24000;
function limited(text) {
  text = text.trim();
  if (!text) throw new Error('В файле нет читаемого текста.');
  if (text.length > maxText) throw new Error('Текст превышает 24 000 символов. Прикрепите нужный фрагмент.');
  return {text};
}

function checkOfficeZip(bytes) {
  const view = new DataView(bytes);
  let end = bytes.byteLength - 22;
  const lower = Math.max(0,end - 65535);
  for (; end >= lower; end--) {
    if (view.getUint32(end,true) === 0x06054b50 && end + 22 + view.getUint16(end+20,true) === bytes.byteLength) break;
  }
  if (end < lower) throw new Error('Не удалось прочитать архив Office.');
  const entries = view.getUint16(end+10,true);
  let pos = view.getUint32(end+16,true), total = 0;
  if (entries > 3000 || view.getUint16(end+4,true) || view.getUint16(end+6,true)) throw new Error('Слишком сложный архив Office.');
  for (let i=0;i<entries;i++) {
    if (pos+46>end || view.getUint32(pos,true)!==0x02014b50) throw new Error('Некорректная структура файла Office.');
    total += view.getUint32(pos+24,true);
    if (total>40_000_000) throw new Error('Документ слишком велик после распаковки.');
    pos += 46+view.getUint16(pos+28,true)+view.getUint16(pos+30,true)+view.getUint16(pos+32,true);
  }
}

export async function readFile(file) {
  const ext = file.name.split('.').at(-1).toLowerCase();
  if (!file.size || file.size > 8_000_000) throw new Error('Выберите непустой файл размером до 8 МБ.');
  if (['jpg','jpeg','png','webp'].includes(ext)) {
    const bitmap = await createImageBitmap(file);
    try {
      const scale = Math.min(1,1600/Math.max(bitmap.width,bitmap.height));
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1,Math.round(bitmap.width*scale));
      canvas.height = Math.max(1,Math.round(bitmap.height*scale));
      const context = canvas.getContext('2d');
      context.fillStyle='white';
      context.fillRect(0,0,canvas.width,canvas.height);
      context.drawImage(bitmap,0,0,canvas.width,canvas.height);
      return {image:canvas.toDataURL('image/jpeg',0.85)};
    } finally { bitmap.close(); }
  }
  if (/^(txt|md|json|csv|js|ts|py|html|css|xml|yaml|yml)$/.test(ext)) return limited(await file.text());
  if (!['docx','xlsx','pdf'].includes(ext)) throw new Error('Поддерживаются DOCX, XLSX, PDF, TXT, CSV, JPG, PNG и WebP.');
  const bytes = await file.arrayBuffer();
  if (ext==='docx' || ext==='xlsx') checkOfficeZip(bytes);
  if (ext==='docx') return limited((await mammoth.extractRawText({arrayBuffer:bytes})).value);
  if (ext==='xlsx') {
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(bytes);
    const lines=[];
    for (const sheet of workbook.worksheets) {
      lines.push('Лист: '+sheet.name);
      sheet.eachRow(row => lines.push(row.values.slice(1).map((value,index) => {
        const cell = row.getCell(index+1);
        return cell.formula ? cell.text+' [формула: '+cell.formula+']' : cell.text;
      }).join('\t')));
      if (lines.join('\n').length > maxText) throw new Error('Таблица слишком велика. Прикрепите нужный диапазон.');
    }
    return limited(lines.join('\n'));
  }
  const task=getDocument({data:new Uint8Array(bytes),isEvalSupported:false,enableXfa:false});
  try {
    const pdf=await task.promise;
    if (pdf.numPages>30) throw new Error('PDF содержит больше 30 страниц. Выделите нужные страницы.');
    const pages=[];
    for(let n=1;n<=pdf.numPages;n++) {
      const page=await pdf.getPage(n);
      const content=await page.getTextContent();
      const text=content.items.map(item=>item.str===undefined?'':item.str+(item.hasEOL?'\n':' ')).join('').trim();
      if(text) pages.push('Страница '+n+'\n'+text);
      if(pages.join('\n').length>maxText) throw new Error('PDF слишком длинный. Выделите нужные страницы.');
    }
    if (!pages.length) throw new Error('В PDF нет текстового слоя. Для разбора скана прикрепите страницу как JPG или PNG.');
    return limited(pages.join('\n\n'));
  } finally { await task.destroy(); }
}

export async function word(source) {
  const paragraphs = source.split('\n').map(line => {
    const heading = /^(#{1,3})\s+(.+)$/.exec(line);
    return heading ? new Paragraph({text:heading[2],heading:[HeadingLevel.HEADING_1,HeadingLevel.HEADING_2,HeadingLevel.HEADING_3][heading[1].length-1]}) : new Paragraph(line);
  });
  return Packer.toBlob(new Document({sections:[{children:paragraphs}]}));
}
export async function spreadsheet(table) {
  const workbook=new ExcelJS.Workbook();
  const sheet=workbook.addWorksheet('Таблица');
  for (const row of table.rows) sheet.addRow([...row.cells].map(cell=>{
    const value=cell.innerText.trim();
    return /^-?(?:0|[1-9]\d*)(?:[.,]\d+)?$/.test(value)&&value.length<16 ? Number(value.replace(',','.')) : value;
  }));
  const bytes=await workbook.xlsx.writeBuffer();
  return new Blob([bytes],{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'});
}
