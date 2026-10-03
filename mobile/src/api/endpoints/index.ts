/**
 * Endpoint barrel.
 *
 * Grouped by area rather than flattened, so a call site reads
 * `authApi.login(...)` or `subscriptionsApi.listSubscriptions(...)` and it is
 * obvious which part of the API is being touched. A flat re-export would put
 * twenty unrelated function names in one namespace.
 */

export * as authApi from './auth';
export * as dashboardApi from './dashboard';
export * as meApi from './me';
export * as subscriptionsApi from './subscriptions';
