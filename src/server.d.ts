import type { AddressValidator, Invoice, RegistryPayload, RegistrationProof } from './index.js';
export type Signer = (bytes: Uint8Array) => Promise<Uint8Array>;
export function signInvoice(invoice: Invoice, options: { sign: Signer; validateAddress: AddressValidator }): Promise<string>;
export function signRegistry(registry: RegistryPayload, options: { kid: string; sign: Signer }): Promise<string>;
export function signRegistrationProof(proof: RegistrationProof, options: { sign: Signer }): Promise<string>;
