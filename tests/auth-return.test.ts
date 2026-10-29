import {describe,it,expect} from 'vitest';
import {readAuthReturn,authInitializationMessage} from '../src/auth-return';

describe('AUTH-RETURN callback classification without secret retention',()=>{
 it('keeps six-character lobby invitation codes out of Auth routing',()=>{
  for(const path of ['/join?code=K7M4XP','/join/K7M4XP','/zone?code=K7M4XP']){
   const result=readAuthReturn('https://example.invalid'+path);expect(result.callback).toBe(false);expect(result.hasCode).toBe(false);expect(authInitializationMessage(result,null,false)).toBe('');
  }
 });
 it('accepts auth codes on the site root and callback route',()=>{
  for(const path of ['/?code=opaque','/auth/callback?code=opaque'])expect(readAuthReturn('https://example.invalid'+path)).toMatchObject({callback:true,hasCode:true,recovery:false});
 });
 it('recognizes expired email links even without type or error parameter',()=>{
  const result=readAuthReturn('https://example.invalid/#error_code=otp_expired');expect(result).toMatchObject({callback:true,problem:'expired'});expect(authInitializationMessage(result,null,true)).toContain('abgelaufen');
 });
 it('retains recovery intent but never raw tokens or error descriptions',()=>{
  const result=readAuthReturn('https://example.invalid/#type=recovery&access_token=private-access&refresh_token=private-refresh&error_description=private-description');expect(result.recoveryFragment).toBe(true);expect(JSON.stringify(result)).not.toContain('private-');
 });
});
