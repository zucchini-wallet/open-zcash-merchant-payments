export type Network = 'mainnet' | 'testnet';
export type AddressValidator = (address: string, network: Network) => Promise<{ network: Network; shielded: boolean } | null> | { network: Network; shielded: boolean } | null;
export interface PaymentKey { kid: string; algorithm: 'Ed25519'; publicKey: string; networks: Network[]; notBefore: number; expiresAt: number }
export interface Merchant { version: 1; id: string; name: string; origins: string[]; status: 'active' | 'suspended'; paymentKeys: PaymentKey[] }
export interface Invoice { version: 1; registryId: string; merchantId: string; kid: string; origin: string; network: Network; invoiceId: string; issuedAt: number; expiresAt: number; paymentUri: string; challenge?: string }
export interface Revocation { merchantId: string; kid: string; revokedAt: number; reason: 'compromised' | 'retired' | 'ownership-change' | 'policy' }
export interface RegistryPayload { version: 1; registryId: string; sequence: number; issuedAt: number; expiresAt: number; sourceCommit: string; merchants: Merchant[]; revocations: Revocation[] }
export interface Checkpoint { readonly registryId: string; readonly sequence: number; readonly digest: string }
export interface RegistryState { /** Atomically compare against persisted checkpoint with assertCheckpoint, then persist. */ accept(next: Checkpoint): Promise<void> }
export interface Trust { registryId: string; minimumSequence: number; roots: { kid: string; publicKey: string }[] }
export interface Payment { readonly address: string; readonly amountZatoshis: string; readonly memoBase64url: string; readonly label?: string; readonly message?: string }
declare const verified: unique symbol;
export type VerifiedRegistry = Readonly<RegistryPayload & { readonly checkpoint: Checkpoint; readonly [verified]: true }>;
export interface VerifiedInvoice { readonly invoice: Readonly<Invoice>; readonly payment: Payment; readonly merchantName: string; readonly verification: 'issuer-only' | 'issuer-and-browser-origin'; readonly digest: string; readonly replayKey: string; readonly validUntil: number }
export type RequestContext = { kind: 'browser'; origin: string; challenge: string } | { kind: 'import' };
export interface RegistrationProof { version: 1; registryId: string; merchantId: string; kid: string; origin: string; recordSha256: string; challenge: string; issuedAt: number; expiresAt: number }
export class ProtocolError extends Error { readonly code: string; constructor(code: string) }
export function strictJSON(input: string, maxBytes?: number): unknown;
export function validateMerchantRecord(value: unknown): asserts value is Merchant;
export function validateRegistryPayload(value: unknown): asserts value is RegistryPayload;
export function assertCheckpoint(previous: Checkpoint | undefined, next: Checkpoint): void;
export function verifyRegistry(compact: string, options: { trust: Trust; state: RegistryState; now?: number }): Promise<VerifiedRegistry>;
export function verifyInvoice(compact: string, options: { registry: VerifiedRegistry; network: Network; context: RequestContext; validateAddress: AddressValidator; now?: number }): Promise<VerifiedInvoice>;
export function parsePaymentUri(uri: string, network: Network, validateAddress: AddressValidator): Promise<Payment>;
export function verifyRegistrationProof(compact: string, options: { record: Merchant; recordBytes: Uint8Array; expected: RegistrationProof; now?: number }): Promise<Readonly<RegistrationProof>>;
