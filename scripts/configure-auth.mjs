// Use a scoped Supabase management token in the environment, never a CLI argument.
// This applies only the committed non-secret provider/template fields.
import {readFile} from 'node:fs/promises';
if(process.argv.includes('--help')){console.log('SUPABASE_ACCESS_TOKEN=<secret environment binding> node scripts/configure-auth.mjs\nUpdates existing MANHUNT Auth: removes Google and applies four email templates. Does not change SMTP, sessions or email verification.');process.exit(0);}
const token=process.env.SUPABASE_ACCESS_TOKEN;if(!token){console.error('Supabase management access is missing. Use the dashboard links in docs/RELEASE-b.0.69.46.md. Never put secrets in chat or Git.');process.exit(1);}
const config=JSON.parse(await readFile(new URL('../supabase/templates/auth-config.json',import.meta.url),'utf8'));
const url='https://api.supabase.com/v1/projects/dxoleuqmhcnqnjyqdqvw/config/auth';
const response=await fetch(url,{method:'PATCH',headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},body:JSON.stringify(config)});
if(!response.ok){console.error(`Auth configuration update failed (${response.status}). No credentials or provider response printed.`);process.exit(1);}
const verify=await fetch(url,{headers:{Authorization:`Bearer ${token}`}});if(!verify.ok)throw Error('Auth verification unavailable');const data=await verify.json();
if(!Object.entries(config).every(([key,value])=>data[key]===value))throw Error('Auth configuration read-back mismatch');
console.log('Google disabled; four email templates saved and read back successfully.');
console.log(JSON.stringify({customSmtp:!!data.smtp_host,emailLimitPerHour:data.rate_limit_email_sent,verificationRequired:!data.mailer_autoconfirm}));
