export enum EventType {
    Updated = 'updated',
    Created = 'created',
    Deleted = 'deleted',
}

export type Identifier = string

export interface Event {
    topic?: string;
    type: string | EventType;
    payload?: unknown;
    [key: string]: unknown;
}

export interface RecordListEvent extends Event {
    payload?: {
        ids: Identifier[];
    };
}

export interface RecordEvent extends Event {
    payload?: {
        id: Identifier;
    };
}

export type SubscriptionCallback<T = Event> = (event: T) => void
export type SubscriptionCallbackWithUnsubscribe<T = Event> = (
    event: T,
    unsubscribe: () => Promise<unknown>
) => void

export type Subscriptions = {
    topic: string;
    subscriptionCallback: SubscriptionCallback;
}[]

export interface EventSources {
    [topic: string]: unknown;
}

export interface RealTimeDataProvider {
    subscribe: (
        topic: string,
        subscriptionCallback: SubscriptionCallback
    ) => Promise<unknown>;
    unsubscribe: (
        topic: string,
        subscriptionCallback: SubscriptionCallback
    ) => Promise<unknown>;
    publish: (topic: string, payload: Event) => Promise<unknown>;
}

export type Lock = {
    id?: Identifier;
    resource: string;
    recordId: Identifier;
    createdAt?: unknown;
    identity?: string;
}

export interface LocksDataProvider {
    lock: (resource: string, params: LockParams) => Promise<LockResult>;
    unlock: (resource: string, params: UnlockParams) => Promise<unknown>;
    getLock: (
        resource: string,
        params: GetLockParams
    ) => Promise<GetLockResult>;
    getLocks: (
        resource: string,
        params: GetLocksParams
    ) => Promise<GetLocksResult>;
}

export interface GetLockParams {
    id: Identifier;
    meta?: unknown;
}

export interface GetLockResult {
    data?: Lock;
}

export interface GetLocksParams {
    meta?: unknown;
}

export interface GetLocksResult {
    data: Lock[];
}

export interface LockParams {
    id: Identifier;
    identity: Identifier;
    meta?: unknown;
}

export interface LockResult {
    data: Lock;
}

export interface UnlockParams {
    id: Identifier;
    identity: Identifier;
    meta?: unknown;
}
