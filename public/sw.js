self.addEventListener('push',event=>{
  let data;try{data=event.data.json();}catch{return;}
  const url=typeof data.url==='string'&&/^\/app\/hoje\?invitation=[a-f0-9-]{36}$/.test(data.url)?data.url:'/app/hoje';
  event.waitUntil(self.registration.showNotification('Metanóia',{
    body:'Tem um convite de apoio no horário que tu escolheu. Abrir quando fizer sentido.',
    tag:data.tag||'metanoia-support',data:{url},renotify:false,
  }));
});
self.addEventListener('notificationclick',event=>{
  event.notification.close();
  const url=new URL(event.notification.data?.url||'/app/hoje',self.location.origin).href;
  event.waitUntil((async()=>{
    const windows=await self.clients.matchAll({type:'window',includeUncontrolled:true});
    const existing=windows.find(client=>new URL(client.url).origin===self.location.origin);
    if(existing){await existing.navigate(url);await existing.focus();}else await self.clients.openWindow(url);
  })());
});
