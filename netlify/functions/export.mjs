export default async function exportFile(request){
 if(request.method!=='POST')return Response.json({error:'Используйте POST.'},{status:405});
 if(Number(request.headers.get('content-length'))>600000)return Response.json({error:'Файл слишком большой.'},{status:413});
 let data;try{data=await request.formData()}catch{return Response.json({error:'Некорректный файл.'},{status:400})}
 const source=data.get('content'),raw=data.get('filename');
 if(typeof source!=='string'||!source||source.length>250000)return Response.json({error:'Допустимый размер файла: до 250 000 символов.'},{status:400});
 const filename=(typeof raw==='string'?raw:'talgat-code.txt').replace(/[^a-zA-Z0-9._-]/g,'_').slice(0,80)||'talgat-code.txt';
 return new Response(source,{headers:{'content-type':'application/octet-stream','content-disposition':'attachment; filename="'+filename+'"','cache-control':'no-store','x-content-type-options':'nosniff'}});
}
export const config={path:'/api/export'};
