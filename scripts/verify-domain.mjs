// PR data is input only. Run this from the trusted operator checkout.
import { readFile } from 'node:fs/promises';
import { resolveTxt } from 'node:dns/promises';
import { strictJSON } from '../src/index.js';
import { verifyEnrollment } from './lifecycle.mjs';
const [recordPath, proofPath, trustedChallengePath, repository, sourceCommit] = process.argv.slice(2);
if (!sourceCommit) throw new Error('Usage: node scripts/verify-domain.mjs <record> <proof> <trusted-envelope> <owner/repo> <record-commit>');
const result = await verifyEnrollment({recordBytes:await readFile(recordPath),compact:(await readFile(proofPath,'utf8')).trim(),trustedChallenge:strictJSON(await readFile(trustedChallengePath,'utf8')),repository,sourceCommit,resolveTxt,now:Math.floor(Date.now()/1000)});
console.log(JSON.stringify(result,null,2));
