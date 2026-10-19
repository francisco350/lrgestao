const {scrypt,randomBytes,createHash,timingSafeEqual}=require('node:crypto');
const {promisify}=require('node:util');
const derive=promisify(scrypt);
const parameters={N:32768,r:8,p:3,maxmem:64*1024*1024};
const digest=value=>createHash('sha256').update(value).digest('hex');
const token=()=>randomBytes(32).toString('base64url');
function validatePassword(value){if(typeof value!=='string'||value.length<12||value.length>128||Buffer.byteLength(value)>512)throw Error('A palavra-passe deve ter entre 12 e 128 caracteres.');}
async function hashPassword(value){validatePassword(value);const salt=randomBytes(16).toString('hex');const result=await derive(value,salt,64,parameters);return `scrypt$32768$8$3$${salt}$${result.toString('hex')}`;}
async function verifyPassword(value,encoded){if(typeof value!=='string'||Buffer.byteLength(value)>512)return false;const [kind,n,r,p,salt,hash]=String(encoded).split('$');if(kind!=='scrypt'||n!=='32768'||r!=='8'||p!=='3'||!salt||!/^[0-9a-f]{128}$/.test(hash||''))return false;const result=await derive(value,salt,64,parameters);return timingSafeEqual(result,Buffer.from(hash,'hex'));}
module.exports={digest,token,hashPassword,verifyPassword,validatePassword};
