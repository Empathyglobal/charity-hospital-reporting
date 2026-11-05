import {randomBytes,scrypt as rawScrypt,timingSafeEqual,createHash} from 'node:crypto';
import {promisify} from 'node:util';
const fail=(status,message)=>{throw Object.assign(new Error(message),{status});};
const scrypt=promisify(rawScrypt),hash=x=>createHash('sha256').update(x).digest('hex');
export async function encodePassword(password,salt=randomBytes(16).toString('hex')){
 if(typeof password!=='string'||password.length<12||password.length>256)throw Error('Password must contain 12–256 characters');
 return 'scrypt$'+salt+'$'+Buffer.from(await scrypt(password,salt,32)).toString('hex');
}
export async function verifyPassword(password,encoded){
 if(typeof password!=='string'||password.length>256||!/^scrypt\$[a-f0-9]{32}\$[a-f0-9]{64}$/.test(encoded??''))return false;
 const [,salt,expected]=encoded.split('$'),actual=Buffer.from(await scrypt(password,salt,32));return timingSafeEqual(actual,Buffer.from(expected,'hex'));
}
export function createSharedAuth({pool,config,keyReader,secure=true}){
 const cookieName=secure?'__Secure-hospital_report':'hospital_report_local',workspace=config.workspaceId;
 const cookie=(value,seconds)=>`${cookieName}=${value}; Path=/reports/; HttpOnly; SameSite=Strict; Max-Age=${seconds}${secure?'; Secure':''}`;
 async function credential(){const v=await keyReader(config.passwordVariable);if(!/^scrypt\$[a-f0-9]{32}\$[a-f0-9]{64}$/.test(v??''))fail(423,'shared_login_not_configured');return v;}
 const token=request=>{const v=(request.headers.get('cookie')??'').split(';').map(x=>x.trim()).find(x=>x.startsWith(cookieName+'='))?.slice(cookieName.length+1);return /^[a-f0-9]{64}$/.test(v??'')?v:null;};
 return {
  checkOrigin(request){if(request.headers.get('origin')!==config.allowedOrigin)fail(403,'origin_not_allowed');},
  async login(password,clientId,username,remember=false){
   const encoded=await credential(),version=hash(encoded),clientHash=hash(version+'|'+(clientId||'unknown'));
   // Count attempts atomically before costly password verification. No raw IP/password in DB or logs.
   const r=await pool.query(`INSERT INTO hospital_report_login_limits(workspace_id,client_hash,attempts) VALUES($1,$2,1)
    ON CONFLICT(workspace_id,client_hash) DO UPDATE SET attempts=CASE WHEN hospital_report_login_limits.started_at<now()-interval '15 minutes' THEN 1 ELSE hospital_report_login_limits.attempts+1 END,started_at=CASE WHEN hospital_report_login_limits.started_at<now()-interval '15 minutes' THEN now() ELSE hospital_report_login_limits.started_at END RETURNING attempts`,[workspace,clientHash]);
   if(r.rows[0].attempts>5)fail(429,'login_rate_limited');
   if(!await verifyPassword(password,encoded)||typeof username!=='string'||!config.username||username!==config.username)fail(401,'incorrect_password');
   const value=randomBytes(32).toString('hex'),seconds=(remember===true?(config.rememberDays??30)*24:config.sessionHours)*3600;
   await pool.query('INSERT INTO hospital_report_sessions VALUES($1,$2,$3,now()+($4::integer * interval \'1 second\'))',[workspace,hash(value),version,seconds]);
   await pool.query('UPDATE hospital_report_login_limits SET attempts=0 WHERE workspace_id=$1 AND client_hash=$2',[workspace,clientHash]);
   return cookie(value,seconds);
  },
  async require(request){const value=token(request);if(!value)fail(401,'sign_in_required');const version=hash(await credential());const r=await pool.query('SELECT 1 FROM hospital_report_sessions WHERE workspace_id=$1 AND token_hash=$2 AND credential_version=$3 AND expires_at>now()',[workspace,hash(value),version]);if(!r.rowCount)fail(401,'sign_in_required');return {id:'shared-hospital'};},
  async logout(request){const value=token(request);if(value)await pool.query('DELETE FROM hospital_report_sessions WHERE workspace_id=$1 AND token_hash=$2',[workspace,hash(value)]);return cookie('',0);}
 };
}

