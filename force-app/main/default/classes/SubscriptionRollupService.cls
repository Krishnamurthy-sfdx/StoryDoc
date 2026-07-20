/**
 * Maintains the Account subscription roll-ups.
 *
 * Account__c on Subscription__c is a lookup rather than a master-detail, so native
 * roll-up summary fields are not available. This service recalculates
 * Account.Total_MRR__c and Account.Active_Subscription_Count__c from the Active
 * subscriptions of every affected account.
 */
public with sharing class SubscriptionRollupService {
  private static final String STATUS_ACTIVE = 'Active';

  /**
   * Recalculates the roll-ups for the supplied account ids.
   * Accounts with no Active subscriptions are reset to 0.
   */
  public static void recalculate(Set<Id> accountIds) {
    if (accountIds == null || accountIds.isEmpty()) {
      return;
    }

    // Drop nulls so we never query on a null key.
    Set<Id> targets = new Set<Id>(accountIds);
    targets.remove(null);
    if (targets.isEmpty()) {
      return;
    }

    Map<Id, Account> updates = new Map<Id, Account>();
    for (Id accountId : targets) {
      updates.put(
        accountId,
        new Account(
          Id = accountId,
          Total_MRR__c = 0,
          Active_Subscription_Count__c = 0
        )
      );
    }

    for (AggregateResult ar : [
      SELECT Account__c accountId, SUM(MRR__c) totalMrr, COUNT(Id) subCount
      FROM Subscription__c
      WHERE Account__c IN :targets AND Status__c = :STATUS_ACTIVE
      GROUP BY Account__c
    ]) {
      Id accountId = (Id) ar.get('accountId');
      Account acct = updates.get(accountId);
      Decimal totalMrr = (Decimal) ar.get('totalMrr');
      acct.Total_MRR__c = totalMrr == null ? 0 : totalMrr;
      acct.Active_Subscription_Count__c = (Integer) ar.get('subCount');
    }

    update updates.values();
  }

  /**
   * Collects every account whose roll-up may have moved: both sides of a
   * reparent, and any record where Status or MRR changed.
   */
  public static Set<Id> affectedAccountIds(
    List<Subscription__c> newList,
    Map<Id, Subscription__c> oldMap
  ) {
    Set<Id> accountIds = new Set<Id>();

    if (newList != null) {
      for (Subscription__c sub : newList) {
        Subscription__c prior = oldMap == null ? null : oldMap.get(sub.Id);
        if (prior == null) {
          accountIds.add(sub.Account__c);
          continue;
        }
        if (
          prior.Account__c != sub.Account__c ||
          prior.Status__c != sub.Status__c ||
          prior.MRR__c != sub.MRR__c
        ) {
          accountIds.add(sub.Account__c);
          accountIds.add(prior.Account__c);
        }
      }
    } else if (oldMap != null) {
      // Delete: the surviving parent still needs recalculating.
      for (Subscription__c sub : oldMap.values()) {
        accountIds.add(sub.Account__c);
      }
    }

    accountIds.remove(null);
    return accountIds;
  }
}
