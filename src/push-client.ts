const supported=()=> 'Notification'in window&&'serviceWorker'in navigator&&'PushManager'in window;
export async function detachPush(api:(path:string,options?:RequestInit)=>Promise<unknown>){
 if(!supported())return;
 const registration=await navigator.serviceWorker.getRegistration();const subscription=await registration?.pushManager.getSubscription();
 if(subscription){await api('/push/subscribe',{method:'DELETE',body:JSON.stringify({endpoint:subscription.endpoint})});await subscription.unsubscribe();}
}
